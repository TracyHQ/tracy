// `scripts/run-clock-shift.mjs` — the runner that executes test files with the clock moved forward.
//
// Its one rule is the subject: a file's verdict is its child's EXIT CODE and nothing the child
// prints. Around that rule sit the edges that must end red instead of quietly green: a child that
// dies of a signal or never ends, a log that cannot be written, git that cannot say what changed,
// a file list that cannot be discovered. And the exclusions: whole files, never run, always named.
//
// Fixtures live in a scratch "repository" outside this one (`CLOCK_SHIFT_TEST_TMPDIR`, else the
// system temp directory), logs included; `main()` is called in-process with that tree as its root.
// Children are real `node --test` processes unless a case needs a child that misbehaves on cue.
import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { load as loadYaml } from 'js-yaml'
import { envWithoutGitLocation } from '../check-push.mjs'
import { planMatrix } from '../ci/plan-ci.mjs'
import {
  ADVICE,
  changedFiles,
  EXCLUDED,
  killRunning,
  main,
  parseArgs,
  runFile,
  validateExclusions,
  validateFile
} from '../run-clock-shift.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const RUNNER = join(ROOT, 'scripts/run-clock-shift.mjs')
const SESSION_URL = pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/session.js')).href
const HTTP_URL = pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/http.js')).href

const BASE = process.env.CLOCK_SHIFT_TEST_TMPDIR ?? tmpdir()
mkdirSync(BASE, { recursive: true })
const SCRATCH = mkdtempSync(join(BASE, 'run-clock-shift-'))
const LOGS = join(SCRATCH, 'logs')
after(() => rmSync(SCRATCH, { recursive: true, force: true }))

/** A child environment with the default shift and this suite's own log directory. */
function envWith(days) {
  const env = { ...process.env, TRACY_CLOCK_SHIFT_LOG_DIR: LOGS }
  delete env.NODE_TEST_CONTEXT
  delete env.TRACY_TEST_CLOCK_OFFSET_DAYS
  if (days !== undefined) env.TRACY_TEST_CLOCK_OFFSET_DAYS = days
  return env
}
let trees = 0
/** A fresh scratch root holding `files` (`{ 'relative/path': 'source' }`). */
function tree(files = {}) {
  const root = join(SCRATCH, `tree-${String(++trees)}`)
  mkdirSync(root, { recursive: true })
  for (const [name, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true })
    writeFileSync(join(root, name), source)
  }
  return root
}

/** Runs the CLI in-process on `root`; returns its exit code and everything it printed. */
async function run(root, argv, deps = {}) {
  let text = ''
  const { days, ...rest } = deps
  const code = await main(argv, {
    root,
    env: envWith(days),
    out: (chunk) => {
      text += chunk
    },
    workers: async () => [],
    excluded: [],
    ...rest
  })
  return { code, text }
}

/** The saved output of `file`, read from the path its verdict line names. */
function logOf(text, file) {
  const line = text.split('\n').find((l) => l.includes(` ${file} — `) && l.includes(', log '))
  assert.ok(line, `no verdict line names a log for ${file}:\n${text}`)
  return readFileSync(line.slice(line.indexOf(', log ') + 6), 'utf8')
}

/** The two ways a child never starts: an `error` event for a binary that is not there, and a throw. */
const noSuchBinary = (root) => (_node, _args, options) => spawn(join(root, 'no-such-binary'), [], options)
const spawnThrows = () => {
  throw new Error('EAGAIN: no more processes')
}
/** A spawn stand-in that must never be reached. */
const neverSpawn = () => {
  throw new Error('a child was started')
}
/** A real child running `source` with the stdio the runner gave (its log file). */
const node = (source) => (_node, _args, options) =>
  spawn(process.execPath, ['-e', source], { stdio: options.stdio })

const PASSING = `import { test } from 'node:test'
test('passes', () => {})
`
const FAILING = `import assert from 'node:assert/strict'
import { test } from 'node:test'
test('compares two numbers', () => assert.equal(1, 2, 'the diagnostic of the test itself'))
`
/** The pre-#838 shape with real credentials; `FIXED` is the unshifted time this suite runs at. */
const mismatch = () => `import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mintSession } from ${JSON.stringify(SESSION_URL)}
import { viewer } from ${JSON.stringify(HTTP_URL)}
const FIXED = ${String(Math.floor(performance.timeOrigin + performance.now()))}
test('a session minted at a fixed time reaches a door on the wall clock', async () => {
  const cookie = 'tracy_sess=' + (await mintSession('person@example.com', 'secret', FIXED))
  const request = { req: { header: (name) => (name === 'cookie' ? cookie : undefined) } }
  assert.equal(await viewer(request, { sessionSecret: 'secret' }), 'person@example.com')
})
`
/** #838: minted on the verifier's clock. */
const CORRECTED = `import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mintSession } from ${JSON.stringify(SESSION_URL)}
import { viewer } from ${JSON.stringify(HTTP_URL)}
test('a session minted on the wall clock reaches a door on the wall clock', async () => {
  const cookie = 'tracy_sess=' + (await mintSession('person@example.com', 'secret'))
  const request = { req: { header: (name) => (name === 'cookie' ? cookie : undefined) } }
  assert.equal(await viewer(request, { sessionSecret: 'secret' }), 'person@example.com')
})
`

// ── Arguments ───────────────────────────────────────────────────────────────────────────────────

test('parseArgs: one mode per run', () => {
  assert.deepEqual(parseArgs(['a.test.mjs', 'b c.test.mjs']), {
    mode: 'files',
    files: ['a.test.mjs', 'b c.test.mjs']
  })
  assert.deepEqual(parseArgs(['--changed-since', 'HEAD^1']), { mode: 'changed', ref: 'HEAD^1' })
  assert.deepEqual(parseArgs(['--all-workers']), { mode: 'all' })
  assert.deepEqual(parseArgs(['--check-excluded']), { mode: 'excluded' })
})

test('parseArgs: nothing to run, an unknown flag, a missing ref and mixed modes are usage errors', () => {
  for (const argv of [
    [],
    [''],
    ['--nope'],
    ['-x', 'a.test.mjs'],
    ['--changed-since'],
    ['--changed-since', ''],
    ['--changed-since', '--all-workers'],
    ['--changed-since', '-n1'],
    ['--changed-since', 'a', '--changed-since', 'b'],
    ['--changed-since', 'a', 'b.test.mjs'],
    ['--all-workers', 'a.test.mjs'],
    ['--all-workers', '--changed-since', 'a'],
    ['--check-excluded', '--all-workers'],
    ['--check-excluded', 'a.test.mjs']
  ])
    assert.throws(() => parseArgs(argv), Error, JSON.stringify(argv))
})

