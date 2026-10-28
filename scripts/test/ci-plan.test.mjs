// Guards the CI planner: which build-check rows exist for which event, and that it fails closed.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readFileSync } from 'node:fs'

import {
  databaseTestsLeftOut,
  e2eOwners,
  e2ePaths,
  parsePlanArgs,
  planMatrix,
  scopeNotes
} from '../ci/plan-ci.mjs'
import { DATA_FILE_TESTS, DATABASE_MARK, REVIEWED_SKILLS } from '../ci/related-tests.mjs'

const allFiles = [
  'packages/site/tracy-add-site/test/e2e/wizard.test.mjs',
  'packages/ui/tracy-mode-picker/test/e2e/policy.test.mjs',
  'packages/site/tracy-add-site/test/unit.test.mjs',
  'apps/tracy-web/test/e2e/x.test.mjs'
]
const groups = (p) => p.matrix.include.map((r) => r.group)
const ALWAYS = ['tests 1/2', 'tests 2/2', 'checks']
const RELATED = ['tests related', 'checks']

test('e2eOwners: derives package dirs from e2e file paths only', () => {
  assert.deepEqual(e2eOwners(allFiles), [
    'apps/tracy-web',
    'packages/site/tracy-add-site',
    'packages/ui/tracy-mode-picker'
  ])
})

test('e2ePaths: matches an owner package and shared inputs, not a neighbour', () => {
  const re = new RegExp(e2ePaths(allFiles))
  assert.ok(re.test('packages/site/tracy-add-site/src/x.js'))
  assert.ok(re.test('scripts/check-tests.ts'))
  assert.ok(!re.test('packages/site/tracy-my-sites/src/x.js'))
})

test('PR into develop touching an app runs its related tests and checks', () => {
  const p = planMatrix({
    event: 'pull_request',
    baseRef: 'develop',
    changed: ['apps/tracy-host/src/a.js'],
    allFiles
  })
  assert.deepEqual(groups(p), RELATED)
  assert.equal(p.skipped.length, 4)
})

test('PR touching an e2e-owning package adds only the e2e row', () => {
  const p = planMatrix({
    event: 'pull_request',
    baseRef: 'develop',
    changed: ['packages/ui/tracy-mode-picker/src/a.js'],
    allFiles
  })
  assert.deepEqual(groups(p), ['tests e2e', ...RELATED])
})

test('PR moving the dsh fork pointer uses every row', () => {
  for (const changed of [
    ['vendor/tracy/deepseek-harness'],
    ['vendor/tracy/deepseek-harness/packages/x/y.ts']
  ]) {
    const p = planMatrix({ event: 'pull_request', baseRef: 'develop', changed, allFiles })
    assert.deepEqual(
      groups(p),
      ['tests emdash-business', 'tests emdash-saas', 'tests emdash-base', 'tests e2e', ...ALWAYS],
      JSON.stringify(changed)
    )
  }
})

test('an unknown vendor path fails closed to every row', () => {
  const p = planMatrix({
    event: 'pull_request',
    baseRef: 'develop',
    changed: ['vendor/tracy/deepseek-harness-old/a.ts', 'vendor/tracy/dsh-passwords/src/a.ts', 'docs/a.md'],
    allFiles
  })
  assert.deepEqual(groups(p), [
    'tests emdash-business',
    'tests emdash-saas',
    'tests emdash-base',
    'tests e2e',
    ...ALWAYS
  ])
})

test('PR touching one EmDash theme adds only that theme', () => {
  const p = planMatrix({
    event: 'pull_request',
    baseRef: 'develop',
    changed: ['packages/cms/tracy-emdash-theme-base/x.astro'],
    allFiles
  })
  assert.deepEqual(groups(p), ['tests emdash-base', 'checks'])
})

test('business also reads tracy-site-build-core', () => {
  const p = planMatrix({
    event: 'pull_request',
    baseRef: 'develop',
    changed: ['packages/site/tracy-site-build-core/a.js'],
    allFiles
  })
  assert.ok(groups(p).includes('tests emdash-business'))
})

