// Guards the opt-in rule for a pull request into develop (16/10/2026): which labels turn on which
// suite, that an unreadable label opts nothing out, and that the wiring in the workflow, the Turbo
// configuration and the gate keeps the decision honest.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { load } from 'js-yaml'

import {
  DATABASE_MARK,
  E2E_LABEL,
  INTEGRATION_LABEL,
  SKIP_DB_ENV,
  SKIP_DB_FLAG,
  isDatabaseGated,
  skipDatabaseRequested,
  splitDatabaseGated
} from '../ci/related-tests.mjs'
import { editedDatabaseTests, parseLabels, readLabels, testScope } from '../ci/test-scope.mjs'

const here = (rel) => new URL(rel, import.meta.url)
const text = (rel) => readFileSync(here(rel), 'utf8')

// ── the classification the skip is built on ──────────────────────────────────────────────────────

test('a file is database-gated when it names the variable, in any way: the classification the gate always used', () => {
  // The word is the variable the real database helper reads: they must agree, or the skip misses the tests.
  assert.ok(text('../../apps/tracy-web/test/_db.mjs').includes(DATABASE_MARK))
  assert.equal(isDatabaseGated(`const url = process.env.${DATABASE_MARK}\n`), true)
  assert.equal(isDatabaseGated(`skip: 'set ${DATABASE_MARK}'`), true)
  assert.equal(isDatabaseGated("import { test } from 'node:test'\ntest('unit', () => {})\n"), false)
  assert.equal(isDatabaseGated(''), false)
})

test('the gate and the planner count database files with ONE predicate, not two spellings', () => {
  const gate = text('../check-tests.ts')
  assert.ok(
    gate.includes('isDatabaseGated(readFileSync(f'),
    'ensureDatabase counts with the shared predicate'
  )
  assert.ok(
    !gate.includes(`.includes('${DATABASE_MARK}')`),
    'no second spelling of the predicate in the gate'
  )
})

test('splitDatabaseGated: off returns every file; on drops only the files that name the variable', () => {
  const files = ['a/test/db.test.mjs', 'a/test/unit.test.mjs', 'a/test/gone.test.mjs']
  const read = (f) => {
    if (f.endsWith('gone.test.mjs')) throw new Error('unreadable')
    return f.endsWith('db.test.mjs') ? `process.env.${DATABASE_MARK}` : 'nothing'
  }
  assert.deepEqual(splitDatabaseGated(files, false, read), { run: files, dropped: [] })
  // A file that cannot be classified runs: a skip must never drop what it could not read.
  assert.deepEqual(splitDatabaseGated(files, true, read), {
    run: ['a/test/unit.test.mjs', 'a/test/gone.test.mjs'],
    dropped: ['a/test/db.test.mjs']
  })
})

test('the switch: only 1 turns it on, 0 and unset are off, and anything else is an error, never a guess', () => {
  assert.deepEqual(skipDatabaseRequested([], {}), { on: false, rest: [] })
  assert.deepEqual(skipDatabaseRequested([], { [SKIP_DB_ENV]: '' }), { on: false, rest: [] })
  assert.deepEqual(skipDatabaseRequested([], { [SKIP_DB_ENV]: '0' }), { on: false, rest: [] })
  assert.deepEqual(skipDatabaseRequested([], { [SKIP_DB_ENV]: '1' }), { on: true, rest: [] })
  for (const bad of ['true', 'yes', ' 1', '01', 'on', '2']) {
    assert.match(skipDatabaseRequested([], { [SKIP_DB_ENV]: bad }).error, /must be 1, 0 or unset/, bad)
  }
})

test('the flag turns it on wherever it stands and is taken out of the arguments the strict parser sees', () => {
  assert.deepEqual(skipDatabaseRequested([SKIP_DB_FLAG], {}), { on: true, rest: [] })
  assert.deepEqual(skipDatabaseRequested(['--part', 'workers', SKIP_DB_FLAG, '--database', 'owned'], {}), {
    on: true,
    rest: ['--part', 'workers', '--database', 'owned']
  })
  assert.match(skipDatabaseRequested([SKIP_DB_FLAG, SKIP_DB_FLAG], {}).error, /more than once/)
  // An environment that says 0 does not veto a person who typed the flag.
  assert.equal(skipDatabaseRequested([SKIP_DB_FLAG], { [SKIP_DB_ENV]: '0' }).on, true)
})

