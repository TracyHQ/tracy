// The hub's intake doors under /hub/v1: bearer token, per-account quota, idempotent receipts, withdraw, and the
// signed-in person's token doors.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { migrate } from '../src/schema/index.js'
import { hubIntakeRoutes } from '../src/hub/intake-routes.js'
import { createHubTokens, ensureHubAccount } from '../src/hub/tokens.js'
import { scratchDatabase } from './scratch-database.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const ORIGIN = 'http://hub.example'
let db
let tokens

before(async () => {
  if (!process.env.TEST_DATABASE_URL) return
  db = await scratchDatabase()
  await migrate(db.pool)
  tokens = createHubTokens({ pool: db.pool })
})
after(async () => db?.close())

const principal = async () =>
  (await db.pool.query(`insert into wo_principal (kind) values ('test') returning id`)).rows[0].id

// A signed-in person is named by a test header; their principal is their email's principal row.
const people = new Map()
const host = {
  json: (c, body, status = 200) => c.json(body, status),
  requireViewer: async (c) => c.req.header('x-test-viewer') ?? new Response('sign in', { status: 401 }),
  principalOf: async (_pool, email) => people.get(email) ?? null,
  hubAccountOf: async (pool, principalId) => (await ensureHubAccount(pool, principalId)).accountId
}

const app = (extra = {}) => hubIntakeRoutes({ pool: db.pool, host, config: { origin: ORIGIN }, ...extra })

const google = { family: 'google_maps', objectId: 'ChIJ-cafe' }
const body = (observations, subjectId = 'ChIJ-cafe') => ({
  schema: 'wo-contribution/v1',
  subject: { identity: { namespace: 'google', externalId: subjectId } },
  observations
})
const website = (url = 'https://cafe.example/') => ({ field: 'website', value: url, source: google })

function send(hub, token, payload, { key = 'k-1', path = '/hub/v1/contributions', raw } = {}) {
  return hub.request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(key ? { 'idempotency-key': key } : {})
    },
    body: raw ?? JSON.stringify(payload)
  })
}
const get = (hub, token, path) => hub.request(path, { headers: { authorization: `Bearer ${token}` } })
const observationsUsed = async (accountId) =>
  Number(
    (
      await db.pool.query(
        `select coalesce(sum(used), 0) as n from wo_hub_quota_use
         where account_id = $1 and category = 'observations' and period = 'day'`,
        [accountId]
      )
    ).rows[0].n
  )

test('a contribution is answered 202 with a receipt the account can read back', opts, async () => {
  const hub = app()
  const { token } = await tokens.issue(await principal())
  const res = await send(hub, token, body([website(), { field: 'name', value: 'Cafe', source: google }]))
  assert.equal(res.status, 202)
  const receipt = await res.json()
  assert.equal(receipt.status, 'pending')
  assert.deepEqual(receipt.subject, { namespace: 'google', externalId: 'ChIJ-cafe' })
  assert.deepEqual(
    receipt.observations.map((o) => [o.ordinal, o.field, o.status]),
    [
      [0, 'website', 'pending'],
      [1, 'name', 'pending']
    ]
  )
  assert.ok(receipt.receivedAt)
  const again = await get(hub, token, `/hub/v1/contributions/${receipt.id}`)
  assert.equal(again.status, 200)
  assert.deepEqual(await again.json(), receipt)

  const { token: other } = await tokens.issue(await principal())
  assert.equal((await get(hub, other, `/hub/v1/contributions/${receipt.id}`)).status, 404)
  assert.equal((await get(hub, token, '/hub/v1/contributions/not-a-uuid')).status, 404)
})

