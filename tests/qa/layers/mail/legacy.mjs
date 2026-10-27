// Adapters for the existing tracy-web mail suites. A suite is run as a child `node --test` with the
// TAP reporter and judged test by test: exit 0 or a green summary never makes a case PASS by
// itself, a skipped test is ENV (its prerequisite probed), zero tests is PENDING, and a failure
// that is not an environment error is FAIL.
import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { REPO_ROOT, TEST_REL } from './common.mjs'
import { PROTOCOL, VERSION } from './suite-reporter.mjs'
import { readTextSync } from '../../lib/bounded-reader.mjs'

/** name -> the denominator items it speaks about. Items are ids of denominator.json. */
export const SUITES = [
  'transactional-mail',
  'notification-mail',
  'access-email-design',
  'mail-unavailable',
  'audit-mail-fixes',
  'site-mail-message',
  'site-mail-policy',
  'site-mail-token',
  'site-mail-smtp',
  'site-mail-route',
  'site-mail-domains',
  'notification-letter-languages',
  'notifications',
  'notification-preferences',
  'notification-unsubscribe',
  'comment-notifications',
  'team-notifications',
  'site-event-notifications',
  'invite-expiry',
  'team-invite-link'
]

/** The 11 suites the task names; the rest are the additional adapters of the plan. */
export const REQUIRED_SUITES = SUITES.slice(0, 11)

export const suiteFile = (name) => `${TEST_REL}/${name}.test.mjs`

/** Static facts read from the suite's own text: what it needs, and the ids it cites. */
export function describeSuite(name, root = REPO_ROOT) {
  const text = readTextSync(path.join(root, suiteFile(name)))
  return {
    name,
    file: suiteFile(name),
    needs: [
      ...(/TEST_DATABASE_URL|freshPool/.test(text) ? ['postgres'] : []),
      ...(/\.listen\(|createServer|serve\(|Bun\.serve|startServer/.test(text) ? ['socket'] : [])
    ],
    legacyIds: [
      ...new Set([...text.matchAll(/\b(F-S\d-\d{3}|QA-[A-Z]+-\d+|REG-[A-Za-z0-9-]+)\b/g)].map((m) => m[1]))
    ].sort()
  }
}

/** Direct probe: can this process listen on loopback? */
export function probeSocket() {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', (error) => resolve({ ok: false, code: error.code, message: error.message }))
    server.listen(0, '127.0.0.1', () => server.close(() => resolve({ ok: true })))
  })
}

/** Direct probe: a database URL was granted to this layer and answers a TCP connect. */
export function probeDatabase(env = process.env) {
  let url = env.QA_STAND_DATABASE_URL
  if (!url)
    return Promise.resolve({
      ok: false,
      reason:
        'QA_STAND_DATABASE_URL is not set (TEST_DATABASE_URL of the shell is deliberately not inherited)'
    })
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return Promise.resolve({ ok: false, reason: 'QA_STAND_DATABASE_URL is not a URL' })
  }
  // The layer owns no PostgreSQL stand: only the exact form postgres://[user[:password]@]loopback[:port]/qa_mail_*
  // is accepted. Query parameters (pg lets `host`, `port` and `service` override the authority), a
  // fragment, another protocol, a database name that needs decoding and anything that is not a
  // loopback database are refused before any connect. The child gets the normalized URL only.
  const refuse = (why) =>
    Promise.resolve({
      ok: false,
      reason: `QA_STAND_DATABASE_URL is not a loopback database named qa_mail_*; refused without connecting (${why})`
    })
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) return refuse('protocol')
  if (parsed.search !== '' || parsed.hash !== '' || url.includes('?') || url.includes('#'))
    return refuse('query or fragment')
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) return refuse('host')
  if (!/^\/qa_mail_[A-Za-z0-9_]+$/.test(parsed.pathname)) return refuse('database name')
  url = parsed.href
  return new Promise((resolve) => {
    const socket = net.connect({ host: parsed.hostname, port: Number(parsed.port || 5432), timeout: 3000 })
    socket.once('connect', () => (socket.destroy(), resolve({ ok: true, url })))
    socket.once(
      'timeout',
      () => (socket.destroy(), resolve({ ok: false, reason: 'database connect timed out' }))
    )
    socket.once('error', (error) =>
      resolve({ ok: false, reason: `database connect failed: ${error.code ?? error.message}` })
    )
  })
}

export const REPORTER_FILE = fileURLToPath(new URL('./suite-reporter.mjs', import.meta.url))
const COUNT_KEYS = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']

/**
 * Read the protocol of suite-reporter.mjs. Only the exact supported shape is accepted: one header
 * line with the supported version, numbered records in order, one closing "end" record and nothing
 * after it. Every other line (junk, a repeated or missing version, a gap in the numbering, a stream
 * cut short, counts that disagree with the records) makes the whole stream untrusted.
 * @returns {{ tests: object[], all: object[], problem: string|null }} `tests` are the top-level ones
 */
