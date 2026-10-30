/**
 * Isolation for the 「NAI5 提示词」 agent preset. The bundle patch mounts this
 * plugin inside the preset's standing composition, so every registration lands
 * in the preset's scope layer. Agents inherit that layer while they are bound
 * to the preset (sessions started in it and blank sessions switched to it), and
 * other presets never see it.
 *
 * - Global tools (MCP servers, host plugins, Desktop add-ons) are denied in the
 *   preset layer. A restriction can only name tools that exist when it is
 *   created, and MCP servers register theirs after startup, so the deny list is
 *   extended on every `tools/change` notice, before a later model step resolves
 *   its tool list (dsh 0.2.1 fixes a step's tools before `agent/pre-step`), and
 *   again in `agent/pre-step` for a change that lands in between. Tools mounted
 *   by the preset's own rows are not global and stay visible.
 * - Global skills (for example Desktop's Office skills) are shadowed in the
 *   preset layer by entries that neither the model nor the user can invoke, so
 *   the skill catalog and the `/` menu list only the skills mounted by the
 *   preset's own provider rows. The shadows rank after every other provider in
 *   the layer, so a preset skill with the same name still wins.
 *
 * The plugin writes no session events and registers no HTTP routes.
 * @module dsh-nai5-prompting
 */
import z from '@deepseek-ai/schemastery'

export const name = 'nai5-prompting-isolation'
export const inject = ['tools', 'skills']

/** Reserved PTC transport name; `tools.restrict()` rejects it. */
const RUN_CODE = 'run_code'

/** Provider name of the shadow entries. */
export const SHADOW_PROVIDER = 'nai5-prompting-hidden-global'

/** Shadow candidate rank: after every provider rank DSH assigns (bundled skills use 600). */
export const SHADOW_RANK = 1_000_000

/** Description carried by every shadow entry; no catalog renders it. */
const SHADOW_DESCRIPTION = 'Global skill hidden in the NAI5 prompting preset.'

/** Invocation policy that keeps a shadow out of model catalogs and user commands. */
const HIDDEN = Object.freeze({ modelInvocable: false, userInvocable: false })

/** Plugin configuration; the bundle patch states every value explicitly. */
export const Config = z.object({
  hideGlobalTools: z.boolean().default(true).description('在本预设里隐藏全局工具（MCP、宿主插件、桌面端附加工具）；本预设自己挂载的工具不受影响'),
  keepGlobalTools: z.array(z.string()).default([]).description('隐藏全局工具时仍保留的全局工具名，例如某个 MCP 工具的完整名字'),
  hideGlobalSkills: z.boolean().default(true).description('在本预设里隐藏全局技能（例如桌面端自带的 Office 技能），技能目录只留本预设挂载的技能'),
  keepGlobalSkills: z.array(z.string()).default([]).description('隐藏全局技能时仍保留的全局技能名'),
})

/**
 * Mount the configured isolation effects into the preset scope.
 * @param ctx - plugin context of the preset's standing composition.
 * @param config - validated plugin configuration.
 */
export function apply(ctx, config) {
  if (config.hideGlobalTools) hideGlobalTools(ctx, new Set(config.keepGlobalTools))
  if (config.hideGlobalSkills) hideGlobalSkills(ctx, new Set(config.keepGlobalSkills))
}

/**
 * Global tool names that a deny restriction may name now, minus kept ones.
 * @param ctx - context exposing `tools`.
 * @param keep - global tool names that stay visible.
 * @param denied - names an earlier restriction already denies.
 * @returns names to deny, in registry order.
 */
export function pendingDenials(ctx, keep, denied) {
  const names = []
  for (const schema of ctx.tools.schemas()) {
    const toolName = schema.name
    if (toolName === RUN_CODE || keep.has(toolName) || denied.has(toolName)) continue
    names.push(toolName)
  }
  return names
}

/**
 * Deny every global tool outside `keep` for agents bound to this preset: at
 * mount time, after each registry change, and before each model step.
 * @param ctx - plugin context of the preset's standing composition.
 * @param keep - global tool names that stay visible.
 */
export function hideGlobalTools(ctx, keep) {
  const denied = new Set()
  let live = true
  let queued = false
  ctx.effect(() => () => { live = false })
  const sync = () => {
    if (!live) return
    const names = pendingDenials(ctx, keep, denied)
    if (names.length === 0) return
    try {
      ctx.tools.restrict({ deny: names })
      for (const toolName of names) denied.add(toolName)
    } catch (error) {
      // A tool can unregister between the read and the restriction; the next change or step retries.
      ctx.logger.warn(`dsh-nai5-prompting: could not hide global tools ${names.join(', ')}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  sync()
  // The registry emits `tools/change` while it is still applying one change, and an
  // MCP server registers its tools in a burst: deny them all in one restriction
  // once the current task finishes. Our own restriction emits a change as well;
  // that sync finds nothing new and stops.
  ctx.on('tools/change', () => {
    if (queued) return
    queued = true
    queueMicrotask(() => {
      queued = false
      sync()
    })
  })
  // Waterfall listener: delegate with next() so later listeners and the step proceed.
  ctx.on('agent/pre-step', (_payload, next) => {
    sync()
    return next()
  })
}

/**
 * Shadow entries for the current global skills outside `keep`.
 * @param summaries - skill summaries read from the global layer.
 * @param keep - global skill names that stay visible.
 * @returns provider candidates hiding those skills.
 */
export function shadowCandidates(summaries, keep) {
  return summaries
    .filter(summary => !keep.has(summary.name))
    .map(summary => ({
      name: summary.name,
      description: SHADOW_DESCRIPTION,
      invocation: HIDDEN,
      source: 'hidden-global',
      provider: SHADOW_PROVIDER,
      rank: SHADOW_RANK,
      locator: summary.name,
    }))
}

/**
 * Register a preset-layer provider that shadows every global skill outside
 * `keep`. Each catalog read lists the global layer afresh, and any registry
 * change clears the cached catalogs, so skills registered after startup are
 * hidden on the next read.
 * @param ctx - plugin context of the preset's standing composition.
 * @param keep - global skill names that stay visible.
 */
export function hideGlobalSkills(ctx, keep) {
  ctx.skills.registerProvider(() => ({
    name: SHADOW_PROVIDER,
    async list(options) {
      // Omitting `scope` reads the global layer only, which never includes this provider.
      const summaries = await ctx.skills.list({ cwd: options.cwd, signal: options.signal })
      return shadowCandidates(summaries, keep)
    },
    async get(candidate) {
      return {
        name: candidate.name,
        description: SHADOW_DESCRIPTION,
        invocation: HIDDEN,
        source: 'hidden-global',
        provider: SHADOW_PROVIDER,
        content: '',
      }
    },
  }))
}
