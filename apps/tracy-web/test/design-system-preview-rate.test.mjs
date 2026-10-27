/**
 * The per-account cap on the two design system preview doors (Akemi, 12/10/2026):
 * `GET /api/design-system/preview` (`design-system-preview.js`) and
 * `GET /api/sites/:key/design-system/preview` (`design-system.js`). Thirty asks a minute per signed-in
 * account, every ask counted, ONE budget across both doors; over it is `429 RATE_LIMITED` with
 * `Retry-After`.
 *
 *   node --test apps/tracy-web/test/design-system-preview-rate.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'

import { mountDesignSystem } from '../src/sites/design-system.js'
import { mountDesignSystemPreview, previewRateLimiter } from '../src/sites/design-system-preview.js'
import { DS_PREVIEW_PER_MINUTE_PER_ACCOUNT } from '../src/lib/policy.js'

const LIMIT = DS_PREVIEW_PER_MINUTE_PER_ACCOUNT

/** Both doors on one app, sharing one limiter as `sites/route.js` wires them; the clock is the test's. */
function mounted() {
  const clock = { t: Date.UTC(2026, 9, 12, 10, 0, 0) }
  const now = () => clock.t
  const previewRate = previewRateLimiter({ now })
  const app = new Hono()
  const emailOf = (c) => c.req.header('x-who') ?? 'a@x.test'
  mountDesignSystemPreview(app, {
    signedIn: async (c) => ({ email: emailOf(c) }),
    // No demo anywhere: an ask that gets past the cap is a cheap 400/409, and still counted.
    demoOf: async () => null,
    innerOf: () => new URL('http://none/'),
    fetchImpl: /** @type {any} */ (async () => new Response('', { status: 404 })),
    ds: {
      refero: async () => [],
      quickstartContractOf: () => ({ reason: 'NONE' }),
      emitFor: async () => ({ ok: false })
    },
    now,
    previewRate
  })
  mountDesignSystem(app, {
    requireGrant: async (c) => ({ kind: 'session', email: emailOf(c), grant: { role: 'viewer' } }),
    siteByKey: async () => ({ site_key: 'shop.localhost', label: 'shop', host: 'local', platform: 'emdash' }),
    toolsetRefusal: async () => null,
    runJob: async () => ({ ok: false }),
    lease: { take: async () => ({ ok: true }), release: async () => {} },
    record: async () => {},
    store: { insert: async () => {}, latest: async () => null, markUndone: async () => {} },
    ds: /** @type {any} */ ({ refero: async () => [] }),
    now,
    previewRate
  })
  return { app, clock }
}

const NEW_SITE = '/api/design-system/preview?quickstart=tracy-business/j6&id=refero:x'
const RUNNING_SITE = '/api/sites/shop.localhost/design-system/preview?id=refero:x'
const ask = (app, path, who = 'a@x.test') => app.request(path, { headers: { 'x-who': who } })

for (const [door, path] of [
  ['the Add site door', NEW_SITE],
  ['the running site door', RUNNING_SITE]
]) {
  test(`${door}: ask number ${LIMIT + 1} in a minute is 429 RATE_LIMITED with Retry-After`, async () => {
    const { app } = mounted()
    for (let i = 0; i < LIMIT; i++) {
      const res = await ask(app, path)
      assert.notEqual(res.status, 429, `ask ${i + 1} is within the cap`)
    }
    const res = await ask(app, path)
    assert.equal(res.status, 429)
    assert.deepEqual(await res.json(), { code: 'RATE_LIMITED' })
    const retry = Number(res.headers.get('retry-after'))
    assert.ok(Number.isInteger(retry) && retry >= 1 && retry <= 60, `Retry-After ${retry}`)
    assert.equal(res.headers.get('cache-control'), 'private, no-store')
  })
}

test('one budget across both doors: thirty on one, the next on the other is refused', async () => {
  const { app } = mounted()
  for (let i = 0; i < LIMIT; i++) await ask(app, i % 2 ? NEW_SITE : RUNNING_SITE)
  assert.equal((await ask(app, NEW_SITE)).status, 429)
  assert.equal((await ask(app, RUNNING_SITE)).status, 429)
})

