import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readConfig, ConfigError } from '../src/config.js'
import { localAccessRoutes } from '../src/identity/local-access.js'
import { verifySession } from '../src/lib/session.js'
import { localLaunchUrl } from '../../../scripts/open-local.mjs'

const env = {
  TRACY_ORIGIN: 'http://localhost:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(64),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k',
  TRACY_MODE: 'local',
  TRACY_ENVIRONMENT: 'local',
  LOCAL_ACCESS_SECRET: 'a'.repeat(64),
  LOCAL_INSTALLATION_ID: '12345678-1234-4123-8123-123456789abc',
  DATABASE_URL: 'postgres://localhost/tracy'
}

function harness() {
  let time = 1_700_000_000_000
  const codes = new Map()
  const owners = []
  const config = readConfig(env)
  const app = localAccessRoutes({
    config,
    now: () => time,
    ensureOwner: async (email) => owners.push(email),
    book: {
      put: async (hash, expires) => codes.set(hash, expires),
      take: async (hash, now) => {
        const expires = codes.get(hash)
        codes.delete(hash)
        return expires > now
      }
    }
  })
  const request = (path, options = {}) => app.request(`${config.origin}${path}`, options)
  const launch = async () => {
    const response = await request('/auth/local/launch', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.LOCAL_ACCESS_SECRET}` }
    })
    assert.equal(response.status, 200)
    return new URL((await response.json()).url).hash.slice(1)
  }
  const exchange = (code, headers = {}) =>
    request('/auth/local/exchange', {
      method: 'POST',
      headers: { origin: config.origin, 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ code })
    })
  return {
    request,
    launch,
    exchange,
    owners,
    config,
    advance: (ms) => {
      time += ms
    }
  }
}

test('local mode is explicit and rejects cloud origins, shared cookies and incomplete credentials', () => {
  assert.equal(readConfig({ ...env, TRACY_MODE: undefined }).localAccess, null)
  assert.ok(readConfig(env).localAccess)
  for (const change of [
    { TRACY_MODE: 'typo' },
    { TRACY_ORIGIN: 'https://cowork.tracy.ai' },
    { TRACY_ORIGIN: 'http://localhost.evil.test:8080' },
    { TRACY_ORIGIN: 'http://localhost:8080/path' },
    { TRACY_ENVIRONMENT: 'prod' },
    { TRACY_ENVIRONMENT: undefined },
    { SESSION_DOMAIN: '.localhost' },
    { SITE_DOMAIN: 'tracy.ai' },
    { LOCAL_ACCESS_SECRET: '' },
    { LOCAL_ACCESS_SECRET: 'short' },
    { LOCAL_INSTALLATION_ID: '' },
    { DATABASE_URL: '' },
    { SESSION_SECRET: env.LOCAL_ACCESS_SECRET }
  ])
    assert.throws(() => readConfig({ ...env, ...change }), ConfigError)
})

test('launcher code creates a normal host-only local session, never a cloud session', async () => {
  const h = harness()
  const code = await h.launch()
  const response = await h.exchange(code)
  assert.equal(response.status, 200)
  assert.deepEqual(h.owners, [`owner+${env.LOCAL_INSTALLATION_ID}@local.invalid`])
  const cookie = response.headers.get('set-cookie')
  assert.match(cookie, /HttpOnly/)
  assert.doesNotMatch(cookie, /Domain=/i)
  const token = cookie.split(';')[0].slice('tracy_sess='.length)
  assert.equal(await verifySession(token, env.SESSION_SECRET, 1_700_000_000_000), h.owners[0])
  assert.equal(await verifySession(token, 'cloud-secret', 1_700_000_000_000), null)
  assert.equal((await h.exchange(code)).status, 401)
})

test('concurrent exchange consumes the code exactly once', async () => {
  const h = harness()
  const code = await h.launch()
  const replies = await Promise.all([h.exchange(code), h.exchange(code)])
  assert.deepEqual(replies.map((r) => r.status).sort(), [200, 401])
  assert.equal(h.owners.length, 1)
})

test('expired and malformed codes create no account', async () => {
  const h = harness()
  const code = await h.launch()
  h.advance(60_000)
  for (const candidate of [code, '', 'wrong', null, {}])
    assert.equal((await h.exchange(candidate)).status, 401)
  assert.deepEqual(h.owners, [])
})

test('browser writes require the exact origin, JSON and same-origin fetch metadata', async () => {
  const h = harness()
  const code = await h.launch()
  for (const headers of [
    { origin: '' },
    { origin: 'null' },
    { origin: 'http://site.localhost:8080' },
    { origin: 'http://localhost:8081' },
    { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'same-site' }
  ])
    assert.equal((await h.exchange(code, headers)).status, 403)
  assert.equal((await h.exchange(code, { 'content-type': 'text/plain' })).status, 415)
  assert.equal((await h.exchange(code)).status, 200)
})

test('launch requires the installation secret and refuses browser calls', async () => {
  const h = harness()
  for (const headers of [
    {},
    { authorization: 'Bearer wrong' },
    { authorization: `Bearer ${env.LOCAL_ACCESS_SECRET}`, origin: env.TRACY_ORIGIN },
    { authorization: `Bearer ${env.LOCAL_ACCESS_SECRET}`, 'sec-fetch-site': 'same-origin' }
  ])
    assert.ok((await h.request('/auth/local/launch', { method: 'POST', headers })).status >= 400)
  assert.deepEqual(h.owners, [])
})

test('forged Host cannot receive a launch page or session', async () => {
  const h = harness()
  for (const host of ['evil.test:8080', 'site.localhost:8080', 'localhost:9999']) {
    assert.equal((await h.request('/auth/local/open', { headers: { host } })).status, 403)
  }
})

test('opening the launch page does not create a session or expose a root credential', async () => {
  const h = harness()
  const page = await h.request('/auth/local/open')
  assert.equal(page.headers.get('set-cookie'), null)
  assert.equal(page.headers.get('cache-control'), 'no-store')
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer')
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/)
  const html = await page.text()
  assert.ok(html.indexOf('history.replaceState') < html.indexOf('fetch('))
  assert.ok(!html.includes(env.LOCAL_ACCESS_SECRET))
  assert.deepEqual(h.owners, [])
})

test('cloud deployments expose none of the local access routes', async () => {
  const app = localAccessRoutes({ config: { origin: 'https://cowork.tracy.ai' } })
  assert.equal((await app.request('/auth/local/open')).status, 404)
  assert.equal((await app.request('/auth/local/launch', { method: 'POST' })).status, 404)
})

test('local mode blocks alternate cloud sign-in paths and oversized exchange bodies', async () => {
  const h = harness()
  for (const path of ['/signin', '/signin/google', '/signin/github/callback'])
    assert.equal((await h.request(path)).status, 401)
  for (const path of ['/login', '/verify'])
    assert.equal((await h.request(path, { method: 'POST' })).status, 401)
  assert.equal(
    (
      await h.request('/auth/local/exchange', {
        method: 'POST',
        headers: { origin: env.TRACY_ORIGIN, 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'a'.repeat(2048) })
      })
    ).status,
    413
  )
  assert.deepEqual(h.owners, [])
})

test('launcher requests only the local origin and validates the returned browser URL', async () => {
  const h = harness()
  const url = await localLaunchUrl(env, async (url, options) => {
    assert.equal(url, `${env.TRACY_ORIGIN}/auth/local/launch`)
    assert.equal(options.redirect, 'error')
    return h.request('/auth/local/launch', options)
  })
  assert.equal((await h.exchange(new URL(url).hash.slice(1))).status, 200)
  for (const url of [
    `https://cowork.tracy.ai/auth/local/open#${'a'.repeat(64)}`,
    `${env.TRACY_ORIGIN}/other#${'a'.repeat(64)}`,
    `${env.TRACY_ORIGIN}/auth/local/open?secret=bad#${'a'.repeat(64)}`,
    `${env.TRACY_ORIGIN}/auth/local/open#bad`
  ])
    await assert.rejects(localLaunchUrl(env, async () => Response.json({ url })))
  await assert.rejects(localLaunchUrl({ ...env, TRACY_MODE: 'cloud' }))
})
