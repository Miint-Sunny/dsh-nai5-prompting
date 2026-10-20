// The vendored skills stay byte-identical to the release recorded in vendor.json.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const vendor = JSON.parse(readFileSync(join(ROOT, 'vendor.json'), 'utf8'))

function listFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...listFiles(path))
    else files.push(relative(ROOT, path).split(sep).join('/'))
  }
  return files.sort()
}

test('vendor.json pins one split release by commit', () => {
  assert.equal(vendor.form, 'split')
  assert.match(vendor.commit, /^[0-9a-f]{40}$/)
  assert.equal(vendor.skillOrder.length, 11)
})

test('skills/ holds exactly the files listed in vendor.json', () => {
  assert.deepEqual(listFiles(join(ROOT, 'skills')), Object.keys(vendor.files).sort())
})

test('every vendored file matches its release checksum', () => {
  for (const [file, digest] of Object.entries(vendor.files)) {
    const actual = createHash('sha256').update(readFileSync(join(ROOT, file))).digest('hex')
    assert.equal(actual, digest, `${file} differs from ${vendor.tag}; rerun scripts/sync-skills.mjs instead of editing it`)
  }
})

test('every skill in skillOrder has a SKILL.md whose frontmatter names it', () => {
  for (const skill of vendor.skillOrder) {
    const text = readFileSync(join(ROOT, 'skills', skill, 'SKILL.md'), 'utf8')
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)
    assert.ok(frontmatter, `${skill} has no frontmatter`)
    assert.match(frontmatter[1], new RegExp(`^name: ${skill}$`, 'm'))
    assert.match(frontmatter[1], /^description: \S/m)
  }
})
