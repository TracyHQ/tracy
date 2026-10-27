// The standalone host adapter (ADR 0036 decision 2): the open Website Opportunities layer run by one
// operator with no host product around it. No database: every member here answers without one.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'
import { HOST_MEMBERS, requireHost } from '../src/host.js'
import { createStandaloneHost } from '../src/standalone/host.js'

const TOKEN = 't'.repeat(40)

/** Runs one request through a door that answers what the host saw. */
async function seen(host, { headers = {}, remoteAddress = '127.0.0.1', url = 'http://localhost/x' } = {}) {
  const app = new Hono()
  app.get('/x', async (c) => {
    const who = await host.requireViewer(c, {})
    if (who instanceof Response) return who
    return host.json(c, { who, ip: host.clientIp(c) })
  })
  const res = await app.fetch(new Request(url, { headers }), { incoming: { socket: { remoteAddress } } })
  return { status: res.status, body: await res.json() }
}

test('satisfies every member of the host contract', async () => {
  assert.doesNotThrow(() => requireHost(createStandaloneHost({ config: {} }), HOST_MEMBERS))
  assert.equal(await createStandaloneHost({ config: {} }).openSecret('cipher', 'secret'), null)
})

test('with a token, a request without it is refused, even from this machine', async () => {
  const host = createStandaloneHost({ config: { operatorEmail: 'me@example.com', operatorToken: TOKEN } })
  const refused = await seen(host)
  assert.equal(refused.status, 401)
  assert.equal(refused.body.code, 'UNAUTHENTICATED')
  assert.equal((await seen(host, { headers: { authorization: `Bearer ${'x'.repeat(40)}` } })).status, 401)
  const ok = await seen(host, { headers: { authorization: `Bearer ${TOKEN}` }, remoteAddress: '203.0.113.9' })
  assert.equal(ok.status, 200)
  assert.equal(ok.body.who, 'me@example.com')
})

test('a token too short to be a secret is refused at start', () => {
  assert.throws(() => createStandaloneHost({ config: { operatorToken: 'short' } }), /OPERATOR_TOKEN/)
})

test('without a token, only this machine by a loopback name is the operator', async () => {
  const host = createStandaloneHost({ config: {} })
  const local = await seen(host)
  assert.equal(local.status, 200)
  assert.equal(local.body.who, 'operator@localhost')
  assert.equal((await seen(host, { remoteAddress: '203.0.113.9' })).status, 401)
  // DNS rebinding: a page elsewhere resolving its own name to 127.0.0.1.
  assert.equal((await seen(host, { url: 'http://evil.example/x' })).status, 401)
  assert.equal(
    (await seen(host, { remoteAddress: '::ffff:127.0.0.1', url: 'http://127.0.0.1:8080/x' })).status,
    200
  )
})

test('clientIp ignores X-Forwarded-For unless TRUST_PROXY is set', async () => {
  const headers = { authorization: `Bearer ${TOKEN}`, 'x-forwarded-for': '198.51.100.7, 192.0.2.4' }
  const direct = createStandaloneHost({ config: { operatorToken: TOKEN } })
  assert.equal((await seen(direct, { headers, remoteAddress: '198.51.100.2' })).body.ip, '198.51.100.2')
  const proxied = createStandaloneHost({ config: { operatorToken: TOKEN, trustProxy: true } })
  // The proxy appends the address it saw: the last entry is the one it vouches for.
  assert.equal((await seen(proxied, { headers, remoteAddress: '198.51.100.2' })).body.ip, '192.0.2.4')
  const garbage = { ...headers, 'x-forwarded-for': 'not-an-ip' }
  assert.equal(
    (await seen(proxied, { headers: garbage, remoteAddress: '198.51.100.2' })).body.ip,
    '198.51.100.2'
  )
})

test('rate limit counts per bucket and window, and gives one back', async () => {
  const host = createStandaloneHost({ config: {} })
  const now = Date.UTC(2026, 0, 1, 10, 30)
  assert.equal(await host.overLimitOrClosed(null, 'b', 2, now), false)
  assert.equal(await host.overLimitOrClosed(null, 'b', 2, now), false)
  assert.equal(await host.overLimitOrClosed(null, 'b', 2, now), true)
  assert.equal(await host.overLimitOrClosed(null, 'other', 2, now), false)
  await host.refundOne(null, 'b', now)
  await host.refundOne(null, 'b', now)
  assert.equal(await host.overLimitOrClosed(null, 'b', 2, now), false)
  // The next hour is a new window.
  assert.equal(await host.overLimitOrClosed(null, 'b', 2, now + 3_600_000), false)
  // A day window counts on its own.
  assert.equal(await host.overLimitOrClosed(null, 'b', 0, now, 86_400_000), true)
})

test('compares secrets in constant time and never matches a missing one', () => {
  const host = createStandaloneHost({ config: {} })
  assert.equal(host.sameSecret('abc', 'abc'), true)
  assert.equal(host.sameSecret('abc', 'abd'), false)
  assert.equal(host.sameSecret(undefined, undefined), false)
  assert.equal(host.sameSecret('abc', undefined), false)
})

test('every switch is on and no vision model is assigned', async () => {
  const host = createStandaloneHost({ config: {} })
  assert.equal(await host.uiSwitchOn(null, 'website-opportunities'), true)
  assert.deepEqual(await host.lookupDoor(null, 'vision', 's'), { state: 'unassigned' })
  assert.deepEqual(host.effortOptions({ presetId: 'x', baseUrl: 'y', metadata: {} }), {
    parameter: null,
    choices: []
  })
  assert.equal(await host.currentVisionProof({ pool: null, fingerprint: 'f' }), null)
})

test('the operator signs outreach with OPERATOR_NAME, or not at all', async () => {
  assert.equal(await createStandaloneHost({ config: {} }).displayNameOf(null, 'any'), '')
  assert.equal(
    await createStandaloneHost({ config: { operatorName: 'Mai' } }).displayNameOf(null, 'any'),
    'Mai'
  )
})

test('the one operator is also the operator of the operator doors, keys are read-only', async () => {
  const host = createStandaloneHost({ config: { operatorEmail: 'me@example.com', operatorToken: TOKEN } })
  const app = new Hono()
  app.get('/op', async (c) => {
    const who = await host.requireOperator(c, { write: true })
    return who instanceof Response ? who : host.json(c, { who })
  })
  const ok = await app.fetch(
    new Request('http://localhost/op', { headers: { authorization: `Bearer ${TOKEN}` } }),
    {
      incoming: { socket: { remoteAddress: '203.0.113.9' } }
    }
  )
  assert.deepEqual(await ok.json(), { who: 'me@example.com' })
  const refused = await app.fetch(new Request('http://localhost/op'), {
    incoming: { socket: { remoteAddress: '127.0.0.1' } }
  })
  assert.equal(refused.status, 401)
  assert.equal(host.sealSecret, undefined)
})

test('rateCountsOf reads what the in-memory limiter counted in that window', async () => {
  const host = createStandaloneHost({ config: {} })
  const DAY = 86_400_000
  const now = Date.parse('2026-10-23T12:00:00Z')
  for (let i = 0; i < 3; i++) await host.overLimitOrClosed(null, 'wo:social-budget:yt-api', 100, now, DAY)
  const start = new Date(Math.floor(now / DAY) * DAY)
  const counts = await host.rateCountsOf(
    null,
    ['wo:social-budget:yt-api', 'wo:social-budget:other'],
    start,
    DAY
  )
  assert.deepEqual([...counts], [['wo:social-budget:yt-api', 3]])
})
