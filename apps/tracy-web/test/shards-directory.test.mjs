/** Where a person lives, and who may be adopted (spec §2.2; review amendments 4 and 5). */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import {
  adoptAllowed,
  destinationOf,
  holdsMasterSeat,
  homeOf,
  placesOf,
  recordHome
} from '../src/shards/directory.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const EVERYONE = { everyone: true, emails: [], domains: [] }
const NOBODY = { everyone: false, emails: [], domains: [] }

const account = async (pool, email) =>
  (await pool.query('insert into account (email) values ($1) returning id', [email])).rows[0].id

test(
  's0 wins over any shard a person was also invited into; otherwise the shard used last',
  opts,
  async () => {
    const { pool } = db
    await recordHome(pool, 'a@tracy.test', 's2')
    await recordHome(pool, 'a@tracy.test', 's3')
    assert.equal(homeOf(await placesOf(pool, 'a@tracy.test')), 's3')
    await recordHome(pool, 'a@tracy.test', 's2')
    assert.equal(homeOf(await placesOf(pool, 'a@tracy.test')), 's2')
    await recordHome(pool, 'a@tracy.test', 's0')
    assert.equal(homeOf(await placesOf(pool, 'a@tracy.test')), 's0')
    assert.equal(homeOf([]), null)
  }
)

test(
  'an account invited onto a site of this master before its first sign-in stays here, and is written down',
  opts,
  async () => {
    const { pool } = db
    const id = await account(pool, 'invited@tracy.test')
    await pool.query("insert into site (site_key, label, host) values ('shop.tracy.test', 'shop', 'prod1')")
    await pool.query(
      "insert into seat (site_key, account_id, role, granted_by) values ('shop.tracy.test', $1, 'editor', $1)",
      [id]
    )
    assert.equal(await holdsMasterSeat(pool, 'invited@tracy.test'), true)
    assert.equal(await destinationOf({ pool, email: 'invited@tracy.test', allow: EVERYONE }), 's0')
    assert.deepEqual(
      (await placesOf(pool, 'invited@tracy.test')).map((p) => p.shard),
      ['s0']
    )
  }
)

test('a staff seat in the tracy_admin workspace also keeps a person here', opts, async () => {
  const { pool } = db
  const id = await account(pool, 'staff@tracy.test')
  const ws = (
    await pool.query(
      "insert into workspace (display_name, kind) values ('Tracy', 'tracy_admin') returning id"
    )
  ).rows[0].id
  await pool.query(
    "insert into seat_workspace (workspace_id, account_id, role, granted_by, accepted_at) values ($1, $2, 'admin', $2, now())",
    [ws, id]
  )
  assert.equal(await destinationOf({ pool, email: 'staff@tracy.test', allow: EVERYONE }), 's0')
})

test('a new person is adoptable only through the gate, and a closed gate writes nothing', opts, async () => {
  const { pool } = db
  await account(pool, 'new@joomlart.com')
  assert.equal(await destinationOf({ pool, email: 'new@joomlart.com', allow: EVERYONE }), null)
  assert.equal(await destinationOf({ pool, email: 'new@joomlart.com', allow: NOBODY }), 's0')
  assert.deepEqual(await placesOf(pool, 'new@joomlart.com'), [], 'opening the gate later still moves them')
})

test('adoptAllowed reads everyone, an address or a domain, in any case', () => {
  assert.equal(adoptAllowed({ everyone: false, emails: ['ceo@tracy.ai'], domains: [] }, 'Ceo@Tracy.ai'), true)
  assert.equal(
    adoptAllowed({ everyone: false, emails: [], domains: ['joomlart.com'] }, 'x@JoomlArt.com'),
    true
  )
  assert.equal(
    adoptAllowed({ everyone: false, emails: [], domains: ['joomlart.com'] }, 'x@evil-joomlart.com'),
    false
  )
  assert.equal(adoptAllowed(NOBODY, 'x@tracy.test'), false)
  assert.equal(adoptAllowed(EVERYONE, 'x@tracy.test'), true)
  assert.equal(adoptAllowed(null, 'x@tracy.test'), false)
})