test('the command line: usage is exit 2 and starts no test; a real file is run and holds', () => {
  const cli = (args, days) =>
    spawnSync(process.execPath, [RUNNER, ...args], { env: envWith(days), encoding: 'utf8' })
  for (const args of [[], ['--nope'], ['--all-workers', 'scripts/test/ci-plan.test.mjs']]) {
    const bad = cli(args)
    assert.equal(bad.status, 2, JSON.stringify(args))
    assert.match(bad.stdout, /usage: pnpm test:clock-shift/)
    assert.doesNotMatch(bad.stdout, /file\(s\) to run/)
  }
  // A refused offset is said once, before any file runs, not once per file.
  for (const days of ['soon', '-1', '99999999999']) {
    const offset = cli(['scripts/test/ci-plan.test.mjs'], days)
    assert.equal(offset.status, 2, days)
    assert.match(offset.stdout, /^clock-shift: clock-shift: TRACY_TEST_CLOCK_OFFSET_DAYS/m)
    assert.doesNotMatch(offset.stdout, /file\(s\) to run/)
  }

  const good = cli(['scripts/test/ci-plan.test.mjs'])
  assert.equal(good.status, 0, good.stdout + good.stderr)
  assert.match(
    good.stdout,
    /^clock-shift: 1 file\(s\) to run with the clock moved 400 day\(s\) forward; logs in /m
  )
  assert.match(good.stdout, /^clock-shift: HOLDS scripts\/test\/ci-plan\.test\.mjs — exit 0, /m)
})

// ── What a run reports ──────────────────────────────────────────────────────────────────────────