test('docs-only PR runs checks but no test process', () => {
  const p = planMatrix({
    event: 'pull_request',
    baseRef: 'develop',
    changed: ['docs/references/example.md'],
    allFiles
  })
  assert.deepEqual(groups(p), ['checks'])
  assert.equal(p.related.workers.length, 0)
})

test('a changed workers test runs one related row with that file', () => {
  const p = planMatrix({
    event: 'pull_request',
    baseRef: 'develop',
    changed: ['packages/site/tracy-add-site/test/unit.test.mjs'],
    allFiles
  })
  assert.deepEqual(groups(p), RELATED)
  assert.deepEqual(p.related.workers, ['packages/site/tracy-add-site/test/unit.test.mjs'])
})

test('a changed e2e test runs the browser row', () => {
  const p = planMatrix({
    event: 'pull_request',
    baseRef: 'develop',
    changed: ['packages/site/tracy-add-site/test/e2e/wizard.test.mjs'],
    allFiles
  })
  assert.deepEqual(groups(p), ['tests e2e', 'checks'])
})

test('a workspace dependency change runs a dependent owner’s e2e suite', () => {
  const p = planMatrix({
    event: 'pull_request',
    baseRef: 'develop',
    changed: ['packages/core/tracy-core/src/seat/index.mjs'],
    allFiles,
    dependencies: { 'packages/site/tracy-add-site': ['packages/core/tracy-core'] }
  })
  assert.ok(groups(p).includes('tests e2e'))
})

test('fails closed: every row on staging and main PRs, manual, nightly, unreadable or empty diff', () => {
  const all = ['tests emdash-business', 'tests emdash-saas', 'tests emdash-base', 'tests e2e', ...ALWAYS]
  for (const input of [
    { event: 'pull_request', baseRef: 'main', changed: ['docs/a.md'] },
    { event: 'pull_request', baseRef: 'staging', changed: ['docs/a.md'] },
    { event: 'workflow_dispatch', changed: null },
    { event: 'schedule', changed: null },
    { event: 'pull_request', baseRef: 'develop', changed: null },
    { event: 'pull_request', baseRef: 'develop', changed: [] }
  ]) {
    const p = planMatrix({ ...input, allFiles })
    assert.deepEqual(groups(p), all, JSON.stringify(input))
    assert.equal(p.skipped.length, 0)
  }
})

test('rows carry the args CI runs; rest rides with the last workers shard', () => {
  const p = planMatrix({ event: 'workflow_dispatch', changed: null, allFiles })
  const args = Object.fromEntries(p.matrix.include.map((r) => [r.group, r.args]))
  assert.equal(args['tests 2/2'], '--only tests --tests-part workers:2/2,rest')
  assert.equal(args.checks, '--skip tests')
})

test('arguments: planning takes none; the balance check is one exact flag', () => {
  assert.deepEqual(parsePlanArgs([]), { mode: 'plan' })
  assert.deepEqual(parsePlanArgs(['--check-test-balance']), { mode: 'balance' })
  for (const bad of [
    ['--check-test-balanc'],
    ['--check-test-balance', '--check-test-balance'],
    ['plan'],
    ['']
  ]) {
    assert.ok('error' in parsePlanArgs(bad), `${bad.join(' ')} must be refused, not planned`)
  }
})

test('the own-domain pilot is switched on for the e2e row, and only by that row’s name', () => {
  // The workflow keys the two variables on the group name this planner gives the e2e row.
  const rows = planMatrix({ event: 'workflow_dispatch', changed: null, allFiles }).matrix.include
  assert.equal(
    rows.filter((r) => r.group === 'tests e2e' && r.args === '--only tests --tests-part e2e').length,
    1
  )
  const workflow = readFileSync(new URL('../../.github/workflows/tracy-ci.yml', import.meta.url), 'utf8')
  const lines = workflow.split('\n').filter((l) => /^\s+TRACY_PILOT(_ARTIFACT_DIR)?:/.test(l))
  assert.deepEqual(
    lines.map((l) => l.trim()),
    [
      "TRACY_PILOT: ${{ matrix.group == 'tests e2e' && '1' || '' }}",
      "TRACY_PILOT_ARTIFACT_DIR: ${{ matrix.group == 'tests e2e' && format('{0}/own-domain-pilot', runner.temp) || '' }}"
    ]
  )
})

