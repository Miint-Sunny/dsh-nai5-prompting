// The bundle patch declares one clean preset whose rows the loader can mount.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse } from 'yaml'
import { Config } from '../lib/index.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

/** `!!js` values stay recognizable instead of being evaluated. */
const jsTag = { tag: 'tag:yaml.org,2002:js', resolve: source => ({ js: source }) }
const patch = parse(readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8'), { customTags: [jsTag] })
const preset = patch[0].insert[0]
const rows = preset.config.plugins
const row = id => rows.find(entry => entry.id === id)

/** Packages a clean prompting preset may mount; shells, terminals, delegation and planning stay out. */
const ALLOWED_PLUGINS = new Set([
  '@deepseek-ai/dsh-persona',
  '@deepseek-ai/dsh-agent-instructions',
  '@deepseek-ai/dsh-tool-fs',
  '@deepseek-ai/dsh-tool-ask-user',
  '@deepseek-ai/dsh-tool-web',
  '@deepseek-ai/dsh-skill-filesystem',
  '@deepseek-ai/dsh-tool-skill',
  '@deepseek-ai/dsh-compaction-basic',
  '@deepseek-ai/dsh-command-compact',
  'cordis:group',
  pkg.name,
])

function walk(entries, visit) {
  for (const entry of entries) {
    visit(entry)
    if (entry.group === true) walk(entry.config, visit)
  }
}

test('package.json declares the bundle, its engine range and the export the skill path needs', () => {
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.ok(existsSync(join(ROOT, pkg.dsh.bundle.patch)))
  assert.match(pkg.engines.dsh, /^>=0\.2\.1-rc\.2 /)
  assert.equal(pkg.exports['./package.json'], './package.json')
  for (const entry of ['lib', 'skills', 'cordis.patch.yml', 'vendor.json']) assert.ok(pkg.files.includes(entry), entry)
})

test('the patch inserts exactly one agent preset row', () => {
  assert.equal(patch.length, 1)
  assert.equal(patch[0].insert.length, 1)
  assert.equal(preset.id, 'preset-nai5-prompting')
  assert.equal(preset.name, '@deepseek-ai/dsh-agent-preset')
  assert.equal(preset.config.id, 'nai5-prompting')
  assert.ok(preset.config.name.length > 0)
  assert.ok(preset.config.description.length > 0)
  assert.equal(typeof preset.config.order, 'number')
})

test('every row names an allowed plugin, and ids are unique within each list', () => {
  const lists = [rows]
  walk(rows, entry => {
    assert.equal(typeof entry.name, 'string')
    assert.ok(ALLOWED_PLUGINS.has(entry.name), `unexpected plugin row ${entry.name}`)
    if (entry.group === true) lists.push(entry.config)
  })
  for (const list of lists) {
    const ids = list.map(entry => entry.id)
    assert.equal(new Set(ids).size, ids.length)
  }
})

test('the persona replaces the whole system prompt and interpolates nothing', () => {
  const persona = row('persona').config
  assert.equal(persona.complete, true)
  assert.equal(persona.includeRuntimeContext, false)
  assert.ok(persona.prefix.length > 200)
  // dsh-persona interpolates `{{name}}` strictly and has no opt-out.
  assert.ok(!persona.prefix.includes('{{'))
  assert.ok(!persona.prefix.includes('}}'))
})

test('the isolation row names this package with a valid configuration', () => {
  const isolation = row('isolation')
  assert.equal(isolation.name, pkg.name)
  assert.deepEqual(new Config(isolation.config), {
    hideGlobalTools: true,
    keepGlobalTools: [],
    hideGlobalSkills: true,
    keepGlobalSkills: [],
  })
})

test('workspace instructions come from NAI.md only', () => {
  const config = row('agent-instructions').config
  assert.deepEqual(config.instructionFileCandidates, ['NAI.md'])
  assert.deepEqual(config.localInstructionFileCandidates, [])
  assert.ok(config.maxBytes > 0)
})

test('the skill provider reads only the vendored skills directory', () => {
  const config = row('skill-filesystem').config
  assert.equal(config.includeDefaultRoots, false)
  assert.equal(config.customSkillDirs.length, 1)
  const profile = mkdtempSync(join(tmpdir(), 'nai5-profile-'))
  try {
    mkdirSync(join(profile, 'node_modules'))
    symlinkSync(ROOT, join(profile, 'node_modules', pkg.name), 'dir')
    // The loader evaluates `!!js` with the profile directory as `baseUrl`.
    const evaluate = new Function('baseUrl', 'process', `return (${config.customSkillDirs[0].js})`)
    const dir = evaluate(pathToFileURL(`${profile}/`).href, process)
    assert.equal(dir, join(ROOT, 'skills'))
  } finally {
    rmSync(profile, { recursive: true, force: true })
  }
})

test('the preset mounts the skill tool, file tools, web tools and compaction', () => {
  assert.ok(row('tool-skill'))
  assert.ok(row('tool-ask-user'))
  assert.deepEqual(row('tool-fs').config, { read: true, readImage: true, write: true, edit: true })
  assert.equal(row('tool-web').config.search, true)
  assert.equal(row('tool-web').config.fetch, true)
  const compaction = row('compaction')
  assert.equal(compaction.group, true)
  assert.deepEqual(compaction.config.map(entry => entry.name), ['@deepseek-ai/dsh-compaction-basic', '@deepseek-ai/dsh-command-compact'])
})