test('the #838 mismatch is red under the shift, every other file still runs, and the advice is printed', async () => {
  const root = tree({
    't/mismatch.test.mjs': mismatch(),
    't/corrected.test.mjs': CORRECTED,
    't/failing.test.mjs': FAILING,
    't/passing.test.mjs': PASSING
  })
  const files = ['t/mismatch.test.mjs', 't/corrected.test.mjs', 't/failing.test.mjs', 't/passing.test.mjs']
  const { code, text } = await run(root, files)
  assert.equal(code, 1)
  assert.match(text, /^clock-shift: FAIL t\/mismatch\.test\.mjs — exit 1, /m)
  assert.match(text, /^clock-shift: HOLDS t\/corrected\.test\.mjs — exit 0, /m)
  assert.match(text, /^clock-shift: FAIL t\/failing\.test\.mjs — exit 1, /m)
  assert.match(text, /^clock-shift: HOLDS t\/passing\.test\.mjs — exit 0, /m)
  assert.match(text, /^clock-shift: 4 run, 0 excluded, 2 red; /m)
  // The tests' own diagnostics are in each file's log and, for a red file, printed too …
  assert.match(logOf(text, 't/mismatch.test.mjs'), /person@example\.com/)
  assert.match(logOf(text, 't/failing.test.mjs'), /the diagnostic of the test itself/)
  assert.doesNotMatch(logOf(text, 't/passing.test.mjs'), /the diagnostic of the test itself/)
  assert.match(text, /the diagnostic of the test itself/)
  // … and the advice is offered as the usual cause, not as the verdict.
  assert.ok(text.includes(ADVICE))
  assert.match(text, /Each file's log decides; the usual cause: /)
  assert.equal(
    ADVICE,
    'a credential minted at a fixed time is being verified against real time — mint it with the verifier’s clock or inject the same clock into both.'
  )
})

test('the control run (offset 0) of the same mismatch is green, and says which clock it used', async () => {
  const root = tree({ 't/mismatch.test.mjs': mismatch() })
  const { code, text } = await run(root, ['t/mismatch.test.mjs'], { days: '0' })
  assert.equal(code, 0, text)
  assert.match(text, /to run with the clock moved 0 day\(s\) forward/)
  assert.ok(!text.includes(ADVICE))
})

test('a file named twice runs once', async () => {
  const root = tree({ 'a.test.mjs': PASSING })
  const { code, text } = await run(root, ['a.test.mjs', './a.test.mjs', join(root, 'a.test.mjs')])
  assert.equal(code, 0, text)
  assert.equal(text.match(/^clock-shift: HOLDS /gm).length, 1)
})

// ── Files that may not be run ───────────────────────────────────────────────────────────────────

test('a missing file, a directory, a symlink, a FIFO and a path outside the root are refused before any child starts', async () => {
  const root = tree({ 'real.test.mjs': PASSING, 'dir.test.mjs/keep': '' })
  const outside = tree({ 'elsewhere.test.mjs': PASSING })
  symlinkSync(join(root, 'real.test.mjs'), join(root, 'link.test.mjs'))
  symlinkSync(outside, join(root, 'linked-dir'), 'dir')
  execFileSync('mkfifo', [join(root, 'fifo.test.mjs')])
  const refusals = {
    'missing.test.mjs': /does not exist/,
    'dir.test.mjs': /is not a regular file/,
    'link.test.mjs': /is a symbolic link/,
    'fifo.test.mjs': /is not a regular file/,
    '../outside.test.mjs': /does not exist/,
    [join(outside, 'elsewhere.test.mjs')]: /is outside the repository/,
    'linked-dir/elsewhere.test.mjs': /is outside the repository/,
    '.': /is not a regular file/
  }
  for (const [name, reason] of Object.entries(refusals)) {
    assert.throws(() => validateFile(root, name), reason, name)
    const { code, text } = await run(root, [name, 'real.test.mjs'], {
      spawnChild: (...args) => (args[1].at(-1) === 'real.test.mjs' ? spawn(...args) : neverSpawn())
    })
    assert.equal(code, 1, name)
    assert.match(text, /^clock-shift: FAIL .* — refused before running: /m)
    // The refusal does not stop the files that can run.
    assert.match(text, /^clock-shift: HOLDS real\.test\.mjs — exit 0/m)
  }
  assert.equal(validateFile(root, './real.test.mjs'), 'real.test.mjs')
  assert.equal(validateFile(root, join(root, 'real.test.mjs')), 'real.test.mjs')
})

test('a file this user cannot read is refused', () => {
  const root = tree({ 'locked.test.mjs': PASSING })
  chmodSync(join(root, 'locked.test.mjs'), 0o000)
  // root reads everything; there the mode bits say nothing, and the file is simply runnable.
  if (process.getuid() === 0) assert.equal(validateFile(root, 'locked.test.mjs'), 'locked.test.mjs')
  else assert.throws(() => validateFile(root, 'locked.test.mjs'), /EACCES/)
  chmodSync(join(root, 'locked.test.mjs'), 0o600)
})

test('a name with spaces and shell characters reaches node as one argument', async () => {
  const name = 'odd dir/with space & $(touch pwned); `id`.test.mjs'
  const root = tree({ [name]: PASSING })
  const { code, text } = await run(root, [name])
  assert.equal(code, 0, text)
  assert.ok(text.includes(`clock-shift: HOLDS ${name} — exit 0, `))
  assert.equal(existsSync(join(root, 'pwned')), false)
  assert.equal(existsSync(join(root, 'odd dir', 'pwned')), false)
})

// ── The exit code is the whole verdict ──────────────────────────────────────────────────────────

/** A child that ends when the case tells it to. */
function fakeChild() {
  const child = new EventEmitter()
  child.killed = 0
  child.kill = () => {
    child.killed += 1
  }
  return child
}

test('exit 0 holds whatever the child printed, and a non-zero exit fails whatever it printed', async () => {
  const root = tree({ 'a.test.mjs': PASSING })
  const GREEN = 'TAP version 13\nok 1 - x\n1..1\n# tests 1\n# pass 1\n# fail 0\n'
  const RED = 'TAP version 13\nnot ok 1 - x\n1..1\n# tests 1\n# pass 0\n# fail 1\n# cancelled 3\n'
  const print = (text, code) =>
    node(`process.stdout.write(${JSON.stringify(text)}); process.exitCode = ${String(code)}`)
  for (const printed of ['', 'garbage', GREEN, RED, RED.slice(0, 30)]) {
    const zero = await run(root, ['a.test.mjs'], { spawnChild: print(printed, 0) })
    assert.equal(zero.code, 0, JSON.stringify(printed))
    assert.match(zero.text, /^clock-shift: HOLDS a\.test\.mjs — exit 0, /m)
    // Kept verbatim for the reader, and the runner claims no count of tests from it.
    assert.equal(logOf(zero.text, 'a.test.mjs'), printed)
    assert.doesNotMatch(zero.text, /\d+ (tests?|passed|skipped)\b/)

    const one = await run(root, ['a.test.mjs'], { spawnChild: print(printed, 1) })
    assert.equal(one.code, 1, JSON.stringify(printed))
    assert.match(one.text, /^clock-shift: FAIL a\.test\.mjs — exit 1, /m)
    assert.equal(logOf(one.text, 'a.test.mjs'), printed)
  }
})

test('a file with no test, an empty file and a suite that skips itself exit 0: they hold, and the run says a skip was not checked', async () => {
  const root = tree({
    'no-tests.test.mjs': 'export const nothing = 1\n',
    'empty.test.mjs': '',
    'db.test.mjs': `import { describe, test } from 'node:test'
const skip = 'set TEST_DATABASE_URL'
test('needs PostgreSQL', { skip }, () => {})
describe('a whole suite on PostgreSQL', { skip }, () => { test('inside', () => {}) })
`,
    'network.test.mjs': `import { test } from 'node:test'
test('the database refuses the connection', () => { throw new Error('connect ECONNREFUSED 127.0.0.1:5432') })
`,
    'malformed.test.mjs': "import { test } from 'node:test'\ntest('x', () => {\n"
  })
  const green = await run(root, ['no-tests.test.mjs', 'empty.test.mjs', 'db.test.mjs'])
  assert.equal(green.code, 0, green.text)
  assert.equal(green.text.match(/^clock-shift: HOLDS .* — exit 0, /gm).length, 3)
  assert.match(green.text, /a self-skipped test was NOT checked$/m)
  // The skip directives of the suite itself are kept in its log.
  assert.match(logOf(green.text, 'db.test.mjs'), /set TEST_DATABASE_URL/)

  const red = await run(root, ['db.test.mjs', 'network.test.mjs', 'malformed.test.mjs'])
  assert.equal(red.code, 1)
  assert.match(red.text, /^clock-shift: FAIL network\.test\.mjs — exit 1, /m)
  assert.match(logOf(red.text, 'network.test.mjs'), /ECONNREFUSED/)
  assert.match(red.text, /^clock-shift: FAIL malformed\.test\.mjs — exit 1, /m)
  assert.match(logOf(red.text, 'malformed.test.mjs'), /SyntaxError/)
  assert.match(red.text, /^clock-shift: 3 run, 0 excluded, 2 red; /m)
})

test('a file deleted or half-written between the check and the run is judged by what its child does', async () => {
  const root = tree({ 'gone.test.mjs': PASSING, 'torn.test.mjs': PASSING })
  const first =
    (change) =>
    (...args) => {
      change()
      return spawn(...args)
    }
  const gone = await run(root, ['gone.test.mjs'], {
    spawnChild: first(() => rmSync(join(root, 'gone.test.mjs')))
  })
  assert.equal(gone.code, 1)
  assert.match(gone.text, /^clock-shift: FAIL gone\.test\.mjs — exit 1, /m)
  assert.match(logOf(gone.text, 'gone.test.mjs'), /gone\.test\.mjs/)
  const torn = await run(root, ['torn.test.mjs'], {
    spawnChild: first(() => truncateSync(join(root, 'torn.test.mjs'), 40))
  })
  assert.equal(torn.code, 1)
  assert.match(torn.text, /^clock-shift: FAIL torn\.test\.mjs — exit 1, /m)
})

// ── Children that fail in other ways ────────────────────────────────────────────────────────────

test('a child killed by a signal, one that cannot start and one that throws on spawn are red and the run goes on', async () => {
  const root = tree({ 'a.test.mjs': PASSING, 'b.test.mjs': PASSING })
  const cases = [
    [node("process.kill(process.pid, 'SIGTERM'); setTimeout(() => {}, 10000)"), /killed by SIGTERM/],
    [noSuchBinary(root), /could not start: .*ENOENT/, 'NOT RUN'],
    [spawnThrows, /could not start: EAGAIN/, 'NOT RUN'],
    [node('process.exit(7)'), /exit 7/]
  ]
  for (const [spawnFirst, why, label = 'FAIL'] of cases) {
    let calls = 0
    const { code, text } = await run(root, ['a.test.mjs', 'b.test.mjs'], {
      spawnChild: (...args) => (++calls === 1 ? spawnFirst(...args) : spawn(...args))
    })
    assert.equal(code, 1, text)
    assert.match(text, new RegExp(`^clock-shift: ${label} a\\.test\\.mjs — ${why.source}`, 'm'))
    assert.match(text, /^clock-shift: HOLDS b\.test\.mjs/m)
  }
})

test('output far past any pipe buffer is saved whole and does not change the verdict', async () => {
  const root = tree({ 'a.test.mjs': PASSING })
  const loud = (code) =>
    node(
      `for (let i = 0; i < 3000; i++) process.stdout.write(String(i).padStart(6, '0') + 'x'.repeat(1017) + '\\n'); process.exitCode = ${String(code)}`
    )
  const whole = (log) => {
    const lines = log.split('\n')
    assert.equal(lines.length, 3001)
    assert.ok(lines.slice(0, 3000).every((line, i) => line.length === 1023 && Number(line.slice(0, 6)) === i))
  }
  const zero = await run(root, ['a.test.mjs'], { spawnChild: loud(0) })
  assert.equal(zero.code, 0, zero.text.slice(-2000))
  assert.ok(zero.text.length < 2000, 'the output of a file that holds is not printed')
  whole(logOf(zero.text, 'a.test.mjs'))
  // A red file's log is printed whole too: on a CI runner the file is out of reach.
  const red = await run(root, ['a.test.mjs'], { spawnChild: loud(1) })
  assert.equal(red.code, 1)
  whole(logOf(red.text, 'a.test.mjs'))
  assert.ok(red.text.includes(logOf(red.text, 'a.test.mjs')))
})

test('a log that cannot be created, opened or closed is an error and the run is red', async () => {
  const root = tree({ 'a.test.mjs': PASSING, 'b.test.mjs': PASSING, 'not-a-directory': 'a regular file' })
  const blocked = await run(root, ['a.test.mjs'], {
    env: { ...envWith(), TRACY_CLOCK_SHIFT_LOG_DIR: join(root, 'not-a-directory', 'logs') },
    spawnChild: neverSpawn
  })
  assert.equal(blocked.code, 1)
  assert.match(blocked.text, /^clock-shift: the run stopped: /m)

  await assert.rejects(
    runFile({
      root,
      file: 'a.test.mjs',
      log: join(root, 'no-such-directory', 'a.log'),
      env: {},
      spawnChild: neverSpawn
    }),
    /ENOENT.*a\.log/
  )

  // The child exits 0, but its log was taken away under it: not a clean run.
  const closedEarly = (_node, _args, options) => {
    closeSync(options.stdio[1])
    const child = fakeChild()
    setImmediate(() => child.emit('close', 0, null))
    return child
  }
  const unclosed = await run(root, ['a.test.mjs', 'b.test.mjs'], { spawnChild: closedEarly })
  assert.equal(unclosed.code, 1, unclosed.text)
  assert.match(unclosed.text, /^clock-shift: the run stopped: EBADF/m)
  assert.doesNotMatch(unclosed.text, /HOLDS/)
})

const hanging = (marker) => `import { writeFileSync } from 'node:fs'
import { test } from 'node:test'
test('hangs', async () => {
  await new Promise((done) => setTimeout(done, 3000))
  writeFileSync(${JSON.stringify(marker)}, 'the test process outlived the runner')
})
`

test('a child that never ends is stopped at the limit, with its own test processes', async () => {
  const marker = join(SCRATCH, 'hang-survived')
  const root = tree({ 'hang.test.mjs': hanging(marker), 'after.test.mjs': PASSING })
  const started = performance.now()
  const { code, text } = await run(root, ['hang.test.mjs', 'after.test.mjs'], { timeoutMs: 1000 })
  assert.equal(code, 1)
  assert.ok(performance.now() - started < 2800, 'the runner waited for the hanging child')
  assert.match(text, /^clock-shift: FAIL hang\.test\.mjs — still running after 1 s: stopped, /m)
  assert.match(text, /^clock-shift: HOLDS after\.test\.mjs/m)
  await new Promise((done) => setTimeout(done, 3000))
  assert.equal(existsSync(marker), false, 'the test process was left running')
})

test('an interrupted run stops the process groups it started', async () => {
  const marker = join(SCRATCH, 'interrupt-survived')
  const root = tree({ 'hang.test.mjs': hanging(marker) })
  const { code, text } = await run(root, ['hang.test.mjs'], {
    spawnChild: (...args) => {
      // What the CLI does on SIGINT and SIGTERM, once the test process is up.
      setTimeout(killRunning, 700)
      return spawn(...args)
    }
  })
  assert.equal(code, 1)
  assert.match(text, /^clock-shift: FAIL hang\.test\.mjs — killed by SIGKILL, /m)
  await new Promise((done) => setTimeout(done, 3000))
  assert.equal(existsSync(marker), false, 'the test process was left running')
})

test('a child that exits 0 after the limit does not turn the verdict green, and the verdict is given once', async () => {
  const child = fakeChild()
  let answers = 0
  const pending = runFile({
    root: SCRATCH,
    file: 'late.test.mjs',
    log: join(SCRATCH, 'late.log'),
    env: {},
    spawnChild: () => child,
    timeoutMs: 30
  }).then((result) => {
    answers += 1
    return result
  })
  const result = await pending
  assert.match(result, /still running after 0\.03 s: stopped/)
  assert.equal(child.killed, 1)
  child.emit('close', 0, null)
  child.emit('error', new Error('late'))
  await new Promise((done) => setTimeout(done, 20))
  assert.equal(answers, 1)
  assert.match(await pending, /still running/)

  // The other order: an early `error` and then a `close` are one verdict too.
  const twice = fakeChild()
  const early = runFile({
    root: SCRATCH,
    file: 'x.test.mjs',
    log: join(SCRATCH, 'x.log'),
    env: {},
    spawnChild: () => twice
  })
  twice.emit('error', new Error('spawn EACCES'))
  twice.emit('close', 0, null)
  const unstarted = await early
  assert.ok(unstarted instanceof Error, 'a child that never started is not a verdict')
  assert.match(unstarted.message, /spawn EACCES/)
})

test('a preload probe that cannot start or is killed stops the run red: it is not a usage error and no file runs', async () => {
  const root = tree({ 'a.test.mjs': PASSING })
  const probes = [
    [() => ({ error: new Error('spawnSync node EAGAIN'), status: null, signal: null }), /EAGAIN/],
    [() => ({ status: null, signal: 'SIGKILL', stderr: '' }), /SIGKILL/]
  ]
  for (const [probe, why] of probes) {
    for (const argv of [['a.test.mjs'], ['--check-excluded']]) {
      const { code, text } = await run(root, argv, { probe, spawnChild: neverSpawn })
      assert.equal(code, 1, text)
      assert.match(text, /^clock-shift: the run stopped: the preload could not be tried: /m)
      assert.match(text, why)
      assert.doesNotMatch(text, /usage:|file\(s\) to run/)
    }
  }
  // A probe that ran and refused the offset is still the usage error it was.
  const refused = await run(root, ['a.test.mjs'], { days: 'soon', spawnChild: neverSpawn })
  assert.equal(refused.code, 2, refused.text)
  assert.match(refused.text, /usage:/)
})

// ── The named exclusions ────────────────────────────────────────────────────────────────────────

const REASON = 'compares a file modification time, which the preload does not move, with Date.now()'

test('validateExclusions: exact files with a written reason, nothing else', () => {
  validateExclusions([])
  validateExclusions([{ file: 'apps/x/test/a.test.mjs', reason: REASON }])
  for (const list of [
    null,
    { file: 'a.test.mjs', reason: REASON },
    [null],
    ['a.test.mjs'],
    [{ file: 'a.test.mjs' }],
    [{ file: 'a.test.mjs', reason: '' }],
    [{ file: 'a.test.mjs', reason: 'flaky' }],
    [{ file: 'a.test.mjs', reason: 42 }],
    [{ file: 42, reason: REASON }],
    [{ file: 'a.test.mjs', reason: REASON, also: 'apps/' }],
    // Nothing finer than a file: an entry that names tests is refused.
    [{ file: 'a.test.mjs', reason: REASON, tests: ['a test'] }],
    [{ file: 'apps/*/test/a.test.mjs', reason: REASON }],
    [{ file: 'apps/x/test/[ab].test.mjs', reason: REASON }],
    [{ file: 'apps/x/test/{a,b}.test.mjs', reason: REASON }],
    [{ file: 'apps/x/test/?.test.mjs', reason: REASON }],
    [{ file: 'apps/x/test/', reason: REASON }],
    [{ file: 'apps/x/test', reason: REASON }],
    [{ file: 'apps/x/test/a.mjs', reason: REASON }],
    [{ file: '/abs/a.test.mjs', reason: REASON }],
    [{ file: '../a.test.mjs', reason: REASON }],
    [{ file: 'apps/./a.test.mjs', reason: REASON }],
    [{ file: 'apps//a.test.mjs', reason: REASON }],
    [
      { file: 'a.test.mjs', reason: REASON },
      { file: 'a.test.mjs', reason: REASON }
    ]
  ])
    assert.throws(() => validateExclusions(list), Error, JSON.stringify(list))
})

test('an excluded file is not run in any mode and is printed with its reason; only that exact file', async () => {
  // The excluded file would be red if it ran, and holds a fixed-time credential: by design the
  // moved clock does not see it. That price is stated in the runner and the documentation.
  const root = tree({ 't/a.test.mjs': mismatch(), 't/a2.test.mjs': PASSING, 'u/a.test.mjs': FAILING })
  const excluded = [{ file: 't/a.test.mjs', reason: REASON }]
  const others = (...args) => (args[1].at(-1) === 't/a.test.mjs' ? neverSpawn() : spawn(...args))
  const workers = async () => ['t/a.test.mjs', 't/a2.test.mjs']
  const git = (args) =>
    args[0] === 'merge-base'
      ? `${'a'.repeat(40)}\n`
      : args[0] === 'diff'
        ? 't/a.test.mjs\0t/a2.test.mjs\0'
        : ''
  for (const argv of [
    ['t/a.test.mjs', 't/a2.test.mjs'],
    ['./t/a.test.mjs', 't/a2.test.mjs'],
    [join(root, 't/a.test.mjs'), 't/a2.test.mjs'],
    ['--changed-since', 'HEAD^1'],
    ['--all-workers']
  ]) {
    const { code, text } = await run(root, argv, { excluded, spawnChild: others, workers, git })
    assert.equal(code, 0, text)
    assert.ok(text.includes(`clock-shift: EXCLUDED t/a.test.mjs — ${REASON}\n`), text)
    assert.match(text, /^clock-shift: HOLDS t\/a2\.test\.mjs — exit 0/m)
    assert.match(text, /^clock-shift: 1 file\(s\) to run with the clock moved/m)
    assert.match(text, /^clock-shift: 1 run, 1 excluded, 0 red; /m)
  }

  // The same kind of source under another path is not the listed file.
  const other = await run(root, ['u/a.test.mjs'], { excluded })
  assert.equal(other.code, 1)
  assert.match(other.text, /^clock-shift: FAIL u\/a\.test\.mjs — exit 1/m)

  // A list that is not well formed stops the run in every mode, before any child.
  for (const argv of [
    ['t/a2.test.mjs'],
    ['--changed-since', 'HEAD^1'],
    ['--all-workers'],
    ['--check-excluded']
  ]) {
    const broken = await run(root, argv, {
      excluded: [{ file: 't/*.test.mjs', reason: REASON }],
      spawnChild: neverSpawn,
      workers,
      git
    })
    assert.equal(broken.code, 1, JSON.stringify(argv))
    assert.match(broken.text, /the run stopped: not one \{ file, reason \} per exact \*\.test\.mjs path/)
  }
})

test('--check-excluded: a file that still exits non-zero on the moved clock is STILL NEEDED; one that exits 0 is NO LONGER NEEDED and the command is red', async () => {
  const root = tree({
    'm.test.mjs': mismatch(),
    'fixed.test.mjs': PASSING,
    'hang.test.mjs': hanging(join(SCRATCH, 'check-excluded-hang')),
    'crash.test.mjs': "process.kill(process.pid, 'SIGKILL')\n"
  })
  const entry = (file) => ({ file, reason: REASON })
  const offsets = []
  const recording = (...args) => {
    offsets.push(args[2].env.TRACY_TEST_CLOCK_OFFSET_DAYS)
    return spawn(...args)
  }
  const needed = await run(root, ['--check-excluded'], {
    excluded: [entry('m.test.mjs'), entry('hang.test.mjs')],
    spawnChild: recording,
    timeoutMs: 1000
  })
  assert.equal(needed.code, 0, needed.text)
  assert.match(needed.text, /^clock-shift: STILL NEEDED m\.test\.mjs — exit 1, /m)
  assert.match(
    needed.text,
    /^clock-shift: STILL NEEDED hang\.test\.mjs — still running after 1 s: stopped, /m
  )
  assert.match(needed.text, /^clock-shift: 2 run, 0 excluded, 0 red; /m)
  // Each file once, on the moved clock only; an expected failure's log is saved, not printed.
  assert.deepEqual(offsets, [undefined, undefined])
  assert.doesNotMatch(needed.text, /person@example\.com/)
  assert.match(logOf(needed.text, 'm.test.mjs'), /person@example\.com/)
  assert.doesNotMatch(needed.text, /^clock-shift: EXCLUDED /m)

  const stale = await run(root, ['--check-excluded'], {
    excluded: [entry('m.test.mjs'), entry('fixed.test.mjs'), entry('deleted.test.mjs')]
  })
  assert.equal(stale.code, 1)
  assert.match(stale.text, /^clock-shift: STILL NEEDED m\.test\.mjs — exit 1, /m)
  assert.match(stale.text, /^clock-shift: NO LONGER NEEDED fixed\.test\.mjs — exit 0, /m)
  assert.match(stale.text, /^clock-shift: FAIL deleted\.test\.mjs — refused before running: does not exist$/m)
  assert.match(stale.text, /^clock-shift: 2 run, 0 excluded, 2 red; /m)
  assert.match(
    stale.text,
    /^ {2}fixed\.test\.mjs — exit 0, .*\nEach file's log decides; remove from EXCLUDED every file that exits 0 here\.$/m
  )

  // A file that cannot be run is red on its own, with nothing to remove.
  const missing = await run(root, ['--check-excluded'], {
    excluded: [entry('m.test.mjs'), entry('deleted.test.mjs')]
  })
  assert.equal(missing.code, 1)
  assert.match(missing.text, /^ {2}deleted\.test\.mjs — refused before running: does not exist$/m)

  // Any non-zero end counts, a signal included: no cause is read from the output.
  const crash = await run(root, ['--check-excluded'], {
    excluded: [entry('crash.test.mjs')],
    spawnChild: node("process.kill(process.pid, 'SIGKILL')")
  })
  assert.equal(crash.code, 0, crash.text)
  assert.match(crash.text, /^clock-shift: STILL NEEDED crash\.test\.mjs — killed by SIGKILL, /m)

  // A child that never started gave no exit code: NOT RUN and red, never `STILL NEEDED`.
  for (const [spawnChild, why] of [
    [noSuchBinary(root), /could not start: .*ENOENT/],
    [spawnThrows, /could not start: EAGAIN/]
  ]) {
    const unrun = await run(root, ['--check-excluded'], { excluded: [entry('m.test.mjs')], spawnChild })
    assert.equal(unrun.code, 1, unrun.text)
    assert.match(unrun.text, new RegExp(`^clock-shift: NOT RUN m\\.test\\.mjs — ${why.source}`, 'm'))
    assert.doesNotMatch(unrun.text, /STILL NEEDED|NO LONGER NEEDED/)
    assert.match(unrun.text, /^clock-shift: 1 run, 0 excluded, 1 red; /m)
  }

  // Asked on the real clock, every listed file exits 0: red, never a quiet pass.
  const control = await run(root, ['--check-excluded'], { excluded: [entry('m.test.mjs')], days: '0' })
  assert.equal(control.code, 1)
  assert.match(control.text, /^clock-shift: NO LONGER NEEDED m\.test\.mjs — exit 0, /m)
  assert.match(control.text, /to run with the clock moved 0 day\(s\) forward/)
})

test('the shipped EXCLUDED list is well formed, names files that exist, and still holds the brief-guard entry', () => {
  validateExclusions(EXCLUDED)
  assert.ok(Object.isFrozen(EXCLUDED))
  for (const { file } of EXCLUDED) assert.equal(validateFile(ROOT, file), file)
  const guard = EXCLUDED.find((entry) => entry.file === 'apps/tracy-web/test/brief-guard.test.mjs')
  assert.match(guard.reason, /goes red for real on 01\/01\/2027/)
})

test('worker discovery is strict for this runner: a directory that cannot be listed is an error, not a shorter list', async () => {
  const { walk } = await import('../check-tests.ts')
  const root = tree({ 'a/x.test.mjs': PASSING, 'a/deep/y.test.mjs': PASSING })
  assert.deepEqual(walk(root, [], true).sort(), [join(root, 'a/deep/y.test.mjs'), join(root, 'a/x.test.mjs')])
  // The gate's own walk keeps skipping what it cannot list; the strict one says which directory.
  assert.deepEqual(walk(join(root, 'missing')), [])
  assert.throws(() => walk(join(root, 'missing'), [], true), /cannot list .*missing/)
  if (process.getuid?.() !== 0) {
    chmodSync(join(root, 'a/deep'), 0o000)
    try {
      assert.deepEqual(walk(root), [join(root, 'a/x.test.mjs')])
      assert.throws(() => walk(root, [], true), /cannot list .*deep/)
    } finally {
      chmodSync(join(root, 'a/deep'), 0o700)
    }
  }

  // A discovery that throws is red in both modes that use it; no child is started.
  for (const argv of [['--changed-since', 'HEAD^1'], ['--all-workers']]) {
    const { code, text } = await run(root, argv, {
      workers: async () => {
        throw new Error('cannot list /repo/apps/x: EACCES')
      },
      spawnChild: neverSpawn
    })
    assert.equal(code, 1)
    assert.match(text, /^clock-shift: the run stopped: cannot list \/repo\/apps\/x: EACCES$/m)
    assert.doesNotMatch(text, /file\(s\) to run/)
  }
  // The runner's own discovery asks for the strict walk.
  assert.match(readFileSync(RUNNER, 'utf8'), /workersFiles\(\{ strict: true \}\)/)
})

// ── --changed-since, on a real repository ───────────────────────────────────────────────────────

/** A repository with a base on `main` and a `work` branch several commits ahead. */
function repository() {
  const root = tree({
    't/modified.test.mjs': PASSING,
    't/staged.test.mjs': PASSING,
    't/unstaged.test.mjs': PASSING,
    't/untouched.test.mjs': PASSING,
    't/deleted.test.mjs': PASSING,
    't/old name.test.mjs': PASSING,
    't/base-moved.test.mjs': PASSING,
    't/was a file.test.mjs': PASSING,
    'src/code.mjs': 'export const one = 1\n'
  })
  const env = {
    ...envWithoutGitLocation(process.env),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null'
  }
  const git = (...args) =>
    execFileSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@example.test', '-c', 'commit.gpgsign=false', ...args],
      {
        cwd: root,
        env,
        encoding: 'utf8'
      }
    )
  const more = (name) =>
    writeFileSync(join(root, name), `${readFileSync(join(root, name), 'utf8')}test('one more', () => {})\n`)
  symlinkSync('untouched.test.mjs', join(root, 't/was a link.test.mjs'))
  git('init', '--quiet', '--initial-branch=main')
  git('add', '-A')
  git('commit', '--quiet', '-m', 'base')
  git('checkout', '--quiet', '-b', 'work')
  more('t/modified.test.mjs')
  writeFileSync(join(root, 'src/code.mjs'), 'export const one = 2\n')
  git('commit', '--quiet', '-am', 'first')
  writeFileSync(join(root, 't/added in a later commit.test.mjs'), PASSING)
  rmSync(join(root, 't/deleted.test.mjs'))
  renameSync(join(root, 't/old name.test.mjs'), join(root, 't/new name.test.mjs'))
  // A type change (git status `T`) with the same content on the other side of the link.
  rmSync(join(root, 't/was a link.test.mjs'))
  writeFileSync(join(root, 't/was a link.test.mjs'), PASSING)
  git('add', '-A')
  git('commit', '--quiet', '-m', 'second')
  // The base branch moves on after the fork: not part of this change.
  git('checkout', '--quiet', 'main')
  more('t/base-moved.test.mjs')
  git('commit', '--quiet', '-am', 'base moves')
  git('checkout', '--quiet', 'work')
  more('t/staged.test.mjs')
  git('add', 't/staged.test.mjs')
  more('t/unstaged.test.mjs')
  writeFileSync(join(root, 't/untracked.test.mjs'), PASSING)
  const workers = [
    't/added in a later commit.test.mjs',
    't/base-moved.test.mjs',
    't/deleted.test.mjs',
    't/modified.test.mjs',
    't/new name.test.mjs',
    't/old name.test.mjs',
    't/staged.test.mjs',
    't/unstaged.test.mjs',
    't/untouched.test.mjs',
    't/untracked.test.mjs',
    't/was a file.test.mjs',
    't/was a link.test.mjs'
  ]
  return { root, git, workers }
}