// ── the labels ───────────────────────────────────────────────────────────────────────────────────

test('parseLabels: a list of names, and empty — a failed read — stays different from an empty list', () => {
  assert.deepEqual(parseLabels('["ci:e2e","bug"]'), ['ci:e2e', 'bug'])
  assert.deepEqual(parseLabels('[]'), [])
  for (const bad of [undefined, '', '  ', 'null', '{}', '"ci:e2e"', '[1]', '[""]', '[', 'ci:e2e']) {
    assert.equal(parseLabels(bad), null, String(bad))
  }
})

const PULL = (over = {}) => ({
  number: 7,
  base: { ref: 'develop' },
  labels: [{ name: 'ci:e2e' }, { name: 'bug' }],
  ...over
})
const asks = (answer) => {
  const paths = []
  return {
    paths,
    get: async (path) => {
      paths.push(path)
      if (answer instanceof Error) throw answer
      return answer
    }
  }
}

test('readLabels reads the pull request now and returns its label names', async () => {
  const api = asks(PULL())
  assert.deepEqual(await readLabels({ get: api.get, repo: 'TracyHQ/tch', pr: 7, baseRef: 'develop' }), {
    labels: ['ci:e2e', 'bug']
  })
  assert.deepEqual(api.paths, ['repos/TracyHQ/tch/pulls/7'])
})

test('readLabels refuses every answer it cannot trust, so the plan opts nothing out', async () => {
  const cases = [
    ['an API error', new Error('HTTP 403')],
    ['not an object', null],
    ['another pull request', PULL({ number: 8 })],
    ['another base', PULL({ base: { ref: 'main' } })],
    ['no label list', PULL({ labels: undefined })],
    ['a nameless label', PULL({ labels: [{ name: 'ok' }, {}] })],
    [
      'a list that may be cut short',
      PULL({ labels: Array.from({ length: 100 }, (_, i) => ({ name: `l${i}` })) })
    ]
  ]
  for (const [why, answer] of cases) {
    const got = await readLabels({ get: asks(answer).get, repo: 'TracyHQ/tch', pr: 7, baseRef: 'develop' })
    assert.ok('error' in got, why)
  }
  for (const pr of ['', 'x', '0', '07', '7/../8', undefined]) {
    const api = asks(PULL())
    const got = await readLabels({ get: api.get, repo: 'TracyHQ/tch', pr, baseRef: 'develop' })
    assert.ok('error' in got, String(pr))
    assert.deepEqual(api.paths, [], 'a bad number never reaches the API')
  }
})

// ── the decision ─────────────────────────────────────────────────────────────────────────────────

const DB = 'apps/tracy-web/test/db.test.mjs'
const UNIT = 'apps/tracy-web/test/unit.test.mjs'
const FILES = [DB, UNIT, 'apps/tracy-web/src/a.js', 'apps/tracy-web/test/_db.mjs']
const read = (f) => (f === DB || f.endsWith('_db.mjs') ? `process.env.${DATABASE_MARK}` : 'unit')
const scope = (over) =>
  testScope({
    event: 'pull_request',
    baseRef: 'develop',
    labels: [],
    changed: ['apps/tracy-web/src/a.js'],
    allFiles: FILES,
    readText: read,
    ...over
  })

test('the labels the planner reads are the ones the re-run workflow listens for and the header names', () => {
  const rerun = text('../../.github/workflows/ci-label-rerun.yml')
  const header = text('../../.github/workflows/tracy-ci.yml')
  for (const label of [E2E_LABEL, INTEGRATION_LABEL]) {
    assert.ok(rerun.includes(`label.name == '${label}'`), `${label} in ci-label-rerun.yml`)
    assert.ok(header.includes(`\`${label}\``), `${label} in the header of tracy-ci.yml`)
  }
})

