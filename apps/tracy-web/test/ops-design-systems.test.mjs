/**
 * The switch "Design systems on Design inspiration": off on a server nobody touched, written only by
 * an owner or admin from this origin, and read by anyone — the next read after a press answers the
 * new value, with nothing rebuilt in between.
 */
import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'

import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import * as host from '../src/host/client.js'
import { readDesignSystemsShown } from '../src/lib/design-systems-setting.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const env = {
  TRACY_ORIGIN: 'https://cowork.tracy.test',
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
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const read = async () => {
    const response = await app.fetch(new Request('https://cowork.tracy.test/api/design-systems'))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    return (await response.json()).shown
  }
  const put = (cookie, body, headers = {}) =>
    app.fetch(
      new Request('https://cowork.tracy.test/api/ops/design-systems', {
        method: 'PUT',
        redirect: 'manual',
        headers: {
          ...(cookie ? { cookie } : {}),
          origin: 'https://cowork.tracy.test',
          'content-type': 'application/json',
          ...headers
        },
        body: JSON.stringify(body)
      })
    )
  return { read, put, cookieFor }
}

async function seedStaff(pool, email, role) {
  const account = (
    await pool.query(
      'insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id',
      [email]
    )
  ).rows[0].id
  const ws = (
    await pool.query(
      "insert into workspace (display_name, kind) values ('Tracy', 'tracy_admin') on conflict (display_name) do update set kind = excluded.kind returning id"
    )
  ).rows[0].id
  await pool.query(
    `insert into seat_workspace (workspace_id, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
    [ws, account, role]
  )
}

test('a fresh server answers off, to a reader with no seat at all', opts, async () => {
  const { pool } = db
  assert.equal(await harness(pool).read(), false)
})

test('no database behind the reader reads as off, never as on', async () => {
  assert.equal(await readDesignSystemsShown(null), false)
  const broken = { query: async () => Promise.reject(new Error('relation does not exist')) }
  assert.equal(await readDesignSystemsShown(broken), false)
})

test('only an owner or admin from this origin may flip it', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test', 'owner')
  await seedStaff(pool, 'admin@tracy.test', 'admin')
  await seedStaff(pool, 'editor@tracy.test', 'editor')
  const h = harness(pool)
  const owner = await h.cookieFor('owner@tracy.test')
  const admin = await h.cookieFor('admin@tracy.test')
  const editor = await h.cookieFor('editor@tracy.test')

  assert.notEqual((await h.put(null, { shown: true })).status, 200)
  assert.equal((await h.put(editor, { shown: true })).status, 403)
  assert.equal((await h.put(owner, { shown: true }, { origin: 'https://evil.test' })).status, 403)
  assert.equal((await h.put(owner, { shown: 'yes' })).status, 400)
  assert.equal(await h.read(), false, 'no refused press changed anything')

  assert.equal((await h.put(admin, { shown: true })).status, 200)
  assert.equal(await h.read(), true)
})

test('the next read after a press answers the new value, both ways', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test', 'owner')
  const h = harness(pool)
  const owner = await h.cookieFor('owner@tracy.test')

  const on = await h.put(owner, { shown: true })
  assert.equal(on.status, 200)
  assert.deepEqual(await on.json(), { shown: true })
  assert.equal(await h.read(), true)

  assert.equal((await h.put(owner, { shown: false })).status, 200)
  assert.equal(await h.read(), false)
  const { rows } = await pool.query('select updated_by from design_systems_setting')
  assert.deepEqual(rows, [{ updated_by: 'owner@tracy.test' }])
})
