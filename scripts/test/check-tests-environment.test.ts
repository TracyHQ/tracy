/**
 * What the tests gate did NOT run, said out loud (08/10/2026, #1028).
 *
 * WHY THESE ARE PINNED. A test that skips itself because the machine lacks something prints one
 * grey line among thousands and the gate is green; fifteen tests lived that way and no file said
 * so. Three things now make it visible, and each has a way to go quiet again:
 *   - the second reporter lists every selected-and-not-run test with its file and reason — unless
 *     it stops being wired into a part, or starts changing the verdict;
 *   - `NOT_RUN_HERE` names the trees whose tests this gate leaves alone — unless a tree moves, or
 *     an entry is kept for a tree that no longer holds a test;
 *   - a prerequisite that was asked for and cannot be used fails — unless it turns back into a skip.
 *
 *   node --import tsx --test scripts/test/check-tests-environment.test.ts
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  coverageProblems,
  e2eArgs,
  interopArgs,
  NOT_RUN_HERE,
  reportedScript,
  vendorArgs,
  workersShardArgs
} from '../check-tests.ts'
import {
  createCollector,
  isWholeReport,
  NO_REPORT,
  REPORT_END,
  REPORTER_FAULT,
  reporterArgs,
  scratchRoot,
  spawnReported,
  TIMING_MARK
} from '../test-timing-reporter.mjs'
import { parseTimingLog, sampleOf } from '../update-test-timings.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '../..')

/** A child `node --test` must print and exit on its own, not report to the runner running us. */
function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const {
    NODE_TEST_CONTEXT: _context,
    TRACY_TEST_TIMING: _timing,
    TRACY_TEST_REPORT_FILE: _report,
    ...env
  } = process.env
  return { ...env, ...extra }
}

function tempTree(prefix: string): string {
  return mkdtempSync(join(realpathSync(process.env.TCH_TEST_ARTIFACTS_DIR ?? tmpdir()), prefix))
}

// ── the reporter's rules, on hand-made events ────────────────────────────────────────────────────

const FILE = join(ROOT, 'apps/site/test/one.test.mjs')
const fileRecord = (file: string, ms: number, passed = true) => ({
  type: 'test:complete',
  // The runner names a file's record by the path it was given, relative to where it runs.
  data: {
    name: relative(ROOT, file),
    nesting: 0,
    line: 1,
    column: 1,
    file,
    details: { duration_ms: ms, passed }
  }
})
const result = (name: string, extra: object = {}, type = 'test:pass') => ({
  type,
  data: { name, nesting: 0, line: 12, column: 1, file: FILE, details: { duration_ms: 5 }, ...extra }
})

test('reporter: a skip and a todo are listed with file, line, name and reason; a pass is not', () => {
  const c = createCollector()
  c.add(result('runs'))
  c.add(result('needs docker', { skip: 'no docker daemon here' }))
  c.add(result('bare', { skip: true, line: 20 }))
  c.add(result('later', { todo: true, line: 30 }))
  c.add(result('multi\nline name', { skip: 'reason\twith\nbreaks', line: 40 }))
  c.add(result('red and skipped', { skip: 'why' }, 'test:fail'))
  const lines = c.render().trimEnd().split('\n')
  assert.match(lines[0], /^check-tests: 5 test\(s\) were selected and NOT run/)
  assert.deepEqual(lines.slice(1), [
    'check-tests:   SKIP apps/site/test/one.test.mjs:12 › needs docker — no docker daemon here',
    'check-tests:   SKIP apps/site/test/one.test.mjs:12 › red and skipped — why',
    'check-tests:   SKIP apps/site/test/one.test.mjs:20 › bare — (no reason given)',
    'check-tests:   SKIP apps/site/test/one.test.mjs:40 › multi line name — reason with breaks',
    'check-tests:   TODO apps/site/test/one.test.mjs:30 › later — (no reason given)'
  ])
  assert.doesNotMatch(c.render(), new RegExp(TIMING_MARK), 'no timing line unless asked for')
})

test('reporter: nothing skipped is said too, so silence is never the report', () => {
  const c = createCollector()
  c.add(result('runs'))
  assert.equal(c.render(), 'check-tests: 0 tests were selected and not run (no skip, no todo) in this run.\n')
})

