// Contract of scripts/test-trust.mjs on throwaway fixture repositories: what counts as a kill, what
// never does (a load failure, a timeout, a signal, a skip, a non-assertion error), which inputs are
// refused, that the tree being measured is only read, and that every input a run depends on (a
// package, an asset, the environment, the database) is in the receipt and refuses it when it changes.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  COHORT_SCHEMA,
  DatabaseNotClean,
  TrustInputError,
  checkReceipt,
  expandAssets,
  importClosure,
  importsOf,
  inputDrift,
  inventoryOracle,
  judge,
  loadCohort,
  packageGraph,
  parseCli,
  postgresDriver,
  reachability,
  readGreen,
  repoFile,
  runCohort,
  sourceGraph,
  tapPoints,
  validateCohort
} from '../test-trust.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'test-trust.mjs')
const base = process.env.TCH_TEST_ARTIFACTS_DIR || tmpdir()
mkdirSync(base, { recursive: true })
// Real path: the tool refuses a path through a symlink, and the system temp folder is one on macOS.
const work = realpathSync(mkdtempSync(join(base, 'test-trust-selftest-')))
after(() => rmSync(work, { recursive: true, force: true }))

const PRODUCT = `export function allowed(age) {
  if (typeof age !== 'number') throw new TypeError('age must be a number')
  return age >= 18
}
export const label = (age) => (allowed(age) ? 'adult' : 'minor')
`
const GUARD_TEST = `import assert from 'node:assert/strict'
import { test } from 'node:test'
import { allowed } from '../src/gate.mjs'
test('a minor is refused', () => {
  assert.equal(allowed(17), false)
})
test('an adult is admitted', { skip: allowed(30) !== true }, () => {
  assert.equal(allowed(30), true)
})
`
const OTHER_TEST = `import assert from 'node:assert/strict'
import { test } from 'node:test'
import { twice } from '../src/other.mjs'
test('twice doubles', () => {
  assert.equal(twice(2), 4)
})
`

let seq = 0
/** A fixture repository; `files` overrides or adds to the default product and tests. */
function fixture(files = {}) {
  const root = join(work, `repo-${++seq}`)
  const all = {
    'pkg/package.json': '{ "name": "fixture", "type": "module" }\n',
    'pkg/src/gate.mjs': PRODUCT,
    'pkg/src/other.mjs': 'export const twice = (n) => n * 2\n',
    'pkg/test/gate.test.mjs': GUARD_TEST,
    'pkg/test/other.test.mjs': OTHER_TEST,
    ...files
  }
  for (const [rel, content] of Object.entries(all)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), content)
  }
  return root
}

const GATE = 'pkg/test/gate.test.mjs'
const OTHER = 'pkg/test/other.test.mjs'
const mutant = (id, find, replace, extra = {}) => ({
  id,
  description: id,
  file: 'pkg/src/gate.mjs',
  find,
  replace,
  ...extra
})
const cohortOf = (root, mutants, extra = {}) =>
  validateCohort(
    root,
    { schema: COHORT_SCHEMA, cohort: 'fixture', tests: [GATE, OTHER], mutants, ...extra },
    'fixture'
  )
/** The oracle of the fixtures: each test guards the file it imports. */
const fixtureOracle = (
  version = '1',
  map = (t) => (t === GATE ? ['pkg/src/gate.mjs'] : ['pkg/src/other.mjs'])
) => ({
  id: 'fixture-oracle',
  fingerprint: () => ({ 'oracle.mjs': version }),
  guards: async (_root, t) => map(t)
})
const oracle = fixtureOracle()
const measure = (root, mutants, extra = {}, opts = {}) =>
  runCohort({
    root,
    cohort: cohortOf(root, mutants, extra),
    out: join(root, '..', `out-${seq}`),
    oracle,
    ...opts
  })
const cellOf = (result, id, t = GATE) => result.matrix.find((c) => c.mutant === id && c.test === t)
const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

test('an assertion that passed in control and fails on the mutant is a kill, named by its test', async () => {
  const root = fixture()
  const before = digest(join(root, 'pkg/src/gate.mjs'))
  const { dir, result } = await measure(
    root,
    [mutant('boundary', 'return age >= 18', 'return age >= 17', { expect: { killedBy: [GATE] } })],
    {},
    { verify: true }
  )
  assert.equal(result.valid, true)
  assert.deepEqual(result.verify, { ok: true, failures: [] })
  assert.deepEqual(cellOf(result, 'boundary').assertions, ['a minor is refused'])
  assert.equal(cellOf(result, 'boundary').status, 'killed')
  assert.equal(cellOf(result, 'boundary').reachability, 'covered')
  // The file that never runs the mutated code is reported as such, not as a weak test.
  assert.equal(cellOf(result, 'boundary', OTHER).status, 'not-covered')
  assert.equal(cellOf(result, 'boundary', OTHER).imported, false)
  // The measured tree is only read, the scratch copy is gone, and the receipt names the bytes it ran.
  assert.equal(digest(join(root, 'pkg/src/gate.mjs')), before)
  assert.equal(result.inputs.sources['pkg/src/gate.mjs'], before)
  assert.equal(result.inputs.tests[GATE], digest(join(root, GATE)))
  assert.equal(existsSync(join(dir, 'scratch')), false)
  assert.deepEqual(readdirSync(dir).sort(), ['logs', 'matrix.md', 'result.json'])
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8')), result)
  assert.doesNotMatch(readFileSync(join(dir, 'result.json'), 'utf8'), new RegExp(root.replaceAll('/', '\\/')))
  // control, mutant, restored for each of the two files, with the same counts at both ends.
  assert.deepEqual(
    result.runs.map((r) => r.variant),
    ['control', 'control', 'boundary', 'boundary', 'restored', 'restored']
  )
  assert.deepEqual(result.runs[0].counts, result.runs[4].counts)
})

test('a mutant no assertion notices survives, and verify reports the missed expectation', async () => {
  const root = fixture()
  const { result } = await measure(
    root,
    [mutant('label', "? 'adult' : 'minor'", "? 'adult' : 'child'", { expect: { killedBy: [GATE] } })],
    {},
    { verify: true }
  )
  // `label` is imported by the test file and never called: importing code is not running it.
  assert.equal(cellOf(result, 'label').status, 'not-covered')
  assert.equal(cellOf(result, 'label').imported, true)
  assert.equal(result.valid, true)
  assert.equal(result.verify.ok, false)
  assert.match(result.verify.failures.join('\n'), /mutant label was expected to be killed by .*: not-covered/)
})

test('a mutant that ran and no assertion noticed is covered-survived; equivalent only with an argument', async () => {
  const root = fixture()
  const { dir, result } = await measure(
    root,
    [
      mutant('upper', 'return age >= 18', 'return age >= 18 && age < 200'),
      mutant('reviewed', 'return age >= 18', 'return 18 <= age', {
        behaviour: 'nothing: the compare is the same',
        equivalent: { argument: 'a >= b and b <= a are the same compare for numbers' }
      })
    ],
    {},
    { verify: true }
  )
  assert.equal(cellOf(result, 'upper').status, 'covered-survived')
  assert.equal(cellOf(result, 'upper').reachability, 'covered')
  assert.equal(cellOf(result, 'reviewed').status, 'equivalent-reviewed')
  assert.match(cellOf(result, 'reviewed').reason, /same compare/)
  // The file that never runs the code stays not-covered: an argument does not turn it into a review.
  assert.equal(cellOf(result, 'reviewed', OTHER).status, 'not-covered')
  // A survivor is a finding to hand over, not a failed measurement.
  assert.deepEqual(result.verify, { ok: true, failures: [] })
  const report = readFileSync(join(dir, 'matrix.md'), 'utf8')
  assert.match(report, /- SURVIVOR upper on pkg\/test\/gate\.test\.mjs: covered-survived/)
  assert.match(report, /- NO KILL upper: every test file of the cohort stayed green/)
  assert.match(report, /- reviewed: reviewed\. If it shipped: nothing: the compare is the same/)
  assert.equal(existsSync(join(dir, 'coverage')), false)
})

test('reachability is read from coverage, and unknown when there is none to read', () => {
  const dir = join(work, 'coverage-unit')
  const write = (name, body) => {
    mkdirSync(dirname(join(dir, name)), { recursive: true })
    writeFileSync(join(dir, name), typeof body === 'string' ? body : JSON.stringify(body))
  }
  const script = (url, ranges) => ({ url, functions: [{ functionName: '', ranges, isBlockCoverage: true }] })
  const outer = { startOffset: 0, endOffset: 100, count: 1 }
  write('ran/a.json', {
    result: [script('file:///x.js', [outer, { startOffset: 10, endOffset: 20, count: 0 }])]
  })
  assert.equal(reachability(join(dir, 'ran'), 'file:///x.js', 5), 'covered')
  // The innermost block decides: the file loaded, the branch holding the offset did not run.
  assert.equal(reachability(join(dir, 'ran'), 'file:///x.js', 15), 'not-covered')
  assert.equal(reachability(join(dir, 'ran'), 'file:///other.js', 5), 'not-covered')
  // Any process of the run that executed it counts.
  write('ran/b.json', {
    result: [script('file:///x.js', [outer, { startOffset: 10, endOffset: 20, count: 3 }])]
  })
  assert.equal(reachability(join(dir, 'ran'), 'file:///x.js', 15), 'covered')
  assert.equal(reachability(join(dir, 'absent'), 'file:///x.js', 5), 'unknown')
  mkdirSync(join(dir, 'empty'), { recursive: true })
  assert.equal(reachability(join(dir, 'empty'), 'file:///x.js', 5), 'unknown')
  write('broken/a.json', '{ "result": [')
  assert.equal(reachability(join(dir, 'broken'), 'file:///x.js', 5), 'unknown')
  write('odd/a.json', { result: 'none' })
  assert.equal(reachability(join(dir, 'odd'), 'file:///x.js', 5), 'unknown')
})

