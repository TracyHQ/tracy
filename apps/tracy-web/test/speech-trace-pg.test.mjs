/**
 * Voice turn timings on a real database (`src/speech/trace.js` → `ops_signal` → `/api/ops/speech`
 * `turns`): a turn reported twice is one row, and a Tracy staff seat's turns never reach /ops.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const ORIGIN = 'https://cowork.tracy.test'
const env = {
  TRACY_ORIGIN: ORIGIN,
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'demo',
  HOST_demo_ORIGIN: 'http://demo-host',
  HOST_demo_DSH_ORIGIN: 'http://demo-host',
  HOST_demo_SECRET: 'h',
  SEAT_demo_SECRET: 'k'
}

async function seedStaff(pool, email) {
  const account = (await pool.query('insert into account (email) values ($1) returning id', [email])).rows[0]
    .id
  const workspace = (
    await pool.query(
      "insert into workspace (display_name, kind) values ('Tracy', 'tracy_admin') returning id"
    )
  ).rows[0].id
  await pool.query(
    `insert into seat_workspace (workspace_id, account_id, role, granted_by, accepted_at)
     values ($1, $2, 'admin', $2, now())`,
    [workspace, account]
  )
}

test('a turn reported twice is one row; a staff seat’s turns are left out of /ops', opts, async () => {
  const pool = db.pool
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    log: { warn() {}, log() {}, error() {} }
  })
  await seedStaff(pool, 'ops@tracy.test')
  await pool.query("insert into account (email) values ('ana@example.com')")
  const session = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const report = async (email, id, body = {}) =>
    app.fetch(
      new Request(`${ORIGIN}/api/speech/trace`, {
        method: 'POST',
        headers: {
          cookie: await session(email),
          origin: ORIGIN,
          'sec-fetch-site': 'same-origin',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ id, speechToReply: 3100, sentToAck: 40, ackCached: 1, ...body })
      })
    )
  assert.equal((await report('ana@example.com', 'ana-turn-00001')).status, 200)
  assert.equal((await report('ana@example.com', 'ana-turn-00001')).status, 200, 'the beacon’s copy')
  assert.equal((await report('ana@example.com', 'ana-turn-00002', { error: 1 })).status, 200)
  assert.equal((await report('ops@tracy.test', 'ops-turn-00001')).status, 200)
  const rows = (await pool.query("select data, account_id from ops_signal where kind = 'voice.turn'")).rows
  assert.equal(rows.length, 3, 'one row per turn id')
  assert.ok(rows.every((row) => row.account_id !== null))
  assert.ok(rows.every((row) => !('text' in row.data)))
  const res = await app.fetch(
    new Request(`${ORIGIN}/api/ops/speech`, { headers: { cookie: await session('ops@tracy.test') } })
  )
  assert.equal(res.status, 200)
  const { turns } = await res.json()
  assert.equal(turns.day.turns, 2, 'the staff seat’s turn is left out')
  assert.equal(turns.week.turns, 2)
  assert.deepEqual(turns.day.errors, { a: 1, b: 2, rate: null })
  assert.deepEqual(turns.day.spans.speechToReply, { n: 2, p50: null, p95: null })
})