test('reporter: only the file’s own record is a file duration; a test’s never is', () => {
  const c = createCollector({ timing: true, cwd: ROOT })
  // A slow test, tests named after the file (by base name, and by path but not at 1:1 or nested):
  // none is the file.
  const named = 'apps/site/test/one.test.mjs'
  c.add(result('slow', { details: { duration_ms: 90_000 } }))
  c.add({
    type: 'test:complete',
    data: {
      name: 'one.test.mjs',
      nesting: 0,
      line: 1,
      column: 1,
      file: FILE,
      details: { duration_ms: 60_000, passed: true }
    }
  })
  c.add({
    type: 'test:complete',
    data: {
      name: named,
      nesting: 0,
      line: 7,
      column: 1,
      file: FILE,
      details: { duration_ms: 80_000, passed: true }
    }
  })
  c.add({
    type: 'test:complete',
    data: {
      name: named,
      nesting: 1,
      line: 1,
      column: 1,
      file: FILE,
      details: { duration_ms: 70_000, passed: true }
    }
  })
  c.add(fileRecord(FILE, 1234.6))
  const out = c.render()
  assert.match(out, /tracy-test-timing v1 file=apps\/site\/test\/one\.test\.mjs seconds=1\.235 ok=1\n/)
  assert.match(out, /tracy-test-timing v1 files=1 summed=1\.235\n/)
  assert.doesNotMatch(out, /seconds=(90|80|70|60)\./)
})

test('reporter: late, duplicate and interleaved file records are refused per file, never averaged', () => {
  const other = join(ROOT, 'apps/site/test/two.test.mjs')
  const red = join(ROOT, 'apps/site/test/red.test.mjs')
  const odd = join(ROOT, 'apps/site/test/odd.test.mjs')
  const spaced = join(ROOT, 'apps/site/test/has space.test.mjs')
  const c = createCollector({ timing: true, cwd: ROOT })
  c.add(fileRecord(FILE, 1000))
  c.add(fileRecord(other, 2000))
  c.add(result('a test in between'))
  c.add(fileRecord(FILE, 9000)) // the same file again, after another file's record
  c.add(fileRecord(red, 500, false))
  c.add({
    type: 'test:complete',
    data: { name: relative(ROOT, odd), nesting: 0, line: 1, column: 1, file: odd, details: {} }
  })
  c.add(fileRecord(spaced, 100))
  // Under half a millisecond would print as 0.000: no process is that fast, so it is no number.
  const instant = join(ROOT, 'apps/site/test/instant.test.mjs')
  c.add(fileRecord(instant, 0.2))
  const zero = join(ROOT, 'apps/site/test/zero.test.mjs')
  c.add(fileRecord(zero, 0))
  const out = c.render()
  assert.match(out, /conflict file=apps\/site\/test\/instant\.test\.mjs reason=no-usable-duration\n/)
  assert.match(out, /conflict file=apps\/site\/test\/zero\.test\.mjs reason=no-usable-duration\n/)
  assert.doesNotMatch(out, /seconds=0\.000/)
  assert.match(out, /conflict file=apps\/site\/test\/one\.test\.mjs reason=2-file-records\n/)
  assert.match(out, /file=apps\/site\/test\/two\.test\.mjs seconds=2\.000 ok=1\n/)
  assert.match(out, /file=apps\/site\/test\/red\.test\.mjs seconds=0\.500 ok=0\n/)
  assert.match(out, /conflict file=apps\/site\/test\/odd\.test\.mjs reason=no-usable-duration\n/)
  assert.match(out, /conflict file="apps\/site\/test\/has space\.test\.mjs" reason=whitespace-in-path\n/)
  assert.match(out, /files=2 summed=2\.500\n/)
  assert.doesNotMatch(out, /one\.test\.mjs seconds=/)
})

test('reporter: malformed events and its own faults become one line, not a throw', () => {
  const c = createCollector({ timing: true, cwd: ROOT })
  for (const bad of [
    null,
    undefined,
    {},
    { type: 'test:pass' },
    { type: 'test:pass', data: null },
    { type: 'test:complete', data: 'x' }
  ]) {
    c.add(bad as never)
  }
  const hostile = { type: 'test:pass', data: {} }
  Object.defineProperty(hostile.data, 'skip', {
    get() {
      throw new Error('boom from an event')
    }
  })
  c.add(hostile)
  const out = c.render()
  assert.match(out, /check-tests: reporter error \(the test verdict is unaffected\): boom from an event\n/)
  assert.match(out, /files=0 summed=0\.000\n/)
  // The table reader takes that line as "this run is not a sample", wherever it stands in a log.
  assert.ok(out.includes(`${REPORTER_FAULT}: boom from an event`))
  assert.match(parseTimingLog(out).problems.join(' | '), /the reporter said it failed/)
  assert.ok('refused' in sampleOf(parseTimingLog(out), 2))
})

// ── the reporter beside the usual one, in a real `node --test` ───────────────────────────────────

