#!/usr/bin/env node
/**
 * Skip the full Tracy CI suite only when the exact tree already passed a full run — the decision in
 * `scripts/ci/green-tree.mjs`, on runs shaped like the GitHub REST answers, no network.
 *
 *   node --test scripts/test/ci-green-tree.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  SKIP_JOB_PREFIX,
  findProof,
  forcedFullRunOf,
  fullRowJobs,
  planAnnotations,
  proofProblem,
  skipNotice,
  skipNoticeOf,
  testedScopeNotice,
  testedScopeOf,
  testedTreeNotice,
  testedTreeOf
} from '../ci/green-tree.mjs'
import { fullRowSets } from '../ci/plan-ci.mjs'

const REPO = 'TracyHQ/tch'
const TREE = 'c24f1e478a8d979f1f39d9827bcf4d7261cd8252'
const OTHER = 'a'.repeat(40)

let serial = 0
/** A completed, green, same-repo Tracy CI run whose head commit carries `tree`. */
function run(tree = TREE, over = {}) {
  serial += 1
  return {
    id: 1000 + serial,
    run_attempt: 1,
    status: 'completed',
    conclusion: 'success',
    path: '.github/workflows/tracy-ci.yml',
    run_started_at: new Date(Date.UTC(2026, 9, 10, 12, serial)).toISOString(),
    html_url: `https://github.com/${REPO}/actions/runs/${1000 + serial}`,
    repository: { full_name: REPO },
    head_repository: { full_name: REPO },
    head_commit: { tree_id: tree },
    ...over
  }
}
/** The jobs of a full green run: plan, dsh, and every `build check` row a release PR plans. */
const fullJobs = () => [
  { name: 'plan the build-check rows', conclusion: 'success' },
  { name: 'build dsh once for this run', conclusion: 'success' },
  ...fullRowJobs().map((name) => ({ name, conclusion: 'success' })),
  { name: "build dsh once for the nightly's commit", conclusion: 'skipped' }
]
/** `inspect` stand-in: what the API would say about each run's jobs and recorded tested tree. */
const inspector = (byId) => async (r) =>
  byId[r.id] ?? { jobs: fullJobs(), testedTree: TREE, testedScope: 'full' }

test('the full row set is the release set: checks, both test shards, three EmDash suites, e2e', () => {
  assert.deepEqual([...fullRowJobs()].sort(), [
    'build check (checks)',
    'build check (tests 1/2)',
    'build check (tests 2/2)',
    'build check (tests e2e)',
    'build check (tests emdash-base)',
    'build check (tests emdash-business)',
    'build check (tests emdash-saas)'
  ])
})

test('a full green run that tested this exact tree is the proof — the suite is skipped', async () => {
  const proof = run()
  const d = await findProof({ tree: TREE, repo: REPO, runs: [run(OTHER), proof], inspect: inspector({}) })
  assert.equal(d.skip, true)
  assert.equal(d.run.id, proof.id)
  assert.equal(d.run.url, proof.html_url)
})

test('no run whose head carries this tree — the full suite runs', async () => {
  const d = await findProof({ tree: TREE, repo: REPO, runs: [run(OTHER)], inspect: inspector({}) })
  assert.equal(d.skip, false)
  assert.match(d.why, /no green Tracy CI run/)
})

test('one byte different is another tree — never matched by the commit, only by the tree', async () => {
  const near = TREE.slice(0, -1) + '3'
  const d = await findProof({ tree: near, repo: REPO, runs: [run()], inspect: inspector({}) })
  assert.equal(d.skip, false)
})

test('a run that skipped any build check row is no proof (routine PR, or itself a skip run)', async () => {
  const partial = run()
  const jobs = fullJobs().map((j) =>
    j.name === 'build check (tests e2e)' ? { ...j, conclusion: 'skipped' } : j
  )
  const d = await findProof({
    tree: TREE,
    repo: REPO,
    runs: [partial],
    inspect: inspector({ [partial.id]: { jobs, testedTree: TREE, testedScope: 'full' } })
  })
  assert.equal(d.skip, false)
  assert.match(d.why, /tests e2e/)
})