// A reviewed tree no test reads: its re-pin runs the checks row only.
const SKILL = REVIEWED_SKILLS.find((skill) => !skill.readers.length).prefix
const [DATA, MAPPED] = [...DATA_FILE_TESTS.entries()][0]
const T4 = REVIEWED_SKILLS.find((skill) => skill.prefix.includes('joomlart-t4'))
const EMDASH_SKILL = REVIEWED_SKILLS.find((skill) => skill.prefix.startsWith('vendor/emdash/')).prefix
const dataFiles = [...allFiles, ...MAPPED, ...T4.readers, DATA, `${SKILL}SKILL.md`]
const planOf = (changed, extra = {}) =>
  planMatrix({ event: 'pull_request', baseRef: 'develop', changed, allFiles: dataFiles, ...extra })

test('a reviewed skill re-pin runs the checks row only', () => {
  const p = planOf([`${SKILL}SKILL.md`, `${SKILL}IMPORT-NOTE.md`, 'changes/2026-10-09-x.md'])
  assert.deepEqual(groups(p), ['checks'])
  assert.equal(p.runsAll, false)
  assert.equal(p.related.workers.length, 0)
  assert.equal(p.related.interop, false)
})

test('a data-file-only change runs checks plus the mapped tests, without the e2e row', () => {
  const p = planOf([DATA])
  assert.deepEqual(groups(p), RELATED)
  assert.deepEqual([...p.related.workers].sort(), [...MAPPED].sort())
  assert.equal(p.related.interop, false)
  assert.deepEqual(groups(planOf([DATA, `${SKILL}SKILL.md`, 'docs/references/x.md'])), RELATED)
})

test('a data file with source keeps today selection, e2e row included', () => {
  const p = planOf([DATA, 'apps/tracy-web/src/lib/template-profiles.js'])
  assert.deepEqual(groups(p), ['tests e2e', ...RELATED])
  assert.equal(p.related.interop, true)
  assert.deepEqual(groups(planOf([DATA, `${SKILL}SKILL.md`, 'apps/tracy-web/src/x.js'])), [
    'tests e2e',
    ...RELATED
  ])
})

test('a data file renamed, a missing mapped test, an unmapped vendor path and release events stay full', () => {
  const renamed = planOf([DATA], { allFiles: dataFiles.filter((f) => f !== DATA) })
  assert.deepEqual(groups(renamed), ['tests e2e', ...RELATED])
  const missing = planOf([DATA], { allFiles: dataFiles.filter((f) => f !== MAPPED[0]) })
  assert.equal(missing.runsAll, true)
  assert.equal(groups(missing).length, 7)
  assert.equal(groups(planOf(['vendor/unmapped/example.md'])).length, 7)
  assert.equal(groups(planOf([DATA, 'scripts/check-tests.ts'])).length, 7)
  for (const extra of [
    { baseRef: 'main' },
    { baseRef: 'staging' },
    { event: 'workflow_dispatch' },
    { event: 'schedule' }
  ]) {
    assert.equal(groups(planOf([DATA, `${SKILL}SKILL.md`], extra)).length, 7, JSON.stringify(extra))
  }
  assert.equal(groups(planOf(null)).length, 7)
  assert.equal(groups(planOf([])).length, 7)
})

test('a journal entry under changes/ never forces the full suite', () => {
  const journal = 'changes/2026-10-28-x.md'
  const files = [...dataFiles, journal]
  const lane = planOf([journal], { allFiles: files, readText: () => '' })
  assert.equal(lane.related.lane, 'template-data')
  assert.equal(lane.runsAll, false)
  assert.match(lane.matrix.include.find((r) => r.group === 'checks').args, /--only vocabulary/)
  const code = 'packages/site/tracy-add-site/src/a.js'
  const withCode = planOf([journal, code], { allFiles: files })
  assert.equal(withCode.runsAll, false)
  assert.equal(withCode.related.full, false)
  assert.deepEqual(groups(withCode), groups(planOf([code], { allFiles: files })))
  assert.ok(groups(withCode).includes('tests related'))
})

