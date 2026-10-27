import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { Hono } from 'hono'
import { csrfGuard } from '../src/lib/csrf.js'
import { parseDesktopOpened } from '../src/lib/desktop-opened.js'
import { mintSession } from '../src/lib/session.js'
import { desktopRoutes } from '../src/ops/desktop.js'
import { fileDb } from './_db.mjs'

const ORIGIN = 'https://cowork.tracy.test'
const ID = '3b2f9cbd-80a6-5c1e-9a8b-0123456789ab'
const NOW = Date.parse('2026-10-22T20:00:00.000Z')
const OPENED = { installId: ID, version: '0.6.1', platform: 'mac', openedAt: '2026-10-22T18:00:00.000Z' }
const config = { origin: ORIGIN, sessionSecret: 's'.repeat(32) }
const db = fileDb()
const pg = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
before(db.open)
beforeEach(db.reset)
after(db.close)

function harness(pool, now = NOW) {
  const app = new Hono()
  app.use('*', csrfGuard({ config }))
  app.route('/', desktopRoutes({ pool, config, now: () => now }))
  const send = (body = OPENED, headers = {}) =>
    app.request(`${ORIGIN}/api/desktop/installs/opened`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    })
  return { send }
}

test('app opened claims keep only the existing copy, version, platform and original UTC+7 day', () => {
  assert.deepEqual(parseDesktopOpened({ ...OPENED, installId: ID.toUpperCase() }, NOW), {
    ok: true,
    ...OPENED,
    day: '2026-10-23'
  })
  assert.equal(parseDesktopOpened({ ...OPENED, openedAt: '2026-10-22T16:59:59Z' }, NOW).day, '2026-10-22')
  assert.equal(parseDesktopOpened({ ...OPENED, openedAt: '2026-10-22T17:00:00Z' }, NOW).day, '2026-10-23')
})

test('unknown fields, account claims, invalid copy/version/platform and impossible dates are refused', () => {
  for (const body of [
    null,
    [],
    {},
    { ...OPENED, email: 'somebody@tracy.test' },
    { ...OPENED, content: 'never retained' },
    { ...OPENED, installId: 'new-device-name' },
    { ...OPENED, version: '<script>' },
    { ...OPENED, platform: 'other' },
    { ...OPENED, openedAt: '2026-02-30T17:00:00.000Z' },
    { ...OPENED, openedAt: '2026-10-22' },
    { ...OPENED, openedAt: 0 },
    { ...OPENED, openedAt: { length: 20 } },
    { ...OPENED, openedAt: Array(20).fill(null) },
    { ...OPENED, openedAt: '2026-10-22T17:00:00+00:00' }
  ])
    assert.equal(parseDesktopOpened(body, NOW).ok, false, JSON.stringify(body))
})

test('offline reports keep their timestamp up to 90 days; future clock skew is bounded to five minutes', () => {
  for (const delta of [-90 * 86_400_000, 300_000]) {
    assert.equal(
      parseDesktopOpened({ ...OPENED, openedAt: new Date(NOW + delta).toISOString() }, NOW).ok,
      true
    )
  }
  for (const delta of [-90 * 86_400_000 - 1, 300_001]) {
    assert.equal(
      parseDesktopOpened({ ...OPENED, openedAt: new Date(NOW + delta).toISOString() }, NOW).ok,
      false
    )
  }
})

test(
  'an anonymous foreground signal is recorded without account/content enrichment or an install table write',
  pg,
  async () => {
    const { send } = harness(db.pool)
    assert.equal((await send()).status, 204)
    const [row] = (await db.pool.query('select * from ops_signal')).rows
    assert.equal(row.kind, 'desktop.app_opened')
    assert.equal(row.occurred_at.toISOString(), OPENED.openedAt)
    assert.deepEqual(row.data, { installId: ID, version: '0.6.1', platform: 'mac' })
    assert.equal(row.account_id, null)
    assert.equal(row.telegram_required, false)
    assert.equal(row.dedupe_key, `desktop.app_opened:${ID}:2026-10-23`)
    assert.equal((await db.pool.query('select count(*)::int as n from desktop_install')).rows[0].n, 0)
  }
)

test(
  'only the existing signed session supplies identity, and an unknown account is never created',
  pg,
  async () => {
    const account = (await db.pool.query("insert into account (email) values ('qa@tracy.test') returning id"))
      .rows[0].id
    const { send } = harness(db.pool)
    const cookie = `tracy_sess=${await mintSession('qa@tracy.test', config.sessionSecret)}`
    assert.equal((await send(OPENED, { cookie, 'sec-fetch-site': 'same-origin' })).status, 204)
    const [row] = (await db.pool.query('select * from ops_signal')).rows
    assert.equal(row.account_id, account)
    assert.deepEqual(Object.keys(row.data).sort(), ['installId', 'platform', 'version'])
    const missingCookie = `tracy_sess=${await mintSession('missing@tracy.test', config.sessionSecret)}`
    assert.equal(
      (
        await send(
          { ...OPENED, installId: '11111111-2222-4333-8444-555555555555' },
          { cookie: missingCookie }
        )
      ).status,
      204
    )
    assert.equal((await db.pool.query('select count(*)::int as n from account')).rows[0].n, 1)
  }
)