const SELECTED = [
  't/added in a later commit.test.mjs',
  't/modified.test.mjs',
  't/new name.test.mjs',
  't/staged.test.mjs',
  't/unstaged.test.mjs',
  't/untracked.test.mjs',
  't/was a link.test.mjs'
]

/** A repository whose only commit has no parent, as a depth-1 checkout of a merge commit reads. */
function shallow() {
  const root = tree({ 't/a.test.mjs': PASSING })
  const env = {
    ...envWithoutGitLocation(process.env),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null'
  }
  for (const args of [
    ['init', '--quiet', '--initial-branch=main'],
    ['add', '-A'],
    [
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@example.test',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      'only'
    ]
  ])
    execFileSync('git', args, { cwd: root, env, encoding: 'utf8' })
  return root
}

test('--changed-since: added and modified test files since the merge base, across commits, staged, unstaged and untracked', async () => {
  const { root, workers } = repository()
  // Deleted, renamed-away, untouched and base-only files are not selected; nor is non-test code.
  assert.deepEqual(changedFiles({ root, ref: 'main', workers }), SELECTED)

  const { code, text } = await run(root, ['--changed-since', 'main'], { workers: async () => workers })
  assert.equal(code, 0, text)
  assert.deepEqual(
    text
      .match(/^clock-shift: HOLDS .*(?= — exit 0)/gm)
      .map((line) => line.replace('clock-shift: HOLDS ', '')),
    SELECTED
  )
  assert.match(text, /^clock-shift: 7 file\(s\) to run with the clock moved 400 day\(s\) forward/m)
})