test('testScope: every label combination on a pull request into develop', () => {
  const none = scope({})
  assert.deepEqual(
    [none.e2eLeftOut, none.e2eForced, none.skipDb, none.record],
    [true, false, true, 'partial:db+e2e']
  )
  const e2e = scope({ labels: [E2E_LABEL] })
  assert.deepEqual([e2e.e2eLeftOut, e2e.e2eForced, e2e.skipDb, e2e.record], [false, true, true, 'partial:db'])
  const db = scope({ labels: [INTEGRATION_LABEL] })
  assert.deepEqual([db.e2eLeftOut, db.e2eForced, db.skipDb, db.record], [true, false, false, 'partial:e2e'])
  const both = scope({ labels: [E2E_LABEL, INTEGRATION_LABEL] })
  assert.deepEqual([both.e2eLeftOut, both.e2eForced, both.skipDb, both.record], [false, true, false, 'full'])
  assert.equal(
    none.dbFiles,
    1,
    'one workers file in this tree reads the variable (the helper is not a test file)'
  )
})

test('testScope: not a pull request into develop — nothing is decided, whatever the labels', () => {
  for (const input of [
    { event: 'pull_request', baseRef: 'main' },
    { event: 'pull_request', baseRef: 'staging' },
    { event: 'pull_request', baseRef: '' },
    { event: 'schedule' },
    { event: 'workflow_dispatch' },
    { event: 'push' }
  ]) {
    for (const labels of [[], [E2E_LABEL], null]) {
      const got = scope({ ...input, labels })
      assert.equal(got.applies, false, JSON.stringify(input))
      assert.deepEqual([got.e2eLeftOut, got.skipDb, got.record], [false, false, 'full'])
    }
  }
})

test('testScope: unreadable labels, an unknown diff or an unreadable tree opt nothing out', () => {
  for (const labels of [null, undefined, 'ci:e2e', { 0: 'ci:e2e' }]) {
    const got = scope({ labels })
    assert.deepEqual(
      [got.applies, got.labelsKnown, got.e2eLeftOut, got.skipDb, got.record],
      [true, false, false, false, 'full']
    )
  }
  for (const changed of [null, []]) {
    const got = scope({ changed })
    assert.deepEqual([got.labelsKnown, got.e2eLeftOut, got.skipDb, got.record], [true, false, false, 'full'])
  }
  const blind = scope({ readText: undefined })
  assert.equal(blind.skipDb, false, 'without a reader the skip cannot classify, so it does not happen')
  assert.equal(blind.e2eLeftOut, true, 'the e2e rule needs no tree')
})

test('testScope: editing a file that reads the database keeps the database tests; a deleted one does not', () => {
  assert.equal(scope({ changed: [DB] }).skipDb, false)
  assert.deepEqual(scope({ changed: [DB, UNIT] }).dbEdited, [DB])
  assert.equal(scope({ changed: ['apps/tracy-web/test/_db.mjs'] }).skipDb, false)
  assert.equal(scope({ changed: [UNIT] }).skipDb, true)
  // Gone from the tree: nothing to run, nothing to keep.
  assert.equal(scope({ changed: ['apps/tracy-web/test/removed.test.mjs'] }).skipDb, true)
  // A changed file that cannot be read cannot be ruled out.
  assert.equal(
    scope({
      changed: [UNIT],
      readText: (f) => {
        if (f === UNIT) throw new Error('unreadable')
        return read(f)
      }
    }).skipDb,
    false
  )
})

test('editedDatabaseTests: only tracked files under a test directory that name the variable', () => {
  const present = new Set(FILES)
  assert.deepEqual(editedDatabaseTests([DB, UNIT, 'apps/tracy-web/src/a.js'], present, read), [DB])
  // Outside a test directory the same words mean nothing here (`check-tests.ts` names the variable too).
  assert.deepEqual(
    editedDatabaseTests(['scripts/check-tests.ts'], new Set(['scripts/check-tests.ts']), () => DATABASE_MARK),
    []
  )
  // A document under a test directory is not a test file.
  assert.deepEqual(
    editedDatabaseTests(['a/test/notes.md'], new Set(['a/test/notes.md']), () => DATABASE_MARK),
    []
  )
})

test('every decision says why, in words, for the notice and the job summary', () => {
  assert.match(scope({}).why.join(' | '), /no label ci:e2e.*no label ci:integration: 1 workers test file/)
  assert.match(
    scope({ labels: [E2E_LABEL, INTEGRATION_LABEL] }).why.join(' | '),
    /label ci:e2e.*label ci:integration/
  )
  assert.match(scope({ changed: [DB] }).why.join(' | '), /edits apps\/tracy-web\/test\/db\.test\.mjs/)
  assert.match(scope({ labels: null }).why[0], /could not read the labels/)
})