test('a retry after a lost answer gets the same receipt and is never charged twice', opts, async () => {
  const hub = app()
  const p = await principal()
  const { token, accountId } = await tokens.issue(p)
  const first = await (await send(hub, token, body([website()]), { key: 'retry-1' })).json()
  const retry = await send(hub, token, body([website()]), { key: 'retry-1' })
  assert.equal(retry.status, 202)
  assert.equal(retry.headers.get('idempotent-replayed'), 'true')
  assert.deepEqual(await retry.json(), first)
  assert.equal(await observationsUsed(accountId), 1)
  const count = await db.pool.query(
    'select count(*)::int as n from wo_hub_contribution where account_id = $1',
    [accountId]
  )
  assert.equal(count.rows[0].n, 1)

  const changed = await send(hub, token, body([website('https://other.example/')]), { key: 'retry-1' })
  assert.equal(changed.status, 409)
  assert.equal((await changed.json()).code, 'idempotency_key_reused')
  assert.equal(await observationsUsed(accountId), 1)
})

test('no token, an unknown token, and the old token after a rotate are refused', opts, async () => {
  const hub = app()
  const p = await principal()
  const { token: old } = await tokens.issue(p)
  const { token: fresh } = await tokens.rotate(p)
  const fake = ['woh', '_', 'Z'.repeat(43)].join('')
  for (const t of [null, fake, old]) {
    const res = await send(hub, t, body([website()]), { key: `t-${t}` })
    assert.equal(res.status, 401)
    assert.match(res.headers.get('www-authenticate') ?? '', /^Bearer/)
  }
  assert.equal((await send(hub, fresh, body([website()]))).status, 202)
})

test('quota is the account’s: every holder of its token, and every rotation, share it', opts, async () => {
  const hub = app({ quotaLimits: { observations: { day: 3, month: null } } })
  const p = await principal()
  const { token } = await tokens.issue(p)
  // Two holders of the same token, each sending two observations.
  assert.equal((await send(hub, token, body([website(), website()]), { key: 'holder-a' })).status, 202)
  const second = await send(hub, token, body([website(), website()]), { key: 'holder-b' })
  assert.equal(second.status, 429)
  assert.equal((await second.json()).code, 'quota_exceeded')
  const { token: rotated } = await tokens.rotate(p)
  assert.equal((await send(hub, rotated, body([website()]), { key: 'after-rotate' })).status, 202)
  assert.equal((await send(hub, rotated, body([website()]), { key: 'after-rotate-2' })).status, 429)
  // Another account has its own quota.
  const { token: other } = await tokens.issue(await principal())
  assert.equal((await send(hub, other, body([website(), website(), website()]), { key: 'x' })).status, 202)
  const usage = await (await get(hub, rotated, '/hub/v1/account')).json()
  assert.equal(usage.usage.observations.day, 3)
  assert.equal(usage.limits.observations.day, 3)
})

test('a batch over 50 observations or 256 KiB, a missing key, or bad JSON is refused', opts, async () => {
  const hub = app()
  const { token } = await tokens.issue(await principal())
  const many = await send(hub, token, body(Array.from({ length: 51 }, () => website())), { key: 'many' })
  assert.equal(many.status, 422)
  assert.equal((await many.json()).code, 'too_many_observations')
  const big = body([{ field: 'name', value: 'x'.repeat(300), source: google }])
  const raw = JSON.stringify({ ...big, padding: 'y'.repeat(256 * 1024) })
  const huge = await send(hub, token, null, { key: 'huge', raw })
  assert.equal(huge.status, 413)
  assert.equal((await send(hub, token, body([website()]), { key: null })).status, 400)
  assert.equal((await send(hub, token, null, { key: 'bad', raw: '{not json' })).status, 400)
})

test('a pipeline field nested anywhere is refused, with its reason', opts, async () => {
  const hub = app()
  const { token } = await tokens.issue(await principal())
  const top = await send(hub, token, { ...body([website()]), seller: { dealStatus: 'won' } }, { key: 'top' })
  assert.equal(top.status, 422)
  assert.deepEqual(await top.json(), {
    code: 'private_field',
    path: 'seller.dealStatus',
    next: 'Send only public business facts: deal status, notes, briefs, demos and outreach stay with you.'
  })
  const inner = await send(
    hub,
    token,
    body([website(), { field: 'name', value: 'Cafe', source: { ...google, extra: { notes: 'x' } } }]),
    { key: 'inner' }
  )
  assert.equal(inner.status, 202)
  const receipt = await inner.json()
  assert.deepEqual(
    receipt.observations.map((o) => [o.status, o.reason]),
    [
      ['pending', null],
      ['rejected', 'private_field']
    ]
  )
  const stored = await db.pool.query(
    'select value from wo_hub_observation where contribution_id = $1 and ordinal = 1',
    [receipt.id]
  )
  assert.equal(stored.rows[0].value, null)
})

