import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  prOf,
  checksOf,
  createCiReader,
  CI_LIST_QUERY,
  CI_DETAIL_QUERY,
  githubLink
} from '../src/ops/ci-github.js'
import { ciRoutes } from '../src/ops/ci.js'
import { mintSession } from '../src/lib/session.js'

function check({
  id = 1,
  name = 'build check (checks)',
  status = 'COMPLETED',
  conclusion = 'SUCCESS',
  runId = 10,
  workflow = 'Tracy CI',
  at = '2026-10-08T10:00:00Z'
} = {}) {
  return {
    __typename: 'CheckRun',
    databaseId: id,
    name,
    status,
    conclusion,
    startedAt: status === 'QUEUED' ? null : at,
    completedAt: status === 'COMPLETED' ? at : null,
    detailsUrl: 'https://github.com/TracyHQ/tch/actions/runs/10/job/1',
    summary: null,
    checkSuite: {
      createdAt: at,
      workflowRun: { databaseId: runId, runAttempt: 1, workflow: { name: workflow } }
    }
  }
}
function raw(overrides = {}) {
  return {
    number: 1,
    title: 'A change',
    state: 'OPEN',
    isDraft: false,
    headRefOid: 'abc',
    baseRefName: 'develop',
    mergedAt: null,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    reviewDecision: null,
    author: { login: 'lee', name: 'Lee', databaseId: 1 },
    mergeQueue: null,
    mergeQueueEntry: null,
    commits: {
      nodes: [
        {
          commit: {
            oid: 'abc',
            committedDate: '2026-10-08T09:59:00Z',
            statusCheckRollup: { contexts: { pageInfo: { hasNextPage: false }, nodes: [check()] } }
          }
        }
      ]
    },
    ...overrides
  }
}
const commitWith = (nodes, complete = true, oid = 'abc') => ({
  nodes: [
    {
      commit: {
        oid,
        committedDate: '2026-10-08T09:59:00Z',
        statusCheckRollup: { contexts: { nodes, pageInfo: { hasNextPage: !complete } } }
      }
    }
  ]
})
const listResponse = (records) => ({
  data: {
    repository: {
      open: { nodes: records, pageInfo: { hasNextPage: false, endCursor: null } },
      merged: { nodes: [] }
    }
  }
})
const answer = (body) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