test('a mutant that cannot load, hangs, crashes or throws is inconclusive, never a kill', async () => {
  const root = fixture()
  const { result } = await measure(
    root,
    [
      mutant('syntax', 'return age >= 18', 'return age >= 18 ))'),
      mutant('missing-import', 'export function allowed', "import './gone.mjs'\nexport function allowed"),
      mutant('hang', 'return age >= 18', 'for (;;) {}'),
      mutant('signal', 'return age >= 18', "process.kill(process.pid, 'SIGKILL')"),
      mutant('throws', 'return age >= 18', "if (age < 18) throw new RangeError('boom')\n  return true")
    ],
    { timeoutSeconds: 3 },
    { verify: true }
  )
  for (const id of ['syntax', 'missing-import', 'hang', 'signal', 'throws'])
    assert.equal(cellOf(result, id).status, 'inconclusive', `${id}: ${cellOf(result, id).reason}`)
  assert.match(cellOf(result, 'hang').reason, /timed out/)
  assert.match(cellOf(result, 'throws').reason, /without an assertion error/)
  assert.deepEqual(
    result.matrix.filter((c) => c.status === 'killed'),
    []
  )
  // The measurement itself stands (control and restored are green); verification does not.
  assert.equal(result.valid, true)
  assert.equal(result.verify.ok, false)
  assert.equal(result.verify.failures.filter((f) => /is inconclusive on/.test(f)).length, 5)
})

test('a test that stops running on the mutant proves nothing', async () => {
  const root = fixture()
  // `allowed(30)` turns false: the second test skips itself, the first still passes.
  const { result } = await measure(root, [mutant('skips', 'return age >= 18', 'return age >= 99')])
  assert.equal(cellOf(result, 'skips').status, 'inconclusive')
  assert.match(cellOf(result, 'skips').reason, /did not run: an adult is admitted/)
})

test('a mutant that does not apply exactly once is not run, and fails verification', async () => {
  const root = fixture()
  // A file that does not exist is refused with the cohort, before anything runs.
  assert.throws(
    () => cohortOf(root, [mutant('unreached', 'n * 2', 'n * 3', { file: 'pkg/src/unreached.mjs' })]),
    TrustInputError
  )
  const { result: second } = await measure(
    root,
    [mutant('absent', 'return age >= 21', 'return true'), mutant('twice', 'age', 'years')],
    {},
    { verify: true }
  )
  assert.deepEqual(
    second.mutants.map((m) => [m.applied, m.reason]),
    [
      [false, 'the text to replace is not in the file'],
      [false, 'the text to replace occurs more than once']
    ]
  )
  // The table still holds a cell for every test file and mutant, with the reason nothing ran.
  assert.deepEqual(
    second.matrix.map((c) => [c.mutant, c.test, c.status, c.reason]),
    [
      ['absent', GATE, 'not-measured', 'the text to replace is not in the file'],
      ['absent', OTHER, 'not-measured', 'the text to replace is not in the file'],
      ['twice', GATE, 'not-measured', 'the text to replace occurs more than once'],
      ['twice', OTHER, 'not-measured', 'the text to replace occurs more than once']
    ]
  )
  assert.equal(second.verify.failures.length, 2)
})

test('a product file no cohort test imports is reported, not mutated', async () => {
  const root = fixture({ 'pkg/src/lonely.mjs': 'export const one = 1\n' })
  const { result } = await measure(
    root,
    [mutant('lonely', 'one = 1', 'one = 2', { file: 'pkg/src/lonely.mjs' })],
    {},
    { verify: true }
  )
  assert.equal(result.mutants[0].applied, false)
  assert.match(result.mutants[0].reason, /no test file of the cohort imports/)
  assert.equal(result.verify.ok, false)
})

test('a red control makes the whole measurement invalid: no mutant is judged', async () => {
  const root = fixture({
    'pkg/test/gate.test.mjs': GUARD_TEST.replace('allowed(17), false', 'allowed(17), true')
  })
  const { result } = await measure(
    root,
    [mutant('boundary', 'return age >= 18', 'return age >= 17')],
    {},
    {
      verify: true
    }
  )
  assert.equal(result.valid, false)
  assert.match(result.invalidReason, /control run of pkg\/test\/gate\.test\.mjs: not green/)
  assert.deepEqual(
    result.matrix.map((c) => c.status),
    ['not-measured', 'not-measured']
  )
  assert.match(result.matrix[0].reason, /not run: control run of pkg\/test\/gate\.test\.mjs: not green/)
  assert.deepEqual(result.verify.failures, [result.invalidReason])
})

test('verify refuses a kill the inventory oracle does not back, and a run over budget', async () => {
  const root = fixture()
  const mutants = [
    mutant('boundary', 'return age >= 18', 'return age >= 17', { expect: { killedBy: [GATE] } })
  ]
  const unbacked = await measure(root, mutants, {}, { verify: true, oracle: fixtureOracle('1', () => []) })
  assert.equal(cellOf(unbacked.result, 'boundary').status, 'killed')
  assert.match(unbacked.result.verify.failures.join('\n'), /oracle does not map pkg\/test\/gate\.test\.mjs/)

  // No budget: nothing runs, not even control, and nothing is called measured.
  const cohort = { ...cohortOf(root, mutants), budgetSeconds: 0 }
  const none = await runCohort({ root, cohort, out: join(root, '..', `out-${seq}`), oracle, verify: true })
  assert.deepEqual(none.result.runs, [])
  assert.equal(none.result.valid, false)
  assert.match(
    none.result.invalidReason,
    /budget of 0 s was used up before the control run of pkg\/test\/gate/
  )
  assert.equal(cellOf(none.result, 'boundary').status, 'not-measured')
  assert.equal(none.result.verify.ok, false)
})

test('the budget bounds every run: a hang is cut at what is left, later runs do not start', async () => {
  const root = fixture()
  // Each run may take 60 s, the cohort 6 s in all: the hanging mutant is cut by the budget.
  const { result } = await measure(
    root,
    [
      mutant('hang', 'return age >= 18', 'for (;;) {}'),
      mutant('boundary', 'return age >= 18', 'return age >= 17')
    ],
    { timeoutSeconds: 60, budgetSeconds: 6 },
    { verify: true }
  )
  assert.equal(cellOf(result, 'hang').status, 'inconclusive')
  assert.match(cellOf(result, 'hang').reason, /timed out/)
  // What did not fit is reported as not measured, cell by cell, never guessed.
  for (const [id, t] of [
    ['hang', OTHER],
    ['boundary', GATE],
    ['boundary', OTHER]
  ]) {
    assert.equal(cellOf(result, id, t).status, 'not-measured', `${id} ${t}`)
    assert.match(cellOf(result, id, t).reason, /budget of 6 s was used up/)
  }
  assert.deepEqual(
    result.runs
      .filter((r) => r.variant === 'hang' || r.variant === 'boundary')
      .map((r) => [r.variant, r.test]),
    [['hang', GATE]]
  )
  // The whole cohort, restored pass included, stays within the budget plus the grace of one kill.
  // Runner time: everything the tool did counts against the budget, not only the test processes.
  assert.ok(result.totals.wallMs < 6000 + 2500, `runner time ${result.totals.wallMs} ms`)
  assert.ok(result.totals.processMs <= result.totals.wallMs)
  assert.equal(result.verify.ok, false)
})

