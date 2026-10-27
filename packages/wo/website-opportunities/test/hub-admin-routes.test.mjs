// Hub administration doors (`src/ops/hub-admin-routes.js`): accounts with their quota use, block and unblock, revoke
// a token, withdraw a contribution, take a place or picture off the hub, remove a business, the verify backlog.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { Hono } from 'hono'
import { createCostLedger } from '../src/cost-ledger.js'
import { createHubQuota } from '../src/hub/quota.js'
import { createHubTokens } from '../src/hub/tokens.js'
import { VERIFY_PURPOSE } from '../src/hub/verify-queue.js'
import { hubAdminRoutes } from '../src/ops/hub-admin-routes.js'
import { hubDatabase, makePlace, makeTokenHolder, observe } from './hub-fixtures.mjs'

/** One pending observation in a contribution of its own (the shared fixture writes decided ones). */
async function pendingObservation(pool, accountId, subject, field = 'name', value = 'Cafe') {
  const c = await pool.query(
    `insert into wo_hub_contribution (account_id, idempotency_key, payload_hash, schema_version, payload_bytes)
     values ($1, $2, $3, 'wo-contribution/v1', 100) returning id`,
    [accountId, `k-${Math.random()}`, 'b'.repeat(64)]
  )
  const o = await pool.query(
    `insert into wo_hub_observation (contribution_id, ordinal, subject_namespace, subject_external_id, field, value,
       claimed_source_family, claimed_source_object_id, policy_version)
     values ($1, 0, $2, $3, $4, $5::jsonb, 'google_maps', $3, 'intake/1') returning id`,
    [c.rows[0].id, subject.namespace, subject.externalId, field, JSON.stringify(value)]
  )
  return o.rows[0].id
}

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const NOW = Date.parse('2026-10-23T12:00:00Z')
const BASE = '/api/website-opportunities/operator/hub'
let db
let app

const host = {
  json: (c, body, status = 200) => c.json(body, status),
  async requireOperator(c) {
    return c.req.header('x-op') === 'op' ? 'op@example.test' : c.json({ code: 'FORBIDDEN' }, 403)
  }
}
const call = (path, { method = 'GET', who = 'op', body } = {}) =>
  app.request(`${BASE}${path}`, {
    method,
    headers: { 'x-op': who, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  })

before(async () => {
  if (!process.env.TEST_DATABASE_URL) return
  db = await hubDatabase()
  app = new Hono()
  app.route(
    '/',
    hubAdminRoutes({ pool: db.pool, host, now: () => NOW, verifyDailyCapCents: 300, log: { log() {} } })
  )
})
after(async () => db?.close())

test('only an operator gets in', opts, async () => {
  assert.equal((await call('/accounts', { who: 'nobody' })).status, 403)
  assert.equal((await call('/verify', { who: 'nobody' })).status, 403)
})

test('accounts list their token prefix, contributions and quota use against the limits', opts, async () => {
  const holder = await makeTokenHolder(db.pool)
  await createHubQuota({ pool: db.pool, now: () => NOW }).charge(holder.accountId, 'read_places', 7)
  const { placeId, identities } = await makePlace(db.pool)
  await pendingObservation(db.pool, holder.accountId, identities[0])
  const out = await (await call('/accounts')).json()
  const row = out.accounts.find((a) => a.id === holder.accountId)
  assert.equal(row.state, 'active')
  assert.equal(row.tokenPrefix, holder.token.slice(4, 12))
  assert.equal(row.contributions.total, 1)
  assert.deepEqual(row.usage.read_places, { day: 7, month: 7 })
  assert.deepEqual(out.limits.read_places, { day: 500, month: 10_000 })
  assert.ok(placeId)
})

test('block stops the token at once, unblock lets it back in', opts, async () => {
  const holder = await makeTokenHolder(db.pool)
  const tokens = createHubTokens({ pool: db.pool })
  assert.equal((await call(`/accounts/${holder.accountId}/block`, { method: 'POST', body: {} })).status, 200)
  assert.equal(await tokens.authenticate(holder.token), null)
  assert.equal(
    (await call(`/accounts/${holder.accountId}/unblock`, { method: 'POST', body: {} })).status,
    200
  )
  assert.equal((await tokens.authenticate(holder.token))?.accountId, holder.accountId)
  assert.equal(
    (await call('/accounts/00000000-0000-4000-8000-000000000000/block', { method: 'POST', body: {} })).status,
    404
  )
})

test('revoke token: the token stops, the account and its quota stay', opts, async () => {
  const holder = await makeTokenHolder(db.pool)
  const res = await call(`/accounts/${holder.accountId}/revoke-token`, { method: 'POST', body: {} })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true, revoked: true })
  assert.equal(await createHubTokens({ pool: db.pool }).authenticate(holder.token), null)
  const again = await (
    await call(`/accounts/${holder.accountId}/revoke-token`, { method: 'POST', body: {} })
  ).json()
  assert.equal(again.revoked, false)
})