export function parseEvents(output) {
  const fail = (problem) => ({ tests: [], all: [], outputs: [], problem })
  if (typeof output !== 'string' || output === '') return fail('the reporter wrote nothing')
  if (!output.endsWith('\n')) return fail('the stream is cut short (no final newline)')
  const lines = output.slice(0, -1).split('\n')
  const records = []
  for (const [i, text] of lines.entries()) {
    let r
    try {
      r = JSON.parse(text)
    } catch {
      return fail(`line ${i + 1} is not a protocol record: "${text.slice(0, 80)}"`)
    }
    if (!r || typeof r !== 'object' || r.protocol !== PROTOCOL)
      return fail(`line ${i + 1} is not a ${PROTOCOL} record`)
    if (r.version !== VERSION)
      return fail(`line ${i + 1} has protocol version ${r.version}, expected ${VERSION}`)
    if (r.seq !== i) return fail(`line ${i + 1} has sequence ${r.seq}, expected ${i}`)
    records.push(r)
  }
  if (records[0].type !== 'header') return fail('the first record is not the header')
  const end = records[records.length - 1]
  if (end.type !== 'end') return fail('the stream has no closing "end" record')
  const body = records.slice(1, -1)
  const outputs = []
  for (const [i, r] of body.entries()) {
    if (r.type !== 'output') continue
    if (!['stdout', 'stderr'].includes(r.stream) || typeof r.data !== 'string')
      return fail(`record ${i + 1} does not match the output schema`)
    outputs.push(r)
  }
  const tests = body.filter((r) => r.type !== 'output')
  for (const [i, t] of tests.entries()) {
    if (t.type !== 'test') return fail(`record ${i + 1} has unexpected type ${JSON.stringify(t.type)}`)
    if (
      typeof t.name !== 'string' ||
      !Number.isInteger(t.nesting) ||
      typeof t.ok !== 'boolean' ||
      typeof t.cancelled !== 'boolean' ||
      typeof t.detail !== 'string' ||
      typeof t.stack !== 'string'
    )
      return fail(`record ${i + 1} does not match the test schema`)
  }
  const tally = Object.fromEntries(COUNT_KEYS.map((k) => [k, 0]))
  for (const t of tests) {
    tally.tests += 1
    if (t.cancelled) tally.cancelled += 1
    else if (!t.ok) tally.fail += 1
    else if (t.skip) tally.skipped += 1
    else if (t.todo) tally.todo += 1
    else tally.pass += 1
  }
  for (const k of COUNT_KEYS)
    if (end.counts?.[k] !== tally[k])
      return fail(`the end record says ${k} ${end.counts?.[k]} but the stream holds ${tally[k]}`)
  const rs = end.runnerSummary
  if (!rs) return fail('the runner summary is missing from the end record')
  const runner = {
    tests: rs.tests,
    pass: rs.passed,
    fail: rs.failed,
    cancelled: rs.cancelled,
    skipped: rs.skipped,
    todo: rs.todo
  }
  for (const k of COUNT_KEYS)
    if (runner[k] !== tally[k])
      return fail(`the runner summary says ${k} ${runner[k]} but the stream holds ${tally[k]}`)
  const top = tests
    .filter((t) => t.nesting === 0)
    .map((t) => ({
      ok: t.ok && !t.cancelled,
      index: t.testNumber,
      name: t.name,
      directive: t.skip ? 'SKIP' : t.todo ? 'TODO' : null,
      reason: String(t.skip || t.todo || ''),
      detail: t.detail
    }))
  return { tests: top, all: tests, outputs, problem: null }
}

const ENV_ERROR = /EPERM|EACCES|EADDRINUSE|ECONNREFUSED|listen\b/i
const ASSERTION = /ERR_ASSERTION|AssertionError/
const BROKEN = /ERR_MODULE_NOT_FOUND|Cannot find (module|package)|SyntaxError|ERR_UNKNOWN_FILE_EXTENSION/

/** Run one suite; resolves `{ tests, exitCode, stderr, timedOut }`. */
export function runSuite({
  root = REPO_ROOT,
  name,
  env = process.env,
  timeoutMs = 240_000,
  databaseUrl = null
}) {
  const childEnv = { ...env }
  delete childEnv.TEST_DATABASE_URL
  delete childEnv.DATABASE_URL
  delete childEnv.NODE_TEST_CONTEXT
  if (databaseUrl) childEnv.TEST_DATABASE_URL = databaseUrl
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        '--test',
        `--test-reporter=${REPORTER_FILE}`,
        `--test-timeout=${Math.min(timeoutMs, 120_000)}`,
        suiteFile(name)
      ],
      { cwd: root, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] }
    )
    let stdout = ''
    let stderr = ''
    let timedOut = false
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer)
      const parsed = parseEvents(stdout)
      resolve({
        tests: parsed.tests,
        problem: parsed.problem,
        exitCode,
        signal,
        stderr,
        stdout,
        timedOut
      })
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({
        tests: [],
        problem: `spawn failed: ${error.message}`,
        exitCode: null,
        stderr: String(error),
        stdout,
        timedOut: false
      })
    })
  })
}