test('a T4 skill re-pin runs checks plus its declared readers, no interop, e2e or EmDash row', () => {
  const p = planOf([`${T4.prefix}SKILL.md`, `${T4.prefix}IMPORT-NOTE.md`, 'changes/2026-10-09-x.md'])
  assert.deepEqual(groups(p), RELATED)
  assert.equal(p.runsAll, false)
  assert.deepEqual(p.related.workers, T4.readers)
  assert.equal(p.related.interop, false)
  assert.deepEqual(groups(planOf([`${T4.prefix}SKILL.md`, `${SKILL}SKILL.md`])), RELATED)
})

test('a Tracy skill edit runs checks plus its audited readers, not the full suite', () => {
  // Found by name: spelling the skill path out here would make this file a reader of the tree.
  const prMerge = REVIEWED_SKILLS.find((skill) => skill.prefix.endsWith('/pr-merge/'))
  const changed = [`${prMerge.prefix}SKILL.md`, 'changes/2026-10-28-x.md']
  const p = planOf(changed, { allFiles: [...dataFiles, ...prMerge.readers] })
  assert.deepEqual(groups(p), RELATED)
  assert.equal(p.runsAll, false)
  assert.deepEqual(p.related.workers, prMerge.readers)
  assert.equal(p.related.interop, false)
  // Its reader gone, the planner cannot vouch for the selection.
  assert.equal(planOf(changed).runsAll, true)
  // The skill that triggered the change: its REG-PR-1228 check is a worker test now, so it stays narrow.
  const contract = REVIEWED_SKILLS.find((skill) => skill.prefix.endsWith('/quickstart-contract/'))
  const edit = [`${contract.prefix}SKILL.md`, 'changes/2026-10-28-x.md']
  const narrow = planOf(edit, { allFiles: [...dataFiles, ...contract.readers] })
  assert.deepEqual(groups(narrow), RELATED)
  assert.equal(narrow.runsAll, false)
  assert.deepEqual([...narrow.related.workers].sort(), [...contract.readers].sort())
  assert.equal(narrow.related.interop, false)
})

test('a skill a regression script reads runs every row: no CI row runs regression scripts', () => {
  for (const prefix of [EMDASH_SKILL]) {
    const readers = REVIEWED_SKILLS.find((skill) => skill.prefix === prefix).readers
    assert.ok(
      readers.some((file) => file.startsWith('tests/regression/scripts/')),
      prefix
    )
    const p = planOf([`${prefix}SKILL.md`, 'changes/2026-10-28-x.md'], {
      allFiles: [...dataFiles, ...readers]
    })
    assert.equal(p.runsAll, true, prefix)
    assert.equal(groups(p).length, 7, prefix)
  }
})

test('the EmDash CMS and the Bravada theme still run the EmDash suites; a look-alike of the skill is not the skill', () => {
  for (const other of [
    'vendor/emdash/emdash/IMPORT-NOTE.md',
    'vendor/emdash/emdash-theme-bravada/IMPORT-NOTE.md'
  ]) {
    assert.deepEqual(groups(planOf([other])), [
      'tests emdash-business',
      'tests emdash-saas',
      'tests emdash-base',
      'checks'
    ])
  }
  assert.ok(groups(planOf([`${EMDASH_SKILL.slice(0, -1)}-x/a.md`])).length > 1)
})

test('a lost declared reader, a deleted skill reader and release events run every row', () => {
  const lost = planOf([`${T4.prefix}SKILL.md`], {
    allFiles: dataFiles.filter((f) => !T4.readers.includes(f))
  })
  assert.equal(lost.runsAll, true)
  assert.equal(groups(lost).length, 7)
  for (const extra of [
    { baseRef: 'main' },
    { baseRef: 'staging' },
    { event: 'workflow_dispatch' },
    { event: 'schedule' }
  ]) {
    assert.equal(groups(planOf([`${T4.prefix}SKILL.md`, `${EMDASH_SKILL}SKILL.md`], extra)).length, 7)
  }
})

