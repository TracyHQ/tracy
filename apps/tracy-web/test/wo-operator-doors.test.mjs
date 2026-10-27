// The open layer's operator doors mounted in Tracy (`website-opportunities/src/ops/operator-routes.js` through
// `wo-host.js` requireOperator): any /ops staff seat reads, only owner/admin from this origin writes, nobody else gets in.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { Hono } from 'hono'
import { operatorRoutes } from 'website-opportunities/src/ops/operator-routes.js'
import { mintSession, SESSION_COOKIE } from '../src/lib/session.js'
import { createTracyWoHost } from '../src/wo-host.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const config = { origin: 'https://ops.example.test', sessionSecret: 's'.repeat(32) }
const BASE = '/api/website-opportunities/operator'

async function seat(email, role) {
  const { pool } = db
  const id = (await pool.query('insert into account (email) values ($1) returning id', [email])).rows[0].id
  if (!role) return
  const ws =
    (await pool.query("select id from workspace where kind = 'tracy_admin'")).rows[0]?.id ??
    (await pool.query("insert into workspace(display_name,kind) values('T','tracy_admin') returning id"))
      .rows[0].id
  await pool.query(
    'insert into seat_workspace(workspace_id,account_id,role,granted_by,accepted_at) values($1,$2,$3,$2,now())',
    [ws, id, role]
  )
}

function app() {
  const a = new Hono()
  a.route(
    '/',
    operatorRoutes({
      pool: db.pool,
      config,
      host: createTracyWoHost({ pool: db.pool, config }),
      log: { log() {} }
    })
  )
  return a
}
const cookieOf = async (email) => `${SESSION_COOKIE}=${await mintSession(email, config.sessionSecret)}`

test('signed out: 401; a signed-in account without a staff seat: a bare 403', opts, async () => {
  await seat('someone@example.test', null)
  const out = await app().request(`${BASE}/me`)
  assert.equal(out.status, 401)
  const res = await app().request(`${BASE}/settings`, {
    headers: { cookie: await cookieOf('someone@example.test') }
  })
  assert.equal(res.status, 403)
  assert.equal(await res.text(), '')
})

test('any staff seat reads; only owner/admin from this origin writes; keys can be sealed', opts, async () => {
  await seat('owner@example.test', 'owner')
  await seat('member@example.test', 'developer')
  const member = await cookieOf('member@example.test')
  const owner = await cookieOf('owner@example.test')
  const me = await (await app().request(`${BASE}/me`, { headers: { cookie: member } })).json()
  assert.deepEqual(me, { operator: true, email: 'member@example.test', hub: false, keysWritable: true })
  const put = (cookie, origin) =>
    app().request(`${BASE}/settings`, {
      method: 'PUT',
      headers: { cookie, origin, 'content-type': 'application/json' },
      body: JSON.stringify({ settings: { researchDailyCapCents: 700 } })
    })
  assert.equal((await put(member, config.origin)).status, 403)
  assert.equal((await put(owner, 'https://elsewhere.example')).status, 403)
  const ok = await put(owner, config.origin)
  assert.equal(ok.status, 200)
  assert.equal((await ok.json()).settings.researchDailyCapCents, 700)
  const key = await app().request(`${BASE}/keys/apify`, {
    method: 'PUT',
    headers: { cookie: owner, origin: config.origin, 'content-type': 'application/json' },
    body: JSON.stringify({ apiKey: 'apify_key_123456' })
  })
  assert.equal(key.status, 200)
  assert.equal((await key.json()).keys.providers.apify.source, 'ops')
})