test('a run missing a row entirely is no proof (a `tests related` routine PR run)', async () => {
  const routine = run()
  const jobs = fullJobs().filter((j) => !j.name.startsWith('build check (tests'))
  jobs.push({ name: 'build check (tests related)', conclusion: 'success' })
  const d = await findProof({
    tree: TREE,
    repo: REPO,
    runs: [routine],
    inspect: inspector({ [routine.id]: { jobs, testedTree: TREE, testedScope: 'full' } })
  })
  assert.equal(d.skip, false)
})

test('cancelled, failed or unfinished runs are never proof, whatever their jobs say', async () => {
  for (const over of [
    { conclusion: 'cancelled' },
    { conclusion: 'failure' },
    { conclusion: 'skipped' },
    { status: 'in_progress', conclusion: null }
  ]) {
    const d = await findProof({ tree: TREE, repo: REPO, runs: [run(TREE, over)], inspect: inspector({}) })
    assert.equal(d.skip, false, JSON.stringify(over))
  }
})

test('a run from a fork, or of another workflow file, is never proof', async () => {
  for (const over of [
    { head_repository: { full_name: 'someone/tch' } },
    { repository: { full_name: 'someone/tch' } },
    { path: '.github/workflows/other.yml' }
  ]) {
    const d = await findProof({ tree: TREE, repo: REPO, runs: [run(TREE, over)], inspect: inspector({}) })
    assert.equal(d.skip, false, JSON.stringify(over))
  }
})

test('the head tree only nominates; the tree the run RECORDED as tested decides', async () => {
  // A pull_request run tests the merge with its base: when the base had moved, its head tree is
  // not what it tested, and an old run that recorded nothing proves nothing.
  const merged = run()
  const legacy = run()
  const d = await findProof({
    tree: TREE,
    repo: REPO,
    runs: [merged, legacy],
    inspect: inspector({
      [merged.id]: { jobs: fullJobs(), testedTree: OTHER, testedScope: 'full' },
      [legacy.id]: { jobs: fullJobs(), testedTree: null, testedScope: 'full' }
    })
  })
  assert.equal(d.skip, false)
  assert.match(d.why, /tested tree/)
})

test('the current run is never its own proof', async () => {
  const self = run()
  const d = await findProof({
    tree: TREE,
    repo: REPO,
    runs: [self],
    currentRunId: self.id,
    inspect: inspector({})
  })
  assert.equal(d.skip, false)
})

test('the newest valid proof is named when several exist', async () => {
  const older = run()
  const newer = run()
  const d = await findProof({ tree: TREE, repo: REPO, runs: [older, newer], inspect: inspector({}) })
  assert.equal(d.run.id, newer.id)
})

test('a malformed tree is refused before anything is read', async () => {
  let asked = 0
  const d = await findProof({
    tree: 'HEAD',
    repo: REPO,
    runs: [run()],
    inspect: async () => {
      asked += 1
      return { jobs: fullJobs(), testedTree: TREE, testedScope: 'full' }
    }
  })
  assert.equal(d.skip, false)
  assert.equal(asked, 0)
})

test('proofProblem names what disqualifies a run, null for a valid proof', () => {
  const r = run()
  assert.equal(
    proofProblem({ run: r, jobs: fullJobs(), testedTree: TREE, testedScope: 'full', tree: TREE, repo: REPO }),
    null
  )
  const failed = fullJobs().map((j) =>
    j.name === 'build check (checks)' ? { ...j, conclusion: 'failure' } : j
  )
  assert.match(
    proofProblem({ run: r, jobs: failed, testedTree: TREE, testedScope: 'full', tree: TREE, repo: REPO }),
    /build check \(checks\)/
  )
})

test('the tested-tree record round-trips through the annotation it is written as', () => {
  const line = testedTreeNotice(TREE)
  assert.equal(line, `::notice title=tested tree::${TREE}`)
  assert.equal(testedTreeOf([{ title: 'tested tree', message: TREE }]), TREE)
  assert.equal(testedTreeOf([]), null)
  assert.equal(testedTreeOf([{ title: 'tested tree', message: 'not a tree' }]), null)
  // Two different records in one job: ambiguous, so none.
  assert.equal(
    testedTreeOf([
      { title: 'tested tree', message: TREE },
      { title: 'tested tree', message: OTHER }
    ]),
    null
  )
})

