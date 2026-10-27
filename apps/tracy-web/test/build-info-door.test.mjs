// `GET /api/build` — which build of the tracy-web server answers (Settings › Help & about shows it).
// The commit and the build time are baked into the image (`apps/tracy-web/Dockerfile`, last lines);
// a reused image keeps the values of the build that made it, so the label matches what runs.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildApp } from '../src/app.js'
import { buildInfoRoutes } from '../src/public/build-info-door.js'
import { mintSession } from '../src/lib/session.js'

const config = { sessionSecret: 's'.repeat(32) }
const SHA = '0ab8dfcbad1e4df87c0ffee0123456789abcdef0'

const read = async (env, { signedIn = true } = {}) => {
  const headers = signedIn
    ? { cookie: `tracy_sess=${await mintSession('a@b.co', config.sessionSecret)}` }
    : {}
  const res = await buildInfoRoutes({
    config,
    env,
    fetchImpl: async () => new Response('', { status: 503 })
  }).request('/api/build', { headers })
  return { res, body: await res.json() }
}

test('a signed-in person reads the full commit and the build time, never cached', async () => {
  const { res, body } = await read({ TRACY_SOURCE_COMMIT: SHA, TRACY_BUILT_AT: '2026-10-09T08:12:00Z' })
  assert.equal(res.status, 200)
  assert.deepEqual(body, { desktopVersion: null, commit: SHA, builtAt: '2026-10-09T08:12:00.000Z' })
  assert.equal(res.headers.get('cache-control'), 'no-store')
})

test('nobody signed in: 401, and no commit', async () => {
  const { res, body } = await read({ TRACY_SOURCE_COMMIT: SHA }, { signedIn: false })
  assert.equal(res.status, 401)
  assert.deepEqual(body, { code: 'NOT_SIGNED_IN' })
})

test('a value missing or not of its shape answers null, never a guess', async () => {
  for (const [env, expected] of [
    [{}, { commit: null, builtAt: null }],
    [
      { TRACY_SOURCE_COMMIT: 'unknown', TRACY_BUILT_AT: '' },
      { commit: null, builtAt: null }
    ],
    [
      { TRACY_SOURCE_COMMIT: '0ab8dfc', TRACY_BUILT_AT: 'yesterday' },
      { commit: null, builtAt: null }
    ],
    [{ TRACY_SOURCE_COMMIT: `${SHA}<script>` }, { commit: null, builtAt: null }],
    [{ TRACY_SOURCE_COMMIT: SHA.toUpperCase() }, { commit: SHA, builtAt: null }]
  ]) {
    const { body } = await read(env)
    assert.deepEqual(body, { ...expected, desktopVersion: null }, JSON.stringify(env))
  }
})

test('the app answers the door on its own origin', async () => {
  const app = buildApp({
    config: {
      ...config,
      origin: 'http://tracy.test:8080',
      secure: false,
      siteDomain: 'tracy.test',
      siteDomainAliases: [],
      sessionDomain: null
    },
    fetchImpl: async () => new Response('', { status: 503 }),
    mail: { send: async () => {} },
    env: { TRACY_SOURCE_COMMIT: SHA }
  })
  const res = await app.request('http://tracy.test:8080/api/build', {
    headers: { cookie: `tracy_sess=${await mintSession('a@b.co', config.sessionSecret)}` }
  })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).commit, SHA)
})

test('desktop download version reads the public stable feed once and caches the result', async () => {
  let calls = 0
  const app = buildInfoRoutes({
    config,
    env: {},
    fetchImpl: async (url) => {
      assert.equal(url, 'https://update.tracy.ai/desktop/stable-mac.yml')
      calls++
      return new Response('version: 0.6.0\nfiles:\n  - url: app.zip\n')
    }
  })
  const headers = { cookie: `tracy_sess=${await mintSession('a@b.co', config.sessionSecret)}` }
  const replies = await Promise.all([
    app.request('/api/build', { headers }),
    app.request('/api/build', { headers })
  ])
  for (const reply of replies) assert.equal((await reply.json()).desktopVersion, '0.6.0')
  assert.equal(calls, 1)
  assert.equal((await (await app.request('/api/build', { headers })).json()).desktopVersion, '0.6.0')
  assert.equal(calls, 1)
})

test('unreadable, duplicate, prerelease and oversized desktop feeds return null', async () => {
  const headers = { cookie: `tracy_sess=${await mintSession('a@b.co', config.sessionSecret)}` }
  for (const feed of [
    '',
    'version: bad\n',
    'version: 0.6.0-dev.1\n',
    'version: 0.6.0\nversion: 0.7.0\n',
    'x'.repeat(65537)
  ]) {
    const app = buildInfoRoutes({ config, env: {}, fetchImpl: async () => new Response(feed) })
    assert.equal((await (await app.request('/api/build', { headers })).json()).desktopVersion, null)
  }
  const app = buildInfoRoutes({
    config,
    env: {},
    fetchImpl: async () => {
      throw new Error('offline')
    }
  })
  assert.equal((await (await app.request('/api/build', { headers })).json()).desktopVersion, null)
})
