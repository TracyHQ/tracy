/**
 * The deterministic half of the regression runner. A case that carries `run` (see `RunSpec` in
 * `catalogue.mjs`) is judged by its own command: exit code first, then every test the case names
 * must report `ok` in the TAP output. No model reads the case, so a rerun costs no tokens (plan
 * `tasks/todo-regression-deterministic.md`, decided 05/10/2026).
 *
 * Named tests are checked even on exit 0 because exit 0 alone cannot tell "the guarded test passed"
 * from "the guarded test was deleted or renamed": the second is a green that guards nothing.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Default time a command may run, in seconds. */
export const DEFAULT_TIMEOUT_S = 600

/**
 * Which of a run's needs this machine cannot meet.
 * @param {import('./catalogue.mjs').RunSpec} run - the case's run.
 * @param {{env: Record<string, string | undefined>, stand: string | null, cdpUp: boolean}} ctx - what the machine has.
 * @returns {string[]} one line per unmet need; empty when the case can run.
 */
export function missingNeeds(run, ctx) {
  const missing = []
  for (const need of run.needs ?? []) {
    if (need === 'postgres' && !ctx.env.TEST_DATABASE_URL)
      missing.push('postgres: TEST_DATABASE_URL is not set')
    if (need === 'stand' && !ctx.stand) missing.push('stand: no --stand given')
    if (need === 'chrome' && !ctx.cdpUp) missing.push('chrome: no Chrome answers on the CDP endpoint')
  }
  return missing
}

/**
 * Check named tests against TAP output: each name must prefix the title of an `ok` line, and no
 * `not ok` line it prefixes may exist. An `ok … # SKIP` or `ok … # TODO` line is a test that did not
 * run, so it counts as failed: a guarded test skipped for want of a database guards nothing.
 * @param {string} output - the command's stdout.
 * @param {string[]} names - test-name prefixes.
 * @returns {{ok: boolean, missing: string[], failed: string[]}} the judgement.
 */
