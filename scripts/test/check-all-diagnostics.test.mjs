#!/usr/bin/env node
/**
 * What `check-all` says about a gate that did not exit 0.
 *
 *   node --test scripts/test/check-all-diagnostics.test.mjs
 *
 * WHY THIS IS A TEST. `runGate` kept only `status === 0`, so a gate ended by a signal left a log
 * with a gate that starts and then is gone. The line added for that must name what the operating
 * system reported and nothing else: no cause, no absolute path, and no change to the verdict.
 *
 * HOW. The real `scripts/check-all.ts` runs in a subprocess with `--only` naming real gates. A
 * preload held in a `data:` URL (nothing is written to disk) wraps `spawnSync`: each gate's call
 * is sent, through the REAL `spawnSync` and with the gate's own options, to a tiny child that
 * exits 0, exits non-zero, signals itself, or to a command that does not exist. No result is
 * faked — status, signal and error are what Node returned for a real child. A gate the case did
 * not plan throws, so no real gate can run from here.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** Child behaviours, keyed by the word a case's plan uses. */
const PRELOAD = `
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { basename } from 'node:path'

const plan = JSON.parse(process.env.CHECK_ALL_TEST_PLAN)
const real = childProcess.spawnSync
const children = {
  pass: [process.execPath, ['-e', 'process.exit(0)']],
  exit7: [process.execPath, ['-e', 'process.exit(7)']],
  sigterm: [process.execPath, ['-e', "process.kill(process.pid, 'SIGTERM'); setInterval(() => {}, 1000)"]],
  enoent: ['check-all-test-no-such-command', []]
}
childProcess.spawnSync = (command, args, options) => {
  const script = (args ?? []).map((arg) => basename(String(arg))).find((name) => name in plan)
  if (script === undefined) throw new Error('unplanned spawnSync in the check-all diagnostics test')
  const [childCommand, childArgs] = children[plan[script]]
  return real(childCommand, childArgs, options)
}
syncBuiltinESMExports()
`

/**
 * Run the real check-all with planned gate children.
 * @param {Record<string, { script: string, child: string }>} gates - gate name → script and child.
 * @returns {{ status: number | null, stdout: string, stderr: string }} what the CLI did.
 */
function runCheckAll(gates) {
  const plan = Object.fromEntries(Object.values(gates).map((gate) => [gate.script, gate.child]))
  const only = Object.keys(gates).flatMap((name) => ['--only', name])
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--import',
      `data:text/javascript,${encodeURIComponent(PRELOAD)}`,
      'scripts/check-all.ts',
      ...only
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 20_000,
      env: { ...process.env, CHECK_ALL_TEST_PLAN: JSON.stringify(plan) }
    }
  )
  assert.equal(result.error, undefined, 'check-all itself must start and finish in time')
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

/**
 * The diagnostic lines of one run.
 * @param {string} stderr - the CLI's stderr.
 * @returns {string[]} lines of the form `check-all: gate <name> failed: …`.
 */
function diagnostics(stderr) {
  return stderr.split('\n').filter((line) => /^check-all: gate \S+ failed: /.test(line))
}

/**
 * Nothing machine-specific may reach the diagnostic.
 * @param {string[]} lines - the diagnostic lines.
 */
function assertNoMachineDetail(lines) {
  for (const line of lines) {
    assert.ok(!line.includes(ROOT), `repository path in: ${line}`)
    assert.ok(!line.includes(process.execPath), `executable path in: ${line}`)
    assert.ok(!line.includes('/'), `a path in: ${line}`)
    assert.ok(!/spawnSync|\bat\b|Error:/.test(line), `raw error text in: ${line}`)
  }
}

test('a gate that exits 0 passes and prints no failure line', () => {
  const run = runCheckAll({ 'doc-links': { script: 'check-doc-links.ts', child: 'pass' } })
  assert.equal(run.status, 0)
  assert.deepEqual(diagnostics(run.stderr), [])
  assert.match(run.stdout, /^check-all: doc-links$/m)
  assert.match(run.stdout, /^check-all: 1 gate\(s\) passed \(--only: /m)
})

test('a non-zero exit is reported with its numeric status', () => {
  const run = runCheckAll({ 'doc-links': { script: 'check-doc-links.ts', child: 'exit7' } })
  assert.equal(run.status, 1)
  assert.deepEqual(diagnostics(run.stderr), ['check-all: gate doc-links failed: status=7'])
  assert.match(run.stderr, /^check-all: 1 gate\(s\) failed: doc-links$/m)
})

test('a gate ended by a signal is reported as that signal, with no invented status or cause', () => {
  const run = runCheckAll({ 'doc-links': { script: 'check-doc-links.ts', child: 'sigterm' } })
  assert.equal(run.status, 1)
  assert.deepEqual(diagnostics(run.stderr), ['check-all: gate doc-links failed: signal=SIGTERM'])
  assert.doesNotMatch(run.stderr, /status=|\b143\b|\b137\b|OOM|memory/i)
  assert.match(run.stderr, /^check-all: 1 gate\(s\) failed: doc-links$/m)
})

test('a gate that cannot be spawned is reported by error code only', () => {
  const run = runCheckAll({ 'doc-links': { script: 'check-doc-links.ts', child: 'enoent' } })
  assert.equal(run.status, 1)
  const lines = diagnostics(run.stderr)
  assert.deepEqual(lines, ['check-all: gate doc-links failed: spawn-error=ENOENT'])
  assert.ok(!run.stderr.includes('check-all-test-no-such-command'), 'the command name stays out')
  assertNoMachineDetail(lines)
})

test('every selected gate still runs after a failure, and the summary names each failed gate', () => {
  const run = runCheckAll({
    'doc-links': { script: 'check-doc-links.ts', child: 'sigterm' },
    'doc-index': { script: 'gen-doc-index.ts', child: 'exit7' },
    'self-contained': { script: 'check-self-contained.ts', child: 'enoent' },
    bundles: { script: 'check-bundles.ts', child: 'pass' }
  })
  assert.equal(run.status, 1)
  const started = run.stdout.split('\n').filter((line) => /^check-all: \S+$/.test(line))
  assert.equal(started.length, 4, 'all four selected gates started')
  const lines = diagnostics(run.stderr)
  assert.deepEqual(
    [...lines].sort(),
    [
      'check-all: gate doc-index failed: status=7',
      'check-all: gate doc-links failed: signal=SIGTERM',
      'check-all: gate self-contained failed: spawn-error=ENOENT'
    ].sort()
  )
  assertNoMachineDetail(lines)
  const summary = run.stderr.split('\n').find((line) => line.includes('gate(s) failed'))
  assert.ok(summary, 'the summary line is kept')
  assert.match(summary, /^check-all: 3 gate\(s\) failed: /)
  for (const name of ['doc-links', 'doc-index', 'self-contained']) assert.ok(summary.includes(name))
  assert.ok(!summary.includes('bundles'))
})
