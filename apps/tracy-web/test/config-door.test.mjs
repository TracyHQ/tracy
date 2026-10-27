// The `GET /api/config` door — the one public answer every plugin's client reads instead of
// baking one of Tracy's own addresses into a committed bundle.
//
// 🔒 WHY THIS FILE EXISTS AT ALL. Until 10/09 the door had NO test on the server side (the client
// half in `@tracy/core` was covered; the door was not), and a browser pass found the cost: the
// Add site wizard displayed `.tracy.ai` as the suffix of a site being created on a laptop, where
// the real address is `<label>.localhost:8080`. Two separate gaps met — the door never published
// the port, and nothing checked what the door published.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { configRoutes } from '../src/public/config-door.js'

const config = {
  origin: 'http://localhost:8080',
  siteDomain: 'localhost',
  siteDomainAliases: ['tracy.test'],
  sessionDomain: null,
  badgeUrl: 'https://tracy.ai/dashboard/badge.js',
  hostOrg: 'TracyHQ'
}

const read = async (over = {}) => {
  const res = await configRoutes({ config: { ...config, ...over } }).request('/api/config')
  return { res, body: await res.json() }
}

test('the door publishes the port a browser must actually type, from the app own origin', async () => {
  const { res, body } = await read()
  assert.equal(res.status, 200)
  assert.equal(body.sitePort, '8080')
  assert.equal(body.siteDomain, 'localhost')
})

test("production's origin has no port, so sitePort is empty — never a stale 8080", async () => {
  const { body } = await read({ origin: 'https://cowork.tracy.ai', siteDomain: 'tracy.ai' })
  assert.equal(body.sitePort, '')
})

test('a malformed origin answers empty rather than taking the door down', async () => {
  const { res, body } = await read({ origin: 'not-a-url' })
  assert.equal(res.status, 200)
  assert.equal(body.sitePort, '')
})

test('the answer carries no secret — only the six public fields, and nothing named like a key', async () => {
  const { res, body } = await read({
    sessionSecret: 'sh'.repeat(16),
    databaseUrl: 'postgres://u:p@h/db',
    github: { appId: '1', privateKey: 'PRIVATE' }
  })
  assert.deepEqual(Object.keys(body).sort(), [
    'badgeUrl',
    'cookieDomain',
    'hostOrg',
    'origin',
    'siteDomain',
    'siteDomainAliases',
    'sitePort'
  ])
  const text = JSON.stringify(body)
  for (const leak of ['secret', 'privateKey', 'PRIVATE', 'postgres://', 'password']) {
    assert.equal(text.toLowerCase().includes(leak.toLowerCase()), false, `leaked ${leak}`)
  }
  assert.equal(res.headers.get('cache-control'), 'public, max-age=60')
})