// ── the wiring: workflow, Turbo, gate ────────────────────────────────────────────────────────────

const workflow = load(text('../../.github/workflows/tracy-ci.yml'))
const stepOf = (job, name) => workflow.jobs[job].steps.find((s) => s.name === name)
const indexOf = (job, name) => workflow.jobs[job].steps.findIndex((s) => s.name === name)
const SKIP = "${{ needs.plan.outputs.skip_db == 'true' && '1' || '0' }}"

test('plan reads the labels from the API at run time, with its own token, and never from the event', () => {
  const labels = stepOf('plan', "Read this pull request's labels")
  assert.ok(labels)
  assert.equal(labels.run, 'node scripts/ci/test-scope.mjs --read-labels')
  assert.equal(labels.env.GH_TOKEN, '${{ github.token }}')
  assert.equal(labels['continue-on-error'], true, 'a failed read must not fail the plan: it fails closed')
  assert.match(labels.if, /github\.base_ref == 'develop'/)
  assert.match(labels.if, /pull_request/)
  assert.equal(workflow.jobs.plan.permissions['pull-requests'], 'read')
  assert.equal(workflow.jobs.plan.permissions.contents, 'read')
  // The labels a re-run sees are the labels now: nothing in the plan job reads them from the payload.
  // `runs-on` is excluded on purpose: it picks the runner from the `ci:aws-only` label (PR #1422) and
  // decides no test; every other key of the job must not read the payload's labels.
  const { 'runs-on': _runner, ...planWithoutRunner } = workflow.jobs.plan
  const planYaml = JSON.stringify(planWithoutRunner)
  assert.ok(!/github\.event\.pull_request\.labels/.test(planYaml), 'labels from the event payload')
  assert.ok(!/github\.event\.label/.test(planYaml), 'the label of the event')
})

test('the scope is decided BEFORE Turbo is asked, and the dry run is asked under the same value the rows get', () => {
  const read = indexOf('plan', "Read this pull request's labels")
  const decide = indexOf('plan', 'Decide the opt-in test scope')
  const ask = indexOf('plan', 'Ask Turbo which test tasks the cache already holds')
  assert.ok(read !== -1 && read < decide && decide < ask)
  assert.equal(stepOf('plan', 'Decide the opt-in test scope').run, 'node scripts/ci/plan-ci.mjs --scope')
  assert.equal(
    stepOf('plan', 'Ask Turbo which test tasks the cache already holds').env.TRACY_TESTS_SKIP_DB,
    "${{ steps.scope.outputs.skip_db == 'true' && '1' || '0' }}"
  )
  const plan = stepOf('plan', 'Plan the rows')
  assert.equal(plan.env.PR_LABELS, '${{ steps.labels.outputs.labels }}')
  assert.equal(plan.env.SCOPE_SKIP_DB, '${{ steps.scope.outputs.skip_db }}')
  assert.equal(workflow.jobs.plan.outputs.skip_db, '${{ steps.plan.outputs.skip_db }}')
})

test('every step that hashes or runs the tests gets the plan’s decision as 1 or 0, never unset', () => {
  for (const name of ["Compare every Turbo task hash with the plan job's", 'Turbo tests', 'Build check']) {
    assert.equal(stepOf('build-check', name).env.TRACY_TESTS_SKIP_DB, SKIP, name)
  }
  // And not as a job-wide variable: the clock-shift step, which runs test files, must not inherit it.
  assert.equal(workflow.jobs['build-check'].env, undefined)
  assert.equal(stepOf('build-check', 'Tests with the clock moved forward').env.TRACY_TESTS_SKIP_DB, undefined)
})

test('the plan records what it decided beside the tested tree', () => {
  assert.equal(
    stepOf('plan', 'Skip the full suite when this tree already passed one').env.TRACY_CI_TESTED_SCOPE,
    '${{ steps.plan.outputs.tested_scope }}'
  )
})

