// The operator doors (`src/ops/operator-routes.js`): settings, provider keys, spend, research queue. Only a caller
// the host names an operator gets in; writes need a JSON body (a cross-site form cannot send one without asking).
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { Hono } from 'hono'
import { createCostLedger } from '../src/cost-ledger.js'
import { migrate } from '../src/schema/index.js'
import { operatorRoutes } from '../src/ops/operator-routes.js'
import { keyHint } from '../src/ops/provider-keys.js'
import { scratchDatabase } from './scratch-database.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const NOW = Date.parse('2026-10-23T12:00:00Z')
const HOUR = 3_600_000
const BASE = '/api/website-opportunities/operator'
let db

const json = (c, body, status = 200) => c.json(body, status)
function testHost({ seal = true } = {}) {
  return {
    json,
    async requireOperator(c, { write = false } = {}) {
      const who = c.req.header('x-op')
      if (who === 'reader' && !write) return 'reader@example.test'
      if (who === 'op') return 'op@example.test'
      return c.json({ code: 'FORBIDDEN', next: 'Operators only.' }, 403)
    },
    openSecret: async (cipher) => (cipher.startsWith('sealed:') ? cipher.slice(7) : null),
    ...(seal ? { sealSecret: async (plain) => `sealed:${plain}` } : {}),
    rateCountsOf: async () => new Map([['wo:social-budget:instagram-scrapecreators', 10]])
  }
}

function appWith({ host = testHost(), config = {}, fetchImpl, hub = false } = {}) {
  const app = new Hono()
  app.route(
    '/',
    operatorRoutes({
      pool: db.pool,
      config: { sessionSecret: 's'.repeat(32), apifyToken: 'apify_env_token', ...config },
      host,
      fetchImpl,
      hub,
      now: () => NOW,
      log: { log() {}, warn() {} }
    })
  )
  return app
}

