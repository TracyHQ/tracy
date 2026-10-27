/**
 * `rerun` (plan §4.10): the ONLY way a lane's test code is run again — always `node --test` inside
 * the lane's `test` fence profile (G2 `renderProfile`), with an environment built by hand, and the
 * result written as JSON. Reports and issues print `scripts/qa/rerun <lane> <pr> [case]`, never a bare
 * `node --test` or `bash` line.
 *
 * Layout it expects (fence `test` profile reads both; `installTestlib` puts the lib there):
 *   r/<runId>/<lane>/pr/<pr>/tests/<case>.test.mjs     the lane's tests (import `../lib/<x>.mjs`)
 *   r/<runId>/<lane>/pr/<pr>/lib/                      the test library, read-only
 * Results: r/<runId>/<lane>/results/rerun/<pr>-<target>-<stamp>/{result.json, events.jsonl, output.txt};
 * the tests see that folder as QA_RESULTS. Spawns are journaled in r/<runId>/procs.jsonl.
 *
 * CLI:  scripts/qa/rerun <lane> <pr> [<case id> | <path to a .test.mjs>] [--run-id <id>]
 *                        [--timeout-ms <n>] [--json]
 *       scripts/qa/rerun --self-check      real sandbox-exec: a sample test runs fenced and cannot
 *                                          read ~/.zshenv (exit 0 = holds)
 *       Env: QA_HOME, QA_WORKTREES (default ~/TCH-worktrees), TRACY_ORIGIN.
 *
 * Exports:
 *   rerunCommand(lane, pr, target?): string                 // the line reports print
 *   resolveTargets({ layout, target? }): { testsDir, libDir, files: string[], target: string }
 *   buildEnv({ layout, lane, pr, runId, ports, origin, resultDir, extraEnv? }): object   // pure
 *   rerunPlan({ lane, pr, target?, runId, qaHome?, worktrees?, ports?, origin?, stamp?, extraEnv?,
 *               perTestMs? }): Plan
 *   rerun(opts same as rerunPlan + { timeoutMs? = 20 min }): Promise<Result>
 *   selfCheck({ keep? }): Promise<{ ok, result, control }>
 *   removeTree(dir): void                                     // rm -rf through read-only folders
 * Plan:   { layout, testsDir, libDir, files, target, resultDir, eventsFile, outputFile, resultFile,
 *           profile: { file, sha256 }, argv: string[], env }
 * Result: { lane, pr, target, runId, command, ok, exitCode, signal, timedOut, startedAt, endedAt, ms,
 *           profile, files: [{ path, sha256 }], libSha256, tests: [...], summary: { pass, fail, skip },
 *           outputTail }
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_PORTS, LANES, laneLayout, renderProfile, sandboxArgv } from '../fence/render.mjs'
import { installTestlib, libDigest } from '../testlib/install.mjs'
import { appendLine } from './journal.mjs'
import { qaHome as defaultQaHome, readActiveRun, writeJsonAtomic } from './state.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const CASE_ID = /^pr\d+-k\d+$/
const sha256 = (b) => createHash('sha256').update(b).digest('hex')
const OUTPUT_CAP = 256 * 1024

export const rerunCommand = (lane, pr, target) =>
  ['scripts/qa/rerun', lane, String(pr), ...(target && target !== 'all' ? [target] : [])].join(' ')

export function resolveTargets({ layout, target }) {
  const testsDir = layout.prTestDir
  const libDir = join(layout.prDir, 'lib')
  let files
  if (!target || target === 'all') {
    if (!existsSync(testsDir)) throw new Error(`rerun: no tests folder ${testsDir}`)
    files = readdirSync(testsDir)
      .filter((n) => n.endsWith('.test.mjs'))
      .sort()
      .map((n) => join(testsDir, n))
    target = 'all'
  } else if (CASE_ID.test(target)) {
    files = [join(testsDir, `${target}.test.mjs`)]
  } else {
    const abs = isAbsolute(target) ? target : resolve(target)
    const real = existsSync(abs) ? realpathSync(abs) : abs
    // The fence reads the lane's PR folder only; a test anywhere else could not run in it.
    if (relative(layout.prDir, real).startsWith('..') || !real.endsWith('.test.mjs'))
      throw new Error(`rerun: ${target} is not a .test.mjs inside ${layout.prDir}`)
    files = [real]
    target = relative(testsDir, real)
  }
  if (files.length === 0) throw new Error(`rerun: no .test.mjs in ${testsDir}`)
  for (const f of files) if (!existsSync(f)) throw new Error(`rerun: missing ${f}`)
  if (!existsSync(join(libDir, 'reporter.mjs'))) throw new Error(`rerun: no test library in ${libDir}`)
  return { testsDir, libDir, files, target }
}

export function buildEnv({ layout, lane, pr, runId, ports, origin, resultDir, extraEnv = {} }) {
  return {
    PATH: `${layout.nodeDir}/bin:/usr/bin:/bin`,
    HOME: join(layout.testTmp, 'home'),
    TMPDIR: layout.testTmp,
    LANG: 'en_US.UTF-8',
    NODE_OPTIONS: `--import=${layout.resolvePreload}`,
    QA_RESOLVE_ONLY: '1',
    QA_RUN_ID: runId,
    QA_LANE: lane,
    QA_PR: String(pr),
    QA_LANE_KEY_FILE: layout.laneKey,
    QA_GATE_URL: `http://127.0.0.1:${ports.gate}`,
    QA_CDP_PORT: String(ports.lanes[lane].cdp),
    TRACY_ORIGIN: origin,
    QA_RESULTS: resultDir,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'core.hooksPath',
    GIT_CONFIG_VALUE_0: '/dev/null',
    ...extraEnv
  }
}

export function rerunPlan({
  lane,
  pr,
  target,
  runId,
  qaHome = defaultQaHome(),
  worktrees = process.env.QA_WORKTREES ?? join(homedir(), 'TCH-worktrees'),
  ports = DEFAULT_PORTS,
  origin = process.env.TRACY_ORIGIN ?? 'http://qa.tracy.test:36080',
  stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, ''),
  extraEnv,
  perTestMs = 5 * 60_000
}) {
  if (!LANES.includes(lane)) throw new Error(`rerun: unknown lane ${lane}`)
  if (!/^\d+$/.test(String(pr))) throw new Error(`rerun: PR must be a number, got ${pr}`)
  if (!runId) throw new Error('rerun: no run id (pass --run-id, or run during a live run)')
  const layout = laneLayout({ qaHome, worktrees, runId, lane, pr: String(pr) })
  const t = resolveTargets({ layout, target })
  const slug = t.target.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/_test_mjs$/, '')
  const resultDir = join(layout.results, 'rerun', `${pr}-${slug}-${stamp}`)
  const eventsFile = join(resultDir, 'events.jsonl')
  const profile = renderProfile({
    lane,
    kind: 'test',
    layout,
    ports,
    outDir: join(layout.qaHome, 'r', runId, 'profiles')
  })
  const node = realpathSync(process.execPath)
  const argv = sandboxArgv(profile.file, [
    node,
    '--test',
    '--test-concurrency=1',
    `--test-timeout=${perTestMs}`,
    `--test-reporter=${join(t.libDir, 'reporter.mjs')}`,
    `--test-reporter-destination=${eventsFile}`,
    ...t.files
  ])
  return {
    layout,
    ...t,
    resultDir,
    eventsFile,
    outputFile: join(resultDir, 'output.txt'),
    resultFile: join(resultDir, 'result.json'),
    profile: { file: profile.file, sha256: profile.sha256 },
    argv,
    env: buildEnv({ layout, lane, pr, runId, ports, origin, resultDir, extraEnv })
  }
}

function readEvents(file) {
  if (!existsSync(file)) return []
  const out = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line))
    } catch {}
  }
  return out
}

export async function rerun({ timeoutMs = 12 * 60_000, ...opts }) {
  const runId = opts.runId ?? readActiveRun(opts.qaHome ?? defaultQaHome())?.runId
  const plan = rerunPlan({ ...opts, runId })
  const { layout } = plan
  for (const d of [plan.resultDir, layout.testTmp, join(layout.testTmp, 'home')])
    mkdirSync(d, { recursive: true })
  const files = plan.files.map((f) => ({ path: relative(layout.prDir, f), sha256: sha256(readFileSync(f)) }))
  const libSha256 = libDigest(plan.libDir)
  const procs = join(layout.qaHome, 'r', runId, 'procs.jsonl')
  const startedAt = new Date()
  appendLine(procs, {
    t: 'intent',
    what: 'rerun',
    lane: opts.lane,
    pr: String(opts.pr),
    runId,
    target: plan.target
  })

  const out = openSync(plan.outputFile, 'w')
  const child = spawn(plan.argv[0], plan.argv.slice(1), {
    detached: true,
    stdio: ['ignore', out, out],
    env: plan.env,
    cwd: plan.testsDir
  })
  closeSync(out)
  appendLine(procs, { t: 'spawn', what: 'rerun', lane: opts.lane, runId, pid: child.pid, pgid: child.pid })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {}
  }, timeoutMs)
  const { code, signal } = await new Promise((r) => child.once('exit', (c, s) => r({ code: c, signal: s })))
  clearTimeout(timer)
  // Whatever the tests left running in their group goes with them.
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {}
  const endedAt = new Date()
  const events = readEvents(plan.eventsFile)
  const tests = events.filter((e) => e.t === 'test')
  // A file that never loaded fails as one "test" named after the file; its reason is on stderr.
  for (const t of tests) {
    if (t.ok || !t.error || (t.error.code && t.error.code !== 'ERR_TEST_FAILURE')) continue
    const err = events
      .filter((e) => e.t === 'stderr' && e.file === t.file)
      .map((e) => e.message)
      .join('')
    const code = /\b(ERR_[A-Z_]+)\b/.exec(err)?.[1]
    if (code) t.error = { ...t.error, code, stderr: err.slice(-2000) }
  }
  const summary = {
    pass: tests.filter((x) => x.ok && !x.skip && !x.todo).length,
    fail: tests.filter((x) => !x.ok).length,
    skip: tests.filter((x) => x.skip || x.todo).length
  }
  const output = existsSync(plan.outputFile) ? readFileSync(plan.outputFile) : Buffer.alloc(0)
  const result = {
    lane: opts.lane,
    pr: String(opts.pr),
    target: plan.target,
    runId,
    command: rerunCommand(opts.lane, opts.pr, plan.target),
    ok: code === 0 && !timedOut && summary.fail === 0 && tests.length > 0,
    exitCode: code,
    signal,
    timedOut,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    ms: endedAt - startedAt,
    profile: plan.profile,
    resultDir: plan.resultDir,
    files,
    libSha256,
    tests,
    summary,
    outputTail: output.subarray(Math.max(0, output.length - 4000)).toString('utf8')
  }
  if (output.length > OUTPUT_CAP) writeFileSync(plan.outputFile, output.subarray(output.length - OUTPUT_CAP))
  writeJsonAtomic(plan.resultFile, result)
  appendLine(procs, {
    t: 'result',
    what: 'rerun',
    lane: opts.lane,
    runId,
    pid: child.pid,
    exitCode: code,
    timedOut
  })
  return result
}

// ── self-check: the real fence, a sample test, ~/.zshenv ─────────────────────────────────────────
const SAMPLE = `import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { standConfig } from '../lib/stand.mjs'

test('the test library loads from ../lib', () => {
  assert.equal(standConfig().lane, 'sonnet')
})
test('the results folder is writable', () => {
  writeFileSync(join(process.env.QA_RESULTS, 'probe.txt'), 'ok')
})
test('~/.zshenv is not readable', () => {
  assert.throws(() => readFileSync(process.env.QA_SELF_CHECK_ZSHENV), (e) => e.code === 'EPERM' || e.code === 'EACCES')
})
`

/** rm -rf for a tree that holds read-only folders (the installed lib, an intake snapshot). */
export function removeTree(dir) {
  if (!existsSync(dir)) return
  const open = (d) => {
    chmodSync(d, 0o755)
    for (const e of readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) open(join(d, e.name))
  }
  open(dir)
  rmSync(dir, { recursive: true, force: true })
}

