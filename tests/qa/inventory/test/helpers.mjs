// Fixture helpers for the inventory selftests. Scratch trees live under QA_INVENTORY_TEST_ARTIFACTS
// (or the OS temp dir) in a per-process folder that `cleanup()` removes.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

let base = null
export function scratchBase() {
  if (!base) {
    const parent = process.env.QA_INVENTORY_TEST_ARTIFACTS || tmpdir()
    mkdirSync(parent, { recursive: true })
    base = mkdtempSync(join(realpathSync(parent), 'qa-inventory-test-'))
  }
  return base
}
export function cleanup() {
  if (base) rmSync(base, { recursive: true, force: true })
  base = null
}

/** Create a scratch root holding `files` ({ relPath: text }). */
export function makeRoot(files = {}) {
  const root = mkdtempSync(join(scratchBase(), 'root-'))
  for (const [rel, text] of Object.entries(files)) put(root, rel, text)
  return root
}
export function put(root, rel, text) {
  const full = join(root, rel)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, text)
}
export const sha = (text) => createHash('sha256').update(text).digest('hex')
export const json = (v) => `${JSON.stringify(v, null, 2)}\n`

export function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
}
export function gitInit(root) {
  git(root, 'init', '-q')
  git(root, 'config', 'user.email', 'qa@example.invalid')
  git(root, 'config', 'user.name', 'qa')
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', 'fixture')
  return git(root, 'rev-parse', 'HEAD')
}
