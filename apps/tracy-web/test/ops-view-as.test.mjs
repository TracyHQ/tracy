/**
 * `/ops` › View as user: an owner or admin opens a look at one customer, from this origin,
 * (a reason is optional); every start and end is in `audit`; the view is the customer's page and counts as
 * nobody's activity; and exit ends it for good.
 */
import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'

import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import * as host from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const ORIGIN = 'https://cowork.tracy.test'
const env = {
  TRACY_ORIGIN: ORIGIN,
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'prod1',
  HOST_prod1_ORIGIN: 'http://prod1',
  HOST_prod1_DSH_ORIGIN: 'http://prod1-dsh',
  HOST_prod1_SECRET: 'h1',
  SEAT_prod1_SECRET: 'k1'
}
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

function harness(pool) {
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    host,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    fetchImpl: async () => Response.json({ error: 'unexpected' }, { status: 500 })
  })
  const sess = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const call = (path, { method = 'GET', cookie, origin = ORIGIN, body } = {}) =>
    app.fetch(
      new Request(`${ORIGIN}${path}`, {
        method,
        redirect: 'manual',
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(method === 'GET' ? {} : { origin }),
          ...(body ? { 'content-type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      })
    )
  const start = (cookie, body, extra = {}) =>
    call('/api/ops/view-as', { method: 'POST', cookie, body, ...extra })
  /** The `tracy_view=…` pair out of a start answer. */
  const viewPair = (res) => /(tracy_view=[^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1]
  return { app, sess, call, start, viewPair }
}

async function seedAccount(pool, email, { staff } = {}) {
  const id = (
    await pool.query(
      'insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id',
      [email]
    )
  ).rows[0].id
  if (staff) {
    const ws = (
      await pool.query(
        "insert into workspace (display_name, kind) values ('Tracy', 'tracy_admin') on conflict (display_name) do update set kind = excluded.kind returning id"
      )
    ).rows[0].id
    await pool.query(
      'insert into seat_workspace (workspace_id, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())',
      [ws, id, staff]
    )
  }
  return id
}

const audits = async (pool) =>
  (await pool.query("select actor, action, detail from audit where action like 'view_as.%' order by at, id"))
    .rows

test('only an owner or admin, from this origin, may open a view', opts, async () => {
  const { pool } = db
  await seedAccount(pool, 'owner@tracy.test', { staff: 'owner' })
  await seedAccount(pool, 'dev@tracy.test', { staff: 'developer' })
  await seedAccount(pool, 'customer@example.com')
  const h = harness(pool)
  const body = { email: 'customer@example.com', reason: 'checking the onboarding agent' }

  assert.notEqual((await h.start(null, body)).status, 200)
  assert.equal((await h.start(await h.sess('customer@example.com'), body)).status, 403)
  assert.equal((await h.start(await h.sess('dev@tracy.test'), body)).status, 403)
  assert.equal(
    (await h.start(await h.sess('owner@tracy.test'), body, { origin: 'https://evil.test' })).status,
    403
  )
  assert.equal(
    (await h.start(await h.sess('owner@tracy.test'), { ...body, reason: 'x'.repeat(301) })).status,
    400
  )
  assert.deepEqual(await audits(pool), [], 'no refusal left a view behind')

  const ok = await h.start(await h.sess('owner@tracy.test'), body)
  assert.equal(ok.status, 200)
  assert.deepEqual(await ok.json(), { url: `${ORIGIN}/` })
  assert.match(ok.headers.get('set-cookie'), /^tracy_view=.*HttpOnly.*Max-Age=1800/)
  assert.ok(!/tracy_sess=/.test(ok.headers.get('set-cookie')), 'the admin’s own sign-in is never touched')
})

test('the target must be a real account that is not staff, and not yourself', opts, async () => {
  const { pool } = db
  await seedAccount(pool, 'owner@tracy.test', { staff: 'owner' })
  await seedAccount(pool, 'other-admin@tracy.test', { staff: 'admin' })
  const h = harness(pool)
  const cookie = await h.sess('owner@tracy.test')
  const go = (email) => h.start(cookie, { email, reason: 'looking' })
  assert.equal((await go('nobody@example.com')).status, 404)
  assert.equal((await go('other-admin@tracy.test')).status, 403)
  assert.equal((await go('owner@tracy.test')).status, 400)
  assert.deepEqual(await audits(pool), [])
})

test('a view is the customer’s page, never a real sign-in, and never counted as theirs', opts, async () => {
  const { pool } = db
  await seedAccount(pool, 'owner@tracy.test', { staff: 'owner' })
  const customerId = await seedAccount(pool, 'customer@example.com')
  await pool.query("update account set language = 'fr' where id = $1", [customerId])
  const h = harness(pool)
  const admin = await h.sess('owner@tracy.test')
  const started = await h.start(admin, {
    email: 'customer@example.com',
    reason: 'checking the onboarding agent'
  })
  const view = h.viewPair(started)
  const both = `${admin}; ${view}`

  const me = await h.call('/auth/me', { cookie: `${admin}; ${view}; tracy_lang=de` })
  const meBody = await me.json()
  assert.equal(meBody.email, 'customer@example.com')
  assert.deepEqual(meBody.viewAs, { by: 'owner@tracy.test' })
  assert.ok(!/tracy_sess=/.test(me.headers.get('set-cookie') ?? ''), 'a view is never renewed into a sign-in')
  const lang = (await pool.query('select language from account where id = $1', [customerId])).rows[0].language
  assert.equal(lang, 'fr', 'looking at a page does not change the customer’s language')

  // Nothing is locked: a write in a view reaches its door (whatever that door answers, it is not a refusal by the view).
  const write = await h.call('/api/sites/wizard', { method: 'POST', cookie: both, body: {} })
  assert.notDeepEqual(await write.json().catch(() => null), { code: 'VIEW_ONLY' })

  const ops = await h.call('/api/ops/ui', { cookie: both })
  assert.equal(ops.status, 200, '/ops still sees the admin while the view is open')
})

test(
  'exit ends the view on the record, clears the cookie, and the token is dead afterwards',
  opts,
  async () => {
    const { pool } = db
    await seedAccount(pool, 'owner@tracy.test', { staff: 'owner' })
    await seedAccount(pool, 'customer@example.com')
    const h = harness(pool)
    const admin = await h.sess('owner@tracy.test')
    const view = h.viewPair(
      await h.start(admin, { email: 'customer@example.com', reason: 'checking the onboarding agent' })
    )

    const exit = await h.call('/auth/view-as/exit', { method: 'POST', cookie: `${admin}; ${view}` })
    assert.equal(exit.status, 303)
    assert.equal(exit.headers.get('location'), `${ORIGIN}/ops`)
    assert.match(exit.headers.get('set-cookie'), /^tracy_view=; .*Max-Age=0/)

    const stale = await (await h.call('/auth/me', { cookie: view })).json()
    assert.equal(stale.email, null, 'a copy of the view token kept by someone is dead')

    assert.deepEqual(await audits(pool), [
      {
        actor: 'owner@tracy.test',
        action: 'view_as.start',
        detail: { target: 'customer@example.com', reason: 'checking the onboarding agent' }
      },
      {
        actor: 'owner@tracy.test',
        action: 'view_as.end',
        detail: { target: 'customer@example.com', by: 'exit' }
      }
    ])
  }
)

test('opening a second view ends the first on the record', opts, async () => {
  const { pool } = db
  await seedAccount(pool, 'owner@tracy.test', { staff: 'owner' })
  await seedAccount(pool, 'a@example.com')
  await seedAccount(pool, 'b@example.com')
  const h = harness(pool)
  const admin = await h.sess('owner@tracy.test')
  const first = h.viewPair(await h.start(admin, { email: 'a@example.com', reason: 'first look' }))
  const second = await h.start(`${admin}; ${first}`, { email: 'b@example.com', reason: 'second look' })
  assert.equal(second.status, 200)
  assert.deepEqual(
    (await audits(pool)).map((r) => [r.action, r.detail.target]),
    [
      ['view_as.start', 'a@example.com'],
      ['view_as.end', 'a@example.com'],
      ['view_as.start', 'b@example.com']
    ]
  )
  const stale = await (await h.call('/auth/me', { cookie: first })).json()
  assert.equal(stale.email, null)
})

test('signing out ends an open view on the record and clears its cookie', opts, async () => {
  const { pool } = db
  await seedAccount(pool, 'owner@tracy.test', { staff: 'owner' })
  await seedAccount(pool, 'customer@example.com')
  const h = harness(pool)
  const admin = await h.sess('owner@tracy.test')
  const view = h.viewPair(
    await h.start(admin, { email: 'customer@example.com', reason: 'checking the onboarding agent' })
  )
  const out = await h.call('/auth/signout', { method: 'POST', cookie: `${admin}; ${view}` })
  assert.equal(out.status, 200)
  assert.ok(out.headers.getSetCookie().some((v) => /^tracy_view=; .*Max-Age=0/.test(v)))
  assert.equal((await (await h.call('/auth/me', { cookie: view })).json()).email, null)
  assert.deepEqual(
    (await audits(pool)).map((r) => [r.action, r.detail.by ?? null]),
    [
      ['view_as.start', null],
      ['view_as.end', 'signout']
    ]
  )
})

test('opening the customer’s Inbox in a view does not save a language on their account', opts, async () => {
  const { pool } = db
  await seedAccount(pool, 'owner@tracy.test', { staff: 'owner' })
  const customerId = await seedAccount(pool, 'customer@example.com')
  const h = harness(pool)
  const admin = await h.sess('owner@tracy.test')
  const view = h.viewPair(
    await h.start(admin, { email: 'customer@example.com', reason: 'checking the inbox' })
  )
  const read = await h.call('/api/notifications', { cookie: `${admin}; ${view}` })
  assert.equal(read.status, 200)
  const lang = (await pool.query('select language from account where id = $1', [customerId])).rows[0].language
  assert.equal(lang, null, 'a look is not the customer choosing a language')
})

test(
  'the reason is optional: a start without one is audited with the admin, the target and the time',
  opts,
  async () => {
    const { pool } = db
    await seedAccount(pool, 'owner@tracy.test', { staff: 'owner' })
    await seedAccount(pool, 'customer@example.com')
    const h = harness(pool)
    const res = await h.start(await h.sess('owner@tracy.test'), { email: 'customer@example.com' })
    assert.equal(res.status, 200)
    const rows = (
      await pool.query("select actor, action, detail, at from audit where action = 'view_as.start'")
    ).rows
    assert.equal(rows.length, 1)
    assert.equal(rows[0].actor, 'owner@tracy.test')
    assert.deepEqual(rows[0].detail, { target: 'customer@example.com' })
    assert.ok(rows[0].at)
  }
)
