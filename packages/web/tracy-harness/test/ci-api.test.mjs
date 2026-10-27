import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  sortedRows,
  relativeTime,
  checkLabel,
  executionSummary,
  durationLabel,
  runnerLabel,
  jobDuration
} from '../src/ci-api.ts'

const rows = [
  {
    id: 1,
    author: 'Lee',
    title: 'Backups',
    build: 'Ready',
    queue: 2,
    target: 'develop',
    committedAt: '2026-10-08T10:00:00Z',
    mergedAt: null
  },
  {
    id: 2,
    author: 'David',
    title: 'Navigation',
    build: 'Building',
    queue: 1,
    target: 'develop',
    committedAt: '2026-10-08T09:00:00Z',
    mergedAt: '2026-10-08T10:00:00Z'
  },
  {
    id: 3,
    author: 'Lee',
    title: 'Language',
    build: 'Failed',
    queue: null,
    target: 'develop',
    committedAt: null,
    mergedAt: '2026-10-08T08:00:00Z'
  }
]
const ids = (key, descending = false) => sortedRows(rows, key, descending).map((row) => row.id)
test('table sorts names, commit and merge times both ways with unknown times last', () => {
  assert.deepEqual(ids('author'), [2, 1, 3])
  assert.deepEqual(ids('author', true), [1, 3, 2])
  assert.deepEqual(ids('committedAt'), [2, 1, 3])
  assert.deepEqual(ids('committedAt', true), [1, 2, 3])
  assert.deepEqual(ids('mergedAt'), [3, 2, 1])
  assert.deepEqual(ids('mergedAt', true), [2, 3, 1])
})
test('build sorting follows action order and filtering never rewrites queue positions', () => {
  assert.deepEqual(ids('build'), [3, 2, 1])
  assert.deepEqual(ids('build', true), [1, 2, 3])
  assert.deepEqual(ids('queue'), [2, 1, 3])
  assert.equal(
    sortedRows(
      rows.filter((row) => row.author === 'Lee'),
      'queue',
      true
    )[0].queue,
    2
  )
  assert.deepEqual(
    rows.map((row) => row.id),
    [1, 2, 3]
  )
})
test('relative merge timestamps update from the observation, and check labels are readable', () => {
  const at = Date.parse('2026-10-08T10:00:00Z')
  assert.equal(relativeTime(null, at), '—')
  assert.equal(relativeTime('invalid', at), '—')
  assert.equal(checkLabel({ status: 'IN_PROGRESS', conclusion: null }), 'Running')
  assert.equal(checkLabel({ status: 'COMPLETED', conclusion: 'SUCCESS' }), 'Passed')
  assert.equal(checkLabel({ status: 'COMPLETED', conclusion: 'TIMED_OUT' }), 'Needs attention')
})

const executionJob = (id, overrides = {}) => ({
  id: String(id),
  status: 'IN_PROGRESS',
  conclusion: null,
  startedAt: '2026-10-08T10:00:00Z',
  completedAt: null,
  runner: { id, name: `runner-${id}`, status: 'online', busy: true },
  steps: [{ name: 'Regression checks', status: 'IN_PROGRESS', number: 6 }],
  ...overrides
})
test('execution summaries preserve parallel jobs and measure wall time rather than adding job durations', () => {
  const now = Date.parse('2026-10-08T10:02:00Z')
  const row = {
    build: 'Building',
    execution: {
      complete: true,
      jobs: [executionJob(1), executionJob(2, { startedAt: '2026-10-08T10:01:00Z' })]
    }
  }
  const result = executionSummary(row, now)
  assert.equal(result.step, '2 jobs running')
  assert.equal(result.runner, '2 runners')
  assert.equal(result.duration, 120)
  assert.equal(durationLabel(result.duration), '2 min 0 s')
  assert.equal(
    executionSummary({ ...row, execution: { ...row.execution, complete: false } }, now).duration,
    null
  )
})
test('queued jobs never invent a runner or a duration, and completed job time stops advancing', () => {
  const now = Date.parse('2026-10-08T10:02:00Z')
  const queued = executionSummary(
    {
      build: 'Queued',
      execution: {
        complete: true,
        jobs: [executionJob(1, { status: 'QUEUED', runner: null, startedAt: null, steps: [] })]
      }
    },
    now
  )
  assert.equal(queued.runner, 'Not assigned')
  assert.equal(queued.duration, null)
  assert.match(queued.waitingNote, /Runner not assigned/)
  const finished = executionJob(1, { status: 'COMPLETED', completedAt: '2026-10-08T10:01:00Z' })
  assert.equal(jobDuration(finished, now), 60)
  assert.equal(jobDuration(finished, now + 3600000), 60)
  assert.equal(runnerLabel({ ...finished.runner, status: 'unknown', busy: null }), 'Availability unknown')
  assert.equal(runnerLabel({ ...finished.runner, status: 'offline', busy: false }), 'Offline')
})
test('CI duration sorts in both directions while unknown duration stays last', () => {
  const snapshot = Date.parse('2026-10-08T10:02:00Z')
  const short = {
    id: 1,
    build: 'Building',
    execution: { complete: true, jobs: [executionJob(1, { startedAt: '2026-10-08T10:01:00Z' })] }
  }
  const long = { id: 2, build: 'Building', execution: { complete: true, jobs: [executionJob(2)] } }
  const unknown = { id: 3, build: 'Queued' }
  assert.deepEqual(
    sortedRows([unknown, long, short], 'duration', false, snapshot).map((row) => row.id),
    [1, 2, 3]
  )
  assert.deepEqual(
    sortedRows([short, unknown, long], 'duration', true, snapshot).map((row) => row.id),
    [2, 1, 3]
  )
})