test('green Tracy CI permits ready while optional nightly jobs are skipped', () => {
  const p = prOf(
    raw({ commits: commitWith([check(), check({ id: 2, name: 'nightly verdict', conclusion: 'SKIPPED' })]) })
  )
  assert.equal(p.build, 'Ready')
  assert.equal(p.state, 'Ready to merge')
  assert.equal(p.queue, null)
  assert.ok(p.progress.value < 100)
  assert.match(p.next, /no GitHub merge queue/)
})
test('a green old SHA, truncated checks, or a skipped-only CI can never report Ready', () => {
  for (const commits of [
    commitWith([check()], true, 'old'),
    commitWith([check()], false),
    commitWith([check({ conclusion: 'SKIPPED' })]),
    commitWith([check({ workflow: 'PR Description Check' })])
  ]) {
    const p = prOf(raw({ commits }))
    assert.notEqual(p.build, 'Ready')
    assert.notEqual(p.state, 'Ready to merge')
    assert.ok((p.progress?.value ?? 0) < 100)
  }
})
test('reruns replace old successes, including obsolete job names from the previous workflow run', () => {
  const commits = commitWith([
    check({ id: 1, runId: 10 }),
    check({ id: 2, name: 'old extra job', runId: 10 }),
    check({ id: 3, runId: 11, status: 'QUEUED', conclusion: null, at: '2026-10-08T10:05:00Z' })
  ])
  const p = prOf(raw({ commits }))
  assert.equal(p.checks.length, 1)
  assert.equal(p.checks[0].id, '3')
  assert.equal(p.build, 'Queued')
  assert.equal(p.progress, null)
})
test('failure, cancellation, review requirements and conflicts each explain the next action', () => {
  const cases = [
    [{ commits: commitWith([check({ conclusion: 'FAILURE' })]) }, 'Needs a fix'],
    [{ commits: commitWith([check({ conclusion: 'CANCELLED' })]) }, 'Checks incomplete'],
    [{ reviewDecision: 'REVIEW_REQUIRED' }, 'Waiting for review'],
    [{ reviewDecision: 'CHANGES_REQUESTED' }, 'Changes requested'],
    [{ mergeable: 'CONFLICTING' }, 'Merge conflict'],
    [{ mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN' }, 'Merge blocked']
  ]
  for (const [input, state] of cases) {
    const p = prOf(raw(input))
    assert.equal(p.state, state)
    assert.ok(p.next.length > 10)
    assert.ok(p.progress.value < 100)
  }
})
test('draft and unstarted PRs retain an ordinary border; only merged PRs finish', () => {
  assert.equal(prOf(raw({ isDraft: true })).progress, null)
  assert.equal(prOf(raw({ commits: commitWith([]) })).progress, null)
  const p = prOf(raw({ state: 'MERGED', mergedAt: '2026-10-08T10:06:00Z' }))
  assert.equal(p.progress.value, 100)
  assert.equal(p.progress.tone, 'done')
  assert.equal(p.deployment.label, 'Not confirmed')
})
test('queue position and ETA are carried only from GitHub, without deriving order from timestamps', () => {
  const p = prOf(
    raw({
      mergeQueue: { id: 'queue' },
      mergeQueueEntry: {
        position: 4,
        enqueuedAt: '2026-10-08T10:06:00Z',
        estimatedTimeToMerge: 90,
        state: 'QUEUED'
      }
    })
  )
  assert.equal(p.queue, 4)
  assert.equal(p.estimateSeconds, 90)
  assert.equal(p.queueEnabled, true)
  assert.equal(prOf(raw()).estimateSeconds, null)
})
test('merge is still complete when deployment fails on the exact merge commit', () => {
  const p = prOf(
    raw({
      mergedAt: '2026-10-08T10:06:00Z',
      mergeCommit: commitWith([
        check({ workflow: 'build-app-images', name: 'deploy-dev', conclusion: 'FAILURE' })
      ]).nodes[0].commit
    })
  )
  assert.equal(p.progress.value, 100)
  assert.equal(p.deployment.label, 'Deployment failed')
})
test('only links to this repository on HTTPS GitHub are exposed', () => {
  for (const value of [
    'javascript:alert(1)',
    'https://github.com.evil.test/TracyHQ/tch/1',
    'https://github.com/other/repo',
    'http://github.com/TracyHQ/tch/pull/1'
  ])
    assert.equal(githubLink(value), null)
  assert.equal(githubLink('https://github.com/TracyHQ/tch/pull/1'), 'https://github.com/TracyHQ/tch/pull/1')
})
test('after cutover the reader asks GitHub about the configured repository and links its pull requests', async () => {
  const asked = []
  const reader = createCiReader({
    executionReader: null,
    deliveryReader: null,
    token: 'x',
    repo: 'TracyHQ/tracy',
    fetchImpl: async (_url, init) => {
      asked.push(JSON.parse(init.body).variables)
      return answer(listResponse([raw({ commits: commitWith([check()]) })]))
    }
  })
  const body = await reader.list()
  assert.deepEqual([asked[0].owner, asked[0].repo], ['TracyHQ', 'tracy'])
  assert.equal(body.rows[0].url, 'https://github.com/TracyHQ/tracy/pull/1')
  assert.equal(
    githubLink('https://github.com/TracyHQ/tracy/pull/1'),
    'https://github.com/TracyHQ/tracy/pull/1'
  )
})
test('legacy status contexts and check conclusions keep their real failure state', () => {
  const nodes = [
    {
      __typename: 'StatusContext',
      context: 'external',
      state: 'ERROR',
      description: 'External test failed',
      createdAt: '2026-10-08T10:00:00Z'
    }
  ]
  assert.equal(checksOf(commitWith(nodes).nodes[0].commit).checks[0].conclusion, 'ERROR')
  assert.equal(prOf(raw({ commits: commitWith(nodes) })).build, 'Failed')
})
test('cache coalesces readers, preserves the observed timestamp on failure, and never returns credentials', async () => {
  let calls = 0,
    time = Date.parse('2026-10-08T10:00:00Z'),
    fail = false
  const reader = createCiReader({
    executionReader: null,
    token: 'private-token',
    now: () => time,
    fetchImpl: async (url, init) => {
      calls++
      assert.equal(url, 'https://api.github.com/graphql')
      assert.equal(init.headers.authorization, 'Bearer private-token')
      if (fail) throw Error('offline')
      return answer(listResponse([raw()]))
    }
  })
  const results = await Promise.all([reader.list(), reader.list(), reader.list()])
  assert.equal(calls, 1)
  assert.ok(!JSON.stringify(results).includes('private-token'))
  const measured = results[0].measuredAt
  time += 31000
  fail = true
  const stale = await reader.list()
  assert.equal(stale.stale, true)
  assert.equal(stale.measuredAt, measured)
  assert.equal(stale.rows.length, 1)
  assert.ok(stale.error)
  await reader.list()
  assert.equal(calls, 2)
})
test('missing access and partial GraphQL errors produce no invented data', async () => {
  let calls = 0
  const missing = createCiReader({
    executionReader: null,
    token: null,
    fetchImpl: async () => {
      calls++
    }
  })
  const body = await missing.list()
  assert.equal(calls, 0)
  assert.equal(body.configured, false)
  assert.equal(body.measuredAt, null)
  assert.deepEqual(body.rows, [])
  const denied = createCiReader({
    executionReader: null,
    token: 'x',
    fetchImpl: async () => answer({ ...listResponse([raw()]), errors: [{ message: 'Forbidden' }] })
  })
  const partial = await denied.list()
  assert.deepEqual(partial.rows, [])
  assert.ok(partial.error)
})
test('open PR pagination uses GitHub cursors and merged PRs are deduplicated', async () => {
  let calls = 0
  const reader = createCiReader({
    executionReader: null,
    token: 'x',
    fetchImpl: async (_url, init) => {
      const variables = JSON.parse(init.body).variables
      calls++
      if (calls === 1) {
        assert.equal(variables.cursor, null)
        const b = listResponse([raw()])
        b.data.repository.open.pageInfo = { hasNextPage: true, endCursor: 'next' }
        return answer(b)
      }
      assert.equal(variables.cursor, 'next')
      return answer(listResponse([raw(), raw({ number: 2 })]))
    }
  })
  const body = await reader.list()
  assert.equal(calls, 2)
  assert.deepEqual(
    body.rows.map((row) => row.id),
    [1, 2]
  )
})
test('detail steps attach only to the same head SHA and actual check id', async () => {
  const p = raw()
  p.head = {
    nodes: [
      {
        commit: {
          oid: 'abc',
          statusCheckRollup: {
            contexts: {
              nodes: [
                {
                  databaseId: 1,
                  steps: {
                    pageInfo: { hasNextPage: false },
                    nodes: [{ name: 'Run tests', number: 1, status: 'IN_PROGRESS', conclusion: null }]
                  }
                }
              ]
            }
          }
        }
      }
    ]
  }
  const reader = createCiReader({
    executionReader: null,
    token: 'x',
    fetchImpl: async () => answer({ data: { repository: { pullRequest: p } } })
  })
  const detail = await reader.detail(1)
  assert.equal(detail.checks[0].steps[0].name, 'Run tests')
})
test('queries request this repository and never contain mutations', () => {
  for (const query of [CI_LIST_QUERY, CI_DETAIL_QUERY]) {
    assert.ok(query.includes('repository(owner:$owner,name:$repo)'))
    assert.ok(!query.includes('mutation'))
  }
})
const config = { origin: 'http://tracy.test', sessionSecret: 's'.repeat(32), secure: false }
async function route({ role = 'developer', subject = '1' } = {}) {
  let reads = 0
  const pool = {
    query: async (sql) =>
      sql.includes('select sw.role')
        ? { rows: role ? [{ role }] : [] }
        : { rows: [{ subject, display_name: 'Lee', email: 'ceo@tracy.ai' }] }
  }
  const app = ciRoutes({
    pool,
    config,
    reader: {
      list: async () => {
        reads++
        return { rows: [prOf(raw())], measuredAt: '2026-10-08T10:00:00Z' }
      },
      detail: async () => prOf(raw())
    }
  })
  const cookie = `tracy_sess=${await mintSession('ceo@tracy.ai', config.sessionSecret)}`
  return { app, cookie, reads: () => reads }
}
test('signed-out and nonstaff requests never reach GitHub, including detail URLs', async () => {
  const h = await route()
  const out = await h.app.request('http://tracy.test/api/ops/ci')
  assert.equal(out.status, 302)
  assert.equal(h.reads(), 0)
  const denied = await route({ role: null })
  const forbidden = await denied.app.request('http://tracy.test/api/ops/ci', {
    headers: { cookie: denied.cookie }
  })
  assert.equal(forbidden.status, 403)
  assert.equal(await forbidden.text(), '')
  assert.equal(denied.reads(), 0)
  const detail = await denied.app.request('http://tracy.test/api/ops/ci/1', {
    headers: { cookie: denied.cookie }
  })
  assert.equal(detail.status, 403)
})
test('staff may read; default member mapping uses GitHub subject rather than a display name', async () => {
  const h = await route()
  const response = await h.app.request('http://tracy.test/api/ops/ci', { headers: { cookie: h.cookie } })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const b = await response.json()
  assert.equal(b.viewer.authorId, '1')
  assert.equal(b.members[0].id, '1')
  const invalid = await h.app.request('http://tracy.test/api/ops/ci/not-a-pr', {
    headers: { cookie: h.cookie }
  })
  assert.equal(invalid.status, 400)
})

test('skipping the required checks job cannot make a PR Ready', () => {
  const row = prOf(
    raw({
      commits: commitWith([check({ conclusion: 'SKIPPED' }), check({ id: 2, name: 'build check (tests)' })])
    })
  )
  assert.notEqual(row.build, 'Ready')
})

test('staging release PRs are included and deployment targets staging', async () => {
  const record = raw({
    baseRefName: 'staging',
    mergedAt: '2026-10-08T11:00:00Z',
    mergeCommit: {
      statusCheckRollup: {
        contexts: {
          pageInfo: { hasNextPage: false },
          nodes: [check({ workflow: 'build-app-images', name: 'deploy-staging' })]
        }
      }
    }
  })
  const reader = createCiReader({
    executionReader: null,
    token: 'test',
    fetchImpl: async () => answer(listResponse([record]))
  })
  assert.equal((await reader.list()).rows[0].target, 'staging')
  assert.equal(prOf(record).deployment.label, 'Deployment checks passed (staging)')
})

test('a new list observation invalidates cached detail even when the commit is unchanged', async () => {
  let time = 0,
    reads = 0
  const good = raw()
  const bad = raw({ commits: commitWith([check({ conclusion: 'FAILURE' })]) })
  const reader = createCiReader({
    executionReader: null,
    token: 'test',
    now: () => time,
    fetchImpl: async (_url, init) => {
      reads++
      const isDetail = JSON.parse(init.body).variables.number != null
      const record = time ? bad : good
      return answer(isDetail ? { data: { repository: { pullRequest: record } } } : listResponse([record]))
    }
  })
  await reader.list()
  assert.equal((await reader.detail(1)).build, 'Ready')
  time = 31000
  await reader.list()
  assert.equal((await reader.detail(1)).build, 'Failed')
  assert.equal(reads, 4)
})

test('post-merge stages follow exact merge checks and never infer Live from merge or partial results', () => {
  const row = (checks, complete = true) =>
    prOf(
      raw({
        mergedAt: '2026-10-08T10:06:00Z',
        mergeCommit: commitWith(checks, complete, 'merge-sha').nodes[0].commit
      })
    )
  const build = (status = 'IN_PROGRESS', conclusion = null, workflow = 'build-app-images') =>
    check({ id: 20, name: 'build', workflow, status, conclusion })
  const deploy = (status = 'IN_PROGRESS', conclusion = null, workflow = 'build-app-images') =>
    check({ id: 21, name: 'deploy-dev', workflow, status, conclusion })
  assert.equal(row([]).deployment.stage, 'Merged')
  assert.equal(row([build()]).deployment.stage, 'Building image')
  assert.equal(row([build('COMPLETED', 'SUCCESS'), deploy()]).deployment.stage, 'Deploying')
  assert.equal(row([build('COMPLETED', 'SUCCESS'), deploy('COMPLETED', 'SUCCESS')]).deployment.stage, 'Live')
  assert.equal(row([deploy('COMPLETED', 'SUCCESS')], false).deployment.stage, 'Merged')
  assert.equal(row([build('COMPLETED', 'FAILURE')]).deployment.failed, true)
  assert.equal(row([deploy('COMPLETED', 'FAILURE')]).deployment.stage, 'Deploying')
  assert.equal(
    row([build('COMPLETED', 'SUCCESS', 'build-dsh-image'), deploy('COMPLETED', 'SUCCESS')]).deployment.stage,
    'Merged'
  )
  assert.equal(row([deploy('COMPLETED', 'NEUTRAL')]).deployment.stage, 'Merged')
  assert.equal(prOf(raw({ commits: commitWith([build()]) })).deployment.stage, null)
})

test('scoped history reads paginate beyond 30 merged PRs before branch/date filtering', async () => {
  const seenQueries = []
  const reader = createCiReader({
    token: 'test',
    executionReader: null,
    fetchImpl: async (_url, init) => {
      const { query, variables } = JSON.parse(init.body)
      assert.match(query, /CiSearch/)
      seenQueries.push(variables)
      const merged = variables.query.includes('is:merged')
      const count = merged ? 80 : 1
      const start = variables.cursor ? 50 : 0,
        length = merged ? Math.min(50, count - start) : 1
      const records = Array.from({ length }, (_, i) =>
        raw({
          number: merged ? start + i + 10 : 1,
          state: merged ? 'MERGED' : 'OPEN',
          mergedAt: merged ? '2026-10-09T10:00:00.000Z' : null,
          updatedAt: '2026-10-09T10:00:00.000Z',
          createdAt: '2026-09-01T00:00:00.000Z'
        })
      )
      return answer({
        data: {
          search: {
            nodes: records,
            issueCount: count,
            pageInfo: {
              hasNextPage: merged && !variables.cursor,
              endCursor: merged && !variables.cursor ? 'page-two' : null
            }
          }
        }
      })
    }
  })
  const data = await reader.list({
    branch: 'develop',
    range: 'custom',
    dateField: 'updated',
    from: '2026-10-09T00:00:00.000Z',
    to: '2026-10-10T00:00:00.000Z'
  })
  assert.equal(data.rows.length, 81)
  assert.equal(data.truncated, false)
  assert.equal(data.recentMergedLimit, null)
  assert.equal(seenQueries.length, 3)
  assert.ok(
    seenQueries.every(
      (v) =>
        v.query.includes('base:develop') &&
        v.query.includes('updated:2026-10-09T00:00:00.000Z..2026-10-10T00:00:00.000Z')
    )
  )
  assert.ok(seenQueries.some((v) => v.cursor === 'page-two'))
})

test('date scopes use the selected PR event, exclusive upper bound and isolated stale caches', async () => {
  let failing = false,
    calls = 0,
    clock = Date.parse('2026-10-09T12:00:00Z')
  const reader = createCiReader({
    token: 'test',
    now: () => clock,
    executionReader: null,
    fetchImpl: async (_url, init) => {
      calls++
      if (failing) throw Error('unavailable')
      const { variables } = JSON.parse(init.body)
      assert.match(variables.query, /is:merged/)
      assert.match(variables.query, /merged:2026-10-09T00:00:00.000Z\.\./)
      return answer({
        data: {
          search: {
            issueCount: 4,
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              raw({ number: 1, state: 'MERGED', mergedAt: '2026-10-09T00:00:00.000Z' }),
              raw({ number: 2, state: 'MERGED', mergedAt: '2026-10-10T00:00:00.000Z' }),
              raw({ number: 3, state: 'MERGED', mergedAt: '2026-10-08T23:59:59.999Z' }),
              raw({ number: 4, state: 'MERGED', baseRefName: 'main', mergedAt: '2026-10-09T10:00:00.000Z' })
            ]
          }
        }
      })
    }
  })
  const scope = {
    branch: 'develop',
    range: 'custom',
    dateField: 'merged',
    from: '2026-10-09T00:00:00.000Z',
    to: '2026-10-10T00:00:00.000Z'
  }
  const results = await Promise.all([reader.list(scope), reader.list(scope)])
  assert.equal(calls, 1)
  assert.deepEqual(
    results[0].rows.map((row) => row.id),
    [1]
  )
  clock += 31000
  failing = true
  const stale = await reader.list(scope)
  assert.equal(stale.stale, true)
  assert.equal(stale.rows[0].id, 1)
  const other = await reader.list({ ...scope, branch: 'main' })
  assert.equal(other.stale, false)
  assert.deepEqual(other.rows, [])
})

test('invalid filter syntax cannot reach GitHub and wide reads are explicitly truncated', async () => {
  const { ciScope } = await import('../src/ops/ci-github.js')
  for (const scope of [
    { branch: 'develop repo:other' },
    { dateField: 'live' },
    { range: 'bogus' },
    { range: 'custom' },
    { range: 'custom', from: '2026-02-30T00:00:00.000Z' },
    { range: 'custom', from: '2026-10-10T00:00:00.000Z', to: '2026-10-09T00:00:00.000Z' }
  ])
    assert.throws(() => ciScope(scope))
  let calls = 0
  const reader = createCiReader({
    token: 'test',
    executionReader: null,
    fetchImpl: async () => {
      calls++
      return answer({
        data: {
          search: { issueCount: 1001, nodes: [], pageInfo: { hasNextPage: true, endCursor: String(calls) } }
        }
      })
    }
  })
  const data = await reader.list({ branch: 'develop', range: 'any' })
  assert.equal(calls, 20)
  assert.equal(data.truncated, true)
  assert.equal(data.error, null)
})