test('withdraw a contribution on its account behalf; the receipt says withdrawn', opts, async () => {
  const holder = await makeTokenHolder(db.pool)
  const { identities } = await makePlace(db.pool)
  const obs = await observe(db.pool, {
    subject: identities[0],
    field: 'name',
    value: 'Cafe',
    account: holder.accountId
  })
  const { rows } = await db.pool.query('select contribution_id from wo_hub_observation where id = $1', [obs])
  const id = rows[0].contribution_id
  const listed = await (await call(`/accounts/${holder.accountId}/contributions`)).json()
  assert.deepEqual(
    listed.contributions.map((c) => c.id),
    [id]
  )
  const res = await call(`/contributions/${id}/withdraw`, { method: 'POST', body: {} })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).receipt.status, 'withdrawn')
  assert.equal(
    (await call('/contributions/00000000-0000-4000-8000-000000000000/withdraw', { method: 'POST', body: {} }))
      .status,
    404
  )
})

test('revoke a place, remove a business, revoke a picture: each needs a reason', opts, async () => {
  const a = await makePlace(db.pool)
  const b = await makePlace(db.pool)
  assert.equal((await call(`/places/${a.placeId}/revoke`, { method: 'POST', body: {} })).status, 400)
  assert.equal(
    (await call(`/places/${a.placeId}/revoke`, { method: 'POST', body: { reason: 'wrong data' } })).status,
    200
  )
  const state = async (id) =>
    (await db.pool.query('select state from wo_hub_place where place_id = $1', [id])).rows[0].state
  assert.equal(await state(a.placeId), 'revoked')
  assert.equal(
    (await call(`/places/${b.placeId}/suppress`, { method: 'POST', body: { reason: 'owner asked' } })).status,
    200
  )
  assert.equal(await state(b.placeId), 'deleted')
  const suppressed = await db.pool.query('select count(*)::int as n from wo_hub_suppressed_identity')
  assert.equal(suppressed.rows[0].n, 1)
  const media = (
    await db.pool.query(
      `insert into wo_place_media (place_id, kind, source, source_url, sha256)
       values ($1, 'image', 'google-places', 'https://example.com/a.jpg', $2) returning id`,
      [a.placeId, 'a'.repeat(64)]
    )
  ).rows[0].id
  const res = await call(`/media/${media}/revoke`, { method: 'POST', body: { reason: 'not the business' } })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true, revoked: true })
  assert.equal(
    (
      await call('/media/00000000-0000-4000-8000-000000000000/revoke', {
        method: 'POST',
        body: { reason: 'x' }
      })
    ).status,
    404
  )
  assert.equal(
    (await call('/places/not-a-uuid/revoke', { method: 'POST', body: { reason: 'x' } })).status,
    404
  )
})

test('verify backlog counts pending work and today’s verification spend against its cap', opts, async () => {
  const holder = await makeTokenHolder(db.pool)
  const { identities } = await makePlace(db.pool)
  const o = await pendingObservation(db.pool, holder.accountId, identities[0], 'website', 'https://a.example')
  await db.pool.query(`update wo_hub_observation set reason = 'deferred_budget' where id = $1`, [o])
  const ledger = createCostLedger({
    pool: db.pool,
    now: () => NOW,
    caps: async () => ({ dailyCapCents: 1e6, jobCapCents: 1e6 })
  })
  const r = await ledger.reserve({
    provider: 'google',
    operation: 'place-details',
    maxCents: 4,
    purpose: VERIFY_PURPOSE
  })
  await ledger.settle(r.reservation, 3)
  const v = await (await call('/verify')).json()
  assert.ok(v.backlog.pendingObservations >= 1)
  assert.ok(v.backlog.pendingGroups >= 1)
  assert.ok(v.backlog.deferredBudget >= 1)
  assert.match(v.backlog.oldestReceivedAt, /^\d{4}-/)
  assert.deepEqual(v.budget, { day: '2026-10-23', spentCents: 3, capCents: 300 })
})