/**
 * Judge one finished run.
 * @returns {{verdict: 'green'|'FAIL'|'ENV'|'PENDING', reason: string, counts: object, failed: object[], envTests: object[]}}
 */
export function judgeSuite(run, { needs = [], socket, database }) {
  // The decision reads the raw stream again: a pre-parsed `run.tests` is never trusted.
  const parsed = parseEvents(run.stdout ?? '')
  const tests = parsed.tests
  const counts = {
    total: tests.length,
    passed: tests.filter((t) => t.ok && !t.directive).length,
    skipped: tests.filter((t) => t.directive === 'SKIP').length,
    todo: tests.filter((t) => t.directive === 'TODO').length,
    failed: tests.filter((t) => !t.ok).length
  }
  if (run.timedOut)
    return { verdict: 'PENDING', reason: 'the suite timed out', counts, failed: [], envTests: [] }
  if (parsed.problem)
    return {
      verdict: 'PENDING',
      reason: `TEST_INVALID: the event stream is not trustworthy: ${parsed.problem} (exit ${run.exitCode}, signal ${run.signal ?? 'none'}${run.stderr ? `, stderr: ${run.stderr.split('\n').find(Boolean)?.slice(0, 120)}` : ''})`,
      counts,
      failed: [],
      envTests: []
    }
  if (tests.length === 0)
    return {
      verdict: 'PENDING',
      reason: `TEST_INVALID: zero tests reported (exit ${run.exitCode})`,
      counts,
      failed: [],
      envTests: []
    }
  // A prerequisite probe that actually failed is the only thing that turns a test into ENV.
  const socketDown = needs.includes('socket') && !socket.ok
  const dbDown = needs.includes('postgres') && !database.ok
  const failing = tests.filter((t) => !t.ok)
  const envTests = []
  const failed = []
  const unexplainedSkips = []
  for (const t of failing) (ENV_ERROR.test(t.detail) && (socketDown || dbDown) ? envTests : failed).push(t)
  for (const t of tests.filter((x) => x.directive === 'SKIP'))
    (socketDown || dbDown ? envTests : unexplainedSkips).push(t)
  if (failed.length > 0)
    return {
      verdict: BROKEN.test(failed.map((t) => t.detail).join('\n')) ? 'PENDING' : 'FAIL',
      reason: `${failed.length} of ${tests.length} tests failed, first: ${failed[0].name}`,
      counts,
      failed,
      envTests
    }
  if (counts.todo > 0)
    return { verdict: 'PENDING', reason: `${counts.todo} tests are TODO`, counts, failed, envTests }
  if (unexplainedSkips.length > 0)
    return {
      verdict: 'PENDING',
      reason: `${unexplainedSkips.length} tests were skipped although no prerequisite probe failed (first: ${unexplainedSkips[0].name})`,
      counts,
      failed,
      envTests
    }
  if (envTests.length > 0) {
    const why = []
    if (socketDown) why.push(`loopback listen: ${socket.code} (${socket.message})`)
    if (dbDown) why.push(`database: ${database.reason}`)
    return {
      verdict: 'ENV',
      reason: `${envTests.length} of ${tests.length} tests could not run${why.length ? ` — probe: ${why.join('; ')}` : ''}`,
      counts,
      failed,
      envTests
    }
  }
  if (run.exitCode !== 0 || run.signal)
    return {
      verdict: 'PENDING',
      reason: `all ${tests.length} reported tests passed but the process ended abnormally (exit ${run.exitCode}, signal ${run.signal ?? 'none'})`,
      counts,
      failed,
      envTests
    }
  return { verdict: 'green', reason: `${counts.passed} tests passed, none skipped`, counts, failed, envTests }
}

/** Names of tests that passed in `control` and fail with an assertion on `mutant` (not an import error). */
export function redTests(control, mutant) {
  // A mutant run that was killed, timed out, ended without a failing exit or left an untrustworthy
  // TAP stream proves nothing: its red tests may be the cut-off remains of a crash.
  const c = parseEvents(control.stdout ?? '')
  const m = parseEvents(mutant.stdout ?? '')
  if (c.problem || m.problem || c.tests.length === 0) return []
  if (mutant.timedOut || mutant.signal || mutant.exitCode !== 1) return []
  const passed = new Set(c.tests.filter((t) => t.ok && !t.directive).map((t) => t.name))
  return m.tests
    .filter((t) => !t.ok && passed.has(t.name) && ASSERTION.test(t.detail) && !BROKEN.test(t.detail))
    .map((t) => t.name)
}