test(
  'withdraw is for the account’s own contribution and marks its observations withdrawn',
  opts,
  async () => {
    const hub = app()
    const { token } = await tokens.issue(await principal())
    const { token: other } = await tokens.issue(await principal())
    const receipt = await (
      await send(hub, token, body([website(), { field: 'phone', value: '1', source: google }]), { key: 'w' })
    ).json()
    assert.equal(
      (await send(hub, other, {}, { path: `/hub/v1/contributions/${receipt.id}/withdraw`, key: null }))
        .status,
      404
    )
    const res = await send(
      hub,
      token,
      {},
      { path: `/hub/v1/contributions/${receipt.id}/withdraw`, key: null }
    )
    assert.equal(res.status, 200)
    const withdrawn = await res.json()
    assert.equal(withdrawn.status, 'withdrawn')
    assert.ok(withdrawn.withdrawnAt)
    assert.deepEqual(
      withdrawn.observations.map((o) => o.status),
      ['withdrawn', 'rejected']
    )
    const twice = await send(
      hub,
      token,
      {},
      { path: `/hub/v1/contributions/${receipt.id}/withdraw`, key: null }
    )
    assert.deepEqual(await twice.json(), withdrawn)
  }
)

test('an account may wait on at most N places at once', opts, async () => {
  const hub = app({ pendingPlacesLimit: 2 })
  const { token } = await tokens.issue(await principal())
  const place = (id) =>
    body([{ field: 'name', value: 'Cafe', source: { family: 'google_maps', objectId: id } }], id)
  assert.equal((await send(hub, token, place('ChIJ-a'), { key: 'a' })).status, 202)
  assert.equal((await send(hub, token, place('ChIJ-b'), { key: 'b' })).status, 202)
  assert.equal((await send(hub, token, place('ChIJ-a'), { key: 'a2' })).status, 202)
  const third = await send(hub, token, place('ChIJ-c'), { key: 'c' })
  assert.equal(third.status, 429)
  assert.equal((await third.json()).code, 'pending_limit')
})

test('a signed-in person gets, rotates and revokes their token through the host', opts, async () => {
  const hub = app()
  const p = await principal()
  people.set('seller@example.com', p)
  const as = (method, extra = {}) =>
    hub.request('/hub/v1/account/token', {
      method,
      headers: { 'x-test-viewer': 'seller@example.com', origin: ORIGIN, ...extra }
    })
  assert.deepEqual(await (await as('GET')).json(), {
    accountId: null,
    state: null,
    tokenPrefix: null,
    tokenCreatedAt: null
  })
  const issued = await as('POST')
  assert.equal(issued.status, 201)
  const { token, prefix } = await issued.json()
  assert.equal((await tokens.authenticate(token))?.principalId, p)
  assert.equal((await (await as('GET')).json()).tokenPrefix, prefix)
  const rotated = await (await as('POST')).json()
  assert.equal(await tokens.authenticate(token), null)
  assert.ok(await tokens.authenticate(rotated.token))
  assert.equal((await as('POST', { origin: 'http://evil.example' })).status, 403)
  assert.equal((await as('DELETE')).status, 200)
  assert.equal(await tokens.authenticate(rotated.token), null)
  const anonymous = await hub.request('/hub/v1/account/token', {
    method: 'POST',
    headers: { origin: ORIGIN }
  })
  assert.equal(anonymous.status, 401)
})

test('without hubAccountOf the host offers no token doors', opts, async () => {
  const { hubAccountOf: _hubAccountOf, ...plain } = host
  const hub = hubIntakeRoutes({ pool: db.pool, host: plain, config: { origin: ORIGIN } })
  assert.equal((await hub.request('/hub/v1/account/token')).status, 404)
})
