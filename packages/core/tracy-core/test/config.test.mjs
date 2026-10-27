/**
 * `tracyConfig()` — the one door every plugin's client reads instead of writing one of Tracy's
 * own addresses as a literal (Task 11).
 *
 * Everything here is the real helper; only `fetch` is a double, same shape as `seat.test.mjs`.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { tracyConfig } from '@tracy/core/config'

const answer = (status, body) => async () =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const BODY = {
  origin: 'https://cowork.tracy.ai',
  siteDomain: 'tracy.ai',
  siteDomainAliases: ['tracy.test'],
  sitePort: '',
  cookieDomain: '.tracy.ai',
  badgeUrl: 'https://tracy.ai/dashboard/badge.js',
  hostOrg: 'TracyHQ'
}

test('reads the door and hands back exactly what it answered', async () => {
  const config = await tracyConfig({ fetch: answer(200, BODY) })
  assert.deepEqual(config, BODY)
})

test('a broken read falls back to production for siteDomain/badgeUrl/hostOrg', async () => {
  const offline = await tracyConfig({
    fetch: async () => {
      throw new Error('offline')
    }
  })
  assert.equal(offline.siteDomain, 'tracy.ai')
  assert.equal(offline.badgeUrl, 'https://tracy.ai/dashboard/badge.js')
  assert.equal(offline.hostOrg, 'TracyHQ')
  assert.deepEqual(offline.siteDomainAliases, [])

  const notOk = await tracyConfig({ fetch: answer(500, { error: 'boom' }) })
  assert.equal(notOk.siteDomain, 'tracy.ai')

  const notJson = await tracyConfig({
    fetch: async () => new Response('<!doctype html><title>nope</title>', { status: 200 })
  })
  assert.equal(notJson.siteDomain, 'tracy.ai')
})

test("a broken read falls back to HOST-ONLY for cookieDomain, not production's .tracy.ai", async () => {
  // Ruling (review, fix round 1): '' is correct here and stays. Production's real value is
  // `.tracy.ai`, but a browser refuses a cookie whose Domain= doesn't match its own host — a
  // fallback of `.tracy.ai` on a dev box wouldn't approximate production, it would silently drop
  // the cookie write entirely. Host-only is the one fallback that is safe on every deployment,
  // unlike siteDomain/badgeUrl/hostOrg above, which fall back to their real production values.
  const fetchImpls = [
    async () => {
      throw new Error('offline')
    },
    answer(500, { error: 'boom' }),
    async () => new Response('<!doctype html><title>nope</title>', { status: 200 })
  ]
  for (const fetchImpl of fetchImpls) {
    const config = await tracyConfig({ fetch: fetchImpl })
    assert.equal(config.cookieDomain, '')
  }
})

test('a page mounting several tabs shares one read', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return new Response(JSON.stringify(BODY), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  const original = globalThis.fetch
  globalThis.fetch = fetchImpl
  try {
    const [a, b] = await Promise.all([tracyConfig(), tracyConfig()])
    assert.deepEqual(a, BODY)
    assert.deepEqual(b, BODY)
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = original
  }
})

test("sitePort: the door's value is carried through, and its fallback is production's own (no port)", async () => {
  const withPort = await tracyConfig({ fetch: answer(200, { ...BODY, sitePort: '8080' }) })
  assert.equal(withPort.sitePort, '8080')

  // A door that predates the field, or a failed read, must not invent a port: production serves
  // sites over https on the default port, so '' is the right answer and not a blank guess.
  const older = await tracyConfig({ fetch: answer(200, { siteDomain: 'tracy.ai' }) })
  assert.equal(older.sitePort, '')
  const offline = await tracyConfig({
    fetch: async () => {
      throw new Error('offline')
    }
  })
  assert.equal(offline.sitePort, '')
})
