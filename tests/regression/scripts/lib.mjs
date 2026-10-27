/**
 * Shared helpers for the per-case scripts in this folder (`<id>.mjs`). A case script runs the
 * commands its case names, checks every value the case's `expect` asks for, prints one line per
 * check (`ok - …` / `not ok - …: got …`) and exits 0 only when all of them pass.
 *
 * REPO_ROOT (env) points a script at another checkout — e.g. a temporary worktree at the parent of
 * a fix, to show the script goes red there. It defaults to the repository holding this file.
 *
 * Exit codes: 0 every check passed · 1 a check failed · 3 the machine cannot run the case
 * (the line starts with `CANNOT RUN:`), which is not a judgement on the code.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The checkout under test. */
export const ROOT = resolve(
  process.env.REPO_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '../../..')
)

/** Exit code for "this machine cannot run the case". */
export const CANNOT_RUN = 3

/**
 * Stop: the machine lacks something the case needs.
 * @param {string} why - what is missing.
 * @returns {never} never returns.
 */
export function cannotRun(why) {
  process.stdout.write(`CANNOT RUN: ${why}\n`)
  process.exit(CANNOT_RUN)
}

/**
 * Stop with CANNOT RUN when the checkout has no `tasks/`: the public export leaves out the
 * internal release records and evidence this case reads.
 * @returns {void} returns only when `tasks/` is present.
 */
export function needsTasks() {
  if (!existsSync(join(ROOT, 'tasks')))
    cannotRun('this case reads tasks/, which is internal and not in this tree')
}

/**
 * Run a command without a shell.
 * @param {string} cmd - program.
 * @param {string[]} args - arguments.
 * @param {{cwd?: string, env?: Record<string, string | undefined>, timeoutS?: number}} [o] - options.
 * @returns {{status: number | null, stdout: string, stderr: string, error?: Error}} the result.
 */
export function run(cmd, args, o = {}) {
  const r = spawnSync(cmd, args, {
    cwd: o.cwd ?? ROOT,
    env: o.env ?? process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: (o.timeoutS ?? 600) * 1000,
    maxBuffer: 256 * 1024 * 1024
  })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error }
}

/**
 * @typedef {object} TapRun
 * @property {number | null} status - exit code.
 * @property {{tests: number, pass: number, fail: number, skipped: number, cancelled: number, todo: number}} counts - the summary lines.
 * @property {string[]} passed - titles of `ok` lines that are not SKIP/TODO (subtests included).
 * @property {string[]} failed - titles of `not ok` lines.
 * @property {string[]} skipped - titles of `ok … # SKIP` lines.
 * @property {string} output - stdout and stderr.
 */

/**
 * Read node:test TAP output.
 * @param {string} stdout - TAP text.
 * @returns {Omit<TapRun, 'status' | 'output'>} counts and titles.
 */
export function readTap(stdout) {
  const counts = { tests: -1, pass: -1, fail: -1, skipped: -1, cancelled: -1, todo: -1 }
  const passed = []
  const failed = []
  const skipped = []
  for (const raw of stdout.split('\n')) {
    const line = raw.trim()
    const sum = /^# (tests|pass|fail|skipped|cancelled|todo) (\d+)$/.exec(line)
    // Indented summary lines would belong to a nested reporter; only the outermost counts.
    if (sum && raw === line) counts[/** @type {keyof typeof counts} */ (sum[1])] = Number(sum[2])
    const t = /^(not )?ok \d+ - (.*)$/.exec(line)
    if (!t) continue
    const directive = /\s#\s(SKIP|TODO)\b.*$/i.exec(t[2])
    const title = (directive ? t[2].slice(0, directive.index) : t[2]).replaceAll('\\#', '#')
    if (t[1]) failed.push(title)
    else if (directive && /skip/i.test(directive[1])) skipped.push(title)
    else if (!directive) passed.push(title)
  }
  return { counts, passed, failed, skipped }
}

/**
 * Run `node --test --test-reporter=tap` over some files.
 * @param {string[]} files - test files, relative to `cwd`.
 * @param {{pattern?: string, cwd?: string, env?: Record<string, string | undefined>, extra?: string[], timeoutS?: number}} [o] - options.
 * @returns {TapRun} the run.
 */