test('the skip record says tree and run in words and parses back', () => {
  const url = `https://github.com/${REPO}/actions/runs/38069623159`
  const line = skipNotice(TREE, url)
  assert.equal(line, `::notice title=full suite skipped::tree ${TREE} already green in run ${url}`)
  assert.deepEqual(
    skipNoticeOf([{ title: 'full suite skipped', message: `tree ${TREE} already green in run ${url}` }]),
    { tree: TREE, runId: 38069623159 }
  )
  assert.equal(skipNoticeOf([{ title: 'full suite skipped', message: 'tree x already green' }]), null)
})

test('a run that left tests out is no proof, even with every release row green and the right tree', async () => {
  // An opt-in run on a pull request into develop keeps every row by name when the planner falls back to
  // the full set, yet drops the database files (and the e2e row, when it is not asked for).
  for (const scope of ['partial:db', 'partial:e2e', 'partial:db+e2e', 'unknown', null, undefined]) {
    const left = run()
    const d = await findProof({
      tree: TREE,
      repo: REPO,
      runs: [left],
      inspect: inspector({ [left.id]: { jobs: fullJobs(), testedTree: TREE, testedScope: scope } })
    })
    assert.equal(d.skip, false, String(scope))
    assert.match(d.why, /tested scope/, String(scope))
  }
})

test('a legacy run, from before the scope was recorded, proves nothing: fail closed', () => {
  const r = run()
  assert.match(
    proofProblem({ run: r, jobs: fullJobs(), testedTree: TREE, tree: TREE, repo: REPO }),
    /tested scope \(none\), not full/
  )
})

test('the tested-scope record round-trips through the annotation it is written as', () => {
  assert.equal(testedScopeNotice('full'), '::notice title=tested scope::full')
  assert.equal(testedScopeOf([{ title: 'tested scope', message: 'full' }]), 'full')
  for (const known of ['partial:db', 'partial:e2e', 'partial:db+e2e'])
    assert.equal(testedScopeOf([{ title: 'tested scope', message: known }]), known)
  assert.equal(testedScopeOf([]), null)
  assert.equal(testedScopeOf(null), null)
  assert.equal(testedScopeOf([{ title: 'tested scope', message: 'everything' }]), null)
  assert.equal(testedScopeOf([{ title: 'tested scope', message: 'unknown' }]), null)
  // Two different records in one job: ambiguous, so none.
  assert.equal(
    testedScopeOf([
      { title: 'tested scope', message: 'full' },
      { title: 'tested scope', message: 'partial:db' }
    ]),
    null
  )
})

test('the plan job records the scope its planner decided, beside the tree', () => {
  const yml = readFileSync(new URL('../../.github/workflows/tracy-ci.yml', import.meta.url), 'utf8')
  assert.ok(
    yml.includes('TRACY_CI_TESTED_SCOPE: ${{ steps.plan.outputs.tested_scope }}'),
    'green-tree.mjs is told what the planner decided'
  )
  const script = readFileSync(new URL('../ci/green-tree.mjs', import.meta.url), 'utf8')
  assert.ok(script.includes('testedScopeNotice(scope)'), 'every run prints the scope notice')
})

test('the workflow is wired to this module: record + lookup in plan, rows gated, skip job named', () => {
  const yml = readFileSync(new URL('../../.github/workflows/tracy-ci.yml', import.meta.url), 'utf8')
  assert.ok(yml.includes('run: node scripts/ci/green-tree.mjs\n'), 'plan runs green-tree.mjs')
  assert.ok(yml.includes('green_run: ${{ steps.green.outputs.green_run }}'), 'plan exposes green_run')
  assert.ok(yml.includes("&& needs.plan.outputs.green_run == ''"), 'build-check rows wait for no proof')
  assert.ok(
    yml.includes(`    name: "${SKIP_JOB_PREFIX}tree \${{ needs.plan.outputs.tree }} already green in run`),
    'the skip job name starts with SKIP_JOB_PREFIX'
  )
  assert.match(
    yml,
    /permissions:\n {6}contents: read\n {6}actions: read\n {6}checks: read\n/,
    'plan may read runs and annotations'
  )
})

// ── a full run on GitHub-hosted runners: three workers shards (30/10/2026) ──────────────────────