export async function selfCheck({ keep = false } = {}) {
  const zshenv = join(homedir(), '.zshenv')
  if (!existsSync(zshenv)) throw new Error('self-check needs ~/.zshenv to exist (the file it must not read)')
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'qa-rerun-check-')))
  try {
    const qaHome = join(root, 'qa')
    const worktrees = join(root, 'wt')
    const preload = join(worktrees, 'qa-tool', 'scripts', 'qa', 'testlib', 'resolve.mjs')
    mkdirSync(dirname(preload), { recursive: true })
    copyFileSync(join(HERE, '..', 'testlib', 'resolve.mjs'), preload)
    const layout = laneLayout({ qaHome, worktrees, runId: 'selfcheck', lane: 'sonnet', pr: '1' })
    installTestlib(join(layout.prDir, 'lib'))
    mkdirSync(layout.prTestDir, { recursive: true })
    writeFileSync(join(layout.prTestDir, 'pr1-k1.test.mjs'), SAMPLE)
    mkdirSync(dirname(layout.laneKey), { recursive: true })
    writeFileSync(layout.laneKey, 'self-check-key\n')
    // Control: outside the fence the same file IS readable, so the fenced refusal means something.
    const control = readFileSync(zshenv).length > 0
    const result = await rerun({
      lane: 'sonnet',
      pr: 1,
      runId: 'selfcheck',
      qaHome,
      worktrees,
      extraEnv: { QA_SELF_CHECK_ZSHENV: zshenv },
      timeoutMs: 60_000
    })
    return { ok: control && result.ok && result.summary.pass === 3, result, control }
  } finally {
    if (!keep) removeTree(root)
  }
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────
async function main(argv) {
  if (argv.includes('--self-check')) {
    const { ok, result, control } = await selfCheck({ keep: argv.includes('--keep') })
    process.stdout.write(
      `${JSON.stringify({ ok, control, summary: result.summary, tests: result.tests, outputTail: ok ? undefined : result.outputTail }, null, 2)}\n`
    )
    return ok ? 0 : 1
  }
  const pos = []
  const opt = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--run-id') opt.runId = argv[++i]
    else if (a === '--timeout-ms') opt.timeoutMs = Number(argv[++i])
    else if (a === '--json') opt.json = true
    else if (a.startsWith('--')) throw new Error(`rerun: unknown option ${a}`)
    else pos.push(a)
  }
  const [lane, pr, target] = pos
  if (!lane || !pr) {
    process.stderr.write('usage: scripts/qa/rerun <lane> <pr> [<case id> | <path>] [--run-id <id>]\n')
    return 2
  }
  const result = await rerun({ lane, pr, target, runId: opt.runId, timeoutMs: opt.timeoutMs })
  if (opt.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  else {
    for (const t of result.tests) process.stdout.write(`${t.ok ? 'pass' : 'FAIL'}  ${t.name}\n`)
    process.stdout.write(
      `${result.ok ? 'ok' : 'not ok'}: ${result.summary.pass} pass, ${result.summary.fail} fail, ${result.summary.skip} skip${result.timedOut ? ' (timed out)' : ''}\nresult: ${result.resultFile ?? join(result.resultDir, 'result.json')}\n`
    )
  }
  return result.ok ? 0 : 1
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${err.message}\n`)
      process.exit(2)
    }
  )
}
