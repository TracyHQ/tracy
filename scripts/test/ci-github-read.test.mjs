import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { CI_REPOSITORY } from '../ci/ci-repository.mjs'
import { githubReader, githubJson } from '../ci/github-read.mjs'

const path = `repos/${CI_REPOSITORY}/actions/runs`
const ok = () => new Response('{"workflow_runs":[]}', { status: 200 })
const limited = (headers = {}) =>
  new Response('', {
    status: 403,
    headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '20', ...headers }
  })
function setup(responses, options = {}) {
  const calls = []
  const read = githubReader({
    appToken: 'app-test',
    jobToken: 'job-test',
    now: () => 1000,
    fetchImpl: async (url, init) => {
      calls.push({ url, ...init })
      return responses.shift()()
    },
    ...options
  })
  return { read, calls }
}

test('uses the App first and only sends a GET to the TCH API without redirects', async () => {
  const { read, calls } = setup([ok])
  assert.deepEqual(await (await read(path)).json(), { workflow_runs: [] })
  assert.equal(calls[0].headers.authorization, 'Bearer app-test')
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls[0].redirect, 'error')
})

test('primary exhaustion retries with job token, caches until reset, then returns to App', async () => {
  let clock = 1000
  const routes = []
  const { read, calls } = setup([limited, ok, ok, ok], {
    now: () => clock,
    onRoute: (route) => routes.push(route)
  })
  await read(path)
  await read(path)
  clock = 21000
  await read(path)
  assert.deepEqual(routes, ['CI App', 'job token', 'CI App'])
  assert.deepEqual(
    calls.map((c) => c.headers.authorization),
    ['Bearer app-test', 'Bearer job-test', 'Bearer job-test', 'Bearer app-test']
  )
})

for (const [name, response] of [
  ['permission refusal', () => new Response('', { status: 403 })],
  ['secondary limit', () => limited({ 'retry-after': '60' })],
  ['rate-limit text without primary headers', () => new Response('API rate limit exceeded', { status: 429 })],
  ['server error', () => new Response('', { status: 500 })]
])
  test(`does not switch credentials for ${name}`, async () => {
    const { read, calls } = setup([response])
    await assert.rejects(read(path), /GitHub CI read failed/)
    assert.equal(calls.length, 1)
  })

test('if both quotas are exhausted it fails; it never loops or reports success', async () => {
  const { read, calls } = setup([limited, limited])
  await assert.rejects(read(path), /HTTP 403/)
  assert.equal(calls.length, 2)
})

test('without an App token (including fork PRs) it uses only the job token', async () => {
  const { read, calls } = setup([ok], { appToken: '' })
  await read(path)
  assert.equal(calls[0].headers.authorization, 'Bearer job-test')
})

test('does not retry network failure using a different identity', async () => {
  const { read } = setup([], {
    fetchImpl: async () => {
      throw new Error('offline')
    }
  })
  await assert.rejects(read(path), /offline/)
})

test('rejects other repositories, absolute URLs and traversal before using credentials', async () => {
  const { read, calls } = setup([])
  for (const value of [
    'repos/Other/repo',
    'https://evil.test',
    `repos/${CI_REPOSITORY}/../../Other/repo`,
    `repos/${CI_REPOSITORY}/%2e%2e/other`,
    `repos/${CI_REPOSITORY}%2fother`
  ])
    await assert.rejects(read(value))
  assert.equal(calls.length, 0)
})

test('bounded merge-gate response refuses oversized and invalid JSON bodies', async () => {
  const { read } = setup([() => new Response('x'.repeat(101)), () => new Response('invalid')])
  await assert.rejects(githubJson(read, path, 100), /larger than 100 bytes/)
  await assert.rejects(githubJson(read, path, 100), SyntaxError)
})

test('every API-reading workflow passes the App read token and retains the job token', () => {
  for (const file of ['tracy-ci', 'auto-merge-develop', 'ci-before-merge']) {
    const text = readFileSync(new URL(`../../.github/workflows/${file}.yml`, import.meta.url), 'utf8')
    assert.match(text, /TRACY_CI_READ_APP_TOKEN:/)
    assert.match(text, /GH_TOKEN: \$\{\{ github.token \}\}/)
    assert.match(text, /permission-actions: read/)
    assert.match(text, /permission-checks: read/)
    assert.match(text, /repositories: \$\{\{ github\.event\.repository\.name \}\}/)
  }
  const text = readFileSync(new URL('../../.github/workflows/tracy-ci.yml', import.meta.url), 'utf8')
  assert.match(text, /github.event.pull_request.head.repo.full_name == github.repository/)
})

test('auto-merge job token can read check annotations when the App quota is exhausted', () => {
  const text = readFileSync(
    new URL('../../.github/workflows/auto-merge-develop.yml', import.meta.url),
    'utf8'
  )
  const permissions = text.split('permissions:')[1].split('concurrency:')[0]
  assert.match(permissions, /checks: read/)
  assert.match(permissions, /actions: read/)
  assert.match(permissions, /pull-requests: read/)
})
