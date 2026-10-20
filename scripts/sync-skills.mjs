#!/usr/bin/env node
/**
 * Replace `skills/` with the split skills of one nai5-prompting release tag
 * and rewrite `vendor.json`. Every skill file is checked against that
 * release's own `SHA256SUMS.txt` before this checkout changes, and the copied
 * files are never edited afterwards (see VENDOR.md).
 *
 * Usage: node scripts/sync-skills.mjs <tag> [--repo <git url>]
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DEFAULT_REPO = 'https://github.com/Miint-Sunny/nai5-prompting.git'

/**
 * Parse `<tag> [--repo <url>]`.
 * @param argv - arguments after the script path.
 * @returns the release tag and git URL.
 */
function parseArgs(argv) {
  const args = [...argv]
  let repo = DEFAULT_REPO
  const repoAt = args.indexOf('--repo')
  if (repoAt !== -1) {
    repo = args[repoAt + 1]
    if (repo === undefined) throw new Error('--repo 后面要跟仓库地址')
    args.splice(repoAt, 2)
  }
  if (args.length !== 1) throw new Error('用法：node scripts/sync-skills.mjs <tag> [--repo <git url>]')
  return { tag: args[0], repo }
}

/**
 * Run git and return its trimmed stdout, failing on a non-zero exit.
 * @param args - git arguments.
 * @returns standard output.
 */
function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} 退出码 ${String(result.status)}`)
  return result.stdout.trim()
}

/**
 * List files below a directory as slash-separated paths relative to `base`.
 * @param dir - directory to walk.
 * @param base - directory the returned paths are relative to.
 * @returns sorted relative file paths.
 */
function listFiles(dir, base) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...listFiles(path, base))
    else if (entry.isFile()) files.push(relative(base, path).split(sep).join('/'))
    else throw new Error(`技能目录里有不是普通文件的条目：${path}`)
  }
  return files.sort()
}

/**
 * SHA-256 of one file.
 * @param path - file path.
 * @returns lowercase hex digest.
 */
function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/**
 * Read the `skills/` entries of a release checksum list.
 * @param text - SHA256SUMS.txt content.
 * @returns map from relative path to digest.
 */
function skillSums(text) {
  const sums = new Map()
  for (const line of text.split('\n')) {
    const match = /^([0-9a-f]{64})\s+\*?(skills\/.+)$/.exec(line.trim())
    if (match !== null) sums.set(match[2], match[1])
  }
  return sums
}

function main() {
  const { tag, repo } = parseArgs(process.argv.slice(2))
  const work = mkdtempSync(join(tmpdir(), 'nai5-sync-'))
  try {
    const checkout = join(work, 'repo')
    git(['-c', 'advice.detachedHead=false', 'clone', '--quiet', '--depth', '1', '--branch', tag, repo, checkout])
    const commit = git(['-C', checkout, 'rev-parse', 'HEAD'])
    const source = JSON.parse(readFileSync(join(checkout, 'SOURCE.json'), 'utf8'))
    if (source.form !== 'split') throw new Error(`${tag} 的 SOURCE.json 不是拆分版（form=${String(source.form)}）`)
    const skillOrder = source.skill_order
    if (!Array.isArray(skillOrder) || skillOrder.length === 0) throw new Error(`${tag} 的 SOURCE.json 没有 skill_order`)

    const sums = skillSums(readFileSync(join(checkout, 'SHA256SUMS.txt'), 'utf8'))
    const files = listFiles(join(checkout, 'skills'), checkout)
    const unlisted = files.filter(file => !sums.has(file))
    const missing = [...sums.keys()].filter(file => !files.includes(file))
    if (unlisted.length > 0 || missing.length > 0) {
      throw new Error(`技能文件与 SHA256SUMS.txt 不一致：清单外 ${unlisted.join(', ') || '无'}；缺少 ${missing.join(', ') || '无'}`)
    }
    for (const file of files) {
      if (sha256(join(checkout, file)) !== sums.get(file)) throw new Error(`校验和不符：${file}`)
    }
    for (const skill of skillOrder) {
      if (!existsSync(join(checkout, 'skills', skill, 'SKILL.md'))) throw new Error(`skill_order 里的 ${skill} 没有 SKILL.md`)
    }

    rmSync(join(ROOT, 'skills'), { recursive: true, force: true })
    cpSync(join(checkout, 'skills'), join(ROOT, 'skills'), { recursive: true })
    const manifest = {
      source: repo.replace(/\.git$/, ''),
      tag,
      commit,
      form: source.form,
      skillOrder,
      files: Object.fromEntries(files.map(file => [file, sums.get(file)])),
    }
    writeFileSync(join(ROOT, 'vendor.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    console.log(`已同步 ${tag}（${commit.slice(0, 12)}）：${String(skillOrder.length)} 个技能，${String(files.length)} 个文件。`)
    console.log('接着更新 README 里的技能版本，运行 npm test，再提交。')
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

main()