const call = (app, path, { method = 'GET', who = 'op', body, type = 'application/json' } = {}) =>
  app.request(`${BASE}${path}`, {
    method,
    headers: { 'x-op': who, ...(body !== undefined ? { 'content-type': type } : {}) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  })

before(async () => {
  if (!process.env.TEST_DATABASE_URL) return
  db = await scratchDatabase()
  await migrate(db.pool)
})
beforeEach(async () => {
  if (!db) return
  await db.pool.query('truncate wo_ops_setting, wo_cost_ledger, wo_place_job, wo_place cascade')
})
after(async () => db?.close())

test('keyHint names a key without printing it', () => {
  assert.equal(keyHint('sk-1234567890'), 'sk-… (13 chars)')
  assert.equal(keyHint(''), null)
})

test('a caller the host does not name an operator is refused on every door', opts, async () => {
  const app = appWith()
  for (const [path, method] of [
    ['/me', 'GET'],
    ['/settings', 'GET'],
    ['/spend', 'GET'],
    ['/queue', 'GET'],
    ['/settings', 'PUT']
  ]) {
    const res = await call(app, path, { method, who: 'nobody', body: method === 'GET' ? undefined : {} })
    assert.equal(res.status, 403, `${method} ${path}`)
  }
  // A reader may look but not write.
  assert.equal((await call(app, '/settings', { who: 'reader' })).status, 200)
  assert.equal(
    (await call(app, '/settings', { method: 'PUT', who: 'reader', body: { settings: {} } })).status,
    403
  )
})

test('/me says who the operator is and whether the hub tab exists', opts, async () => {
  assert.deepEqual(await (await call(appWith(), '/me')).json(), {
    operator: true,
    email: 'op@example.test',
    hub: false,
    keysWritable: true
  })
  const standalone = appWith({ host: testHost({ seal: false }), hub: true })
  const me = await (await call(standalone, '/me')).json()
  assert.equal(me.hub, true)
  assert.equal(me.keysWritable, false)
})

test('a write without a JSON body is refused before anything changes', opts, async () => {
  const app = appWith()
  const res = await call(app, '/settings', { method: 'PUT', body: '{"settings":{}}', type: 'text/plain' })
  assert.equal(res.status, 415)
  assert.equal((await res.json()).code, 'JSON_REQUIRED')
})

test(
  'settings: read the defaults, save a partial change, keep the rest, refuse a bad order',
  opts,
  async () => {
    const app = appWith()
    const first = await (await call(app, '/settings')).json()
    assert.equal(first.settings.researchDailyCapCents, 2000)
    assert.equal(first.keys.providers.apify.source, 'env')
    assert.equal(first.keys.providers.google.configured, false)
    assert.ok(first.capabilities.some((g) => g.id === 'instagram'))
    const saved = await call(app, '/settings', {
      method: 'PUT',
      body: { settings: { researchDailyCapCents: 900, providerOrder: { facebook: ['apify'] } } }
    })
    assert.equal(saved.status, 200)
    const doc = await saved.json()
    assert.equal(doc.settings.researchDailyCapCents, 900)
    assert.equal(doc.settings.researchJobCapCents, 200)
    assert.deepEqual(doc.settings.providerOrder, { facebook: ['apify'] })
    assert.equal(doc.settingsMeta.updatedBy, 'op@example.test')
    const bad = await call(app, '/settings', {
      method: 'PUT',
      body: { settings: { providerOrder: { myspace: [] } } }
    })
    assert.equal(bad.status, 400)
    assert.equal((await bad.json()).code, 'INVALID_PROVIDER_ORDER')
  }
)

test('provider states read the host rate counts: a spent daily cap shows limit_reached', opts, async () => {
  const app = appWith()
  await call(app, '/settings', {
    method: 'PUT',
    body: { settings: { socialStatsProviderDailyCap: { 'instagram-scrapecreators': 10 } } }
  })
  await call(app, '/keys/scrapecreators', { method: 'PUT', body: { apiKey: 'sc_key_123456' } })
  const doc = await (await call(app, '/settings')).json()
  const ig = doc.capabilities.find((g) => g.id === 'instagram')
  assert.equal(ig.providers.find((p) => p.id === 'scrapecreators').state, 'limit_reached')
})

test('keys: sealed through the host, shown as a hint, cleared back to the environment', opts, async () => {
  const app = appWith()
  const saved = await call(app, '/keys/apify', { method: 'PUT', body: { apiKey: 'apify_saved_key_99' } })
  assert.equal(saved.status, 200)
  const facts = (await saved.json()).keys.providers.apify
  assert.deepEqual(facts, { configured: true, source: 'ops', hint: 'api… (18 chars)' })
  const { rows } = await db.pool.query('select apify_key_cipher from wo_ops_setting')
  assert.equal(rows[0].apify_key_cipher, 'sealed:apify_saved_key_99')
  const cleared = await (await call(app, '/keys/apify', { method: 'PUT', body: { apiKey: '' } })).json()
  assert.equal(cleared.keys.providers.apify.source, 'env')
  assert.equal((await call(app, '/keys/nope', { method: 'PUT', body: { apiKey: 'x' } })).status, 400)
  assert.equal((await call(app, '/keys/apify', { method: 'PUT', body: { apiKey: 'a b' } })).status, 400)
})

test('keys are read-only on a host that cannot seal', opts, async () => {
  const app = appWith({ host: testHost({ seal: false }) })
  const res = await call(app, '/keys/apify', { method: 'PUT', body: { apiKey: 'apify_saved_key_99' } })
  assert.equal(res.status, 409)
  assert.equal((await res.json()).code, 'KEYS_READ_ONLY')
})

test('key test makes one call through the given fetch and never returns the key', opts, async () => {
  const seen = []
  const fetchImpl = async (url) => {
    seen.push(String(url))
    return new Response(JSON.stringify({ data: { username: 'me', plan: { id: 'FREE' } } }), { status: 200 })
  }
  const app = appWith({ fetchImpl })
  const res = await call(app, '/keys/apify/test', { method: 'POST', body: {} })
  const out = await res.json()
  assert.equal(out.ok, true)
  assert.equal(out.status, 'connected')
  assert.deepEqual(seen, ['https://api.apify.com/v2/users/me'])
  assert.ok(!JSON.stringify(out).includes('apify_env_token'))
  const missing = await (await call(app, '/keys/serpapi/test', { method: 'POST', body: {} })).json()
  assert.equal(missing.status, 'credential_missing')
})

async function charge(
  provider,
  operation,
  { reserved, actual = null, hoursAgo = 2, purpose = null, settle = true }
) {
  const ledger = createCostLedger({
    pool: db.pool,
    now: () => NOW - hoursAgo * HOUR,
    caps: async () => ({ dailyCapCents: 1e7, jobCapCents: 1e7 })
  })
  const r = await ledger.reserve({ provider, operation, maxCents: reserved, purpose })
  if (settle) await ledger.settle(r.reservation, actual)
  return r.reservation.id
}

test(
  'spend: totals per provider, purpose and day, with unreconciled rows counted at their ceiling',
  opts,
  async () => {
    await charge('apify', 'actor', { reserved: 20, actual: 7, purpose: 'research' })
    await charge('apify', 'actor', { reserved: 20, actual: 9, purpose: 'research', hoursAgo: 30 })
    await charge('google', 'place-details', { reserved: 3, purpose: 'find' })
    const stuck = await charge('serpapi', 'google-search', { reserved: 5, settle: false })
    await db.pool.query(`update wo_cost_ledger set state = 'unreconciled' where id = $1`, [stuck])
    const app = appWith()
    const s = await (await call(app, '/spend?days=7')).json()
    assert.equal(s.days, 7)
    assert.equal(s.totals.calls, 4)
    assert.equal(s.totals.committedCents, 7 + 9 + 3 + 5)
    assert.equal(s.totals.unreconciledCents, 5)
    assert.equal(s.totals.unreconciledCalls, 1)
    assert.deepEqual(
      s.byProvider.map((p) => [p.provider, p.calls, p.committedCents]),
      [
        ['apify', 2, 16],
        ['serpapi', 1, 5],
        ['google', 1, 3]
      ]
    )
    assert.deepEqual(
      s.byPurpose.map((p) => [p.purpose, p.committedCents]),
      [
        ['research', 16],
        [null, 5],
        ['find', 3]
      ]
    )
    assert.deepEqual(
      s.byDay.map((d) => [d.day, d.committedCents]),
      [
        ['2026-10-22', 9],
        ['2026-10-23', 15]
      ]
    )
    assert.equal(s.today.day, '2026-10-23')
    assert.equal(s.today.committedCents, 15)
    assert.equal(s.caps.researchDailyCapCents, 2000)
    assert.equal(s.caps.researchJobCapCents, 200)
    assert.equal((await call(app, '/spend?days=0')).status, 400)
  }
)

test('spend rows: newest first, filtered by state, paged by cursor', opts, async () => {
  for (let i = 0; i < 3; i++) await charge('apify', 'actor', { reserved: 20, actual: i + 1, hoursAgo: i + 1 })
  const stuck = await charge('serpapi', 'google-search', { reserved: 5, settle: false, hoursAgo: 5 })
  await db.pool.query(`update wo_cost_ledger set state = 'unreconciled' where id = $1`, [stuck])
  const app = appWith()
  const page1 = await (await call(app, '/spend/rows?limit=2')).json()
  assert.deepEqual(
    page1.rows.map((r) => r.actualCents),
    [1, 2]
  )
  assert.ok(page1.next)
  const page2 = await (await call(app, `/spend/rows?limit=2&cursor=${encodeURIComponent(page1.next)}`)).json()
  assert.deepEqual(
    page2.rows.map((r) => r.provider),
    ['apify', 'serpapi']
  )
  assert.equal(page2.next, null)
  const unrec = await (await call(app, '/spend/rows?state=unreconciled')).json()
  assert.deepEqual(
    unrec.rows.map((r) => [r.provider, r.state, r.reservedCents]),
    [['serpapi', 'unreconciled', 5]]
  )
  assert.equal((await call(app, '/spend/rows?state=lost')).status, 400)
  assert.equal((await call(app, '/spend/rows?cursor=garbage')).status, 400)
})

async function place(name) {
  return (await db.pool.query('insert into wo_place (display_name) values ($1) returning id', [name])).rows[0]
    .id
}
async function job(placeId, state, extra = {}) {
  const { rows } = await db.pool.query(
    `insert into wo_place_job (place_id, state, last_error, updated_at) values ($1, $2, $3::jsonb, $4) returning id`,
    [
      placeId,
      state,
      extra.lastError ? JSON.stringify(extra.lastError) : null,
      new Date(NOW - (extra.minutesAgo ?? 0) * 60_000)
    ]
  )
  return rows[0].id
}

test('queue: counts by state and the jobs that need an eye, newest first', opts, async () => {
  const a = await place('Cafe A')
  const b = await place('Cafe B')
  const c = await place('Cafe C')
  await job(a, 'completed', { minutesAgo: 1 })
  await job(b, 'failed', { minutesAgo: 2, lastError: { code: 'TIMEOUT', message: 'Provider timed out' } })
  await job(c, 'queued', { minutesAgo: 3 })
  const app = appWith()
  const q = await (await call(app, '/queue')).json()
  assert.equal(q.counts.completed, 1)
  assert.equal(q.counts.failed, 1)
  assert.equal(q.counts.queued, 1)
  assert.equal(q.counts.running, 0)
  assert.deepEqual(
    q.jobs.map((j) => [j.placeName, j.state]),
    [
      ['Cafe B', 'failed'],
      ['Cafe C', 'queued']
    ]
  )
  assert.equal(q.jobs[0].error, 'TIMEOUT: Provider timed out')
  const done = await (await call(app, '/queue?state=completed')).json()
  assert.deepEqual(
    done.jobs.map((j) => j.placeName),
    ['Cafe A']
  )
  assert.equal((await call(app, '/queue?state=lost')).status, 400)
})

test('queue retry queues the place again; cancel stops a job nobody waits on', opts, async () => {
  const a = await place('Cafe A')
  const failed = await job(a, 'failed', { lastError: { code: 'X' } })
  const app = appWith()
  const retried = await call(app, `/queue/${failed}/retry`, { method: 'POST', body: {} })
  assert.equal(retried.status, 200)
  const out = await retried.json()
  assert.equal(out.job.state, 'queued')
  const again = await call(app, `/queue/${out.job.id}/retry`, { method: 'POST', body: {} })
  assert.equal(again.status, 409)
  assert.equal((await again.json()).code, 'NOT_RETRYABLE')
  const cancelled = await call(app, `/queue/${out.job.id}/cancel`, { method: 'POST', body: {} })
  assert.equal(cancelled.status, 200)
  const { rows } = await db.pool.query('select state from wo_place_job where id = $1', [out.job.id])
  assert.equal(rows[0].state, 'cancelled')
  assert.equal((await call(app, `/queue/${out.job.id}/cancel`, { method: 'POST', body: {} })).status, 409)
  assert.equal(
    (await call(app, '/queue/00000000-0000-4000-8000-000000000000/retry', { method: 'POST', body: {} }))
      .status,
    404
  )
  assert.equal((await call(app, '/queue/not-a-uuid/cancel', { method: 'POST', body: {} })).status, 404)
})