test('different runner IDs with the same display name remain two runners', () => {
  const jobs = [
    executionJob(1, { runner: { id: 1, name: 'shared-name', status: 'online', busy: true } }),
    executionJob(2, { runner: { id: 2, name: 'shared-name', status: 'online', busy: true } })
  ]
  assert.equal(
    executionSummary({ build: 'Building', execution: { jobs, complete: true } }).runner,
    '2 runners'
  )
})

test('queued jobs do not display runners assigned to completed jobs', () => {
  const done = executionJob(1, { status: 'COMPLETED', completedAt: '2026-10-08T10:01:00Z' })
  const queued = executionJob(2, { status: 'QUEUED', runner: null, startedAt: null, steps: [] })
  const row = { build: 'Queued', execution: { complete: true, jobs: [done, queued] } }
  assert.equal(executionSummary(row).runner, 'Not assigned')
  queued.runnerAssignment = 'unknown'
  assert.equal(executionSummary(row).runner, 'Unknown')
  assert.doesNotMatch(executionSummary(row).waitingNote, /Runner not assigned/)
})

test('waiting-to-run filter follows CI jobs independently of merge queue', async () => {
  const { waitingToRun } = await import('../src/ci-api.ts')
  assert.equal(waitingToRun({ build: 'Queued', queue: null }), true)
  assert.equal(
    waitingToRun({ build: 'Building', execution: { jobs: [executionJob(1, { status: 'QUEUED' })] } }),
    true
  )
  assert.equal(waitingToRun({ build: 'Ready', queue: 1 }), false)
  assert.equal(waitingToRun({ build: 'Not started' }), false)
  assert.equal(waitingToRun({ build: 'Queued', merged: true }), false)
})

test('failure guidance distinguishes reported startup and code checks without guessing generic failures', async () => {
  const { failureGuidance } = await import('../src/ci-api.ts')
  const row = {
    build: 'Failed',
    merged: false,
    checks: [{ name: 'Build check', conclusion: 'FAILURE', steps: [] }]
  }
  assert.equal(failureGuidance(row).label, 'Cause not confirmed')
  row.checks[0].conclusion = 'TIMED_OUT'
  assert.equal(failureGuidance(row).label, 'Cause not confirmed')
  row.checks[0].conclusion = 'STARTUP_FAILURE'
  assert.equal(failureGuidance(row).label, 'CI review needed')
  row.checks[0] = { name: 'Regression', conclusion: 'FAILURE', steps: [] }
  assert.equal(failureGuidance(row).label, 'Author review needed')
  row.merged = true
  assert.match(failureGuidance(row).note, /^Merged · checks failed/)
  assert.match(failureGuidance(row).explanation, /do not block/)
  assert.equal(failureGuidance({ build: 'Ready', checks: [] }), null)
})