// ── opt-in suites on a pull request into develop (16/10/2026) ───────────────────────────────────

// Built from the shared constant, never spelled out: a test file that names the variable is itself
// "database-gated", and would be left out of every pull request that edits the planner it tests.
const DB_TEXT = `const url = process.env.${DATABASE_MARK}\ntest('db', { skip: url ? false : 'set ${DATABASE_MARK}' }, () => {})\n`
const UNIT_TEXT = "import { test } from 'node:test'\ntest('unit', () => {})\n"
const DB_TEST = 'apps/tracy-web/test/db.test.mjs'
const UNIT_TEST = 'apps/tracy-web/test/unit.test.mjs'
const optFiles = [...allFiles, 'apps/tracy-web/src/a.js', DB_TEST, UNIT_TEST]
const optText = (file) => {
  if (!optFiles.includes(file)) throw new Error(`no such file: ${file}`)
  return file === DB_TEST ? DB_TEXT : UNIT_TEXT
}
/** A pull request into develop that changes tracy-web code: related tests, and the e2e row by its paths. */
const optPlan = (labels, over = {}) =>
  planMatrix({
    event: 'pull_request',
    baseRef: 'develop',
    changed: ['apps/tracy-web/src/a.js'],
    allFiles: optFiles,
    readText: optText,
    labels,
    ...over
  })
const FULL_ROWS = ['tests emdash-business', 'tests emdash-saas', 'tests emdash-base', 'tests e2e', ...ALWAYS]

test('without a label, a pull request into develop gets no e2e row and no database test', () => {
  const p = optPlan([])
  // The paths alone would have run the browser suite: this change is in a package that owns an e2e file.
  assert.deepEqual(groups(p), RELATED)
  assert.deepEqual(
    p.leftOut.map((r) => [r.group, r.label, r.wouldRun]),
    [['tests e2e', 'ci:e2e', true]]
  )
  assert.equal(p.scope.skipDb, true)
  assert.equal(p.scope.dbFiles, 1)
  assert.equal(p.scope.record, 'partial:db+e2e')
  // The unit test beside the database one still runs; the database one is not selected for the row.
  assert.deepEqual(p.relatedRun, [UNIT_TEST])
  assert.deepEqual(p.related.workers.sort(), [DB_TEST, UNIT_TEST])
})

test('an unrelated label opts nothing in', () => {
  assert.deepEqual(groups(optPlan(['bug', 'area:ci'])), RELATED)
  assert.equal(optPlan(['bug']).scope.skipDb, true)
})

test('ci:e2e adds the e2e row and nothing else', () => {
  const p = optPlan(['ci:e2e'])
  assert.deepEqual(groups(p), ['tests e2e', ...RELATED])
  assert.equal(p.leftOut.length, 0)
  assert.equal(p.scope.skipDb, true)
  assert.equal(p.scope.record, 'partial:db')
})

test('ci:integration keeps the database tests and leaves the e2e row out', () => {
  const p = optPlan(['ci:integration'])
  assert.deepEqual(groups(p), RELATED)
  assert.equal(p.scope.skipDb, false)
  assert.equal(p.scope.record, 'partial:e2e')
  assert.deepEqual(p.relatedRun.sort(), [DB_TEST, UNIT_TEST])
})

test('both labels: as a pull request into develop ran before the rule, and recorded as full', () => {
  const p = optPlan(['ci:e2e', 'ci:integration'])
  assert.deepEqual(groups(p), ['tests e2e', ...RELATED])
  assert.equal(p.leftOut.length, 0)
  assert.equal(p.scope.skipDb, false)
  assert.equal(p.scope.record, 'full')
})

