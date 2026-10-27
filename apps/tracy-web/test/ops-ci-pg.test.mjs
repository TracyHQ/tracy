// Real database coverage for verified member selection and the staff boundary.
import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { fileDb } from './_db.mjs'
import { ciRoutes } from '../src/ops/ci.js'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const pgOnly = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const config = { sessionSecret: 's'.repeat(32), ciToken: null, origin: 'http://tracy.test' }
const snapshot = { rows: [], measuredAt: null, configured: false, error: 'Not configured' }
const reader = { list: async () => snapshot, detail: async () => null }
const get = async (app, email) =>
  app.request('http://tracy.test/api/ops/ci', {
    headers: { cookie: `tracy_sess=${await mintSession(email, config.sessionSecret)}` }
  })
async function seat(email, { accepted = true, revoked = false } = {}) {
  const account = (
    await db.pool.query('insert into account(email,display_name) values($1,$2) returning id', [email, 'Lee'])
  ).rows[0].id
  const workspace = (
    await db.pool.query(
      "insert into workspace(display_name,kind) values('Tracy','tracy_admin') on conflict(display_name) do update set display_name=excluded.display_name returning id"
    )
  ).rows[0].id
  await db.pool.query(
    `insert into seat_workspace(workspace_id,account_id,role,granted_by,accepted_at,revoked_at)
    values($1,$2,'editor',$2,$3,$4)`,
    [workspace, account, accepted ? new Date() : null, revoked ? new Date() : null]
  )
  return account
}
test(
  'CI database door defaults to the verified GitHub subject, including members with zero PRs',
  pgOnly,
  async () => {
    const account = await seat('staff@example.com')
    await db.pool.query("insert into identity(provider,subject,account_id) values('github','12345',$1)", [
      account
    ])
    const response = await get(ciRoutes({ pool: db.pool, config, reader }), 'staff@example.com')
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.deepEqual(body.viewer, { authorId: '12345', linked: true })
    assert.deepEqual(body.members, [{ id: '12345', name: 'Lee', login: null }])
    assert.equal(response.headers.get('cache-control'), 'no-store')
  }
)
test('CI database door defaults an unlinked staff member to All', pgOnly, async () => {
  await seat('staff@example.com')
  const response = await get(ciRoutes({ pool: db.pool, config, reader }), 'staff@example.com')
  assert.deepEqual((await response.json()).viewer, { authorId: null, linked: false })
})
test('CI database door excludes pending and revoked staff seats before reading GitHub', pgOnly, async () => {
  await seat('pending@example.com', { accepted: false })
  await seat('revoked@example.com', { revoked: true })
  let reads = 0
  const app = ciRoutes({
    pool: db.pool,
    config,
    reader: {
      ...reader,
      list: async () => {
        reads++
        return snapshot
      }
    }
  })
  assert.equal((await get(app, 'pending@example.com')).status, 403)
  assert.equal((await get(app, 'revoked@example.com')).status, 403)
  assert.equal(reads, 0)
})

