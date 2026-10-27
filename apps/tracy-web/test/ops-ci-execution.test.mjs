import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createExecutionReader } from '../src/ops/ci-execution.js'
import { githubLink, createCiReader } from '../src/ops/ci-github.js'
import { DEFAULT_SOURCE_REPOSITORY as CI_REPO } from '../src/lib/source-repository.js'
const answer = (body) => Response.json(body)
const job = (overrides = {}) => ({
  id: 10,
  run_id: 100,
  run_attempt: 1,
  head_sha: 'head',
  name: 'Check the application',
  status: 'in_progress',
  conclusion: null,
  html_url: 'https://github.com/TracyHQ/tch/actions/runs/100/job/10',
  started_at: '2026-10-08T10:00:00Z',
  completed_at: null,
  runner_id: 57,
  runner_name: 'aws-dev-check-01',
  labels: ['self-hosted', 'tracy-check'],
  steps: [
    {
      name: 'Regression tests',
      number: 6,
      status: 'in_progress',
      conclusion: null,
      started_at: '2026-10-08T10:01:00Z',
      completed_at: null
    }
  ],
  ...overrides
})
const row = (overrides = {}) => ({
  id: 1,
  commit: 'head',
  build: 'Building',
  checksComplete: true,
  checks: [{ id: '10', runId: 100, runAttempt: 1, workflow: 'Tracy CI', conclusion: null, summary: null }],
  ...overrides
})
const runner = { id: 57, name: 'aws-dev-check-01', status: 'online', busy: true }
function reader(fetchImpl, now) {
  return createExecutionReader({
    token: 'private-test-token',
    repo: CI_REPO,
    link: githubLink,
    fetchImpl,
    now
  })
}
test('execution joins the exact check id, run attempt and head SHA, with current runner availability', async () => {
  const result = await reader(async (url, init) => {
    assert.equal(init.method, 'GET')
    assert.ok(url.startsWith('https://api.github.com/repos/TracyHQ/tch/'))
    return answer(
      url.includes('/runners?') ? { total_count: 1, runners: [runner] } : { total_count: 1, jobs: [job()] }
    )
  }).enrich([row()])
  const execution = result.rows[0].execution
  assert.equal(execution.complete, true)
  assert.equal(execution.jobs[0].steps[0].status, 'IN_PROGRESS')
  assert.deepEqual(execution.jobs[0].runner, {
    id: 57,
    name: 'aws-dev-check-01',
    status: 'online',
    busy: true
  })
  assert.ok(!JSON.stringify(result).includes('private-test-token'))
})
test('an old head, old run attempt or different check cannot supply a runner to this PR', async () => {
  for (const overrides of [{ head_sha: 'old' }, { run_attempt: 2 }, { id: 11 }, { run_id: 101 }]) {
    const result = await reader(async (url) =>
      answer(
        url.includes('/runners?')
          ? { total_count: 1, runners: [runner] }
          : { total_count: 1, jobs: [job(overrides)] }
      )
    ).enrich([row()])
    assert.deepEqual(result.rows[0].execution.jobs, [])
    assert.equal(result.rows[0].execution.complete, false)
  }
})
test('queued jobs with no runner stay unassigned; missing runner permission never invents offline', async () => {
  const result = await reader(async (url) =>
    url.includes('/runners?')
      ? new Response('private details', { status: 403 })
      : answer({
          total_count: 1,
          jobs: [job({ runner_id: 0, runner_name: '', status: 'queued', started_at: '2026-10-08T10:00:00Z' })]
        })
  ).enrich([row({ build: 'Queued' })])
  assert.equal(result.rows[0].execution.jobs[0].runner, null)
  assert.equal(result.rows[0].execution.jobs[0].startedAt, null)
  assert.match(result.runnerStatus.error, /Administration read/)
  const assigned = await reader(async (url) =>
    url.includes('/runners?') ? new Response('', { status: 403 }) : answer({ total_count: 1, jobs: [job()] })
  ).enrich([row()])
  assert.equal(assigned.rows[0].execution.jobs[0].runner.status, 'unknown')
  assert.equal(assigned.rows[0].execution.jobs[0].runner.busy, null)
  assert.equal(assigned.rows[0].execution.complete, true)
})
test('job API failure retains PR check data and declares missing job details without secrets', async () => {
  const result = await reader(async (url) =>
    url.includes('/runners?')
      ? answer({ total_count: 0, runners: [] })
      : new Response('private-test-token', { status: 429 })
  ).enrich([row()])
  assert.equal(result.rows[0].build, 'Building')
  assert.equal(result.rows[0].execution.complete, false)
  assert.match(result.rows[0].execution.error, /Job details/)
  assert.ok(!JSON.stringify(result).includes('private-test-token'))
})
test('runner and jobs pagination load later pages and expose truncated data', async () => {
  const first = Array.from({ length: 100 }, (_, i) => job({ id: i + 1000 }))
  const result = await reader(async (url) =>
    answer(
      url.includes('/runners?')
        ? {
            total_count: 101,
            runners: url.endsWith('page=1')
              ? Array.from({ length: 100 }, (_, i) => ({ ...runner, id: i + 1000 }))
              : [runner]
          }
        : { total_count: 101, jobs: url.endsWith('page=1') ? first : [job()] }
    )
  ).enrich([row()])
  assert.equal(result.rows[0].execution.jobs[0].runner.status, 'online')
  assert.equal(result.rows[0].execution.complete, true)
  const truncated = await reader(async (url) =>
    answer(
      url.includes('/runners?') ? { total_count: 0, runners: [] } : { total_count: 99999, jobs: [job()] }
    )
  ).enrich([row()])
  assert.equal(truncated.rows[0].execution.complete, false)
  assert.match(truncated.rows[0].execution.error, /incomplete/)
})
test('readers coalesce active runs, cache completed jobs longer, and do not freeze runner status', async () => {
  let time = 0,
    reads = 0,
    busy = true
  const execution = reader(
    async (url) => {
      reads++
      await new Promise((resolve) => setTimeout(resolve, 2))
      return answer(
        url.includes('/runners?')
          ? { total_count: 1, runners: [{ ...runner, busy }] }
          : {
              total_count: 1,
              jobs: [
                job({ status: 'completed', conclusion: 'success', completed_at: '2026-10-08T10:02:00Z' })
              ]
            }
      )
    },
    () => time
  )
  await Promise.all([execution.enrich([row()]), execution.enrich([row()])])
  assert.equal(reads, 2)
  time = 31000
  busy = false
  const result = await execution.enrich([row()])
  assert.equal(reads, 3)
  assert.equal(result.rows[0].execution.jobs[0].runner.busy, false)
  assert.equal(result.rows[0].execution.jobs[0].measuredAt, '1970-01-01T00:00:00.000Z')
})
test('a bounded first refresh warms remaining PR jobs on the next read without refetching completed runs', async () => {
  let time = 0,
    jobReads = 0
  const execution = reader(
    async (url) => {
      if (url.includes('/runners?')) return answer({ total_count: 0, runners: [] })
      jobReads++
      const runId = Number(url.match(/\/runs\/(\d+)\//)[1])
      return answer({
        total_count: 1,
        jobs: [
          job({
            id: runId + 900,
            run_id: runId,
            status: 'completed',
            conclusion: 'success',
            completed_at: '2026-10-08T10:02:00Z',
            runner_id: 0,
            runner_name: '',
            steps: []
          })
        ]
      })
    },
    () => time
  )
  const rows = Array.from({ length: 100 }, (_, i) =>
    row({
      id: i + 1,
      build: 'Ready',
      checks: [
        { id: String(i + 1000), runId: i + 100, runAttempt: 1, workflow: 'Tracy CI', conclusion: 'SUCCESS' }
      ]
    })
  )
  const first = await execution.enrich(rows)
  assert.equal(jobReads, 80)
  assert.equal(first.rows.filter((row) => row.execution.complete).length, 80)
  time = 1000
  const second = await execution.enrich(rows)
  assert.equal(jobReads, 100)
  assert.equal(second.rows.filter((row) => row.execution.complete).length, 100)
})

test('the default PR reader includes execution observations in list and detail without exposing its token', async () => {
  const pr = {
    number: 1,
    title: 'A change',
    state: 'OPEN',
    isDraft: false,
    headRefOid: 'head',
    baseRefName: 'develop',
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    author: { login: 'lee', databaseId: 1 },
    commits: {
      nodes: [
        {
          commit: {
            oid: 'head',
            committedDate: '2026-10-08T09:59:00Z',
            statusCheckRollup: {
              contexts: {
                pageInfo: { hasNextPage: false },
                nodes: [
                  {
                    __typename: 'CheckRun',
                    databaseId: 10,
                    name: 'build check (checks)',
                    status: 'IN_PROGRESS',
                    conclusion: null,
                    startedAt: '2026-10-08T10:00:00Z',
                    checkSuite: {
                      createdAt: '2026-10-08T10:00:00Z',
                      workflowRun: { databaseId: 100, runAttempt: 1, workflow: { name: 'Tracy CI' } }
                    }
                  }
                ]
              }
            }
          }
        }
      ]
    }
  }
  const ci = createCiReader({
    token: 'private-test-token',
    fetchImpl: async (url, init) => {
      if (url.endsWith('/graphql')) {
        const variables = JSON.parse(init.body).variables
        assert.equal(variables.owner, 'TracyHQ')
        assert.equal(variables.repo, 'tch')
        return answer({
          data: {
            repository: variables.number
              ? { pullRequest: pr }
              : { open: { nodes: [pr], pageInfo: { hasNextPage: false } }, merged: { nodes: [] } }
          }
        })
      }
      return answer(
        url.includes('/runners?') ? { total_count: 1, runners: [runner] } : { total_count: 1, jobs: [job()] }
      )
    }
  })
  const data = await ci.list()
  assert.equal(data.rows[0].execution.jobs[0].runner.name, 'aws-dev-check-01')
  assert.equal(data.rows[0].build, 'Building')
  assert.equal(data.runnerStatus.error, null)
  assert.equal((await ci.detail(1)).execution.jobs[0].steps[0].name, 'Regression tests')
  assert.ok(!JSON.stringify(data).includes('private-test-token'))
})

test('a missing runner id is unknown assignment, not evidence that a job is unassigned', async () => {
  const result = await reader(async (url) =>
    answer(
      url.includes('/runners?')
        ? { total_count: 0, runners: [] }
        : { total_count: 1, jobs: [job({ runner_id: undefined })] }
    )
  ).enrich([row()])
  assert.equal(result.rows[0].execution.jobs[0].runnerAssignment, 'unknown')
  assert.equal(result.rows[0].execution.jobs[0].runner, null)
})
