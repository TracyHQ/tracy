import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDeliveryReader } from '../src/ops/ci-delivery.js'
import { createCiReader, githubLink } from '../src/ops/ci-github.js'

const merge = 'a'.repeat(40),
  deployed = 'b'.repeat(40),
  other = 'c'.repeat(40)
const row = (overrides = {}) => ({
  id: 1052,
  merged: true,
  mergedAt: '2026-10-08T10:00:00Z',
  mergeCommit: merge,
  target: 'develop',
  commit: 'head',
  deployment: { label: 'Image build failed', stage: 'Building image', failed: true, checks: [] },
  ...overrides
})
const response = (data) => new Response(JSON.stringify(data))
function fixture(options = {}) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push(url)
    if (options.denied) return new Response('', { status: 403 })
    if (url.includes('/compare/'))
      return response({
        base_commit: { sha: merge },
        merge_base_commit: { sha: options.unrelated ? other : merge },
        status: options.unrelated ? 'diverged' : 'ahead',
        behind_by: options.unrelated ? 1 : 0
      })
    if (url.endsWith('/graphql')) {
      const { variables } = JSON.parse(init.body)
      const next = options.paginated && !variables.cursor
      return response({
        data: {
          repository: {
            object: {
              oid: options.wrongCommit ? other : variables.sha,
              history: {
                nodes: (next ? [deployed] : options.unrelated ? [other] : [deployed, merge]).map((oid) => ({
                  oid
                })),
                pageInfo: {
                  hasNextPage: Boolean(next || options.capped),
                  endCursor: `${variables.cursor ?? ''}n`
                }
              }
            }
          }
        }
      })
    }
    if (url.includes('/workflows/')) {
      const dsh = url.includes('build-dsh-image')
      return response({
        workflow_runs:
          options.missing && dsh
            ? []
            : [
                {
                  id: dsh ? 2 : 1,
                  run_attempt: 1,
                  head_sha: deployed,
                  event: options.event ?? 'push',
                  head_branch: options.branch ?? 'develop'
                }
              ]
      })
    }
    return response({
      total_count: options.partial ? 2 : 1,
      jobs: [
        {
          id: url.includes('/runs/2/') ? 22 : 11,
          name: options.targetJob ?? 'deploy-dev',
          status: 'completed',
          conclusion: options.failed ? 'failure' : options.skipped ? 'skipped' : 'success',
          html_url: 'https://github.com/TracyHQ/tch/actions/runs/1/job/11',
          started_at: '2026-10-09T09:00:00Z',
          completed_at: options.at ?? '2026-10-09T10:00:00Z'
        }
      ]
    })
  }
  return {
    calls,
    fetchImpl,
    reader: createDeliveryReader({ token: 'secret', repo: 'TracyHQ/tch', link: githubLink, fetchImpl })
  }
}
test('later app and dsh deployments containing the merge commit supersede an old image failure', async () => {
  const f = fixture(),
    input = row(),
    [actual] = await f.reader.enrich([input])
  assert.equal(actual.deployment.stage, 'Live')
  assert.equal(actual.deployment.failed, false)
  assert.equal(actual.deployment.checks.length, 2)
  assert.deepEqual(
    actual.deployment.coverage.map((value) => value.commit),
    [deployed, deployed]
  )
  assert.equal(input.deployment.stage, 'Building image')
  assert.equal(f.calls.filter((url) => url.endsWith('/graphql')).length, 1)
  assert.ok(!JSON.stringify(actual).includes('secret'))
  await f.reader.enrich([input])
  assert.equal(f.calls.length, 5)
})
test('missing merge evidence, open PRs and unknown branches never invent Live', async () => {
  const f = fixture(),
    inputs = [row({ mergeCommit: null }), row({ merged: false }), row({ target: 'other' })]
  assert.deepEqual(await f.reader.enrich(inputs), inputs)
  assert.equal(f.calls.length, 0)
})
test('unrelated ancestry, missing workflow and wrong branch or target keep the original observation', async () => {
  for (const options of [
    { unrelated: true },
    { missing: true },
    { branch: 'main' },
    { targetJob: 'deploy-prod' },
    { event: 'pull_request' },
    { wrongCommit: true }
  ]) {
    const f = fixture(options),
      input = row()
    assert.deepEqual(await f.reader.enrich([input]), [input])
  }
})
test('failed, skipped, partial or inaccessible deployment evidence never makes a PR Live', async () => {
  for (const options of [
    { failed: true },
    { skipped: true },
    { partial: true },
    { denied: true },
    { at: '2026-10-07T10:00:00Z' },
    { at: 'not-a-date' }
  ]) {
    const f = fixture(options),
      input = row()
    assert.deepEqual(await f.reader.enrich([input]), [input])
  }
})
test('deployment ancestry follows cursors and a capped read cannot confirm an unseen PR', async () => {
  const f = fixture({ paginated: true })
  assert.equal((await f.reader.enrich([row()]))[0].deployment.stage, 'Live')
  assert.equal(f.calls.filter((url) => url.endsWith('/graphql')).length, 2)
  const capped = fixture({ capped: true, unrelated: true }),
    input = row()
  assert.deepEqual(await capped.reader.enrich([input]), [input])
  assert.equal(capped.calls.filter((url) => url.endsWith('/graphql')).length, 10)
})
test('delivery coverage enriches both list and detail and shares one reader across filter scopes', async () => {
  const f = fixture()
  const raw = {
    number: 1052,
    state: 'MERGED',
    headRefOid: 'head',
    baseRefName: 'develop',
    mergedAt: '2026-10-08T10:00:00Z',
    mergeCommit: { oid: merge },
    commits: { nodes: [] }
  }
  const reader = createCiReader({
    token: 'secret',
    executionReader: null,
    deliveryReader: f.reader,
    fetchImpl: async (url, init) => {
      const { query } = JSON.parse(init.body)
      return response({
        data: {
          repository: query.includes('query CiPullRequest(')
            ? { pullRequest: raw }
            : { open: { nodes: [], pageInfo: { hasNextPage: false } }, merged: { nodes: [raw] } }
        }
      })
    }
  })
  assert.equal((await reader.list()).rows[0].deployment.stage, 'Live')
  assert.equal((await reader.detail(1052)).deployment.stage, 'Live')
  assert.equal(f.calls.length, 5)
})
test('old PRs beyond the history cap become Live only after an explicit ancestor comparison', async () => {
  const f = fixture({ capped: true }),
    original = f.fetchImpl
  const reader = createDeliveryReader({
    token: 'secret',
    repo: 'TracyHQ/tch',
    link: githubLink,
    fetchImpl: async (url, init) =>
      url.includes('/compare/')
        ? response({
            base_commit: { sha: other },
            merge_base_commit: { sha: other },
            status: 'ahead',
            behind_by: 0
          })
        : original(url, init)
  })
  assert.equal((await reader.enrich([row({ mergeCommit: other })]))[0].deployment.stage, 'Live')
})
test('deployment coverage stays within the PR target environment', async () => {
  for (const [target, job] of [
    ['main', 'deploy-prod'],
    ['staging', 'deploy-staging']
  ]) {
    const f = fixture({ branch: target, targetJob: job })
    const [actual] = await f.reader.enrich([row({ target })])
    assert.equal(actual.deployment.stage, 'Live')
    assert.ok(actual.deployment.checks.every((check) => check.name === job))
  }
})
test('bounded comparisons warm remaining old PRs on the next refresh and coalesce identical deployed SHAs', async () => {
  const f = fixture({ capped: true }),
    original = f.fetchImpl
  let comparisons = 0
  const reader = createDeliveryReader({
    token: 'secret',
    repo: 'TracyHQ/tch',
    link: githubLink,
    fetchImpl: async (url, init) => {
      if (!url.includes('/compare/')) return original(url, init)
      comparisons++
      const base = new URL(url).pathname.split('/compare/')[1].split('...')[0]
      return response({
        base_commit: { sha: base },
        merge_base_commit: { sha: base },
        status: 'ahead',
        behind_by: 0
      })
    }
  })
  const inputs = Array.from({ length: 100 }, (_, i) =>
    row({ id: i + 2000, mergeCommit: (i + 1).toString(16).padStart(40, '0') })
  )
  assert.equal((await reader.enrich(inputs)).filter((row) => row.deployment.stage === 'Live').length, 80)
  assert.equal(comparisons, 80)
  assert.equal((await reader.enrich(inputs)).filter((row) => row.deployment.stage === 'Live').length, 100)
  assert.equal(comparisons, 100)
})