test('agent handoff includes verified PR context and separates merged failures from pending actions', async () => {
  const { agentIssueText, attentionIssue, needsAttention } = await import('../src/ci-api.ts')
  const row = {
    id: 108,
    title: 'Fix tests',
    url: 'https://github.com/TracyHQ/tch/pull/108',
    commit: 'abc123',
    author: 'Lee',
    target: 'develop',
    state: 'Merged',
    build: 'Failed',
    merged: true,
    checks: [{ name: 'Regression', conclusion: 'FAILURE', steps: [] }]
  }
  assert.equal(needsAttention(row), true)
  assert.match(attentionIssue(row).label, /Merged/)
  const text = agentIssueText(row)
  assert.match(text, /pull\/108/)
  assert.match(text, /abc123/)
  assert.match(text, /Failed checks: Regression/)
  assert.match(text, /do not block/)
  assert.match(text, /Verify the current PR head/)
})

test('lifecycle filters include active jobs and keep merged PRs outside running stages', async () => {
  const { matchesPrFilter, prFilters } = await import('../src/ci-api.ts')
  assert.deepEqual(prFilters.slice(1, 7), [
    'Draft',
    'Ready',
    'Waiting to run',
    'Checking/Testing',
    'Ready to merge',
    'Merged / Building image'
  ])
  assert.equal(matchesPrFilter({ merged: false, state: 'Draft', build: 'Building' }, 'Draft'), true)
  assert.equal(matchesPrFilter({ merged: false, state: 'Ready to merge' }, 'Draft'), false)
  assert.equal(matchesPrFilter({ merged: true, state: 'Draft' }, 'Draft'), false)
  assert.equal(matchesPrFilter({ merged: false, build: 'Building' }, 'Checking/Testing'), true)
  assert.equal(
    matchesPrFilter(
      { merged: false, build: 'Queued', execution: { jobs: [executionJob(1)] } },
      'Checking/Testing'
    ),
    true
  )
  assert.equal(matchesPrFilter({ merged: true, build: 'Building' }, 'Checking/Testing'), false)
  assert.equal(matchesPrFilter({ merged: false, build: 'Queued' }, 'Checking/Testing'), false)
  assert.equal(matchesPrFilter({ merged: false, state: 'Ready to merge' }, 'Ready to merge'), true)
  assert.equal(matchesPrFilter({ merged: true, deployment: { stage: 'Merged' } }, 'Merged'), true)
})

test('live PR observations mark only newly added rows, not initial rows, updates or reappearing rows', async () => {
  const { observePrIds } = await import('../src/ci-api.ts')
  const first = observePrIds(null, [{ id: 1 }, { id: 2 }])
  assert.deepEqual(first.added, [])
  const next = observePrIds(first.seen, [{ id: 1 }, { id: 2 }, { id: 3 }])
  assert.deepEqual(next.added, [3])
  const missing = observePrIds(next.seen, [{ id: 1 }])
  assert.deepEqual(observePrIds(missing.seen, [{ id: 1 }, { id: 2 }, { id: 3 }]).added, [])
  assert.deepEqual(observePrIds(new Set(), [{ id: 4 }]).added, [4])
})