test('judge: only a complete run with the control test set can kill', () => {
  const tap = (body, counts) =>
    `TAP version 13\n${body}1..${counts.tests}\n# tests ${counts.tests}\n# suites 0\n# pass ${counts.pass}\n# fail ${counts.fail}\n# cancelled 0\n# skipped ${counts.skipped ?? 0}\n# todo 0\n# duration_ms 1\n`
  const run = (stdout, status = 1, extra = {}) => ({
    status,
    signal: null,
    timedOut: false,
    spawnFailed: false,
    stdout,
    stderr: '',
    ...extra
  })
  const fail = (n, title, code) =>
    `not ok ${n} - ${title}\n  ---\n  failureType: 'testCodeFailure'\n  code: '${code}'\n  ...\n`
  const control = readGreen(run(tap('ok 1 - a\nok 2 - b\n', { tests: 2, pass: 2, fail: 0 }), 0))
  assert.equal(control.green, true)

  const red = tap(`${fail(1, 'a', 'ERR_ASSERTION')}ok 2 - b\n`, { tests: 2, pass: 1, fail: 1 })
  assert.deepEqual(judge(control, run(red), 'covered'), { status: 'killed', assertions: ['a'], reason: '' })
  assert.equal(judge(control, run(red, null, { signal: 'SIGKILL' }), 'covered').status, 'inconclusive')
  assert.equal(judge(control, run(red, 1, { timedOut: true }), 'covered').status, 'inconclusive')
  assert.equal(judge(control, run(red.replace(/# tests 2\n/, '')), 'covered').status, 'inconclusive')
  assert.equal(
    judge(control, run(red, 1, { stderr: 'ERR_MODULE_NOT_FOUND' }), 'covered').status,
    'inconclusive'
  )
  // A test renamed, added or dropped on the mutant is another test set.
  const renamed = tap(`${fail(1, 'c', 'ERR_ASSERTION')}ok 2 - b\n`, { tests: 2, pass: 1, fail: 1 })
  assert.match(judge(control, run(renamed), 'covered').reason, /not the tests of the control run/)
  const typeError = tap(`${fail(1, 'a', 'ERR_INVALID_ARG_TYPE')}ok 2 - b\n`, { tests: 2, pass: 1, fail: 1 })
  assert.equal(judge(control, run(typeError), 'covered').status, 'inconclusive')
  const skipped = tap('ok 1 - a # SKIP later\nok 2 - b\n', { tests: 2, pass: 1, fail: 0, skipped: 1 })
  assert.equal(judge(control, run(skipped, 0), 'covered').status, 'inconclusive')
  const green = tap('ok 1 - a\nok 2 - b\n', { tests: 2, pass: 2, fail: 0 })
  assert.equal(judge(control, run(green, 0), 'covered').status, 'covered-survived')
  assert.equal(judge(control, run(green, 0), 'not-covered').status, 'not-covered')
  // Reachability that was not measured is said so, never guessed from the import graph.
  assert.equal(judge(control, run(green, 0), 'unknown').status, 'unknown')
  assert.match(judge(control, run(green, 0), 'unknown').reason, /reachability was not measured/)
  // A non-zero exit with every test green names no assertion.
  assert.equal(judge(control, run(green, 1), 'covered').status, 'inconclusive')
  // A file whose control skipped a test (no database) stays green for no reason that is evidence:
  // never a pass. Nor is a kill by another test of that file: the file would be accepted with its
  // skipped (database) tests never measured, so the whole file stays inconclusive.
  const gated = readGreen(run(skipped, 0))
  assert.equal(gated.green, true)
  assert.equal(judge(gated, run(skipped, 0), 'covered').status, 'inconclusive')
  assert.match(judge(gated, run(skipped, 0), 'covered').reason, /1 test\(s\) did not run in control.*: a/)
  const gatedRed = tap(`ok 1 - a # SKIP later\n${fail(2, 'b', 'ERR_ASSERTION')}`, {
    tests: 2,
    pass: 0,
    fail: 1,
    skipped: 1
  })
  assert.equal(judge(gated, run(gatedRed), 'covered').status, 'inconclusive')
  assert.match(judge(gated, run(gatedRed), 'covered').reason, /1 test\(s\) did not run in control/)
  // A test already failing in control cannot be the proof; a red control is not green to begin with.
  assert.equal(readGreen(run(red)).green, false)
  assert.deepEqual(
    tapPoints(red).map((p) => [p.title, p.state, p.code]),
    [
      ['a', 'not ok', 'ERR_ASSERTION'],
      ['b', 'ok', null]
    ]
  )
})

test('paths from a cohort are repo-relative regular files reached through no symlink', () => {
  const root = fixture()
  symlinkSync(join(root, 'pkg/src/gate.mjs'), join(root, 'pkg/src/link.mjs'))
  symlinkSync(join(root, 'pkg/src'), join(root, 'pkg/alias'))
  for (const path of [
    '',
    null,
    '/etc/hosts',
    join(root, 'pkg/src/gate.mjs'),
    '../outside.mjs',
    'pkg/../pkg/src/gate.mjs',
    'pkg//src/gate.mjs',
    './pkg/src/gate.mjs',
    'pkg\\src\\gate.mjs',
    'pkg/src',
    'pkg/src/none.mjs',
    'pkg/src/link.mjs',
    'pkg/alias/gate.mjs'
  ])
    assert.throws(() => repoFile(root, path), TrustInputError, String(path))
  assert.equal(repoFile(root, 'pkg/src/gate.mjs'), join(root, 'pkg/src/gate.mjs'))
  assert.deepEqual(importClosure(root, GATE), ['pkg/src/gate.mjs', GATE])
})

test('a malformed cohort is refused before anything runs', () => {
  const root = fixture()
  const good = { schema: COHORT_SCHEMA, cohort: 'fixture', tests: [GATE], mutants: [mutant('m', 'age', 'x')] }
  assert.equal(validateCohort(root, good, 'fixture').timeoutSeconds, 60)
  const bad = (change, why) =>
    assert.throws(() => validateCohort(root, { ...good, ...change }, 'fixture'), TrustInputError, why)
  bad({ schema: 'other/v1' }, 'schema')
  bad({ cohort: 'elsewhere' }, 'name')
  bad({ tests: [] }, 'no tests')
  bad({ tests: [GATE, GATE] }, 'repeated test')
  bad({ tests: ['pkg/src/gate.mjs'] }, 'not a test file')
  bad({ tests: ['../x.test.mjs'] }, 'escaping test')
  bad({ mutants: [] }, 'no mutants')
  bad({ mutants: [mutant('m', 'age', 'x'), mutant('m', 'age', 'y')] }, 'repeated id')
  bad({ mutants: [mutant('M 1', 'age', 'x')] }, 'bad id')
  bad({ mutants: [mutant('m', 'age', 'age')] }, 'no change')
  bad({ mutants: [mutant('m', 'age', 'x', { file: GATE })] }, 'mutating a test')
  bad({ mutants: [mutant('m', 'age', 'x', { file: '/etc/hosts' })] }, 'absolute file')
  bad({ mutants: [mutant('m', 'age', 'x', { expect: { killedBy: [OTHER] } })] }, 'killer outside the cohort')
  bad({ timeoutSeconds: 0 }, 'timeout')
  bad({ budgetSeconds: '120' }, 'budget')
  assert.throws(() => loadCohort(root, '../pilot'), TrustInputError)
  assert.throws(() => loadCohort(root, 'absent'), TrustInputError)
})

test('a receipt records every input once and is refused when any of them changes', async () => {
  const root = fixture()
  const mutants = [
    mutant('boundary', 'return age >= 18', 'return age >= 17', { expect: { killedBy: [GATE] } })
  ]
  const cohort = cohortOf(root, mutants)
  const { result } = await runCohort({
    root,
    cohort,
    cohortSha256: 'c1',
    out: join(root, '..', `out-${seq}`),
    oracle,
    verify: true
  })
  assert.equal(result.verify.ok, true)
  const { inputs } = result
  // What the oracle said and the bytes it said it with.
  assert.deepEqual(inputs.oracle, {
    id: 'fixture-oracle',
    files: { 'oracle.mjs': '1' },
    mapping: { [GATE]: ['pkg/src/gate.mjs'], [OTHER]: ['pkg/src/other.mjs'] }
  })
  assert.deepEqual(result.mutants[0].guardedBy, [GATE])
  // What decided how the files loaded and ran, and what judged them.
  assert.deepEqual(inputs.runtime, { node: process.version, platform: process.platform, arch: process.arch })
  assert.deepEqual(inputs.manifests, { 'pkg/package.json': digest(join(root, 'pkg/package.json')) })
  assert.deepEqual(Object.keys(inputs.sources), ['pkg/src/gate.mjs', 'pkg/src/other.mjs'])
  assert.deepEqual(inputs.cohort, { name: 'fixture', sha256: 'c1' })
  // A cohort with no package, asset or database records that there is none: one appearing is a change.
  assert.deepEqual(inputs.assets, {})
  assert.deepEqual(inputs.packages, { resolved: {}, links: {}, files: {}, config: {} })
  assert.equal(inputs.database, null)
  assert.deepEqual(Object.keys(inputs.environment), ['PATH', 'HOME', 'TMPDIR', 'SystemRoot'])
  for (const [key, print] of Object.entries(inputs.environment))
    assert.match(print, process.env[key] === undefined ? /^unset$/ : /^sha256:[0-9a-f]{64}$/, key)
  assert.match(inputs.mutants.boundary, /^pkg\/src\/gate\.mjs [0-9a-f]{64}$/)
  for (const file of [
    'scripts/test-trust.mjs',
    'tests/qa/layers/static/lib/common.mjs',
    'node_modules/typescript/package.json',
    'node_modules/typescript/lib/typescript.js'
  ])
    assert.match(inputs.tool[file], /^[0-9a-f]{64}$/, file)

  const receipt = JSON.parse(JSON.stringify(result))
  const check = (over = {}) => checkReceipt({ root, receipt, cohort, cohortSha256: 'c1', oracle, ...over })
  const refused = async (over, entry) =>
    assert.ok((await check(over)).includes(`input changed: ${entry}`), entry)
  assert.deepEqual(await check(), [])
  // The oracle: its bytes, a file added to it, the mapping it gives, its identity.
  await refused({ oracle: fixtureOracle('2') }, 'oracle/files/oracle.mjs')
  await refused(
    { oracle: { ...oracle, fingerprint: () => ({ 'oracle.mjs': '1', 'parser.js': '9' }) } },
    'oracle/files/parser.js'
  )
  await refused({ oracle: fixtureOracle('1', () => ['pkg/src/other.mjs']) }, `oracle/mapping/${GATE}`)
  await refused({ oracle: { ...oracle, id: 'another-oracle' } }, 'oracle/id')
  // The environment a run is given: a value that changes, and one that goes.
  await refused({ env: { ...process.env, PATH: '/somewhere/else' } }, 'environment/PATH')
  const { PATH: _path, ...withoutPath } = process.env
  await refused({ env: withoutPath }, 'environment/PATH')
  // A variable that is not passed to a run decides nothing and is not recorded.
  assert.deepEqual(await check({ env: { ...process.env, TEST_DATABASE_URL: 'postgres://elsewhere' } }), [])
  // The cohort file and its mutants.
  await refused({ cohortSha256: 'c2' }, 'cohort/sha256')
  await refused(
    { cohort: cohortOf(root, [mutant('boundary', 'return age >= 18', 'return age >= 16')]) },
    'mutants/boundary'
  )
  await refused({ cohort: cohortOf(root, [...mutants, mutant('more', 'age >= 18', 'true')]) }, 'mutants/more')
  // Every recorded entry is compared: one edited by hand in the receipt is a difference too.
  for (const [section, key] of [
    ['runtime', 'node'],
    ['runtime', 'platform'],
    ['runtime', 'arch'],
    ['tool', 'scripts/test-trust.mjs'],
    ['tool', 'node_modules/typescript/lib/typescript.js'],
    ['manifests', 'pkg/package.json'],
    ['tests', OTHER],
    ['sources', 'pkg/src/other.mjs']
  ]) {
    const forged = { ...receipt, inputs: { ...inputs, [section]: { ...inputs[section], [key]: 'other' } } }
    await refused({ receipt: forged }, `${section}/${key}`)
  }
  const { runtime: _dropped, ...withoutRuntime } = inputs
  await refused({ receipt: { ...receipt, inputs: withoutRuntime } }, 'runtime/node')
  // A receipt that is not one, or that records an invalid measurement, proves nothing.
  assert.equal((await check({ receipt: null })).length, 1)
  assert.deepEqual(await check({ receipt: { ...receipt, inputs: null } }), [
    'the receipt does not record its inputs'
  ])
  assert.match((await check({ receipt: { ...receipt, valid: false } })).join('\n'), /invalid measurement/)

  // The tree: a product source, the manifest that decides the module type, a new manifest above the
  // files, a test, a file the test starts to import.
  const edit = (rel, content) => writeFileSync(join(root, rel), content)
  edit('pkg/src/gate.mjs', `${PRODUCT}// edited\n`)
  await refused({}, 'sources/pkg/src/gate.mjs')
  edit('pkg/src/gate.mjs', PRODUCT)
  assert.deepEqual(await check(), [])
  edit('pkg/package.json', '{ "name": "fixture", "type": "commonjs" }\n')
  await refused({}, 'manifests/pkg/package.json')
  edit('pkg/package.json', '{ "name": "fixture", "type": "module" }\n')
  edit('package.json', '{ "type": "commonjs" }\n')
  await refused({}, 'manifests/package.json')
  rmSync(join(root, 'package.json'))
  assert.deepEqual(await check(), [])
  edit('pkg/src/extra.mjs', 'export const extra = 1\n')
  edit(GATE, `${GUARD_TEST}import '../src/extra.mjs'\n`)
  await refused({}, `tests/${GATE}`)
  await refused({}, 'sources/pkg/src/extra.mjs')
})

test('the copied manifests are the ones recorded: the scratch tree loads as the worktree does', async () => {
  // `.js` files are modules only because of the manifest above them: without it in the scratch
  // tree the control run could not load.
  const root = fixture({
    'pkg/src/gate.js': PRODUCT,
    'pkg/test/gate.test.mjs': GUARD_TEST.replace('gate.mjs', 'gate.js')
  })
  const { result } = await measure(
    root,
    [mutant('boundary', 'return age >= 18', 'return age >= 17', { file: 'pkg/src/gate.js' })],
    {},
    { oracle: fixtureOracle('1', (t) => (t === GATE ? ['pkg/src/gate.js'] : [])) }
  )
  assert.equal(result.valid, true, result.invalidReason)
  assert.equal(cellOf(result, 'boundary').status, 'killed')
})

test('only literal relative imports and node builtins are measured; anything else is refused', () => {
  const root = fixture({
    'pkg/src/pkg-import.mjs': "import pg from 'pg'\nexport default pg\n",
    'pkg/src/required.cjs': "module.exports = require('left-pad')\n",
    'pkg/src/computed.mjs': 'export const load = (name) => import(`./${name}.mjs`)\n',
    'pkg/src/dangling.mjs': "export * from './nowhere.mjs'\n",
    'pkg/src/quiet.mjs':
      "// import x from 'pg'\nexport const text = \"import y from 'pg'; require('z')\"\nexport { twice } from './other.mjs'\nexport const fs = () => import('node:fs')\n"
  })
  for (const [file, why] of [
    ['pkg/src/pkg-import.mjs', /imports the package "pg"/],
    ['pkg/src/required.cjs', /imports the package "left-pad"/],
    ['pkg/src/computed.mjs', /computed\.mjs:1 has a computed import/],
    ['pkg/src/dangling.mjs', /no such file: pkg\/src\/nowhere\.mjs/]
  ])
    assert.throws(
      () => importClosure(root, file),
      (error) => error instanceof TrustInputError && why.test(error.message),
      file
    )
  // Text that only looks like an import is not one; a package the caller accounts for is skipped.
  assert.deepEqual(importClosure(root, 'pkg/src/quiet.mjs'), ['pkg/src/other.mjs', 'pkg/src/quiet.mjs'])
  assert.deepEqual(importClosure(root, 'pkg/src/pkg-import.mjs', { packages: ['pg'] }), [
    'pkg/src/pkg-import.mjs'
  ])
  assert.deepEqual(importsOf('x.mjs', "import a from './a.mjs'\nconst b = require(c)\nrequire('d')\n"), {
    specs: ['./a.mjs', 'd'],
    computed: [2],
    required: ['d']
  })
})

test('inputs that change while the cohort runs make the measurement invalid', async () => {
  const root = fixture()
  let calls = 0
  const drifting = { ...oracle, fingerprint: () => ({ 'oracle.mjs': String(++calls) }) }
  const { result } = await measure(
    root,
    [mutant('boundary', 'return age >= 18', 'return age >= 17')],
    {},
    {
      verify: true,
      oracle: drifting
    }
  )
  assert.equal(result.valid, false)
  assert.equal(result.invalidReason, 'inputs changed during the run: oracle/files/oracle.mjs')
  assert.equal(result.verify.ok, false)
})

test('the inventory oracle names, by content, its modules and the parser files node loaded', () => {
  const print = inventoryOracle.fingerprint()
  assert.deepEqual(Object.keys(print).sort(), [
    'node_modules/typescript/lib/typescript.js',
    'node_modules/typescript/package.json',
    'tests/qa/layers/static/lib/common.mjs',
    'tests/qa/layers/unit/lib/sources.mjs',
    'tests/qa/lib/bounded-reader.mjs'
  ])
  for (const [file, hash] of Object.entries(print)) assert.match(hash, /^[0-9a-f]{64}$/, file)
  // The parser entry is hashed as the bytes on disk, not named by a version.
  const parser = createRequire(import.meta.url).resolve('typescript')
  assert.equal(print['node_modules/typescript/lib/typescript.js'], digest(parser))
  assert.deepEqual(inventoryOracle.fingerprint(), print)
  assert.deepEqual(inputDrift({ a: { b: 1, c: [1] }, d: {} }, { a: { b: 2, c: [1] }, e: 1 }), [
    'a/b',
    'd',
    'e'
  ])
})

test('the command line: usage errors exit 2 and run nothing', () => {
  assert.deepEqual(parseCli(['--cohort', 'pilot', '--verify', '--out', 'x']), {
    cohort: 'pilot',
    out: 'x',
    verify: true,
    checkReceipt: null
  })
  assert.equal(parseCli(['--cohort', 'pilot', '--check-receipt', 'run']).checkReceipt, 'run')
  for (const argv of [
    [],
    ['--cohort', 'pilot'],
    ['--cohort', '--out', 'x'],
    ['--all', '--cohort', 'p', '--out', 'x'],
    ['--check-receipt', 'run'],
    ['--cohort', 'p', '--check-receipt', 'run', '--out', 'x'],
    ['--cohort', 'p', '--check-receipt', 'run', '--verify']
  ])
    assert.throws(() => parseCli(argv), TrustInputError)
  const out = join(work, 'cli-out')
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const child = spawnSync(process.execPath, [SCRIPT, '--cohort', '../../etc/passwd', '--out', out], {
    encoding: 'utf8',
    env
  })
  assert.equal(child.status, 2, child.stderr)
  assert.match(child.stderr, /cohort name must match/)
  assert.equal(existsSync(out), false)
})

/** A fixture laid out as pnpm does: a store under `node_modules/.pnpm`, links to it, a workspace package. */
function packageFixture() {
  const store = 'node_modules/.pnpm'
  const root = fixture({
    [`${store}/esm-dep@1.0.0/node_modules/esm-dep/package.json`]: JSON.stringify({
      name: 'esm-dep',
      version: '1.0.0',
      exports: { '.': { import: './index.mjs', require: './index.cjs' }, './sub': './sub.mjs' },
      dependencies: { leaf: '1.0.0' },
      optionalDependencies: { 'other-platform': '1.0.0' }
    }),
    [`${store}/esm-dep@1.0.0/node_modules/esm-dep/index.mjs`]:
      "import leaf from 'leaf'\nexport const limit = leaf\nexport const kind = 'esm'\n",
    [`${store}/esm-dep@1.0.0/node_modules/esm-dep/index.cjs`]:
      "exports.limit = require('leaf')\nexports.kind = 'cjs'\n",
    [`${store}/esm-dep@1.0.0/node_modules/esm-dep/sub.mjs`]: 'export const bonus = 0\n',
    [`${store}/leaf@1.0.0/node_modules/leaf/package.json`]: '{ "name": "leaf", "version": "1.0.0" }\n',
    [`${store}/leaf@1.0.0/node_modules/leaf/index.js`]: 'module.exports = 18\n',
    'libs/ws-lib/package.json': '{ "name": "@ws/lib", "type": "module", "exports": "./index.mjs" }\n',
    'libs/ws-lib/index.mjs': "export const name = 'workspace'\n",
    'pkg/src/legacy.cjs': "module.exports = require('esm-dep').kind\n",
    'pkg/src/gate.mjs': `import { createRequire } from 'node:module'
import { limit, kind } from 'esm-dep'
import { bonus } from 'esm-dep/sub'
import { name } from '@ws/lib'
const require = createRequire(import.meta.url)
export const kinds = [kind, require('./legacy.cjs'), name]
export function allowed(age) {
  return age >= limit + bonus
}
`,
    'pkg/test/gate.test.mjs': `import assert from 'node:assert/strict'
import { basename, dirname, resolve, sep } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { allowed, kinds } from '../src/gate.mjs'
test('a minor is refused', () => {
  assert.equal(allowed(17), false)
  assert.equal(allowed(18), true)
})
test('import and require read their own condition, the workspace package loads', () => {
  assert.deepEqual(kinds, ['esm', 'cjs', 'workspace'])
})
test('every package loads from the tree the test runs in', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  assert.equal(basename(root), 'scratch')
  for (const spec of ['esm-dep', 'esm-dep/sub', '@ws/lib'])
    assert.ok(fileURLToPath(import.meta.resolve(spec)).startsWith(root + sep), spec)
})
`
  })
  const link = (at, to) => {
    mkdirSync(dirname(join(root, at)), { recursive: true })
    symlinkSync(to, join(root, at))
  }
  link(`${store}/esm-dep@1.0.0/node_modules/leaf`, '../../leaf@1.0.0/node_modules/leaf')
  link('pkg/node_modules/esm-dep', `../../${store}/esm-dep@1.0.0/node_modules/esm-dep`)
  link('pkg/node_modules/@ws/lib', '../../../libs/ws-lib')
  return root
}

test('packages: copied into the scratch tree with their links, and every byte and resolution is in the receipt', async () => {
  const root = packageFixture()
  const store = 'node_modules/.pnpm'
  const esm = `${store}/esm-dep@1.0.0/node_modules/esm-dep`
  const leaf = `${store}/leaf@1.0.0/node_modules/leaf`
  const mutants = [mutant('boundary', 'return age >= limit + bonus', 'return age > limit + bonus')]
  const cohort = cohortOf(root, mutants)
  // The run directory must be outside the tree: a `node_modules` above the scratch copy would let a
  // run load a package that nobody recorded.
  await assert.rejects(
    runCohort({ root, cohort, out: join(root, 'results'), oracle }),
    (error) => error instanceof TrustInputError && /below a folder that has node_modules/.test(error.message)
  )
  const before = digest(join(root, leaf, 'index.js'))
  const { result } = await runCohort({
    root,
    cohort,
    cohortSha256: 'c1',
    out: join(work, `out-packages-${seq}`),
    oracle,
    verify: true
  })
  assert.equal(result.valid, true, result.invalidReason)
  assert.deepEqual(result.verify, { ok: true, failures: [] })
  assert.equal(cellOf(result, 'boundary').status, 'killed')
  assert.equal(digest(join(root, leaf, 'index.js')), before)

  const { packages } = result.inputs
  // What each import lands on, per kind: the same package answers `import` and `require()` with
  // different files, and a subpath is its own entry.
  assert.deepEqual(packages.resolved, {
    'pkg/src/gate.mjs import @ws/lib': 'libs/ws-lib/index.mjs',
    'pkg/src/gate.mjs import esm-dep': `${esm}/index.mjs`,
    'pkg/src/gate.mjs import esm-dep/sub': `${esm}/sub.mjs`,
    'pkg/src/legacy.cjs require esm-dep': `${esm}/index.cjs`
  })
  // Where node finds each package, the dependency of a dependency included; one that is declared and
  // not installed is recorded as such.
  assert.deepEqual(packages.links, {
    [`${esm}/node_modules/other-platform`]: 'absent',
    [`${store}/esm-dep@1.0.0/node_modules/leaf`]: leaf,
    'pkg/node_modules/@ws/lib': 'libs/ws-lib',
    'pkg/node_modules/esm-dep': esm
  })
  assert.deepEqual(Object.keys(packages.files), [
    'libs/ws-lib/index.mjs',
    'libs/ws-lib/package.json',
    `${esm}/index.cjs`,
    `${esm}/index.mjs`,
    `${esm}/package.json`,
    `${esm}/sub.mjs`,
    `${leaf}/index.js`,
    `${leaf}/package.json`
  ])
  assert.equal(packages.files[`${leaf}/index.js`], before)
  assert.deepEqual(packages.config, {
    'pnpm-lock.yaml': 'absent',
    'pnpm-workspace.yaml': 'absent',
    '.npmrc': 'absent'
  })

  const receipt = JSON.parse(JSON.stringify(result))
  const check = () => checkReceipt({ root, receipt, cohort, cohortSha256: 'c1', oracle })
  const refused = async (entry) => assert.ok((await check()).includes(`input changed: ${entry}`), entry)
  const edit = (rel, content) => writeFileSync(join(root, rel), content)
  assert.deepEqual(await check(), [])
  // A byte of a dependency of a dependency: no version number changed.
  edit(`${leaf}/index.js`, 'module.exports = 21\n')
  await refused(`packages/files/${leaf}/index.js`)
  edit(`${leaf}/index.js`, 'module.exports = 18\n')
  // A file added to a package, then removed.
  edit(`${esm}/extra.mjs`, 'export {}\n')
  await refused(`packages/files/${esm}/extra.mjs`)
  rmSync(join(root, esm, 'extra.mjs'))
  assert.deepEqual(await check(), [])
  // The package answers the same import with another file.
  const manifest = readFileSync(join(root, esm, 'package.json'), 'utf8')
  edit(`${esm}/package.json`, manifest.replace('"import":"./index.mjs"', '"import":"./sub.mjs"'))
  await refused('packages/resolved/pkg/src/gate.mjs import esm-dep')
  edit(`${esm}/package.json`, manifest)
  // A link that now points at another copy of the package. `unlinkSync` removes the link itself:
  // `rmSync` without `recursive` refuses a link to a folder on some Node 24 releases.
  mkdirSync(join(root, store, 'leaf@2.0.0/node_modules/leaf'), { recursive: true })
  edit(`${store}/leaf@2.0.0/node_modules/leaf/package.json`, '{ "name": "leaf", "version": "2.0.0" }\n')
  edit(`${store}/leaf@2.0.0/node_modules/leaf/index.js`, 'module.exports = 18\n')
  unlinkSync(join(root, store, 'esm-dep@1.0.0/node_modules/leaf'))
  symlinkSync('../../leaf@2.0.0/node_modules/leaf', join(root, store, 'esm-dep@1.0.0/node_modules/leaf'))
  await refused(`packages/links/${store}/esm-dep@1.0.0/node_modules/leaf`)
  unlinkSync(join(root, store, 'esm-dep@1.0.0/node_modules/leaf'))
  symlinkSync('../../leaf@1.0.0/node_modules/leaf', join(root, store, 'esm-dep@1.0.0/node_modules/leaf'))
  assert.deepEqual(await check(), [])
  // The optional dependency gets installed; the file that configures the install appears.
  mkdirSync(join(root, esm, 'node_modules/other-platform'), { recursive: true })
  edit(`${esm}/node_modules/other-platform/package.json`, '{ "name": "other-platform" }\n')
  await refused(`packages/links/${esm}/node_modules/other-platform`)
  rmSync(join(root, esm, 'node_modules'), { recursive: true })
  edit('pnpm-lock.yaml', "lockfileVersion: '9.0'\n")
  await refused('packages/config/pnpm-lock.yaml')
  rmSync(join(root, 'pnpm-lock.yaml'))
  assert.deepEqual(await check(), [])

  // What cannot be copied is refused: a package that is not installed, one outside the repository.
  assert.throws(
    () => packageGraph(root, [{ file: 'pkg/src/gate.mjs', kind: 'import', spec: 'never-installed' }]),
    (error) => error instanceof TrustInputError && /is not installed/.test(error.message)
  )
  const outside = join(work, `outside-${seq}`)
  mkdirSync(outside, { recursive: true })
  writeFileSync(join(outside, 'package.json'), '{ "name": "outside" }\n')
  symlinkSync(outside, join(root, 'pkg/node_modules/outside'))
  assert.throws(
    () => packageGraph(root, [{ file: 'pkg/src/gate.mjs', kind: 'import', spec: 'outside' }]),
    (error) => error instanceof TrustInputError && /resolves outside the repository/.test(error.message)
  )
})

const ASSET_PRODUCT = `import { readFileSync, readdirSync } from 'node:fs'
const data = new URL('../data/', import.meta.url)
const limit = Number(readFileSync(new URL('limit.txt', data), 'utf8'))
export const files = readdirSync(data).sort()
export const load = (name) => import(new URL(\`./\${name}.mjs\`, import.meta.url).href)
export function allowed(age) {
  return age >= limit
}
`
const ASSET_TEST = `import assert from 'node:assert/strict'
import { test } from 'node:test'
import { allowed, files, load } from '../src/gate.mjs'
test('a minor is refused', async () => {
  assert.equal(allowed(17), false)
  assert.deepEqual(files, ['limit.txt', 'rules/adult.txt'.split('/')[0]])
  assert.equal((await load('other')).twice(2), 4)
})
`

test('assets and computed imports: declared ones are copied and recorded, undeclared ones are absent or refused', async () => {
  const root = fixture({
    'pkg/src/gate.mjs': ASSET_PRODUCT,
    'pkg/test/gate.test.mjs': ASSET_TEST,
    'pkg/data/limit.txt': '18\n',
    'pkg/data/rules/adult.txt': 'adult\n'
  })
  const mutants = [mutant('boundary', 'return age >= limit', 'return age > limit - 2')]
  const declared = { assets: ['pkg/data/'], computedImports: { 'pkg/src/gate.mjs': ['pkg/src/other.mjs'] } }
  // A computed import with no declared target cannot be recorded: refused before anything runs.
  await assert.rejects(
    measure(root, mutants, { assets: ['pkg/data/'] }),
    (error) => error instanceof TrustInputError && /gate\.mjs:5 has a computed import/.test(error.message)
  )
  assert.deepEqual(sourceGraph(root, GATE, declared.computedImports).files, [
    'pkg/src/gate.mjs',
    'pkg/src/other.mjs',
    GATE
  ])
  assert.deepEqual(expandAssets(root, ['pkg/data/', 'pkg/src/other.mjs']), [
    'pkg/data/limit.txt',
    'pkg/data/rules/adult.txt',
    'pkg/src/other.mjs'
  ])
  // An asset nobody declared is not in the scratch tree: the control run fails on it instead of
  // reading the worktree, and nothing is judged.
  const blind = await measure(root, mutants, { computedImports: declared.computedImports }, { verify: true })
  assert.equal(blind.result.valid, false)
  assert.match(blind.result.invalidReason, /control run of pkg\/test\/gate\.test\.mjs: not green/)

  const cohort = cohortOf(root, mutants, declared)
  const { result } = await runCohort({
    root,
    cohort,
    cohortSha256: 'c1',
    out: join(root, '..', `out-${seq}`),
    oracle,
    verify: true
  })
  assert.deepEqual(result.verify, { ok: true, failures: [] })
  assert.equal(cellOf(result, 'boundary').status, 'killed')
  assert.deepEqual(result.inputs.assets, {
    'pkg/data/limit.txt': digest(join(root, 'pkg/data/limit.txt')),
    'pkg/data/rules/adult.txt': digest(join(root, 'pkg/data/rules/adult.txt'))
  })
  assert.match(result.inputs.sources['pkg/src/other.mjs'], /^[0-9a-f]{64}$/)

  const receipt = JSON.parse(JSON.stringify(result))
  const check = (over = {}) => checkReceipt({ root, receipt, cohort, cohortSha256: 'c1', oracle, ...over })
  const refused = async (entry, over) =>
    assert.ok((await check(over)).includes(`input changed: ${entry}`), entry)
  assert.deepEqual(await check(), [])
  // An asset edited, one added to a declared folder (a new migration), one removed.
  writeFileSync(join(root, 'pkg/data/limit.txt'), '21\n')
  await refused('assets/pkg/data/limit.txt')
  writeFileSync(join(root, 'pkg/data/limit.txt'), '18\n')
  writeFileSync(join(root, 'pkg/data/002-more.sql'), 'select 1\n')
  await refused('assets/pkg/data/002-more.sql')
  rmSync(join(root, 'pkg/data/002-more.sql'))
  rmSync(join(root, 'pkg/data/rules/adult.txt'))
  await refused('assets/pkg/data/rules/adult.txt')
  writeFileSync(join(root, 'pkg/data/rules/adult.txt'), 'adult\n')
  assert.deepEqual(await check(), [])
  // A target added to a computed import is a file the receipt never measured.
  writeFileSync(join(root, 'pkg/src/third.mjs'), 'export const third = 3\n')
  await refused('sources/pkg/src/third.mjs', {
    cohort: cohortOf(root, mutants, {
      ...declared,
      computedImports: { 'pkg/src/gate.mjs': ['pkg/src/other.mjs', 'pkg/src/third.mjs'] }
    })
  })

  // Paths of a cohort stay inside the repository and off symlinks, for assets and targets too.
  symlinkSync(join(root, 'pkg/data'), join(root, 'pkg/alias'))
  for (const extra of [
    { assets: ['pkg/alias/'] },
    { assets: ['../'] },
    { assets: ['pkg/none/'] },
    { assets: ['pkg/data/limit.txt', 'pkg/data/limit.txt'] },
    { assets: 'pkg/data/' },
    { computedImports: { 'pkg/src/gate.mjs': [] } },
    { computedImports: { 'pkg/src/gate.mjs': ['../outside.mjs'] } },
    { computedImports: ['pkg/src/gate.mjs'] },
    { database: 'sqlite' }
  ])
    assert.throws(() => cohortOf(root, mutants, extra), TrustInputError, JSON.stringify(extra))
  assert.throws(
    () => cohortOf(root, [mutant('m', 'age', 'x', { behaviour: '' })]),
    TrustInputError,
    'behaviour'
  )
  assert.throws(
    () => cohortOf(root, [mutant('m', 'age', 'x', { equivalent: { argument: ' ' } })]),
    TrustInputError,
    'equivalent'
  )
})

const DATABASE_TEST = `import assert from 'node:assert/strict'
import { test } from 'node:test'
import { allowed } from '../src/gate.mjs'
const url = process.env.TEST_DATABASE_URL
test('a minor is refused, on the database', { skip: url ? false : 'set TEST_DATABASE_URL' }, () => {
  // The database of this one run, never the one the caller named.
  assert.ok(url.includes('/trust_run'), 'a database of this run')
  assert.equal(allowed(17), false)
})
test('the run is given no other variable of the caller', () => {
  assert.equal(process.env.TRUST_SELFTEST_SECRET, undefined)
  assert.equal(allowed(40), true)
})
`

test('a database cohort: each run gets a fresh database, its state is recorded, and no database is never a pass', async () => {
  const root = fixture({ 'pkg/test/gate.test.mjs': DATABASE_TEST })
  const mutants = [
    mutant('boundary', 'return age >= 18', 'return age >= 17'),
    mutant('upper', 'return age >= 18', 'return age >= 18 && age < 30')
  ]
  const url = 'postgres://tester:hunter2@127.0.0.1:5999/trust'
  const env = { ...process.env, TEST_DATABASE_URL: url, TRUST_SELFTEST_SECRET: 'not for a test run' }
  const CLEAN = { template: 'template0', objects: 0, settings: { encoding: 'UTF8', collate: 'C' } }
  const MIGRATED = { objects: 12, schema: 'sha256:migrated', migrations: '3 sha256:names' }
  const log = { asked: [], created: [], dropped: 0 }
  /**
   * A server: what a database created on it starts as (`fresh` when probed, `initial` for run
   * number `n`), and what run `n` leaves in it.
   */
  const server = (version, { fresh = CLEAN, initial = () => CLEAN, after = () => MIGRATED } = {}) => ({
    async probe(o) {
      log.asked.push(o.url)
      return { reachable: true, server: { version }, fresh }
    },
    async fresh(o) {
      log.created.push(o.url)
      const n = log.created.length
      return {
        url: `${o.url}_run${n}`,
        initial: initial(n),
        state: async () => after(n),
        drop: async () => void log.dropped++
      }
    }
  })
  const down = (why) => ({
    probe: async () => ({ reachable: false, why }),
    fresh: async () => assert.fail('no database is created on a server that did not answer')
  })
  const run = (extra, opts) =>
    runCohort({
      root,
      cohort: cohortOf(root, mutants, extra),
      cohortSha256: 'c1',
      out: join(root, '..', `out-${seq}`),
      oracle,
      verify: true,
      ...opts
    })

  // No database declared: the url is not passed and the database test skips itself. The file was
  // then not measured: a green run is inconclusive, and so is a run another test of the file turns
  // red — without that, `--verify` would accept the file with its database test never run.
  const undeclared = await run({}, { env })
  assert.equal(undeclared.result.valid, true, undeclared.result.invalidReason)
  assert.equal(undeclared.result.runs[0].counts.skipped, 1)
  assert.equal(undeclared.result.runs[0].databaseAfter, null)
  for (const id of ['boundary', 'upper']) {
    assert.equal(cellOf(undeclared.result, id).status, 'inconclusive', id)
    assert.match(cellOf(undeclared.result, id).reason, /did not run in control.*on the database/)
  }
  const upperRun = undeclared.result.runs.find((r) => r.variant === 'upper' && r.test === GATE)
  assert.equal(upperRun.counts.fail, 1)
  assert.equal(undeclared.result.verify.ok, false)
  assert.equal(undeclared.result.inputs.database, null)
  assert.equal(undeclared.result.inputs.environment.TEST_DATABASE_URL, undefined)

  // Declared, and the server does not answer (or no url was given): nothing runs, nothing passes.
  for (const [databaseDriver, callerEnv, why] of [
    [down('the server did not answer (ECONNREFUSED)'), env, /ECONNREFUSED/],
    [down('a fresh database cannot be created (42501)'), env, /fresh database cannot be created/],
    [postgresDriver, { ...process.env, TEST_DATABASE_URL: undefined }, /TEST_DATABASE_URL is not set/]
  ]) {
    const none = await run({ database: 'postgres' }, { env: callerEnv, databaseDriver })
    assert.equal(none.result.valid, false)
    assert.match(none.result.invalidReason, /^inconclusive: the test database is not reachable/)
    assert.match(none.result.invalidReason, why)
    assert.deepEqual(none.result.runs, [])
    assert.ok(none.result.matrix.every((c) => c.status === 'not-measured'))
    assert.deepEqual(none.result.verify, { ok: false, failures: [none.result.invalidReason] })
    assert.deepEqual(
      await checkReceipt({
        root,
        receipt: none.result,
        cohort: cohortOf(root, mutants, { database: 'postgres' }),
        cohortSha256: 'c1',
        oracle,
        env: callerEnv,
        databaseDriver
      }),
      ['the receipt records an invalid measurement']
    )
  }

  // Declared and reachable: every run is given a database created for it, the test runs, and the
  // kills are kills.
  const cohort = cohortOf(root, mutants, { database: 'postgres' })
  const { dir, result } = await run({ database: 'postgres' }, { env, databaseDriver: server('16.4') })
  assert.deepEqual(result.verify, { ok: true, failures: [] })
  assert.equal(result.runs[0].counts.skipped, 0)
  assert.equal(cellOf(result, 'boundary').status, 'killed')
  assert.equal(cellOf(result, 'upper').status, 'killed')
  assert.deepEqual(result.inputs.database, {
    kind: 'postgres',
    reachable: true,
    server: { version: '16.4' },
    fresh: CLEAN
  })
  // Two files x (control, two mutants, restored): eight runs, eight databases, all dropped, all
  // asked of the caller's server, none of them the caller's own database.
  assert.equal(result.runs.length, 8)
  assert.equal(log.created.length, 8)
  assert.equal(log.dropped, 8)
  assert.ok([...log.asked, ...log.created].every((u) => u === url))
  assert.ok(result.runs.every((r) => JSON.stringify(r.databaseAfter) === JSON.stringify(MIGRATED)))
  // The url is recorded as a hash: a receipt carries no credential.
  assert.match(result.inputs.environment.TEST_DATABASE_URL, /^sha256:[0-9a-f]{64}$/)
  assert.doesNotMatch(readFileSync(join(dir, 'result.json'), 'utf8'), /hunter2|tester:|5999/)
  assert.doesNotMatch(readFileSync(join(dir, 'matrix.md'), 'utf8'), /hunter2/)

  // A database that is not the recorded clean one is not measured on.
  await assert.rejects(
    run(
      { database: 'postgres' },
      {
        env,
        databaseDriver: server('16.4', { initial: () => ({ ...CLEAN, settings: { encoding: 'LATIN1' } }) })
      }
    ),
    /is not the recorded clean database/
  )
  // Control and restored that leave different schemas or ledgers behind are not the same run.
  log.created.length = 0
  const uneven = await run(
    { database: 'postgres' },
    {
      env,
      databaseDriver: server('16.4', {
        after: (n) => (n > 6 ? { ...MIGRATED, migrations: '2 sha256:fewer' } : MIGRATED)
      })
    }
  )
  assert.match(uneven.result.verify.failures.join('\n'), /left their databases in different states/)
  // A state that cannot be read is an error of that run, never a value two runs can agree on: on a
  // mutant the cell is inconclusive, in control (or restored) nothing is measured.
  const unreadable = (from) => (n) => {
    if (n >= from) throw Object.assign(new Error('gone'), { code: '57P01' })
    return MIGRATED
  }
  log.created.length = 0
  const lostOnMutant = await run(
    { database: 'postgres' },
    { env, databaseDriver: server('16.4', { after: (n) => (n === 3 ? unreadable(3)(n) : MIGRATED) }) }
  )
  assert.equal(cellOf(lostOnMutant.result, 'boundary').status, 'inconclusive')
  assert.match(
    cellOf(lostOnMutant.result, 'boundary').reason,
    /state of its database could not be read \(57P01\)/
  )
  assert.equal(lostOnMutant.result.runs[2].databaseAfter, null)
  assert.equal(lostOnMutant.result.verify.ok, false)
  for (const from of [1, 7]) {
    log.created.length = 0
    const lost = await run(
      { database: 'postgres' },
      { env, databaseDriver: server('16.4', { after: unreadable(from) }) }
    )
    assert.equal(lost.result.valid, false)
    assert.match(
      lost.result.invalidReason,
      new RegExp(`^${from === 1 ? 'control' : 'restored'} run of .*state of its database could not be read`)
    )
    assert.equal(lost.result.verify.ok, false)
  }

  const receipt = JSON.parse(JSON.stringify(result))
  const check = (over = {}) =>
    checkReceipt({
      root,
      receipt,
      cohort,
      cohortSha256: 'c1',
      oracle,
      env,
      databaseDriver: server('16.4'),
      ...over
    })
  assert.deepEqual(await check(), [])
  // Another database, no database, another server version, a server that stopped answering.
  assert.deepEqual(await check({ env: { ...env, TEST_DATABASE_URL: `${url}2` } }), [
    'input changed: environment/TEST_DATABASE_URL'
  ])
  assert.ok(
    (await check({ env: { ...env, TEST_DATABASE_URL: undefined } })).includes(
      'input changed: environment/TEST_DATABASE_URL'
    )
  )
  assert.deepEqual(await check({ databaseDriver: server('17.0') }), [
    'input changed: database/server/version'
  ])
  assert.ok((await check({ databaseDriver: down('gone') })).includes('input changed: database/reachable'))
  // What a database is created with: another encoding or collation is another starting point.
  assert.deepEqual(
    await check({
      databaseDriver: server('16.4', {
        fresh: { ...CLEAN, settings: { encoding: 'UTF8', collate: 'en_US.utf8' } }
      })
    }),
    ['input changed: database/fresh/settings/collate']
  )
  // The same cohort without its database line is another measurement.
  assert.ok((await check({ cohort: cohortOf(root, mutants) })).includes('input changed: database'))
})

/** A stand-in for the `pg` package: every statement goes to `globalThis.__trustPg(database, sql)`. */
const FAKE_PG = `class Client {
  constructor(options) {
    this.database = new URL(options.connectionString).pathname.slice(1)
  }
  on() {}
  async connect() {
    await globalThis.__trustPg(this.database, 'connect')
  }
  async query(sql) {
    return { rows: (await globalThis.__trustPg(this.database, sql)) ?? [] }
  }
  async end() {}
}
module.exports = { Client }
`

test('the PostgreSQL driver: one starting point, checked for every database a run can meet', async () => {
  const root = fixture({
    'pkg/node_modules/pg/package.json': '{ "name": "pg", "main": "index.js" }\n',
    'pkg/node_modules/pg/index.js': FAKE_PG
  })
  const cohort = cohortOf(root, [mutant('boundary', 'return age >= 18', 'return age >= 17')], {
    database: 'postgres'
  })
  const url = 'postgres://tester:hunter2@127.0.0.1:5999/caller'
  const START = {
    objects: 0,
    attributes: { encoding: 6, datcollate: 'C', datctype: 'C', datlocprovider: 'c' },
    settings: { encoding: 'UTF8', collate: 'C', ctype: 'C', timeZone: 'UTC' },
    session: { settings: 300, digest: 'aaaa' }
  }
  /**
   * A scripted server. A database is created from `template0`, or with no template named (which
   * copies `template1`); `fromTemplate1` overrides what the second kind starts as.
   */
  const serve = ({ fromTemplate1 = {}, objects, refuse = {} } = {}) => {
    const sent = []
    const kind = new Map()
    globalThis.__trustPg = (database, sql) => {
      const text = sql.replace(/\s+/g, ' ').trim()
      sent.push([database, text])
      for (const [pattern, code] of Object.entries(refuse))
        if (sql.includes(pattern)) throw Object.assign(new Error(pattern), { code })
      const made = /^create database (\w+)( template template0)?$/.exec(text)
      if (made) kind.set(made[1], made[2] ? 'template0' : 'template1')
      const start = kind.get(database) === 'template1' ? { ...START, ...fromTemplate1 } : START
      if (sql.includes('select version()'))
        return [{ version: 'PostgreSQL 16.4', createDatabase: true, superuser: false }]
      if (sql.includes('as objects')) return [{ objects: objects ?? start.objects }]
      if (sql.includes('as attributes')) return [{ attributes: start.attributes }]
      if (sql.includes('pg_encoding_to_char')) return [start.settings]
      if (sql.includes('from pg_settings')) return [start.session]
      if (sql.includes('string_agg')) return [{ text: 'relation account r' }]
      if (sql.includes('to_regclass')) return [{ found: 'schema_migration' }]
      if (sql.includes('from public.schema_migration'))
        return [{ name: '001-identity.sql' }, { name: '002-book.sql' }]
      return []
    }
    return sent
  }
  const made = (sent, verb) => sent.filter(([, sql]) => sql.startsWith(verb)).map(([, sql]) => sql)
  const probe = () => postgresDriver.probe({ repo: root, cohort, url })
  const FRESH = {
    template: 'template0',
    objects: 0,
    attributes: START.attributes,
    settings: START.settings,
    session: '300 md5:aaaa'
  }
  try {
    // A clean server. Two databases are created to learn what a run starts from: one from
    // template0, as every run's is, and one with no template named, as the tests' own helper
    // creates theirs. Both are read from the inside and both are dropped.
    let sent = serve()
    assert.deepEqual(await probe(), {
      reachable: true,
      server: { version: 'PostgreSQL 16.4', createDatabase: true, superuser: false },
      fresh: FRESH
    })
    const creates = made(sent, 'create database')
    assert.equal(creates.length, 2)
    assert.match(creates[0], /^create database trust_\d+_[0-9a-f]{12} template template0$/)
    assert.match(creates[1], /^create database trust_\d+_[0-9a-f]{12}$/)
    const names = creates.map((sql) => /database (trust_\w+)/.exec(sql)[1])
    assert.deepEqual(
      made(sent, 'drop database'),
      names.map((name) => `drop database if exists ${name} with (force)`)
    )
    for (const name of names)
      for (const read of ['as objects', 'as attributes', 'pg_encoding_to_char', 'from pg_settings'])
        assert.ok(
          sent.some(([database, sql]) => database === name && sql.includes(read)),
          `${name}: ${read}`
        )
    // Nothing is read from the database the caller's url names but who and what the server is.
    assert.deepEqual(
      sent
        .filter(([database]) => database === 'caller')
        .map(([, sql]) => sql.split(' ').slice(0, 2).join(' ')),
      [
        'connect',
        'select version()',
        'connect',
        'create database',
        'connect',
        'drop database',
        'connect',
        'create database',
        'connect',
        'drop database'
      ]
    )

    // 🔒 A template1 with NO object in it and another collation, encoding or session default: the
    // databases the tests create would differ from the recorded one with nothing to count. Refused,
    // for each kind of difference, so no receipt can stay current across such a change.
    for (const [fromTemplate1, names] of [
      [{ attributes: { ...START.attributes, datcollate: 'en_US.utf8' } }, /attributes\/datcollate$/],
      [{ attributes: { ...START.attributes, encoding: 8 } }, /attributes\/encoding$/],
      [{ attributes: { ...START.attributes, daticurules: 'x' } }, /attributes\/daticurules$/],
      [{ settings: { ...START.settings, timeZone: 'Asia/Ho_Chi_Minh' } }, /settings\/timeZone$/],
      [{ session: { settings: 300, digest: 'bbbb' } }, /: session$/]
    ]) {
      sent = serve({ fromTemplate1 })
      const answer = await probe()
      assert.equal(answer.reachable, false, JSON.stringify(fromTemplate1))
      assert.match(
        answer.why,
        /with no template named \(from template1.*does not start as one created from template0/
      )
      assert.match(answer.why, names)
      assert.equal(made(sent, 'drop database').length, 2)
    }
    // ... and with an object in it (a table, a view, a policy, a migration ledger: whatever it is,
    // it has a user oid): refused and dropped, never hashed into a receipt as "fresh".
    sent = serve({ fromTemplate1: { objects: 3 } })
    const seeded = await probe()
    assert.equal(seeded.reachable, false)
    assert.match(seeded.why, /with no template named \(from template1.*holds 3 object\(s\)/)
    assert.equal(made(sent, 'drop database').length, 2)
    sent = serve({ objects: 1 })
    await assert.rejects(postgresDriver.fresh({ repo: root, cohort, url }), DatabaseNotClean)
    assert.equal(made(sent, 'drop database').length, 1)
    assert.match((await probe()).why, /created from template0 holds 1 object\(s\)/)

    // What a run left behind: objects, definitions, the migration ledger.
    serve()
    const database = await postgresDriver.fresh({ repo: root, cohort, url })
    assert.match(database.url, /^postgres:\/\/tester:hunter2@127\.0\.0\.1:5999\/trust_\d+_[0-9a-f]{12}$/)
    assert.deepEqual(database.initial, FRESH)
    serve({ objects: 40 })
    const after = await database.state()
    assert.equal(after.objects, 40)
    assert.match(after.schema, /^sha256:[0-9a-f]{64}$/)
    assert.match(after.migrations, /^2 sha256:[0-9a-f]{64}$/)

    // A role that may not create a database, a server that does not answer.
    serve({ refuse: { 'create database': '42501' } })
    assert.deepEqual(await probe(), { reachable: false, why: 'a clean database cannot be created (42501)' })
    serve({ refuse: { connect: 'ECONNREFUSED' } })
    assert.match((await probe()).why, /did not answer \(ECONNREFUSED\)/)

    // End to end, a settings-only change of template1 between a measurement and its check: the
    // receipt is refused. And on that server nothing runs, nothing passes.
    serve()
    const run = () =>
      runCohort({
        root,
        cohort,
        cohortSha256: 'c1',
        out: join(root, '..', `out-${seq}`),
        oracle,
        verify: true,
        env: { ...process.env, TEST_DATABASE_URL: url }
      })
    const measured = await run()
    assert.deepEqual(measured.result.verify, { ok: true, failures: [] })
    assert.deepEqual(measured.result.inputs.database.fresh, FRESH)
    const check = () =>
      checkReceipt({
        root,
        receipt: JSON.parse(JSON.stringify(measured.result)),
        cohort,
        cohortSha256: 'c1',
        oracle,
        env: { ...process.env, TEST_DATABASE_URL: url }
      })
    assert.deepEqual(await check(), [])
    serve({ fromTemplate1: { attributes: { ...START.attributes, datcollate: 'en_US.utf8' } } })
    assert.ok((await check()).includes('input changed: database/reachable'))
    const refused = await run()
    assert.equal(refused.result.valid, false)
    assert.match(
      refused.result.invalidReason,
      /^inconclusive: the test database is not reachable \(a database created with no template named/
    )
    assert.deepEqual(refused.result.runs, [])
    assert.equal(refused.result.verify.ok, false)
    // The same change in what template0 gives (another server, another initdb) is a recorded input.
    START.attributes = { ...START.attributes, datcollate: 'en_US.utf8' }
    serve()
    assert.deepEqual(await check(), ['input changed: database/fresh/attributes/datcollate'])
  } finally {
    delete globalThis.__trustPg
  }
})
