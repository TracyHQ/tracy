#!/usr/bin/env node
/**
 * Gate wrapper: `check-all.ts` runs scripts from this directory, so the Business template's
 * README diagram generator, which lives with its package and reads that package's own sources,
 * is reached through here. `--check` passes straight through; cwd is the package, because the
 * generator resolves every source relative to it.
 *
 *   node scripts/build-emdash-diagrams.mjs --check
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = path.join(ROOT, 'packages', 'cms', 'tracy-emdash-theme-business')
const script = path.join(pkg, 'tools', 'diagrams.mjs')
const result = spawnSync(process.execPath, [script, ...process.argv.slice(2)], {
  cwd: pkg,
  stdio: 'inherit'
})
process.exit(result.status ?? 1)