test('--changed-since: a type change is selected in both directions; a test file turned into a link is refused, red', async () => {
  const { root, git, workers } = repository()
  assert.equal(
    git('diff', '--name-status', '--no-renames', 'main...HEAD', '--', 't/was a link.test.mjs')[0],
    'T'
  )
  rmSync(join(root, 't/was a file.test.mjs'))
  symlinkSync('untouched.test.mjs', join(root, 't/was a file.test.mjs'))
  for (const stage of [() => {}, () => git('commit', '--quiet', '-am', 'file to link')]) {
    stage()
    assert.deepEqual(
      changedFiles({ root, ref: 'main', workers }),
      [...SELECTED, 't/was a file.test.mjs'].sort()
    )
  }
  const { code, text } = await run(root, ['--changed-since', 'main'], { workers: async () => workers })
  assert.equal(code, 1, text)
  assert.match(
    text,
    /^clock-shift: FAIL t\/was a file\.test\.mjs — refused before running: is a symbolic link$/m
  )
  assert.match(text, /^clock-shift: HOLDS t\/was a link\.test\.mjs — exit 0, /m)
})

test('--changed-since: a pull request merge commit is read against its first parent', async () => {
  const { root, git, workers } = repository()
  git('commit', '--quiet', '-am', 'the rest')
  git('checkout', '--quiet', 'main')
  git('merge', '--quiet', '--no-ff', '-m', 'merge work', 'work')
  assert.deepEqual(changedFiles({ root, ref: 'HEAD^1', workers }), SELECTED)
})