test('bulk agent handoff groups visible issues by author and excludes healthy PRs', async () => {
  const { agentIssuesText } = await import('../src/ci-api.ts')
  const issue = (id, author) => ({
    id,
    author,
    title: `Issue ${id}`,
    url: `https://github.com/TracyHQ/tch/pull/${id}`,
    commit: `head-${id}`,
    target: 'develop',
    state: 'Needs a fix',
    build: 'Failed',
    checks: [{ name: 'Regression', conclusion: 'FAILURE', steps: [] }]
  })
  const text = agentIssuesText([
    issue(1, 'Lee'),
    issue(2, 'David'),
    issue(3, 'Lee'),
    { ...issue(4, 'Lee'), build: 'Ready', state: 'Ready to merge', checks: [] }
  ])
  assert.match(text, /Author: Lee · 2 issue\(s\)/)
  assert.match(text, /Author: David · 1 issue\(s\)/)
  assert.ok(text.indexOf('PR #3') < text.indexOf('PR #2'), 'each author has one contiguous group')
  for (const id of [1, 2, 3]) assert.match(text, new RegExp(`Latest observed commit: head-${id}`))
  assert.doesNotMatch(text, /PR #4/)
  assert.doesNotMatch(agentIssuesText([issue(2, 'David')]), /Author: Lee/)
  assert.equal(agentIssuesText([]), '')
})

test('post-merge filters require observed deployment stage and keep open PRs out', async () => {
  const { matchesPrFilter } = await import('../src/ci-api.ts')
  assert.equal(matchesPrFilter({ merged: true, deployment: { stage: 'Merged' } }, 'Merged'), true)
  assert.equal(matchesPrFilter({ merged: false, deployment: { stage: 'Merged' } }, 'Merged'), false)
  for (const stage of ['Building image', 'Deploying', 'Live']) {
    assert.equal(matchesPrFilter({ merged: true, deployment: { stage } }, stage), true)
    assert.equal(matchesPrFilter({ merged: true, deployment: { stage } }, 'Merged'), false)
    assert.equal(matchesPrFilter({ merged: false, deployment: { stage } }, stage), false)
    assert.equal(matchesPrFilter({ merged: true, deployment: { stage: 'Merged' } }, stage), false)
  }
})

test('release clocks use stage job timestamps, ignore queued jobs and stop at completion', async () => {
  const { releaseDuration } = await import('../src/ci-api.ts')
  const now = Date.parse('2026-10-08T17:20:00Z')
  const build = { name: 'build', status: 'IN_PROGRESS', startedAt: '2026-10-08T17:17:00Z', completedAt: null }
  const deploy = {
    name: 'deploy-dev',
    status: 'IN_PROGRESS',
    startedAt: '2026-10-08T17:19:00Z',
    completedAt: null
  }
  const row = {
    committedAt: '2026-10-08T16:00:00Z',
    deployment: { stage: 'Building image', checks: [build, deploy] }
  }
  assert.equal(releaseDuration(row, now), 180)
  assert.equal(releaseDuration(row, now + 1000), 181)
  assert.equal(releaseDuration(row, now, 'Deploying'), 60)
  row.deployment.checks.push({ ...build, status: 'QUEUED', startedAt: '2026-10-08T16:00:00Z' })
  assert.equal(releaseDuration(row, now), 180)
  build.status = 'COMPLETED'
  build.completedAt = '2026-10-08T17:18:00Z'
  assert.equal(releaseDuration(row, now + 600000), 60)
  row.deployment.checks = [{ ...build, status: 'QUEUED' }]
  assert.equal(releaseDuration(row, now), null)
  row.deployment.checks = [{ ...build, completedAt: null }]
  assert.equal(releaseDuration(row, now), null)
  assert.equal(releaseDuration(row, now, 'Live'), null)
})

test('table duration and sorting follow deployment stage instead of historical PR checks', async () => {
  const { rowDuration, sortedRows } = await import('../src/ci-api.ts')
  const now = Date.parse('2026-10-08T17:20:00Z')
  const row = {
    id: 1,
    merged: true,
    deployment: {
      stage: 'Deploying',
      checks: [
        {
          name: 'build',
          status: 'COMPLETED',
          startedAt: '2026-10-08T16:00:00Z',
          completedAt: '2026-10-08T17:00:00Z'
        },
        { name: 'deploy-dev', status: 'IN_PROGRESS', startedAt: '2026-10-08T17:19:00Z', completedAt: null }
      ]
    }
  }
  assert.equal(rowDuration(row, now), 60)
  const older = { ...row, id: 2, deployment: { ...row.deployment, stage: 'Building image' } }
  assert.equal(rowDuration(older, now), 3600)
  assert.deepEqual(
    sortedRows([older, row], 'duration', false, now).map((r) => r.id),
    [1, 2]
  )
  row.deployment.stage = 'Live'
  row.deployment.checks[1].status = 'COMPLETED'
  row.deployment.checks[1].completedAt = '2026-10-08T17:19:30Z'
  assert.equal(rowDuration(row, now + 600000), 30)
  row.deployment.stage = 'Merged'
  assert.equal(rowDuration(row, now), null)
})

test('filter timestamps reflect stage events and Live sorting uses the last target deployment completion', async () => {
  const { filterTime, filterTimeColumn, sortedRows } = await import('../src/ci-api.ts')
  const row = {
    id: 1,
    committedAt: '2026-10-08T16:00:00Z',
    mergedAt: '2026-10-08T17:00:00Z',
    checks: [{ status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: '2026-10-08T16:59:00Z' }],
    execution: { jobs: [{ status: 'IN_PROGRESS', startedAt: '2026-10-08T16:30:00Z' }] },
    deployment: {
      stage: 'Live',
      checks: [
        {
          name: 'build',
          status: 'COMPLETED',
          conclusion: 'SUCCESS',
          startedAt: '2026-10-08T17:01:00Z',
          completedAt: '2026-10-08T17:05:00Z'
        },
        {
          name: 'deploy-dev',
          status: 'COMPLETED',
          conclusion: 'SUCCESS',
          startedAt: '2026-10-08T17:06:00Z',
          completedAt: '2026-10-08T17:07:00Z'
        },
        {
          name: 'deploy-dev',
          status: 'COMPLETED',
          conclusion: 'SUCCESS',
          startedAt: '2026-10-08T17:08:00Z',
          completedAt: '2026-10-08T17:09:00Z'
        }
      ]
    }
  }
  for (const [filter, time] of [
    ['All PRs', '16:00'],
    ['Draft', '16:00'],
    ['Checking/Testing', '16:30'],
    ['Ready to merge', '16:59'],
    ['Merged', '17:00'],
    ['Building image', '17:01'],
    ['Deploying', '17:06'],
    ['Live', '17:09']
  ]) {
    assert.equal(Date.parse(filterTime(row, filter)), Date.parse(`2026-10-08T${time}:00Z`))
  }
  assert.equal(filterTimeColumn('Live').label, 'Live at')
  assert.equal(filterTime(row, 'Waiting to run'), null)
  assert.equal(filterTime(row, 'Needs attention'), null)
  const missing = { ...row, id: 2, deployment: { stage: 'Live', checks: [] } }
  assert.equal(filterTime(missing, 'Live'), null)
  const newer = {
    ...row,
    id: 3,
    deployment: {
      stage: 'Live',
      checks: [{ ...row.deployment.checks[1], completedAt: '2026-10-08T17:10:00Z' }]
    }
  }
  assert.deepEqual(
    sortedRows([missing, row, newer], 'committedAt', true, Date.now(), 'Live').map((r) => r.id),
    [3, 1, 2]
  )
  row.deployment.checks[2].completedAt = null
  assert.equal(filterTime(row, 'Live'), null)
})

test('Ready follows Draft before recorded CI and includes the combined image stage', async () => {
  const { matchesPrFilter, prStages } = await import('../src/ci-api.ts')
  assert.deepEqual(prStages, [
    'Draft',
    'Ready',
    'Waiting to run',
    'Checking/Testing',
    'Ready to merge',
    'Merged / Building image',
    'Deploying',
    'Live'
  ])
  const row = {
    merged: false,
    state: 'Waiting to start',
    build: 'Not started',
    checksComplete: true,
    checks: []
  }
  assert.equal(matchesPrFilter(row, 'Ready'), true)
  assert.equal(matchesPrFilter({ ...row, state: 'Draft' }, 'Ready'), false)
  assert.equal(matchesPrFilter({ ...row, merged: true }, 'Ready'), false)
  assert.equal(matchesPrFilter({ ...row, checksComplete: false }, 'Ready'), false)
  assert.equal(matchesPrFilter({ ...row, build: 'Queued' }, 'Ready'), false)
  assert.equal(matchesPrFilter({ ...row, build: 'Building' }, 'Ready'), false)
  assert.equal(matchesPrFilter({ ...row, build: 'Ready', state: 'Ready to merge' }, 'Ready'), false)
  assert.equal(
    matchesPrFilter(
      {
        ...row,
        build: 'Incomplete',
        checks: [{ workflow: 'Tracy CI', status: 'COMPLETED', conclusion: 'CANCELLED' }]
      },
      'Ready'
    ),
    false
  )
  assert.equal(matchesPrFilter({ ...row, execution: { jobs: [executionJob(1)] } }, 'Ready'), false)
})

test('Step column follows grouped release phases, prioritizes running jobs and sorts unknown stages last', async () => {
  const { prStep, sortedRows, ciColumns } = await import('../src/ci-api.ts')
  assert.deepEqual(
    ciColumns()
      .slice(0, 3)
      .map((c) => c.label),
    ['PR', 'Step', 'Brief']
  )
  const base = {
    id: 1,
    merged: false,
    state: 'Waiting to start',
    build: 'Not started',
    checksComplete: true,
    checks: []
  }
  const cases = [
    [{ ...base, state: 'Draft' }, 0],
    [base, 1],
    [{ ...base, build: 'Queued' }, 2],
    [{ ...base, build: 'Building' }, 3],
    [{ ...base, build: 'Ready', state: 'Ready to merge' }, 4]
  ]
  for (const [row, index] of cases) assert.equal(prStep(row).index, index)
  for (const [stage, index] of [
    ['Merged', 5],
    ['Building image', 5],
    ['Deploying', 6],
    ['Live', 7]
  ]) {
    assert.equal(prStep({ ...base, merged: true, deployment: { stage } }).index, index)
  }
  assert.equal(prStep({ ...base, build: 'Queued', execution: { jobs: [executionJob(1)] } }).index, 3)
  const unknown = { ...base, id: 2, build: 'Unknown', checksComplete: false }
  assert.equal(prStep(unknown), null)
  const live = { ...base, id: 3, merged: true, deployment: { stage: 'Live' } }
  assert.deepEqual(
    sortedRows([unknown, live, base], 'step', false).map((r) => r.id),
    [1, 3, 2]
  )
  assert.deepEqual(
    sortedRows([unknown, live, base], 'step', true).map((r) => r.id),
    [3, 1, 2]
  )
})

test('combined merged/image stage excludes later phases and uses each row actual stage timestamp', async () => {
  const { matchesPrFilter, filterTime, prStep } = await import('../src/ci-api.ts')
  const base = { merged: true, mergedAt: '2026-10-08T17:00:00Z', deployment: { stage: 'Merged', checks: [] } }
  const filter = 'Merged / Building image'
  assert.equal(matchesPrFilter(base, filter), true)
  assert.equal(filterTime(base, filter), base.mergedAt)
  const image = {
    ...base,
    deployment: {
      stage: 'Building image',
      checks: [{ name: 'build', status: 'IN_PROGRESS', startedAt: '2026-10-08T17:01:00Z' }]
    }
  }
  assert.equal(matchesPrFilter(image, filter), true)
  assert.equal(prStep(image).index, 5)
  assert.equal(filterTime(image, filter), '2026-10-08T17:01:00.000Z')
  assert.equal(matchesPrFilter({ ...image, merged: false }, filter), false)
  for (const stage of ['Deploying', 'Live'])
    assert.equal(matchesPrFilter({ ...base, deployment: { stage } }, filter), false)
})

test('custom date filters send inclusive local days as exclusive UTC bounds', async () => {
  const { ciScopeQuery } = await import('../src/ci-api.ts')
  const query = new URLSearchParams(
    ciScopeQuery({
      branch: 'develop',
      dateField: 'merged',
      range: 'custom',
      from: '2026-10-08',
      to: '2026-10-09'
    })
  )
  assert.equal(query.get('branch'), 'develop')
  assert.equal(query.get('dateField'), 'merged')
  assert.equal(query.get('from'), new Date('2026-10-08T00:00:00').toISOString())
  const next = new Date('2026-10-09T00:00:00')
  next.setDate(next.getDate() + 1)
  assert.equal(query.get('to'), next.toISOString())
  const quick = new URLSearchParams(
    ciScopeQuery({ branch: 'All', dateField: 'updated', range: '24h', from: '2026-10-08', to: '2026-10-09' })
  )
  assert.equal(quick.has('from'), false)
  assert.equal(quick.has('to'), false)
})

test('CI words come from the screen translator; server values it does not know stay verbatim', async () => {
  const { buildLabel, stateLabel, filterCompactLabel, ciMessage, checkLabel } = await import(
    '../src/ci-api.ts'
  )
  const t = (key, params) => `<${key}${params ? JSON.stringify(params) : ''}>`
  assert.equal(buildLabel('Building', t), '<ci.build.building>')
  assert.equal(stateLabel('Some new server state', t), 'Some new server state')
  assert.equal(filterCompactLabel('Ready to merge', t), '<ci.filter.compact.readyToMerge>')
  assert.equal(filterCompactLabel('Draft', t), '<ci.filter.draft>')
  assert.equal(checkLabel({ status: 'IN_PROGRESS', conclusion: null }, t), '<ci.check.running>')
  assert.equal(ciMessage(t, 'ci.message.copied'), '<ci.message.copied>')
  assert.equal(ciMessage(t, 'Failed to fetch'), 'Failed to fetch')
})