export function tapVerdict(output, names) {
  const lines = output.split('\n').map((l) => l.trim())
  // TAP escapes `#` and `\` in a title (`\#1436`); a case names the test as it is written.
  const titles = (prefix) =>
    lines
      .filter((l) => l.startsWith(prefix))
      .map((l) => l.replace(/^(?:not )?ok \d+ - /, '').replace(/\\([#\\])/g, '$1'))
  const notRun = (t) => /\s#\s*(?:SKIP|TODO)\b/i.test(t)
  const passed = titles('ok ').filter((t) => !notRun(t))
  const notOk = [...titles('not ok '), ...titles('ok ').filter(notRun)]
  const failed = names.filter((n) => notOk.some((t) => t.startsWith(n)))
  const missing = names.filter((n) => !failed.includes(n) && !passed.some((t) => t.startsWith(n)))
  return { ok: failed.length === 0 && missing.length === 0, missing, failed }
}

/**
 * The command's environment: the caller's, with the stand URL as TRACY_STAND, and without
 * NODE_TEST_CONTEXT — set by a surrounding `node --test`, it makes a child `node --test` report to
 * its parent instead of printing TAP.
 * @param {{env: Record<string, string | undefined>, stand: string | null}} ctx - caller's env and stand.
 * @returns {Record<string, string | undefined>} the environment.
 */
function childEnv(ctx) {
  const env = { ...ctx.env, ...(ctx.stand ? { TRACY_STAND: ctx.stand } : {}) }
  delete env.NODE_TEST_CONTEXT
  return env
}

/**
 * Run one case's command and judge it.
 * @param {import('./catalogue.mjs').RunSpec} run - the case's run.
 * @param {{root: string, env: Record<string, string | undefined>, stand: string | null, cdpUp: boolean}} ctx - where and with what.
 * @returns {{verdict: 'PASS' | 'FAIL' | 'BLOCKED', reason: string, output: string, ms: number}} the result.
 */
export function runScript(run, ctx) {
  const missing = missingNeeds(run, ctx)
  if (missing.length > 0) return { verdict: 'BLOCKED', reason: missing.join('; '), output: '', ms: 0 }
  // `node --test a b` silently skips a missing `b` and exits 0 on `a` alone: check every argument that
  // names a file before running, so a test file that moved away fails the case instead of passing it.
  const cwd = run.cwd ? join(ctx.root, run.cwd) : ctx.root
  // Playwright reads a spec argument against the `-c` config's folder (`specs/<id>.spec.mjs`), so a file
  // found there is not lost either.
  const configAt = run.cmd.indexOf('-c')
  const configDir = configAt > 0 && run.cmd[configAt + 1] ? dirname(join(cwd, run.cmd[configAt + 1])) : null
  const lostFiles = run.cmd
    .slice(1)
    .filter(
      (a) => !a.startsWith('-') && !a.includes('*') && /\.(?:test\.)?(?:mjs|cjs|js|ts|tsx|mts)$/.test(a)
    )
    .filter((a) => !existsSync(join(cwd, a)) && !(configDir && existsSync(join(configDir, a))))
  // The public export leaves `tasks/` out; a case run from it cannot run there, which is no verdict.
  const internal = existsSync(join(ctx.root, 'tasks')) ? [] : lostFiles.filter((a) => a.startsWith('tasks/'))
  if (internal.length > 0 && internal.length === lostFiles.length)
    return {
      verdict: 'BLOCKED',
      reason: `internal, not in this tree: ${internal.join(', ')}`,
      output: '',
      ms: 0
    }
  if (lostFiles.length > 0)
    return { verdict: 'FAIL', reason: `test file not found: ${lostFiles.join(', ')}`, output: '', ms: 0 }
  const timeoutS = run.timeout_s ?? DEFAULT_TIMEOUT_S
  const started = Date.now()
  const r = spawnSync(run.cmd[0], run.cmd.slice(1), {
    cwd,
    // NODE_TEST_CONTEXT is set by a surrounding `node --test`; a child `node --test` that inherits it
    // reports to its parent instead of printing TAP, and the case cannot be read.
    env: childEnv(ctx),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: timeoutS * 1000,
    maxBuffer: 256 * 1024 * 1024
  })
  const ms = Date.now() - started
  const output = `${r.stdout ?? ''}\n--- stderr ---\n${r.stderr ?? ''}`
  if (r.error && /** @type {NodeJS.ErrnoException} */ (r.error).code === 'ETIMEDOUT')
    return { verdict: 'FAIL', reason: `timed out after ${String(timeoutS)} s`, output, ms }
  if (r.error) return { verdict: 'FAIL', reason: `could not start: ${r.error.message}`, output, ms }
  // Exit 3 with a `CANNOT RUN:` line is the case scripts' "this machine lacks something" (scripts/lib.mjs).
  const cannot = r.status === 3 ? /^CANNOT RUN: (.*)$/m.exec(r.stdout ?? '') : null
  if (cannot) return { verdict: 'BLOCKED', reason: cannot[1], output, ms }
  if (r.status !== 0) return { verdict: 'FAIL', reason: `exit ${String(r.status ?? r.signal)}`, output, ms }
  // `node --test a b` with `b` missing prints this and still exits 0 when `a` passes: a test file
  // moved away (dsh-passwords 2.7.7 moved its tests under test/tracy/, 05/10/2026) must not read green.
  const lost = [...output.matchAll(/^Could not find '([^']+)'/gm)].map((m) => m[1])
  if (lost.length > 0)
    return { verdict: 'FAIL', reason: `test file not found: ${lost.join(', ')}`, output, ms }
  if (run.tests) {
    const t = tapVerdict(r.stdout ?? '', run.tests)
    if (!t.ok) {
      const parts = [
        ...(t.failed.length > 0 ? [`not ok: ${t.failed.join(', ')}`] : []),
        ...(t.missing.length > 0 ? [`not found: ${t.missing.join(', ')}`] : [])
      ]
      return { verdict: 'FAIL', reason: parts.join('; '), output, ms }
    }
  }
  return { verdict: 'PASS', reason: '', output, ms }
}