async function putRead(app, email, body, origin = config.origin) {
  return app.request('http://tracy.test/api/ops/ci/read', {
    method: 'PUT',
    headers: {
      cookie: `tracy_sess=${await mintSession(email, config.sessionSecret)}`,
      'content-type': 'application/json',
      ...(origin ? { origin } : {})
    },
    body: JSON.stringify(body)
  })
}
test(
  'CI read records belong to each Tracy account and survive head/status changes and route recreation',
  pgOnly,
  async () => {
    await seat('a@example.com')
    await seat('b@example.com')
    const rows = [{ id: 1052, authorId: '1', commit: 'first', build: 'Building' }]
    const observed = { ...snapshot, rows }
    const reader = { list: async () => observed, detail: async () => rows[0] }
    let app = ciRoutes({ pool: db.pool, config, reader })
    assert.equal((await (await get(app, 'a@example.com')).json()).rows[0].unread, true)
    const cookie = `tracy_sess=${await mintSession('a@example.com', config.sessionSecret)}`
    assert.equal(
      (await (await app.request('http://tracy.test/api/ops/ci/1052', { headers: { cookie } })).json()).row
        .unread,
      true
    )
    assert.equal((await db.pool.query('select count(*)::int as n from ops_ci_pr_read')).rows[0].n, 0)
    const response = await putRead(app, 'a@example.com', { read: true, numbers: [1052, 1052] })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).states.length, 1)
    app = ciRoutes({ pool: db.pool, config, reader })
    Object.assign(rows[0], { commit: 'new-head', build: 'Ready' })
    const a = (await (await get(app, 'a@example.com')).json()).rows[0]
    assert.equal(a.unread, false)
    assert.ok(a.readAt)
    assert.equal(a.commit, 'new-head')
    assert.equal((await (await get(app, 'b@example.com')).json()).rows[0].unread, true)
    assert.equal(rows[0].unread, undefined, 'never mutate the shared GitHub cache')
    assert.equal((await putRead(app, 'a@example.com', { read: false, numbers: [1052] })).status, 200)
    assert.equal((await (await get(app, 'a@example.com')).json()).rows[0].unread, true)
  }
)
test('CI mark all persists beyond a 50-row page and keeps newly discovered PRs unread', pgOnly, async () => {
  await seat('a@example.com')
  const rows = Array.from({ length: 101 }, (_, i) => ({ id: i + 1, authorId: '1' }))
  const app = ciRoutes({
    pool: db.pool,
    config,
    reader: { ...reader, list: async () => ({ ...snapshot, rows }) }
  })
  const result = await putRead(app, 'a@example.com', {
    read: true,
    numbers: rows.slice(0, 100).map((row) => row.id)
  })
  assert.equal(result.status, 200)
  const body = await (await get(app, 'a@example.com')).json()
  assert.equal(body.rows.filter((row) => !row.unread).length, 100)
  assert.equal(body.rows[99].unread, false)
  assert.equal(body.rows[100].unread, true)
})
test(
  'CI read writes reject invalid input and cross-origin requests without changing records',
  pgOnly,
  async () => {
    await seat('a@example.com')
    const app = ciRoutes({ pool: db.pool, config, reader })
    for (const body of [
      null,
      {},
      { read: true, numbers: [] },
      { read: 'true', numbers: [1] },
      { read: true, numbers: [0] },
      { read: true, numbers: [1.5] },
      { read: true, numbers: [2147483648] },
      { read: true, numbers: ['1'] },
      { read: true, numbers: Array(1001).fill(1) },
      { read: true, numbers: [1], accountId: 'another-account' },
      { read: true, numbers: [1], repo: 'another/repo' }
    ]) {
      assert.equal((await putRead(app, 'a@example.com', body)).status, 400)
    }
    for (const origin of ['http://evil.test', null])
      assert.equal((await putRead(app, 'a@example.com', { read: true, numbers: [1] }, origin)).status, 403)
    assert.equal((await db.pool.query('select count(*)::int as n from ops_ci_pr_read')).rows[0].n, 0)
  }
)
test('CI read writes require an accepted staff seat', pgOnly, async () => {
  await seat('pending@example.com', { accepted: false })
  await seat('revoked@example.com', { revoked: true })
  await db.pool.query("insert into account(email,display_name) values('customer@example.com','Customer')")
  const app = ciRoutes({ pool: db.pool, config, reader })
  for (const email of ['pending@example.com', 'revoked@example.com', 'customer@example.com'])
    assert.equal((await putRead(app, email, { read: true, numbers: [1] })).status, 403)
  assert.equal((await app.request('http://tracy.test/api/ops/ci/read', { method: 'PUT' })).status, 302)
  assert.equal((await db.pool.query('select count(*)::int as n from ops_ci_pr_read')).rows[0].n, 0)
})

test('CI read write works through the full app and its shared CSRF guard', pgOnly, async () => {
  await seat('a@example.com')
  const fullConfig = readConfig({
    TRACY_ORIGIN: config.origin,
    SITE_DOMAIN: 'tracy.test',
    SESSION_SECRET: config.sessionSecret,
    HOSTS: 'local',
    HOST_local_ORIGIN: 'http://host',
    HOST_local_DSH_ORIGIN: 'http://dsh',
    HOST_local_SECRET: 'h',
    SEAT_local_SECRET: 'k'
  })
  const app = buildApp({ pool: db.pool, config: fullConfig, mail: { send: async () => {} } })
  const cookie = `tracy_sess=${await mintSession('a@example.com', config.sessionSecret)}`
  const send = (site, type = 'application/json') =>
    app.request('http://tracy.test/api/ops/ci/read', {
      method: 'PUT',
      headers: { cookie, origin: config.origin, 'sec-fetch-site': site, 'content-type': type },
      body: JSON.stringify({ read: true, numbers: [1052] })
    })
  assert.equal((await send('same-site')).status, 403)
  assert.equal((await send('same-origin', 'text/plain')).status, 415)
  assert.equal((await db.pool.query('select count(*)::int as n from ops_ci_pr_read')).rows[0].n, 0)
  const response = await send('same-origin')
  assert.equal(response.status, 200)
  assert.equal((await response.json()).states[0].unread, false)
  assert.equal((await db.pool.query('select count(*)::int as n from ops_ci_pr_read')).rows[0].n, 1)
})