test('the e2e label means run it: no path filter second-guesses it', () => {
  const p = optPlan(['ci:e2e'], { changed: ['docs/references/example.md'] })
  assert.deepEqual(groups(p), ['tests e2e', 'checks'])
  // And without it, the same documentation-only change simply has nothing to say about e2e.
  assert.deepEqual(
    optPlan([], { changed: ['docs/references/example.md'] }).leftOut.map((r) => r.wouldRun),
    [false]
  )
})

test('release pull requests, the nightly and manual runs are not touched by labels or by their absence', () => {
  for (const input of [
    { event: 'pull_request', baseRef: 'main', changed: ['docs/a.md'] },
    { event: 'pull_request', baseRef: 'staging', changed: ['docs/a.md'] },
    { event: 'workflow_dispatch', changed: null },
    { event: 'schedule', changed: null }
  ]) {
    for (const labels of [[], ['ci:e2e'], ['ci:integration'], null]) {
      const p = planMatrix({ ...input, allFiles: optFiles, readText: optText, labels })
      assert.deepEqual(groups(p), FULL_ROWS, JSON.stringify([input, labels]))
      assert.equal(p.scope.applies, false)
      assert.equal(p.scope.skipDb, false)
      assert.equal(p.scope.record, 'full')
      assert.equal(p.leftOut.length, 0)
    }
  }
})

test('labels that could not be read opt nothing out: the rows a pull request into develop had before', () => {
  const p = optPlan(null)
  assert.deepEqual(groups(p), ['tests e2e', ...RELATED])
  assert.equal(p.scope.applies, true)
  assert.equal(p.scope.labelsKnown, false)
  assert.equal(p.scope.skipDb, false)
  assert.equal(p.scope.record, 'full')
  assert.match(p.scope.why[0], /could not read the labels/)
  // `undefined` — a caller that never heard of labels — is the same as unreadable.
  assert.deepEqual(groups(optPlan(undefined)), ['tests e2e', ...RELATED])
  // And so is an answer that is not a list.
  assert.deepEqual(groups(optPlan('ci:integration')), ['tests e2e', ...RELATED])
})

test('a diff nobody could read, or an empty one, opts nothing out either', () => {
  for (const changed of [null, []]) {
    const p = optPlan([], { changed })
    assert.deepEqual(groups(p), FULL_ROWS, JSON.stringify(changed))
    assert.equal(p.scope.skipDb, false)
    assert.equal(p.leftOut.length, 0)
    assert.equal(p.scope.record, 'full')
  }
})

test('a pull request that edits a database test keeps the database tests, label or not', () => {
  const p = optPlan([], { changed: [DB_TEST] })
  assert.equal(p.scope.skipDb, false)
  assert.deepEqual(p.scope.dbEdited, [DB_TEST])
  assert.deepEqual(p.relatedRun, [DB_TEST])
  // Editing a unit test does not: the database files stay out.
  const unit = optPlan([], { changed: [UNIT_TEST] })
  assert.equal(unit.scope.skipDb, true)
  assert.deepEqual(unit.relatedRun, [UNIT_TEST])
  // A helper that every database test uses is a database file too.
  const helper = 'apps/tracy-web/test/_db.mjs'
  const withHelper = planMatrix({
    event: 'pull_request',
    baseRef: 'develop',
    changed: [helper],
    allFiles: [...optFiles, helper],
    readText: (f) => (f === helper ? DB_TEXT : optText(f)),
    labels: []
  })
  assert.equal(withHelper.scope.skipDb, false)
})

test('a related selection the skip empties is no row at all, as for a documentation-only change', () => {
  // The T4 skill re-pin selects only its declared readers; when all of them need the database and
  // none is asked for, there is nothing left for a `tests related` row to run.
  const p = planOf([`${T4.prefix}SKILL.md`], {
    labels: [],
    readText: (file) => (T4.readers.includes(file) ? DB_TEXT : UNIT_TEXT)
  })
  assert.deepEqual(groups(p), ['checks'])
  assert.deepEqual(p.relatedRun, [])
  assert.equal(p.scope.skipDb, true)
  const labelled = planOf([`${T4.prefix}SKILL.md`], {
    labels: ['ci:integration'],
    readText: (file) => (T4.readers.includes(file) ? DB_TEXT : UNIT_TEXT)
  })
  assert.deepEqual(groups(labelled), RELATED)
})

