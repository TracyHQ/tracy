#!/usr/bin/env node
/**
 * Gate wrapper: `check-all.ts` runs scripts from this directory, so the motion library's generator
 * that lives with its package is reached through here. `--check` passes straight through.
 *
 *   node scripts/build-cms-motion.mjs --check
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const script = path.join(ROOT, 'packages', 'cms', 'tracy-cms-motion', 'scripts', 'build.mjs')
const result = spawnSync(process.execPath, [script, ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(result.status ?? 1)