test('--changed-since: a change that touches no test:workers file runs nothing and says so', async () => {
  const { root } = repository()
  const { code, text } = await run(root, ['--changed-since', 'main'], {
    workers: async () => ['t/untouched.test.mjs', 'elsewhere/x.test.mjs'],
    spawnChild: neverSpawn
  })
  assert.equal(code, 0)
  assert.match(text, /^clock-shift: 0 file\(s\) to run with the clock moved 400 day\(s\) forward; /m)
  assert.match(text, /^clock-shift: 0 run, 0 excluded, 0 red; /m)
})

test('--changed-since: when git cannot say what changed the run is red, never empty and never the whole suite', async () => {
  const { root, workers } = repository()
  const failing = [
    [{ argv: ['--changed-since', 'no-such-ref'] }, /the run stopped: /],
    // A checkout without the merge parent (fetch-depth 1) has no HEAD^1.
    [{ argv: ['--changed-since', 'HEAD^1'], root: shallow() }, /the run stopped: /],
    [{ argv: ['--changed-since', 'main'], root: tree({ 'a.test.mjs': PASSING }) }, /the run stopped: /],
    [{ argv: ['--changed-since', 'main'], git: () => 'not a commit\n' }, /did not name a commit/],
    [
      {
        argv: ['--changed-since', 'main'],
        git: (args) => (args[0] === 'merge-base' ? `${'a'.repeat(40)}\n` : 't/modified.test.mjs\0t/stag')
      },
      /git diff ended mid-name: the list of changed files is incomplete/
    ],
    [
      {
        argv: ['--changed-since', 'main'],
        git: (args) =>
          args[0] === 'merge-base' ? `${'a'.repeat(40)}\n` : args[0] === 'diff' ? '' : 't/untracked'
      },
      /git ls-files ended mid-name/
    ],
    [{ argv: ['--changed-since', 'main'], workers: async () => [] }, /the test:workers file list is empty/],
    [{ argv: ['--changed-since', 'main'], workers: async () => null }, /the test:workers file list is empty/],
    [
      {
        argv: ['--changed-since', 'main'],
        workers: async () => {
          throw new Error('GROUPS no longer declares test:workers')
        }
      },
      /GROUPS no longer declares test:workers/
    ],
    [{ argv: ['--all-workers'], workers: async () => [] }, /the test:workers file list is empty/]
  ]
  for (const [{ argv, root: other, ...deps }, message] of failing) {
    const { code, text } = await run(other ?? root, argv, {
      workers: async () => workers,
      spawnChild: neverSpawn,
      ...deps
    })
    assert.equal(code, 1, text)
    assert.match(text, message)
    assert.doesNotMatch(text, /file\(s\) to run/)
  }
})