/** What the jobs API says of a job GitHub ran on its own `ubuntu-latest`. */
const HOSTED_JOB = { labels: ['ubuntu-latest'], runner_group_name: 'GitHub Actions' }
/** What it says of one of ours. */
const OUR_JOB = {
  labels: ['self-hosted', 'linux', 'tracy-check', 'tracy-lane-dev'],
  runner_group_name: 'Default'
}
/** The jobs of a full green run, every job on one runner kind, with the row set of that kind by default. */
const kindJobs = (job, set = job === HOSTED_JOB ? 'hosted' : 'legacy') => [
  { name: 'plan the build-check rows', conclusion: 'success', ...job },
  { name: 'build dsh once for this run', conclusion: 'success', ...job },
  ...fullRowSets()[set].map((g) => ({ name: `build check (${g})`, conclusion: 'success', ...job }))
]
/** The jobs of a full green run whose rows ran GitHub-hosted: three workers shards, not two. */
const hostedJobs = () => kindJobs(HOSTED_JOB)
const proofOf = (jobs) =>
  proofProblem({ run: run(), jobs, testedTree: TREE, testedScope: 'full', tree: TREE, repo: REPO })

test('the row set must be the one planned for the runner kind the plan job and its rows ran on', () => {
  // Pass: all hosted with three shards; all ours with two (labelled or, as in older fixtures, not).
  assert.equal(proofOf(kindJobs(HOSTED_JOB)), null)
  assert.equal(proofOf(kindJobs(OUR_JOB)), null)
  // The review's case: a hosted plan and hosted rows that are our two-row set, scope full.
  assert.match(String(proofOf(kindJobs(HOSTED_JOB, 'legacy'))), /two workers shards ran GitHub-hosted/)
  // Three shards on our runners are not what our plan makes either.
  assert.match(String(proofOf(kindJobs(OUR_JOB, 'hosted'))), /three workers shards ran self-hosted/)
  // A hosted plan with the two-row set run on our runners: plan and rows disagree.
  const mixed = kindJobs(OUR_JOB, 'legacy')
  Object.assign(mixed[0], HOSTED_JOB)
  assert.match(String(proofOf(mixed)), /different runner kinds .*GitHub-hosted: plan the build-check rows;/)
  // One hosted row among ours is a mix too; a skipped row ran nowhere and is not counted.
  const oneRow = kindJobs(OUR_JOB)
  Object.assign(
    oneRow.find((j) => j.name === 'build check (checks)'),
    HOSTED_JOB
  )
  assert.match(String(proofOf(oneRow)), /different runner kinds/)
  const skipped = kindJobs(OUR_JOB)
  skipped.push({
    name: 'build check (tests related)',
    conclusion: 'skipped',
    labels: [],
    runner_group_name: null
  })
  assert.equal(proofOf(skipped), null)
  // The forced Turbo set is not sized by runner kind, but its jobs must still agree.
  assert.equal(
    proofProblem({
      run: run(),
      jobs: kindJobs(HOSTED_JOB, 'turbo'),
      testedTree: TREE,
      testedScope: 'full',
      tree: TREE,
      repo: REPO,
      forced: true
    }),
    null
  )
})

test('a full GitHub-hosted run is a proof with its three shards, and not with two of them', async () => {
  const proof = run()
  const d = await findProof({
    tree: TREE,
    repo: REPO,
    runs: [proof],
    inspect: inspector({ [proof.id]: { jobs: hostedJobs(), testedTree: TREE, testedScope: 'full' } })
  })
  assert.equal(d.skip, true, d.why)
  // A shard missing is not a full run, whichever count the run had.
  const short = hostedJobs().filter((j) => j.name !== 'build check (tests 2/3)')
  assert.match(
    proofProblem({ run: run(), jobs: short, testedTree: TREE, testedScope: 'full', tree: TREE, repo: REPO }),
    /not a full run/
  )
  // A red shard is red.
  const red = hostedJobs()
  red.find((j) => j.name === 'build check (tests 3/3)').conclusion = 'failure'
  assert.match(
    proofProblem({ run: run(), jobs: red, testedTree: TREE, testedScope: 'full', tree: TREE, repo: REPO }),
    /"build check \(tests 3\/3\)" ended failure/
  )
})

// ── a full run whose tests are the forced Turbo rows (17/10/2026) ───────────────────────────────