test('same-copy UTC+7 days are idempotent across retries and concurrent calls', pg, async () => {
  const { send } = harness(db.pool)
  const responses = await Promise.all(Array.from({ length: 20 }, () => send()))
  assert.deepEqual([...new Set(responses.map((r) => r.status))], [204])
  assert.equal((await send({ ...OPENED, openedAt: '2026-10-22T19:00:00.000Z' })).status, 204)
  assert.equal((await db.pool.query('select count(*)::int as n from ops_signal')).rows[0].n, 1)
  assert.equal((await send({ ...OPENED, openedAt: '2026-10-22T16:59:59.999Z' })).status, 204)
  assert.equal((await db.pool.query('select count(*)::int as n from ops_signal')).rows[0].n, 2)
})

test('signing in later does not retroactively assign an anonymous daily open', pg, async () => {
  const { send } = harness(db.pool)
  await send()
  await db.pool.query("insert into account (email) values ('qa@tracy.test')")
  const cookie = `tracy_sess=${await mintSession('qa@tracy.test', config.sessionSecret)}`
  await send(OPENED, { cookie })
  assert.equal((await db.pool.query('select account_id from ops_signal')).rows[0].account_id, null)
})

test('malformed, oversized and unsupported content creates no events', pg, async () => {
  const { send } = harness(db.pool)
  assert.equal((await send('{broken')).status, 400)
  assert.equal((await send({ ...OPENED, accountId: 'forged' })).status, 400)
  assert.equal((await send('x'.repeat(513))).status, 413)
  assert.equal((await send(' '.repeat(513) + JSON.stringify(OPENED), { 'content-length': '1' })).status, 413)
  assert.equal((await send(OPENED, { 'content-type': 'text/plain' })).status, 415)
  assert.equal((await db.pool.query('select count(*)::int as n from ops_signal')).rows[0].n, 0)
})

test('signed-in cross-site writes are refused by the existing desktop session guard', pg, async () => {
  const { send } = harness(db.pool)
  const cookie = `tracy_sess=${await mintSession('qa@tracy.test', config.sessionSecret)}`
  assert.equal((await send(OPENED, { cookie, 'sec-fetch-site': 'same-site' })).status, 403)
  assert.equal((await send(OPENED, { cookie, origin: 'https://elsewhere.test' })).status, 403)
  assert.equal((await db.pool.query('select count(*)::int as n from ops_signal')).rows[0].n, 0)
})

test(
  'copy and address rate buckets fail closed and return a retry time without storing raw addresses',
  pg,
  async () => {
    const { send } = harness(db.pool)
    const hour = new Date(Math.floor(NOW / 3_600_000) * 3_600_000)
    await db.pool.query('insert into rate_bucket (bucket, window_start, count) values ($1, $2, 120)', [
      `desktop-opened:${ID}`,
      hour
    ])
    const response = await send()
    assert.equal(response.status, 429)
    assert.equal(Number(response.headers.get('retry-after')), 3600)
    await db.pool.query('delete from rate_bucket')
    const ip = '203.0.113.5'
    const hash = createHash('sha256').update(ip).digest('hex')
    await db.pool.query('insert into rate_bucket (bucket, window_start, count) values ($1, $2, 600)', [
      `desktop-opened-ip:${hash}`,
      hour
    ])
    assert.equal((await send(OPENED, { 'cf-connecting-ip': ip })).status, 429)
    const buckets = (await db.pool.query('select bucket from rate_bucket')).rows.map((r) => r.bucket)
    assert.equal(
      buckets.some((bucket) => bucket.includes(ip)),
      false
    )
    assert.equal((await db.pool.query('select count(*)::int as n from ops_signal')).rows[0].n, 0)
  }
)

test('a failed rate lookup refuses the claim; a failed event insert tells the app to retry', async () => {
  const failed = harness({
    query: async () => {
      throw new Error('database unavailable')
    }
  })
  assert.equal((await failed.send()).status, 429)
  const insertFailed = harness({
    query: async (sql) => {
      if (sql.includes('insert into rate_bucket')) return { rows: [{ count: 1 }] }
      throw new Error('event insert failed')
    }
  })
  assert.equal((await insertFailed.send()).status, 503)
})