test('the opt-in applies when the planner would have run every row, except for the unreadable cases', () => {
  // A shared input (the lockfile) makes the related scope uncertain: every row, e2e included, as before
  // the rule. With the rule, the e2e row is still a label's to ask for.
  const p = optPlan([], { changed: ['pnpm-lock.yaml'] })
  assert.equal(p.runsAll, true)
  // The three EmDash rows open Chromium like the e2e row, so they are the label's to ask for as well.
  assert.deepEqual(groups(p), ALWAYS)
  assert.deepEqual(
    p.leftOut.map((r) => [r.group, r.wouldRun]),
    [
      ['tests emdash-business', true],
      ['tests emdash-saas', true],
      ['tests emdash-base', true],
      ['tests e2e', true]
    ]
  )
  assert.equal(p.scope.skipDb, true)
  assert.equal(p.scope.record, 'partial:db+e2e')
  assert.deepEqual(groups(optPlan(['ci:e2e', 'ci:integration'], { changed: ['pnpm-lock.yaml'] })), FULL_ROWS)
})

test('the Turbo rows follow the same rule: the e2e row is a label, and the scope is carried', () => {
  const turboDry = {
    tasks: [
      { package: '@tracy/web', task: 'test:ci:1', cache: { status: 'MISS' } },
      { package: '//', task: 'test:ci:scripts', cache: { status: 'HIT' } }
    ]
  }
  const p = optPlan([], { turboDry })
  assert.deepEqual(groups(p), ['tests web 1/3', 'checks'])
  assert.equal(p.scope.skipDb, true)
  assert.equal(p.leftOut[0].group, 'tests e2e')
  assert.ok(groups(optPlan(['ci:e2e'], { turboDry })).includes('tests e2e'))
})

test('the arguments of the planner now include --scope, and still refuse everything else', () => {
  assert.deepEqual(parsePlanArgs(['--scope']), { mode: 'scope' })
  for (const bad of [['--scope', '--scope'], ['--scope=1'], ['scope'], ['--scopes']]) {
    assert.ok('error' in parsePlanArgs(bad), bad.join(' '))
  }
})

// ── what the plan says it left out ──────────────────────────────────────────────────────────────

test('a change that selects no test says nothing was skipped', () => {
  const docs = optPlan([], { changed: ['docs/references/example.md'] })
  const notes = scopeNotes(docs)
  assert.deepEqual(notes.summary, [])
  assert.deepEqual(notes.warnings, [])
  assert.deepEqual(notes.notices, [])
  assert.equal(databaseTestsLeftOut(docs), null)
  // The same holds for a documentation change that carries a label: still nothing to skip.
  assert.deepEqual(scopeNotes(optPlan(['ci:e2e'], { changed: ['docs/references/example.md'] })).summary, [])
})

test('a change that selects tests names the browser row and the database files it left out', () => {
  const p = optPlan([])
  const notes = scopeNotes(p)
  assert.match(notes.notices.join('\n'), /SKIPPED tests e2e: opt-in .*ci:e2e/)
  assert.match(notes.notices.join('\n'), /SKIPPED database tests: 1 workers test file\(s\) that read /)
  assert.equal(notes.summary.length, 2)
  // The related row skips exactly what its selection loses, so the count is exact, not a bound.
  assert.deepEqual(databaseTestsLeftOut(p), { count: 1, upTo: false })
})

test('rows that take whole shards or owners can lose any database file, so the count is an upper bound', () => {
  const turboDry = {
    tasks: [{ package: '@tracy/web', task: 'test:ci:1', cache: { status: 'MISS' } }]
  }
  assert.deepEqual(databaseTestsLeftOut(optPlan([], { turboDry })), { count: 1, upTo: true })
  assert.match(scopeNotes(optPlan([], { turboDry })).notices.join('\n'), /up to 1 workers test file/)
  const full = optPlan([], { changed: ['pnpm-lock.yaml'] })
  assert.deepEqual(databaseTestsLeftOut(full), { count: 1, upTo: true })
})