test('--all-workers runs the list it is given and nothing else', async () => {
  const root = tree({ 'a.test.mjs': PASSING, 'b.test.mjs': PASSING, 'not-listed.test.mjs': FAILING })
  const { code, text } = await run(root, ['--all-workers'], {
    workers: async () => ['a.test.mjs', 'b.test.mjs']
  })
  assert.equal(code, 0, text)
  assert.match(text, /^clock-shift: 2 run, 0 excluded, 0 red; /m)
  assert.doesNotMatch(text, /not-listed/)
})

test('several files at once: one log per file with only its own output, one verdict each, every red file named', async () => {
  const noisy = (label, verdict) => `import assert from 'node:assert/strict'
import { test } from 'node:test'
test('${label}', async () => {
  for (let i = 0; i < 40; i++) {
    console.log('${label} line ' + i)
    await new Promise((done) => setTimeout(done, 5))
  }
  assert.ok(${verdict})
})
`
  const labels = { 'a.test.mjs': 'alpha', 'b.test.mjs': 'beta', 'c.test.mjs': 'gamma', 'd.test.mjs': 'delta' }
  const root = tree({
    'a.test.mjs': noisy('alpha', true),
    'b.test.mjs': noisy('beta', false),
    'c.test.mjs': noisy('gamma', true),
    'd.test.mjs': noisy('delta', false)
  })
  const { code, text } = await run(root, ['--all-workers'], {
    workers: async () => Object.keys(labels),
    jobs: 4
  })
  assert.equal(code, 1)
  assert.match(text, /^clock-shift: 4 run, 0 excluded, 2 red; /m)
  assert.match(text, /^ {2}b\.test\.mjs — exit 1, /m)
  assert.match(text, /^ {2}d\.test\.mjs — exit 1, /m)
  for (const [file, label] of Object.entries(labels)) {
    assert.equal(
      text.match(new RegExp(`^clock-shift: (HOLDS|FAIL) ${file.replace('.', '\\.')} — `, 'gm')).length,
      1
    )
    const log = logOf(text, file)
    assert.ok(log.includes(`${label} line 0`) && log.includes(`${label} line 39`), file)
    for (const other of Object.values(labels))
      if (other !== label) assert.ok(!log.includes(`${other} line`), file)
  }
  // A red file's log is printed in one piece, right above its verdict.
  const from = text.indexOf('beta line 0')
  assert.ok(from !== -1 && text.indexOf('beta line 39') > from)
  assert.doesNotMatch(text.slice(from, text.indexOf('beta line 39')), /alpha|gamma|delta/)
  assert.doesNotMatch(text, /alpha line|gamma line/)
  // One fresh log directory per run, one file per test file.
  const dir = dirname(text.match(/, log (.*\.log)$/m)[1])
  assert.equal(readdirSync(dir).length, 4)
})