test('another account is not touched by one that hit the cap', async () => {
  const { app } = mounted()
  for (let i = 0; i <= LIMIT; i++) await ask(app, NEW_SITE)
  assert.equal((await ask(app, NEW_SITE)).status, 429)
  assert.notEqual((await ask(app, NEW_SITE, 'b@x.test')).status, 429)
  assert.notEqual((await ask(app, RUNNING_SITE, 'b@x.test')).status, 429)
})

test('the account is one budget whatever the case of its address', async () => {
  const { app } = mounted()
  for (let i = 0; i < LIMIT; i++) await ask(app, NEW_SITE, i % 2 ? 'A@X.test' : 'a@x.test')
  assert.equal((await ask(app, NEW_SITE, 'a@X.TEST')).status, 429)
})

test('the window resets: the next minute opens a fresh thirty', async () => {
  const { app, clock } = mounted()
  for (let i = 0; i <= LIMIT; i++) await ask(app, NEW_SITE)
  const refused = await ask(app, NEW_SITE)
  assert.equal(refused.status, 429)
  clock.t += Number(refused.headers.get('retry-after')) * 1000
  for (let i = 0; i < LIMIT; i++) assert.notEqual((await ask(app, RUNNING_SITE)).status, 429)
  assert.equal((await ask(app, RUNNING_SITE)).status, 429)
})

test('a refused ask is refused before any work: no demo read, no site read', async () => {
  let demoReads = 0
  const now = () => 0
  const app = new Hono()
  mountDesignSystemPreview(app, {
    signedIn: async () => ({ email: 'a@x.test' }),
    demoOf: async () => {
      demoReads++
      return null
    },
    innerOf: () => new URL('http://none/'),
    fetchImpl: /** @type {any} */ (async () => new Response('', { status: 404 })),
    ds: {
      refero: async () => [{ id: 'refero:x', ok: true }],
      quickstartContractOf: () => ({ reason: 'NONE' }),
      emitFor: async () => ({ ok: false })
    },
    now,
    previewRate: async () => ({ over: true, retryAfterS: 42 })
  })
  const res = await app.request(NEW_SITE)
  assert.equal(res.status, 429)
  assert.equal(res.headers.get('retry-after'), '42')
  assert.equal(demoReads, 0)
})

test('with a database: the shared rate_bucket, a one-minute window, and closed when it cannot be read', async () => {
  /** @type {any[]} */
  const calls = []
  let count = 0
  const pool = /** @type {any} */ ({
    query: async (sql, params) => {
      calls.push(params)
      return { rows: [{ count: ++count }] }
    }
  })
  const t = Date.UTC(2026, 9, 12, 10, 0, 15)
  const rate = previewRateLimiter({ pool, now: () => t })
  for (let i = 0; i < LIMIT; i++) assert.equal((await rate('Lee@X.test')).over, false)
  const over = await rate('lee@x.test')
  assert.deepEqual(over, { over: true, retryAfterS: 45 })
  assert.equal(calls[0][0], 'ds-preview:lee@x.test')
  assert.equal(calls[0][1].getTime(), Date.UTC(2026, 9, 12, 10, 0, 0))
  const broken = previewRateLimiter({
    pool: /** @type {any} */ ({
      query: async () => {
        throw new Error('down')
      }
    }),
    now: () => t
  })
  assert.equal((await broken('lee@x.test')).over, true)
})

test('browsing the preview spends the same budget: each page opened in the frame is one ask, over it a small 429 page', async () => {
  const { app } = mounted()
  for (let i = 0; i < LIMIT; i++) {
    const door = i % 2 ? NEW_SITE : RUNNING_SITE
    const res = await ask(app, `${door}&path=${encodeURIComponent(`/page-${i}`)}`)
    assert.notEqual(res.status, 429, `page ${i + 1} is within the cap`)
  }
  const res = await ask(app, `${RUNNING_SITE}&path=%2Fone-more`)
  assert.equal(res.status, 429)
  assert.match(res.headers.get('content-type') ?? '', /^text\/html/, 'said inside the frame, not as JSON')
  assert.ok(Number(res.headers.get('retry-after')) >= 1)
  assert.match(await res.text(), /Too many previews/)
})
