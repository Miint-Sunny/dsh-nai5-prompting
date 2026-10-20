// Isolation behaviour against minimal stand-ins for the tools and skills registries.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, Config, hideGlobalSkills, hideGlobalTools, SHADOW_PROVIDER, SHADOW_RANK, shadowCandidates } from '../lib/index.js'

/** Stand-in context: global tool names, recorded restrictions, listeners and warnings. */
function fakeContext({ globalTools = [], globalSkills = [], restrictFails = 0 } = {}) {
  const state = {
    globalTools: [...globalTools],
    globalSkills: [...globalSkills],
    restrictions: [],
    listeners: new Map(),
    providers: [],
    skillListCalls: [],
    warnings: [],
    restrictFails,
  }
  const ctx = {
    tools: {
      schemas: () => state.globalTools.map(name => ({ name, description: '', parameters: {} })),
      restrict: (filter) => {
        if (state.restrictFails > 0) {
          state.restrictFails -= 1
          throw new Error('tools.restrict() names unknown global tool')
        }
        state.restrictions.push(filter)
        return () => {}
      },
    },
    skills: {
      list: async (options) => {
        state.skillListCalls.push(options)
        return state.globalSkills.map(name => ({ name, description: `${name} skill`, invocation: { modelInvocable: true, userInvocable: true }, source: 'bundled', provider: 'office' }))
      },
      registerProvider: (create) => {
        const provider = create({ signal: new AbortController().signal, invalidate: () => {} })
        state.providers.push(provider)
        return () => {}
      },
    },
    on: (event, listener) => {
      state.listeners.set(event, listener)
      return () => {}
    },
    logger: { warn: message => state.warnings.push(message) },
  }
  return { ctx, state }
}

/** Run the preset's pre-step listener as the agent loop's waterfall would. */
async function preStep(state, decision = { kind: 'continue' }) {
  const listener = state.listeners.get('agent/pre-step')
  let delegated = false
  const result = await listener({}, async () => {
    delegated = true
    return decision
  })
  return { delegated, result }
}

test('global tools are denied at mount except kept names and the PTC transport', () => {
  const { ctx, state } = fakeContext({ globalTools: ['mcp__github__search', 'working_directory', 'run_code', 'mcp__fetch__fetch'] })
  hideGlobalTools(ctx, new Set(['mcp__fetch__fetch']))
  assert.deepEqual(state.restrictions, [{ deny: ['mcp__github__search', 'working_directory'] }])
})

test('tools registered later are denied before the next model step, once each', async () => {
  const { ctx, state } = fakeContext({ globalTools: ['working_directory'] })
  hideGlobalTools(ctx, new Set())
  state.globalTools.push('mcp__playwright__browser_click')
  const first = await preStep(state)
  assert.equal(first.delegated, true)
  assert.deepEqual(first.result, { kind: 'continue' })
  await preStep(state)
  assert.deepEqual(state.restrictions, [{ deny: ['working_directory'] }, { deny: ['mcp__playwright__browser_click'] }])
})

test('a failed restriction is logged and retried on the next step', async () => {
  const { ctx, state } = fakeContext({ globalTools: ['load_workspace_dependencies'], restrictFails: 1 })
  hideGlobalTools(ctx, new Set())
  assert.equal(state.restrictions.length, 0)
  assert.equal(state.warnings.length, 1)
  await preStep(state)
  assert.deepEqual(state.restrictions, [{ deny: ['load_workspace_dependencies'] }])
})

test('no restriction is created while there is nothing to hide', async () => {
  const { ctx, state } = fakeContext({ globalTools: ['run_code'] })
  hideGlobalTools(ctx, new Set())
  await preStep(state)
  assert.deepEqual(state.restrictions, [])
})

test('shadow candidates hide every global skill outside the kept names', () => {
  const candidates = shadowCandidates([{ name: 'office-docx' }, { name: 'office-xlsx' }], new Set(['office-xlsx']))
  assert.deepEqual(candidates, [{
    name: 'office-docx',
    description: 'Global skill hidden in the NAI5 prompting preset.',
    invocation: { modelInvocable: false, userInvocable: false },
    source: 'hidden-global',
    provider: SHADOW_PROVIDER,
    rank: SHADOW_RANK,
    locator: 'office-docx',
  }])
})

test('the shadow provider lists the global layer afresh for the lookup cwd', async () => {
  const { ctx, state } = fakeContext({ globalSkills: ['office', 'office-pptx'] })
  hideGlobalSkills(ctx, new Set())
  const [provider] = state.providers
  assert.equal(provider.name, SHADOW_PROVIDER)
  const signal = new AbortController().signal
  const first = await provider.list({ cwd: '/studio', signal })
  assert.deepEqual(first.map(candidate => candidate.name), ['office', 'office-pptx'])
  assert.deepEqual(state.skillListCalls, [{ cwd: '/studio', signal }])
  state.globalSkills.push('office-render')
  const second = await provider.list({ cwd: '/studio', signal })
  assert.deepEqual(second.map(candidate => candidate.name), ['office', 'office-pptx', 'office-render'])
  const definition = await provider.get(second[0], { cwd: '/studio' })
  assert.deepEqual(definition.invocation, { modelInvocable: false, userInvocable: false })
  assert.equal(definition.provider, SHADOW_PROVIDER)
  assert.equal(definition.content, '')
})

test('switches turn each effect off independently', () => {
  const { ctx, state } = fakeContext({ globalTools: ['working_directory'], globalSkills: ['office'] })
  apply(ctx, Config({ hideGlobalTools: false, hideGlobalSkills: false }))
  assert.equal(state.restrictions.length, 0)
  assert.equal(state.providers.length, 0)
  assert.equal(state.listeners.size, 0)
})

test('the configuration schema fills defaults and rejects wrong types', () => {
  assert.deepEqual(Config({}), { hideGlobalTools: true, keepGlobalTools: [], hideGlobalSkills: true, keepGlobalSkills: [] })
  assert.throws(() => Config({ keepGlobalTools: 'mcp__fetch__fetch' }))
})