test('labeled is NOT a trigger of Tracy CI, and the header says why', () => {
  const raw = text('../../.github/workflows/tracy-ci.yml')
  assert.deepEqual(workflow.on.pull_request.types, ['opened', 'synchronize', 'ready_for_review'])
  assert.ok(raw.includes('`labeled` IS NOT A TRIGGER OF THIS FILE, ON PURPOSE'))
  assert.ok(raw.includes('anh David (SRE)'))
})

test('Turbo: every owner task that holds a database file hashes the switch, and the gate says so', async () => {
  const { workersFiles } = await import('../check-tests.ts')
  const { configProblems } = await import('../ci/turbo-setup.mjs')
  assert.deepEqual(configProblems(workersFiles()), [])
  const web = JSON.parse(text('../../apps/tracy-web/turbo.json'))
  for (const task of ['test:ci:1', 'test:ci:2', 'test:ci:3'])
    assert.ok(web.tasks[task].env.includes(SKIP_DB_ENV), task)
  const root = JSON.parse(text('../../turbo.json'))
  assert.ok(root.tasks['//#test:ci:scripts'].env.includes(SKIP_DB_ENV))
  // The owners that hold no database file do not hash it: labelling a pull request re-runs only what can change.
  assert.ok(!root.tasks['//#test:ci:interop'].env?.includes(SKIP_DB_ENV))
  assert.ok(!root.tasks['//#test:ci:vendor'].env?.includes(SKIP_DB_ENV))
})

test('Turbo: a configuration that forgot the switch is a problem, not a pass', async () => {
  const { definitionProblem, MACHINERY, EXCLUDE } = await import('../ci/turbo-setup.mjs')
  const whole = { inputs: ['$TURBO_DEFAULT$', ...MACHINERY, ...EXCLUDE] }
  assert.equal(definitionProblem('x', whole, '$TURBO_DEFAULT$'), null)
  assert.match(
    definitionProblem('x', whole, '$TURBO_DEFAULT$', [SKIP_DB_ENV]),
    /lacks env TRACY_TESTS_SKIP_DB/
  )
  assert.equal(
    definitionProblem('x', { ...whole, env: ['TRACY_DSH_COMMIT', SKIP_DB_ENV] }, '$TURBO_DEFAULT$', [
      SKIP_DB_ENV
    ]),
    null
  )
})

test('Turbo: an owner that starts to hold a database file without the switch in its task is red', async () => {
  const { workersFiles } = await import('../check-tests.ts')
  const { configProblems } = await import('../ci/turbo-setup.mjs')
  const files = workersFiles()
  const seeder = files.find((f) => f.startsWith('packages/cms/tracy-seeder/'))
  assert.ok(seeder, 'the seeder still owns a workers test file')
  const problems = configProblems(files, (file) => file === seeder)
  assert.equal(problems.length, 1, problems.join('\n'))
  assert.match(
    problems[0],
    /packages\/cms\/tracy-seeder\/turbo\.json: task test:ci lacks env TRACY_TESTS_SKIP_DB/
  )
  // A root owner is judged the same way.
  const script = files.find((f) => f.startsWith('packages/cms/tracy-joomla-quickstart/'))
  if (script) {
    const root = configProblems(files, (file) => file === script)
    assert.equal(root.length, 1, root.join('\n'))
    assert.match(root[0], /turbo\.json: task \/\/#test:ci:joomla-quickstart.*lacks env TRACY_TESTS_SKIP_DB/)
  }
})

test('no test of the CI planner and its neighbours is itself database-gated, so editing the planner never drops its tests', () => {
  // A test file that names the variable is left out of a pull request that carries no label. The tests
  // of `plan-ci.mjs`, `test-scope.mjs`, `related-tests.mjs`, the Turbo setup and the proof must therefore
  // build the name from the shared constant (`DATABASE_MARK`) instead of spelling it.
  const dir = here('./')
  const files = readdirSync(dir).filter((name) => /^ci-.*\.test\.mjs$/.test(name))
  assert.ok(files.length >= 10, `only ${String(files.length)} ci-*.test.mjs files found`)
  assert.ok(files.includes('ci-plan.test.mjs') && files.includes('ci-test-scope.test.mjs'))
  const gated = files.filter((name) => isDatabaseGated(readFileSync(new URL(name, dir), 'utf8')))
  assert.deepEqual(gated, [])
})