const FIXTURES: Record<string, string> = {
  'pass.test.mjs':
    "import { test } from 'node:test'\nawait new Promise((r) => setTimeout(r, 150))\ntest('fine', () => {})\n",
  'skip.test.mjs':
    "import { test } from 'node:test'\n" +
    "test('needs a daemon', { skip: 'no docker daemon here' }, () => {})\n" +
    "test('skips at run time', (t) => t.skip('fixture missing'))\n" +
    "test('ran', () => {})\n",
  'red.test.mjs':
    "import { test } from 'node:test'\ntest('broken', () => { throw new Error('really broken') })\n"
}

function runFixtures(names: string[], env: Record<string, string> = {}) {
  const dir = tempTree('check-tests-reporter-')
  try {
    for (const name of names) writeFileSync(join(dir, name), FIXTURES[name])
    // `--test-force-exit` as the gate passes it: the report must be out before the forced exit.
    let report = ''
    const run = spawnReported(
      process.execPath,
      ['--test', '--test-force-exit', ...reporterArgs(), ...names],
      { cwd: dir, encoding: 'utf8', stdio: 'pipe', timeout: 60_000, env: cleanEnv(env) },
      (text: string) => {
        report += text
      }
    )
    assert.equal(run.error, undefined, String(run.error))
    assert.equal(run.report, report, 'what was printed is what was returned')
    assert.ok(report.endsWith(`\n${REPORT_END}\n`), 'a real run closes its report')
    return { status: run.status, stdout: `${String(run.stdout)}${report}`.split(dir).join('<dir>'), dir }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('beside the usual reporter: its output is kept, the skips are listed, exit 0 stays 0', () => {
  const got = runFixtures(['pass.test.mjs', 'skip.test.mjs'])
  assert.equal(got.status, 0, got.stdout)
  assert.match(got.stdout, /✔ fine/, 'the usual reporter still prints')
  assert.match(got.stdout, /ℹ skipped 2/)
  assert.match(got.stdout, /check-tests: 2 test\(s\) were selected and NOT run/)
  assert.match(
    got.stdout,
    /check-tests: {3}SKIP <dir>\/skip\.test\.mjs:2 › needs a daemon — no docker daemon here\n/
  )
  assert.match(
    got.stdout,
    /check-tests: {3}SKIP <dir>\/skip\.test\.mjs:3 › skips at run time — fixture missing\n/
  )
  assert.doesNotMatch(got.stdout, new RegExp(TIMING_MARK), 'timing lines are for the shards only')
})

test('beside the usual reporter: a red suite stays red, with or without timing', () => {
  const envs: Record<string, string>[] = [{}, { TRACY_TEST_TIMING: '1' }]
  for (const env of envs) {
    const got = runFixtures(['pass.test.mjs', 'red.test.mjs'], env)
    assert.equal(got.status, 1, got.stdout)
    assert.match(got.stdout, /✖ broken/)
    assert.match(got.stdout, /really broken/)
  }
})

test('a run that leaves no report is said so, and its exit code is still its own', () => {
  let said = ''
  const run = spawnReported(
    process.execPath,
    ['-e', 'process.exit(3)'],
    { stdio: 'pipe', env: cleanEnv() },
    (text: string) => {
      said += text
    }
  )
  assert.equal(run.status, 3)
  assert.equal(run.report, null)
  assert.match(said, /left NO skip\/timing report/)
  assert.ok(said.startsWith(NO_REPORT))
  assert.match(JSON.stringify(sampleOf(parseTimingLog(said), 2)), /"refused":"the reporter said it failed/)
})

test('a report file that is empty or cut short is said so, never printed as the whole report', () => {
  const skip = 'check-tests:   SKIP a.test.mjs:2 › needs a daemon — no docker daemon here'
  const head = 'check-tests: 2 test(s) were selected and NOT run (skip/todo) — file:line › name — reason:'
  const whole = `${head}\n${skip}\n${REPORT_END}\n`
  const leaves = (text: string, code: number) => {
    let said = ''
    const run = spawnReported(
      process.execPath,
      [
        '-e',
        `require('node:fs').writeFileSync(process.env.TRACY_TEST_REPORT_FILE, ${JSON.stringify(text)}); process.exit(${String(code)})`
      ],
      { stdio: 'pipe', env: cleanEnv() },
      (out: string) => {
        said += out
      }
    )
    return { run, said }
  }
  // Every way a report can be there and not be whole; the suite's own exit code, green or red, is kept.
  const broken: [string, string][] = [
    ['empty', ''],
    ['one newline', '\n'],
    ['cut inside the first line', head.slice(0, 20)],
    ['cut after a whole line', `${head}\n`],
    ['cut inside a skip line', `${head}\n${skip.slice(0, 30)}`],
    ['cut inside the closing line', `${head}\n${skip}\n${REPORT_END.slice(0, -3)}`],
    ['the closing line without its newline', `${head}\n${skip}\n${REPORT_END}`],
    ['the closing line glued to another line', `${head}\n${skip} ${REPORT_END}\n`],
    ['a whole block, then a second one cut short', `${whole}${head}\n`],
    ['a timing block cut before its summary', `${TIMING_MARK} file=a.test.mjs seconds=1.000 ok=1\n`]
  ]
  for (const [name, text] of broken) {
    assert.equal(isWholeReport(text), false, name)
    for (const code of [0, 1, 7]) {
      const { run, said } = leaves(text, code)
      assert.equal(run.status, code, `${name}: the exit code is the suite's`)
      assert.equal(run.report, null, name)
      assert.ok(said.includes(`\n${NO_REPORT}`) || said.startsWith(NO_REPORT), `${name}: ${said}`)
      assert.ok(said.endsWith('\n'), name)
      assert.match(said, text === '' ? /report file is empty/ : /report file is cut short/, name)
      if (text.trim() !== '') assert.ok(said.startsWith(text), `${name}: what the file holds is still shown`)
      // Wherever these lines land in a CI log, the table reader refuses the run.
      const log = said
        .split('\n')
        .filter((l) => l !== '')
        .map((l) => `build check (tests 1/2)\tBuild check\t2026-10-08T00:26:15.2285319Z ${l}`)
        .join('\n')
      assert.match(parseTimingLog(log).problems.join(' | '), /the reporter said it failed/, name)
      assert.ok('refused' in sampleOf(parseTimingLog(log), 2), name)
    }
  }
  assert.equal(isWholeReport(null), false)
  for (const text of [whole, `${whole}${whole}`, `${REPORT_END}\n`]) {
    assert.equal(isWholeReport(text), true)
    const { run, said } = leaves(text, 4)
    assert.equal(run.status, 4)
    assert.equal(run.report, text)
    assert.equal(said, text)
    assert.doesNotMatch(said, /left NO skip\/timing report/)
  }
})

test('the report scratch goes to the named artifacts directory, or the run is refused before it starts', (t) => {
  const dir = tempTree('scratch-root-')
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  assert.equal(scratchRoot({}), tmpdir())
  assert.equal(scratchRoot({ TCH_TEST_ARTIFACTS_DIR: '' }), tmpdir())
  assert.equal(scratchRoot({ TCH_TEST_ARTIFACTS_DIR: dir }), dir)
  assert.deepEqual(readdirSync(dir), [], 'the probe leaves nothing behind')

  const file = join(dir, 'a-file')
  writeFileSync(file, '')
  const unusable: [string, string, RegExp][] = [
    ['missing', join(dir, 'gone'), /ENOENT/],
    ['a file', file, /not a directory/],
    ['relative', 'artifacts', /not an absolute path/]
  ]
  if (process.platform !== 'win32' && process.getuid?.() !== 0) {
    const locked = join(dir, 'locked')
    mkdirSync(locked, { mode: 0o500 })
    unusable.push(['read-only', locked, /EACCES|EPERM/])
  }
  for (const [name, value, why] of unusable) {
    assert.throws(() => scratchRoot({ TCH_TEST_ARTIFACTS_DIR: value }), why, name)
    assert.throws(() => scratchRoot({ TCH_TEST_ARTIFACTS_DIR: value }), /no other place is used/, name)
  }

  // The suite is told where to write and writes there: the sink it is handed is under the named place.
  const before = process.env.TCH_TEST_ARTIFACTS_DIR
  t.after(() => {
    if (before === undefined) delete process.env.TCH_TEST_ARTIFACTS_DIR
    else process.env.TCH_TEST_ARTIFACTS_DIR = before
  })
  process.env.TCH_TEST_ARTIFACTS_DIR = dir
  const seen = spawnReported(
    process.execPath,
    ['-e', 'process.stdout.write(process.env.TRACY_TEST_REPORT_FILE)'],
    { stdio: 'pipe', env: cleanEnv() },
    () => {}
  )
  assert.ok(String(seen.stdout).startsWith(join(dir, 'tracy-test-report-')), String(seen.stdout))
  assert.deepEqual(
    readdirSync(dir).sort(),
    ['a-file', 'locked'].filter((f) => existsSync(join(dir, f)))
  )

  // An unusable place starts nothing: the command would have left this marker.
  const marker = join(dir, 'ran')
  process.env.TCH_TEST_ARTIFACTS_DIR = join(dir, 'gone')
  assert.throws(
    () =>
      spawnReported(
        process.execPath,
        ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, '')`],
        { stdio: 'pipe', env: cleanEnv() },
        () => {}
      ),
    /nothing was run/
  )
  assert.equal(existsSync(marker), false)
  assert.equal(existsSync(join(dir, 'gone')), false, 'the missing directory is not created')
})

test('with TRACY_TEST_TIMING=1 the lines it prints are exactly what the table reader accepts', () => {
  const got = runFixtures(['pass.test.mjs', 'skip.test.mjs'], { TRACY_TEST_TIMING: '1' })
  assert.equal(got.status, 0, got.stdout)
  const records = got.stdout.split('\n').filter((l) => l.startsWith(`${TIMING_MARK} file=`))
  assert.equal(records.length, 2, got.stdout)
  const slow = /file=<dir>\/pass\.test\.mjs seconds=(\d+\.\d{3}) ok=1/.exec(got.stdout)
  assert.ok(slow, got.stdout)
  // The file waits 150 ms before its only (instant) test: process time, not a sum of test times.
  assert.ok(Number(slow[1]) >= 0.15, `file seconds ${slow[1]} should include the 150 ms outside any test`)

  // Wrapped the way a shard and `gh run view --log` wrap it, both shards and rest, it is a sample.
  const job = (i: number): string => `build check (tests ${String(i)}/2)`
  const wrap = (i: number, body: string[]): string[] =>
    [
      `${TIMING_MARK} begin part=workers shard=${String(i)}/2 files=${String(body.filter((l) => l.includes(' file=')).length)}`,
      ...body,
      `${TIMING_MARK} end part=workers shard=${String(i)}/2 wall=1.000`
    ].map((l) => `${job(i)}\tBuild check\t2026-10-08T00:26:15.2285319Z ${l}`)
  const body = got.stdout.split('\n').filter((l) => l !== '')
  const second = body.map((l) => l.replace(/<dir>\/(pass|skip)/, '<dir>/other-$1'))
  const log = [
    ...wrap(1, body),
    ...wrap(2, second),
    `${job(2)}\tBuild check\t2026-10-08T00:26:15.2285319Z ${TIMING_MARK} part=rest wall=3.000`
  ].join('\n')
  const sample = sampleOf(parseTimingLog(log), 2)
  assert.ok(!('refused' in sample), JSON.stringify(sample))
  assert.equal(sample.files.size, 4)
})

// ── the gate wires it into every part it spawns itself ───────────────────────────────────────────

test('every argv the gate builds keeps its flags and puts the reporter before the files', () => {
  const files = ['a.test.mjs', 'b.test.mjs']
  const rep = reporterArgs()
  assert.equal(rep.length, 4)
  assert.deepEqual(rep.slice(0, 2), ['--test-reporter=spec', '--test-reporter-destination=stdout'])
  assert.ok(existsSync(rep[2].replace('--test-reporter=', '')), 'the reporter is named by a path that exists')
  assert.deepEqual(workersShardArgs(files), [
    '--test',
    '--test-timeout=120000',
    '--test-force-exit',
    ...rep,
    ...files
  ])
  assert.deepEqual(e2eArgs(files), ['--test', '--test-timeout=120000', '--test-force-exit', ...rep, ...files])
  assert.deepEqual(interopArgs(files), ['--import', 'tsx', '--test', ...rep, ...files])
  assert.deepEqual(
    vendorArgs({
      name: 'test:tracy',
      args: ['--import', 'tsx', '--test', '--test-skip-pattern=x', 'test/**/*.test.ts']
    }),
    [...rep, '--import', 'tsx', '--test', '--test-skip-pattern=x', 'test/**/*.test.ts']
  )
})

test('a package script is run with its own flags and globs, the reporter in between; another shape is refused', () => {
  const rep = reporterArgs()
  const read = (rel: string): Record<string, unknown> =>
    (
      JSON.parse(readFileSync(join(ROOT, rel, 'package.json'), 'utf8')) as {
        scripts: Record<string, unknown>
      }
    ).scripts
  // The scripts the gate runs this way, as they are in the tree today.
  assert.deepEqual(reportedScript('package.json', 'test:workers', read('.')), [
    '--test',
    '--test-timeout=120000',
    '--test-force-exit',
    ...rep,
    'apps/*/test/*.test.mjs',
    'scripts/test/*.test.mjs',
    'packages/*/*/test/*.test.mjs'
  ])
  for (const theme of ['base', 'business', 'saas']) {
    const rel = `packages/cms/tracy-emdash-theme-${theme}`
    assert.deepEqual(reportedScript(rel, 'test', read(rel)), ['--test', ...rep, 'tests/*.test.mjs'], rel)
  }
  const refused: unknown[] = [
    undefined,
    null,
    7,
    '',
    'node --test',
    'node tests/a.test.mjs',
    'vitest run',
    'node --import tsx --test tests/*.test.ts',
    'node --test tests/*.test.mjs && echo done',
    'node --test tests/*.test.mjs; rm -rf x',
    'node --test $(cat list)',
    'node --test "tests/a b.test.mjs"',
    'node --test --inspect tests/*.test.mjs',
    'node --test tests/*.test.mjs --test-only',
    'node --test --test-reporter=dot tests/*.test.mjs',
    'node --test --test-reporter-destination=out.txt tests/*.test.mjs',
    'NODE_ENV=test node --test tests/*.test.mjs',
    'pnpm run build && node --test tests/*.test.mjs'
  ]
  for (const script of refused) {
    const got = reportedScript('pkg/package.json', 'test', { test: script })
    assert.ok(!Array.isArray(got), `${JSON.stringify(script)} should be refused`)
    assert.match(got.error, /^pkg\/package\.json: script "test"/)
  }
  assert.ok(!Array.isArray(reportedScript('pkg/package.json', 'test', {})), 'a missing script is refused')
})

/** The gate as a command over a throwaway tree (the harness of `check-tests-parts.test.ts`). */
function gateOver(files: Record<string, string>, part: string) {
  const root = tempTree('check-tests-environment-')
  try {
    mkdirSync(join(root, 'scripts'), { recursive: true })
    for (const module of ['check-tests.ts', 'test-database.ts', 'test-timing-reporter.mjs']) {
      writeFileSync(join(root, 'scripts', module), readFileSync(join(HERE, '..', module), 'utf8'))
    }
    mkdirSync(join(root, 'scripts/ci'), { recursive: true })
    writeFileSync(
      join(root, 'scripts/ci/related-tests.mjs'),
      readFileSync(join(HERE, '../ci/related-tests.mjs'), 'utf8')
    )
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true })
      writeFileSync(join(root, file), text)
    }
    const run = spawnSync(
      process.execPath,
      ['--import', 'tsx', join(root, 'scripts/check-tests.ts'), '--part', part],
      {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 60_000,
        env: cleanEnv()
      }
    )
    assert.equal(run.error, undefined, String(run.error))
    return { status: run.status, stdout: run.stdout, stderr: run.stderr }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('the gate prints the trees it does not run and the tests a part skipped', () => {
  const got = gateOver(
    {
      'apps/site/test/e2e/smoke.test.mjs': FIXTURES['skip.test.mjs'],
      'apps/site/test/unit.test.mjs': FIXTURES['pass.test.mjs']
    },
    'e2e'
  )
  assert.equal(got.status, 0, `${got.stdout}${got.stderr}`)
  assert.match(
    got.stdout,
    /check-tests: 4 trees hold tests this gate does NOT run .*tests\/e2e-dev, vendor\/tracy\/dsh-better-sidebar, vendor\/wordpress\/tracy-wordpress-theme, vendor\/tracy\/dsh-subscriptions\n/
  )
  assert.match(
    got.stdout,
    /check-tests: {3}SKIP apps\/site\/test\/e2e\/smoke\.test\.mjs:2 › needs a daemon — no docker daemon here\n/
  )
  assert.match(
    got.stdout,
    /check-tests: {3}SKIP apps\/site\/test\/e2e\/smoke\.test\.mjs:3 › skips at run time — fixture missing\n/
  )
})

test('the whole workers suite and a standalone suite list their skips too, and stay red when red', () => {
  const workers = JSON.stringify({
    scripts: { 'test:workers': 'node --test --test-timeout=120000 --test-force-exit apps/*/test/*.test.mjs' }
  })
  const tree = {
    'package.json': workers,
    'apps/site/test/a.test.mjs': FIXTURES['pass.test.mjs'],
    'apps/site/test/b.test.mjs': FIXTURES['skip.test.mjs']
  }
  const whole = gateOver(tree, 'workers')
  assert.equal(whole.status, 0, `${whole.stdout}${whole.stderr}`)
  assert.match(whole.stdout, /✔ fine/)
  assert.match(whole.stdout, /check-tests: 2 test\(s\) were selected and NOT run/)
  assert.match(whole.stdout, /check-tests: {3}SKIP apps\/site\/test\/b\.test\.mjs:2 › needs a daemon/)
  assert.match(whole.stdout, /check-tests: {3}SKIP apps\/site\/test\/b\.test\.mjs:3 › skips at run time/)
  assert.doesNotMatch(whole.stdout, new RegExp(TIMING_MARK), 'only a shard is timed')

  const red = gateOver({ ...tree, 'apps/site/test/c.test.mjs': FIXTURES['red.test.mjs'] }, 'workers')
  assert.equal(red.status, 1, `${red.stdout}${red.stderr}`)
  assert.match(red.stdout, /really broken/)

  const reshaped = gateOver(
    { ...tree, 'package.json': JSON.stringify({ scripts: { 'test:workers': 'vitest run' } }) },
    'workers'
  )
  assert.equal(reshaped.status, 1, `${reshaped.stdout}${reshaped.stderr}`)
  assert.match(reshaped.stderr, /package\.json: script "test:workers" is "vitest run"/)
  assert.doesNotMatch(reshaped.stdout, /✔ fine/, 'nothing ran')

  const theme = 'packages/cms/tracy-emdash-theme-base'
  const standalone = {
    'apps/site/test/a.test.mjs': FIXTURES['pass.test.mjs'],
    [`${theme}/package.json`]: JSON.stringify({ scripts: { test: 'node --test tests/*.test.mjs' } }),
    [`${theme}/node_modules/.keep`]: '',
    [`${theme}/tests/one.test.mjs`]: FIXTURES['skip.test.mjs'],
    [`${theme}/tests/two.test.mjs`]: FIXTURES['pass.test.mjs']
  }
  const alone = gateOver(standalone, 'standalone:base')
  assert.equal(alone.status, 0, `${alone.stdout}${alone.stderr}`)
  assert.match(alone.stdout, /✔ fine/)
  assert.match(
    alone.stdout,
    /check-tests: {3}SKIP packages\/cms\/tracy-emdash-theme-base\/tests\/one\.test\.mjs:3 › skips at run time — fixture missing\n/
  )
  const aloneRed = gateOver(
    { ...standalone, [`${theme}/tests/three.test.mjs`]: FIXTURES['red.test.mjs'] },
    'standalone:base'
  )
  assert.equal(aloneRed.status, 1, `${aloneRed.stdout}${aloneRed.stderr}`)
  const aloneReshaped = gateOver(
    { ...standalone, [`${theme}/package.json`]: JSON.stringify({ scripts: { test: 'astro test' } }) },
    'standalone:base'
  )
  assert.equal(aloneReshaped.status, 1, `${aloneReshaped.stdout}${aloneReshaped.stderr}`)
  assert.match(aloneReshaped.stderr, /tracy-emdash-theme-base\/package\.json: script "test" is "astro test"/)
})

/** Every place the gate starts a test process: none may bypass the reporter. */
test('no path of the gate starts a test suite without the second reporter', () => {
  const source = readFileSync(join(ROOT, 'scripts/check-tests.ts'), 'utf8')
  assert.doesNotMatch(
    source,
    /spawnSync\(\s*'pnpm',\s*\[\s*'run',\s*'test/,
    'a `pnpm run test…` cannot carry it'
  )
  const reported = source.match(/spawnReported\(/g) ?? []
  // Whole workers, whole workers with the database skip (listed files, not the script's glob), a
  // shard, related workers, one owner (Turbo), e2e, a standalone suite, dsh-passwords, interop.
  assert.equal(reported.length, 9, 'a new suite path: wire the reporter in and count it here')
})

test('a shard prints its bracket and one record per file; a red shard prints no end line', () => {
  const tree = {
    'apps/site/test/a.test.mjs': FIXTURES['pass.test.mjs'],
    'apps/site/test/b.test.mjs': FIXTURES['skip.test.mjs'],
    'apps/site/test/e2e/smoke.test.mjs': FIXTURES['pass.test.mjs']
  }
  const green = gateOver(tree, 'workers:1/1')
  assert.equal(green.status, 0, `${green.stdout}${green.stderr}`)
  const parsed = parseTimingLog(
    green.stdout
      .split('\n')
      .map((l) => `build check (tests 1/1)\tBuild check\t2026-10-08T00:26:15.2285319Z ${l}`)
      .join('\n')
  )
  assert.deepEqual(parsed.problems, [])
  assert.equal(parsed.shards.length, 1)
  assert.deepEqual(parsed.shards[0].problems, [])
  assert.deepEqual([...parsed.shards[0].files.keys()].sort(), [
    'apps/site/test/a.test.mjs',
    'apps/site/test/b.test.mjs'
  ])
  assert.ok((parsed.shards[0].wall ?? 0) > 0)
  assert.match(green.stdout, /check-tests: {3}SKIP apps\/site\/test\/b\.test\.mjs:2 › needs a daemon/)

  const red = gateOver({ ...tree, 'apps/site/test/c.test.mjs': FIXTURES['red.test.mjs'] }, 'workers:1/1')
  assert.equal(red.status, 1, `${red.stdout}${red.stderr}`)
  assert.match(red.stdout, new RegExp(`${TIMING_MARK} begin part=workers shard=1/1 files=3`))
  assert.doesNotMatch(red.stdout, new RegExp(`${TIMING_MARK} end `))
  assert.match(red.stdout, /file=apps\/site\/test\/c\.test\.mjs seconds=\d+\.\d{3} ok=0/)
})

// ── the trees the gate leaves alone ──────────────────────────────────────────────────────────────

function holdsATest(dir: string, depth = 0): boolean {
  if (depth > 6) return false
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    if (entry.isDirectory()) {
      if (holdsATest(join(dir, entry.name), depth + 1)) return true
    } else if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) return true
  }
  return false
}

test('NOT_RUN_HERE: each tree exists, holds a test, belongs to no group, and says where it runs', () => {
  assert.deepEqual(
    NOT_RUN_HERE.map((t) => t.tree),
    [
      'tests/e2e-dev',
      'vendor/tracy/dsh-better-sidebar',
      'vendor/wordpress/tracy-wordpress-theme',
      'vendor/tracy/dsh-subscriptions'
    ]
  )
  for (const { tree, where } of NOT_RUN_HERE) {
    assert.ok(existsSync(join(ROOT, tree)), `${tree} is gone: drop it from NOT_RUN_HERE`)
    assert.ok(holdsATest(join(ROOT, tree)), `${tree} holds no test file any more: drop it from NOT_RUN_HERE`)
    assert.ok(where.trim().length > 20, `${tree}: say where it runs, or "nowhere"`)
    const probe = `${tree}/test/x.test.mjs`
    assert.deepEqual(
      coverageProblems([probe]).orphans,
      [probe],
      `${tree} is claimed by a run group: it is no longer "not run here"`
    )
  }
})

test('the fixture-gated suite: not asked → skipped; asked without a database → red', () => {
  const cases: [string, string][] = [
    ['scripts/test/content-api-joomla-runtime.test.mjs', 'CONTENT_API_PILOT_PRIVATE']
  ]
  for (const [file, variable] of cases) {
    const runIt = (extra: Record<string, string>) => {
      const { CONTENT_API_PILOT_PRIVATE: _j, TEST_DATABASE_URL: _d, ...rest } = cleanEnv()
      let report = ''
      const run = spawnReported(
        process.execPath,
        ['--test', ...reporterArgs(), file],
        { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', timeout: 100_000, env: { ...rest, ...extra } },
        (text: string) => {
          report += text
        }
      )
      return { status: run.status, stdout: `${String(run.stdout)}${report}` }
    }
    const idle = runIt({})
    assert.equal(idle.status, 0, idle.stdout)
    assert.match(
      idle.stdout,
      new RegExp(`check-tests: {3}SKIP ${file.replace(/[.]/g, '\\.')}:\\d+ › `),
      idle.stdout
    )
    const asked = runIt({ [variable]: '/nonexistent/fixture' })
    assert.equal(asked.status, 1, asked.stdout)
    assert.match(asked.stdout, new RegExp(`${variable} is set but TEST_DATABASE_URL is not`))
  }
})

// ── asked for and unusable is a failure, not a skip ──────────────────────────────────────────────

test('the own-domain pilot: not asked → skipped by name; asked without what it needs → red', () => {
  const file = 'apps/tracy-web/test/e2e/site-own-domain.test.mjs'
  const runIt = (env: Record<string, string>) => {
    const { TRACY_PILOT: _p, TRACY_PILOT_ARTIFACT_DIR: _a, TEST_DATABASE_URL: _d, ...rest } = cleanEnv()
    let report = ''
    const run = spawnReported(
      process.execPath,
      ['--test', ...reporterArgs(), file],
      { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', timeout: 100_000, env: { ...rest, ...env } },
      (text: string) => {
        report += text
      }
    )
    return { status: run.status, stdout: `${String(run.stdout)}${report}`, stderr: String(run.stderr) }
  }
  const idle = runIt({})
  assert.equal(idle.status, 0, idle.stdout + idle.stderr)
  assert.match(
    idle.stdout,
    /check-tests: {3}SKIP apps\/tracy-web\/test\/e2e\/site-own-domain\.test\.mjs:\d+ › own domain, end to end.* — TRACY_PILOT is not 1/
  )

  const asked = runIt({ TRACY_PILOT: '1' })
  assert.equal(asked.status, 1, asked.stdout + asked.stderr)
  assert.match(asked.stdout, /TRACY_PILOT=1 but TRACY_PILOT_ARTIFACT_DIR and TEST_DATABASE_URL is not set/)

  const half = runIt({ TRACY_PILOT: '1', TRACY_PILOT_ARTIFACT_DIR: tmpdir() })
  assert.equal(half.status, 1, half.stdout + half.stderr)
  assert.match(half.stdout, /TRACY_PILOT=1 but TEST_DATABASE_URL is not set/)
})
