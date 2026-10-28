#!/usr/bin/env node
/**
 * The arguments `check-all` gives the `turbo-config` gate, per CI event.
 *
 *   node --test scripts/test/check-all-turbo-config-args.test.mjs
 *
 * WHY THIS IS A TEST (28/10/2026). On a pull request the gate traced the suites of every task the
 * diff touched (`--changed-since HEAD^1`) and took 8.3 and 26.0 minutes of the `checks` row in two
 * runs, while every other gate took seconds to 2 minutes. Pull requests now run `--structure-only`
 * (no suite traced); the full trace moved to the nightly and manual runs. A change that brings the
 * trace back to pull requests, or drops it from the nightly or from a local `pnpm build:check`, is
 * one line in `TURBO_CONFIG_ARGS` — this pins all four cases.
 *
 * HOW. The real `scripts/check-all.ts` runs with `--only turbo-config`; a preload in a `data:` URL
 * wraps `spawnSync` so the gate's argv is printed and a child that exits 0 runs instead of the
 * tracer. Any other spawn throws, so no real gate runs from here.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const PRELOAD = `
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { basename } from 'node:path'

const real = childProcess.spawnSync
childProcess.spawnSync = (command, args, options) => {
  const at = (args ?? []).findIndex((arg) => basename(String(arg)) === 'turbo-setup.mjs')
  if (at === -1) throw new Error('unplanned spawnSync in the turbo-config args test')
  process.stdout.write('turbo-config-args: ' + JSON.stringify(args.slice(at + 1)) + '\\n')
  return real(process.execPath, ['-e', 'process.exit(0)'], options)
}
syncBuiltinESMExports()
`

/**
 * Run the real check-all for the `turbo-config` gate only.
 * @param {Record<string, string>} env - the CI variables of the case; others are removed.
 * @returns {string[]} the argv the gate's script received after its path.
 */
function turboConfigArgs(env) {
  const base = { ...process.env }
  delete base.GITHUB_EVENT_NAME
  delete base.TRACY_TURBO_TASK_AUDITS
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--import',
      `data:text/javascript,${encodeURIComponent(PRELOAD)}`,
      'scripts/check-all.ts',
      '--only',
      'turbo-config'
    ],
    { cwd: ROOT, encoding: 'utf8', timeout: 20_000, env: { ...base, ...env } }
  )
  assert.equal(result.error, undefined, 'check-all itself must start and finish in time')
  assert.equal(result.status, 0, result.stderr)
  const line = result.stdout.split('\n').find((l) => l.startsWith('turbo-config-args: '))
  assert.ok(line, 'the turbo-config gate must have been spawned')
  return JSON.parse(line.slice('turbo-config-args: '.length))
}

test('a pull request traces no suite, with or without Turbo data', () => {
  assert.deepEqual(turboConfigArgs({ GITHUB_EVENT_NAME: 'pull_request' }), ['--check', '--structure-only'])
  assert.deepEqual(turboConfigArgs({ GITHUB_EVENT_NAME: 'pull_request', TRACY_TURBO_TASK_AUDITS: '1' }), [
    '--check',
    '--structure-only'
  ])
})

test('the nightly and manual runs without Turbo data trace every task', () => {
  assert.deepEqual(turboConfigArgs({ GITHUB_EVENT_NAME: 'schedule' }), ['--check'])
  assert.deepEqual(turboConfigArgs({ GITHUB_EVENT_NAME: 'workflow_dispatch' }), ['--check'])
})

test('the nightly with forced, self-auditing Turbo tasks leaves only the structure here', () => {
  assert.deepEqual(turboConfigArgs({ GITHUB_EVENT_NAME: 'schedule', TRACY_TURBO_TASK_AUDITS: '1' }), [
    '--check',
    '--structure-only'
  ])
})

test('a local pnpm build:check traces every task as before', () => {
  assert.deepEqual(turboConfigArgs({}), ['--check'])
})

test('a misspelt gate name is still refused', () => {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/check-all.ts', '--only', 'turbo-confg'],
    { cwd: ROOT, encoding: 'utf8', timeout: 20_000 }
  )
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /names no such gate: turbo-confg/)
})