/** The jobs of a full green run whose `plan` forced every Turbo row, instead of the two shards. */
const turboJobs = () => [
  { name: 'plan the build-check rows', conclusion: 'success' },
  { name: 'build dsh once for this run', conclusion: 'success' },
  ...fullRowSets().turbo.map((g) => ({ name: `build check (${g})`, conclusion: 'success' }))
]

test('a forced Turbo full run is a proof only with its plan job’s `full run` mark', async () => {
  const proof = run()
  const marked = await findProof({
    tree: TREE,
    repo: REPO,
    runs: [proof],
    inspect: inspector({
      [proof.id]: { jobs: turboJobs(), testedTree: TREE, testedScope: 'full', forced: true }
    })
  })
  assert.equal(marked.skip, true, marked.why)
  // The same rows without the mark: a pull request into develop whose tasks the cache may have served.
  const unmarked = await findProof({
    tree: TREE,
    repo: REPO,
    runs: [run()],
    inspect: async () => ({ jobs: turboJobs(), testedTree: TREE, testedScope: 'full', forced: false })
  })
  assert.equal(unmarked.skip, false)
  assert.match(unmarked.why, /not a full run.*full run` notice/)
  // A red forced row is red.
  const jobs = turboJobs()
  jobs.find((j) => j.name === 'build check (tests packages)').conclusion = 'failure'
  assert.match(
    proofProblem({
      run: run(),
      jobs,
      testedTree: TREE,
      testedScope: 'full',
      tree: TREE,
      repo: REPO,
      forced: true
    }),
    /"build check \(tests packages\)" ended failure/
  )
  // A forced set missing one row is not a full run, mark or not.
  assert.match(
    proofProblem({
      run: run(),
      jobs: turboJobs().filter((j) => j.name !== 'build check (tests scripts)'),
      testedTree: TREE,
      testedScope: 'full',
      tree: TREE,
      repo: REPO,
      forced: true
    }),
    /not a full run/
  )
})

test('the mark is read from the plan job’s annotations, and only its exact form counts', () => {
  assert.equal(forcedFullRunOf([{ title: 'full run', message: 'turbo' }]), true)
  assert.equal(forcedFullRunOf([{ title: 'full run', message: ' turbo\n' }]), true)
  for (const notes of [
    [],
    null,
    [{ title: 'full run', message: 'legacy' }],
    [{ title: 'tested tree', message: 'turbo' }]
  ])
    assert.equal(forcedFullRunOf(notes), false, JSON.stringify(notes))
})

test('a re-run of failed jobs copies the plan job without its notes: they are read from the attempt that ran it', async () => {
  const runOf = { id: 77, run_attempt: 2 }
  const started = '2026-10-17T06:13:00Z'
  const notes = [
    { title: 'tested tree', message: TREE },
    { title: 'full run', message: 'turbo' }
  ]
  const answers = {
    'repos/R/actions/runs/77/attempts/1/jobs?per_page=100': {
      jobs: [{ id: 1, name: 'plan the build-check rows', started_at: started }]
    },
    'repos/R/check-runs/1/annotations?per_page=100': notes,
    'repos/R/check-runs/2/annotations?per_page=100': []
  }
  const asked = []
  const get = async (path) => {
    asked.push(path)
    if (!(path in answers)) throw new Error(`no answer for ${path}`)
    return answers[path]
  }
  // The copy: attempt 2's plan job has a new id and attempt 1's start.
  const copy = [{ id: 2, name: 'plan the build-check rows', started_at: started }]
  const read = await planAnnotations(get, 'R', runOf, copy)
  assert.equal(testedTreeOf(read), TREE)
  assert.equal(forcedFullRunOf(read), true)
  // A plan job that really ran again keeps its own (empty) notes: an older attempt never stands in.
  const rerun = [{ id: 2, name: 'plan the build-check rows', started_at: '2026-10-17T07:02:00Z' }]
  assert.deepEqual(await planAnnotations(get, 'R', runOf, rerun), [])
  // A first attempt asks for no other attempt.
  asked.length = 0
  await planAnnotations(get, 'R', { id: 77, run_attempt: 1 }, [
    { id: 1, name: 'plan the build-check rows', started_at: started }
  ])
  assert.deepEqual(asked, ['repos/R/check-runs/1/annotations?per_page=100'])
  // No plan job, no notes.
  assert.deepEqual(await planAnnotations(get, 'R', runOf, []), [])
})
