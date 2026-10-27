#!/usr/bin/env node
/**
 * Gate wrapper: `check-all.ts` runs scripts from this directory, so the generator that lives with
 * its package is reached through here. It runs the generator once per target — the default
 * `tracy` theme, then every `overlays/<slug>/theme.config.json` the package holds (discovered by
 * listing, never a list kept here) — and `--check` passes straight through to each run. Every
 * target runs even after one fails, so one gate names every stale tree; the exit code is the
 * first non-zero one.
 *
 *   node scripts/build-wordpress-theme.mjs --check
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PKG = path.join(ROOT, 'packages', 'cms', 'tracy-wordpress-theme')
const script = path.join(PKG, 'scripts', 'build.mjs')
const overlays = path.join(PKG, 'overlays')
const targets = [
  'tracy',
  ...(existsSync(overlays)
    ? readdirSync(overlays, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(path.join(overlays, e.name, 'theme.config.json')))
        .map((e) => e.name)
        .sort()
    : [])
]

let status = 0
for (const target of targets) {
  const result = spawnSync(process.execPath, [script, '--target', target, ...process.argv.slice(2)], {
    stdio: 'inherit'
  })
  if ((result.status ?? 1) !== 0 && status === 0) status = result.status ?? 1
}
process.exit(status)