export function nodeTest(files, o = {}) {
  // `node --test a b` silently skips a `b` that does not exist and exits 0 on `a` alone, so a test
  // file that moved (dsh-passwords 2.7.7, 05/10/2026) would read green. A missing file is a failed run.
  const base = o.cwd ? resolve(ROOT, o.cwd) : ROOT
  const lost = files.filter((f) => !f.includes('*') && !existsSync(join(base, f)))
  if (lost.length > 0)
    return {
      status: 1,
      ok: 0,
      notOk: 0,
      tests: -1,
      pass: -1,
      fail: -1,
      cancelled: -1,
      skipped: -1,
      titles: [],
      output: `test file not found: ${lost.join(', ')}`
    }
  const args = ['--test', '--test-reporter=tap', ...(o.extra ?? [])]
  if (o.pattern) args.push(`--test-name-pattern=${o.pattern}`)
  const r = run(process.execPath, [...args, ...files], o)
  return { status: r.status, ...readTap(r.stdout), output: `${r.stdout}\n${r.stderr}` }
}

/**
 * Count lines of a repo file that contain a fixed string (what `grep -c` prints).
 * @param {string} path - repo-relative path.
 * @param {string} needle - fixed string.
 * @returns {number} matching lines, or -1 when the file is missing.
 */
export function countLines(path, needle) {
  const full = join(ROOT, path)
  if (!existsSync(full)) return -1
  return readFileSync(full, 'utf8')
    .split('\n')
    .filter((l) => l.includes(needle)).length
}

/**
 * A list of checks that prints as it goes and exits once at the end.
 * @returns {{
 *   check: (label: string, pass: boolean, got?: unknown) => boolean,
 *   eq: (label: string, got: unknown, want: unknown) => boolean,
 *   tapClean: (label: string, r: TapRun, want?: {pass?: number, tests?: number, noSkip?: boolean}) => void,
 *   passes: (label: string, r: TapRun, prefix: string, times?: number, exact?: boolean) => void,
 *   done: () => never
 * }} the checker.
 */
export function checks() {
  let failures = 0
  const show = (v) => (typeof v === 'string' ? JSON.stringify(v) : (JSON.stringify(v) ?? String(v)))
  const check = (label, pass, got) => {
    if (pass) process.stdout.write(`ok - ${label}\n`)
    else {
      failures++
      process.stdout.write(`not ok - ${label}${got === undefined ? '' : `: got ${show(got)}`}\n`)
    }
    return pass
  }
  const eq = (label, got, want) => check(`${label} = ${show(want)}`, got === want, got)
  return {
    check,
    eq,
    /** Exit 0, fail 0, cancelled 0, and (unless noSkip is false) skipped 0; optional exact counts. */
    tapClean(label, r, want = {}) {
      eq(`${label}: exit code`, r.status, 0)
      eq(`${label}: fail`, r.counts.fail, 0)
      eq(`${label}: cancelled`, r.counts.cancelled, 0)
      if (want.noSkip !== false) eq(`${label}: skipped`, r.counts.skipped, 0)
      if (want.pass !== undefined) eq(`${label}: pass`, r.counts.pass, want.pass)
      if (want.tests !== undefined) eq(`${label}: tests`, r.counts.tests, want.tests)
      if (r.counts.pass < 0) check(`${label}: printed a TAP summary`, false, r.output.slice(-600))
    },
    /**
     * The named test passed `times` times (default: at least once) and never failed. The name is a
     * title prefix, or the whole title when `exact` is true.
     */
    passes(label, r, prefix, times, exact = false) {
      const hit = (t) => (exact ? t === prefix : t.startsWith(prefix))
      const ok = r.passed.filter(hit).length
      const bad = r.failed.filter(hit).length
      if (times === undefined) check(`${label}: '${prefix}' passes`, ok > 0 && bad === 0, { ok, notOk: bad })
      else
        check(`${label}: '${prefix}' passes ${String(times)}x`, ok === times && bad === 0, { ok, notOk: bad })
    },
    done() {
      process.stdout.write(failures === 0 ? 'ALL CHECKS PASSED\n' : `${String(failures)} CHECK(S) FAILED\n`)
      process.exit(failures === 0 ? 0 : 1)
    }
  }
}

/**
 * The Postgres URL the case may write to, or stop with CANNOT RUN.
 * @returns {string} TEST_DATABASE_URL.
 */
export function testDatabaseUrl() {
  const url = process.env.TEST_DATABASE_URL
  if (!url) cannotRun('TEST_DATABASE_URL is not set (declare run.needs ["postgres"])')
  return url
}