// ── Where CI runs it ────────────────────────────────────────────────────────────────────────────

test('Tracy CI runs it on the one row the planner marks with clock, and on the full nightly shard', () => {
  const workflow = loadYaml(readFileSync(join(ROOT, '.github/workflows/tracy-ci.yml'), 'utf8'))
  const triggers = workflow.on
  assert.ok(
    triggers.pull_request && Array.isArray(triggers.schedule),
    'pull_request and schedule both trigger Tracy CI'
  )
  // No job was added for it: `build-check` is the only job that mentions it. (Not a list of every
  // job name: other changes add jobs of their own.)
  const mentions = Object.keys(workflow.jobs).filter((name) =>
    /clock-shift/.test(JSON.stringify(workflow.jobs[name]))
  )
  assert.deepEqual(mentions, ['build-check'])

  const job = workflow.jobs['build-check']
  assert.equal(job.strategy.matrix, '${{ fromJSON(needs.plan.outputs.matrix) }}')
  assert.equal(job.strategy['fail-fast'], false)
  const names = job.steps.map((step) => step.name)
  const stepNamed = (name) => job.steps[names.indexOf(name)]

  // The merge commit AND its first parent: `--changed-since HEAD^1` needs both.
  assert.equal(stepNamed('Check out Git repository').with['fetch-depth'], 2)
  // The gate run itself is what it was (a Turbo row runs its tasks in the step before instead).
  assert.equal(stepNamed('Build check').run, 'pnpm exec tsx scripts/check-all.ts ${{ matrix.args }}')
  assert.equal(stepNamed('Build check').if, '${{ !matrix.turbo }}')
  assert.equal(stepNamed('Install dependencies').id, 'install')

  const mine = job.steps.filter((step) => /run-clock-shift|test:clock-shift/.test(step.run ?? ''))
  assert.equal(mine.length, 1)
  const [step] = mine
  assert.ok(
    job.steps.indexOf(step) > names.indexOf('Build check'),
    'it runs after the gates, never instead of them'
  )
  assert.equal(step['continue-on-error'], undefined)
  assert.equal(
    step.if,
    "${{ !cancelled() && steps.install.outcome == 'success' && matrix.clock && (github.event_name == 'pull_request' || github.event_name == 'schedule') }}"
  )
  assert.deepEqual(step.env, {
    EVENT: '${{ github.event_name }}',
    TRACY_CLOCK_SHIFT_LOG_DIR: '${{ runner.temp }}/clock-shift'
  })
  assert.ok(step.run.split('\n').some((line) => line.trim() === 'set -euo pipefail'))

  // The script itself, run by bash with a stand-in `node` that records its arguments and fails
  // where told: what each event runs, and that a red command neither hides nor stops another.
  const bin = tree({
    node: '#!/bin/sh\necho "$*" >> "$CALLS"\nif [ -n "$FAIL_ON" ]; then case "$*" in *"$FAIL_ON"*) exit 3 ;; esac; fi\nexit 0\n',
    'step.sh': step.run
  })
  chmodSync(join(bin, 'node'), 0o755)
  const runStep = (event, failOn = '') => {
    const calls = join(bin, `calls-${event}-${failOn || 'none'}.txt`)
    writeFileSync(calls, '')
    const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', join(bin, 'step.sh')], {
      env: { PATH: `${bin}:${process.env.PATH}`, EVENT: event, CALLS: calls, FAIL_ON: failOn },
      encoding: 'utf8',
      timeout: 30_000
    })
    return { status: result.status, calls: readFileSync(calls, 'utf8').trim().split('\n') }
  }
  const NIGHTLY = [
    'scripts/run-clock-shift.mjs --check-excluded',
    'scripts/run-clock-shift.mjs --all-workers'
  ]
  assert.deepEqual(runStep('schedule'), { status: 0, calls: NIGHTLY })
  // An entry no longer needed is red AND the whole list still runs; a red list is red after a clean check.
  assert.deepEqual(runStep('schedule', '--check-excluded'), { status: 3, calls: NIGHTLY })
  assert.deepEqual(runStep('schedule', '--all-workers'), { status: 3, calls: NIGHTLY })
  assert.deepEqual(runStep('schedule', 'run-clock-shift'), { status: 3, calls: NIGHTLY })
  const CHANGED = ['scripts/run-clock-shift.mjs --changed-since HEAD^1']
  assert.deepEqual(runStep('pull_request'), { status: 0, calls: CHANGED })
  assert.deepEqual(runStep('pull_request', '--changed-since'), { status: 3, calls: CHANGED })

  // A routine PR without a Turbo answer marks its selected test row; the nightly marks the full
  // second shard. With a Turbo answer `checks` carries it (`scripts/test/ci-turbo-rows.test.mjs`).
  const file = 'apps/tracy-web/test/seat.test.mjs'
  const prPlan = planMatrix({ event: 'pull_request', baseRef: 'develop', changed: [file], allFiles: [file] })
  assert.deepEqual(
    prPlan.matrix.include.find((r) => r.group === 'tests related'),
    {
      group: 'tests related',
      label: 'tracy-check',
      args: '--only tests --tests-part related',
      clock: true
    }
  )
  const nightlyPlan = planMatrix({ event: 'schedule', allFiles: [file] })
  assert.deepEqual(
    nightlyPlan.matrix.include.find((r) => r.group === 'tests 2/2'),
    {
      group: 'tests 2/2',
      label: 'tracy-check',
      args: '--only tests --tests-part workers:2/2,rest',
      clock: true
    }
  )

  const scripts = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts
  assert.equal(scripts['test:clock-shift'], 'node scripts/run-clock-shift.mjs')
})