test('nothing is announced as skipped when the selection held no database file, or the row would not have run', () => {
  // The related selection is one unit test: no database file was lost, so no claim that one was.
  const unit = optPlan([], { changed: [UNIT_TEST] })
  assert.equal(databaseTestsLeftOut(unit), null)
  assert.ok(!scopeNotes(unit).notices.join('\n').includes('SKIPPED database tests'))
  // A pull request that no e2e path reaches does not say it skipped the browser row.
  const noPath = optPlan([], { changed: ['packages/site/tracy-my-sites/src/a.js'] })
  assert.ok(!scopeNotes(noPath).notices.join('\n').includes('SKIPPED tests e2e'))
})

test('unreadable labels warn once and announce no skip', () => {
  const notes = scopeNotes(optPlan(null))
  assert.equal(notes.warnings.length, 1)
  assert.match(notes.warnings[0], /could not read the labels/)
  assert.deepEqual(notes.summary, [])
})

// ── the EmDash rows are browser rows: they follow `ci:e2e` too (18/10/2026) ─────────────────────

const THEME = 'packages/cms/tracy-emdash-theme-base/src/a.astro'
const emdashPlan = (labels, over = {}) => optPlan(labels, { changed: [THEME], ...over })

test('without ci:e2e a pull request into develop that touches a theme gets no EmDash row', () => {
  const p = emdashPlan([])
  assert.ok(!groups(p).some((g) => g.startsWith('tests emdash-')), groups(p).join(','))
  assert.deepEqual(
    p.leftOut.filter((r) => r.group.startsWith('tests emdash-')).map((r) => [r.group, r.label, r.wouldRun]),
    [['tests emdash-base', 'ci:e2e', true]]
  )
  assert.ok(p.scope.e2eLeftOut)
  assert.equal(p.scope.record, 'partial:db+e2e')
  assert.deepEqual(p.skipped.map((s) => s.group).sort(), ['tests emdash-business', 'tests emdash-saas'])
  // The summary and the notice say it: a person reads why the row is missing, and which label adds it.
  const notes = scopeNotes(p)
  assert.match(notes.notices.join('\n'), /SKIPPED tests emdash-base: opt-in .*ci:e2e/)
})

test('with ci:e2e the EmDash row of the touched theme runs, and only that one', () => {
  const p = emdashPlan(['ci:e2e'])
  assert.ok(groups(p).includes('tests emdash-base'))
  assert.ok(!groups(p).includes('tests emdash-saas'))
  assert.ok(!groups(p).includes('tests emdash-business'))
  assert.equal(p.leftOut.length, 0)
  assert.equal(p.scope.record, 'partial:db')
})

test('a theme that is not touched leaves no trace in leftOut: nothing was lost', () => {
  const p = optPlan([], { changed: ['apps/tracy-web/src/a.js'] })
  assert.deepEqual(
    p.leftOut.map((r) => r.group),
    ['tests e2e']
  )
})

test('an EmDash theme PR with unreadable labels keeps the row: nothing is opted out', () => {
  const p = emdashPlan(null)
  assert.ok(groups(p).includes('tests emdash-base'))
  assert.equal(p.leftOut.length, 0)
})

test('release pull requests, the nightly and manual runs still run every EmDash row without a label', () => {
  for (const input of [
    { event: 'pull_request', baseRef: 'main', changed: [THEME] },
    { event: 'pull_request', baseRef: 'staging', changed: [THEME] },
    { event: 'workflow_dispatch', changed: null },
    { event: 'schedule', changed: null }
  ]) {
    const p = planMatrix({ ...input, allFiles: optFiles, readText: optText, labels: [] })
    for (const g of ['tests emdash-business', 'tests emdash-saas', 'tests emdash-base', 'tests e2e'])
      assert.ok(groups(p).includes(g), `${g} for ${JSON.stringify(input)}`)
    assert.equal(p.leftOut.length, 0)
  }
})
