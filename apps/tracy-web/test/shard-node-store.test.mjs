// apps/tracy-web/test/shard-node-store.test.mjs
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { TICKET } from '../src/lib/shard-shapes.js'
import { fileDb } from './_db.mjs'
import {
  adoptMirror,
  isMirror,
  issueTicket,
  migrationHeadOf,
  redeemTicket,
  shardStatus,
  sweepUnreportedAccounts
} from '../src/shard/node-store.js'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const at = Date.now()
// created_at comes from the JS clock, the one `sweepUnreportedAccounts({ now })` compares it with
// (a SQL default would be the real clock even when a test moves Date.now()).
const account = async (email) =>
  (
    await db.pool.query('insert into account (email, created_at) values ($1, $2) returning id', [
      email,
      new Date(Date.now())
    ])
  ).rows[0].id
const sha256 = (text) => createHash('sha256').update(text).digest('hex')
// The master makes the nonce (32 hex) and sends only its hash (contract §4).
const NONCE = 'c0ffee'.repeat(5) + 'ab'
const OTHER_NONCE = 'f'.repeat(32)
const ticketFor = (input = {}) =>
  issueTicket(db.pool, { email: 'a@b.c', nonceHash: sha256(NONCE), next: '/new/', now: at, ...input })

test('a mirror is made once per email, and the same key again is the same mirror', opts, async () => {
  const id = await account('a@b.c')
  assert.equal(
    (await adoptMirror(db.pool, { email: 'a@b.c', accountId: id, idempotencyKey: 'm-1' })).mirror.source,
    'master'
  )
  assert.equal(
    (await adoptMirror(db.pool, { email: 'a@b.c', accountId: id, idempotencyKey: 'm-1' })).mirror
      .idempotency_key,
    'm-1'
  )
  assert.deepEqual(await adoptMirror(db.pool, { email: 'a@b.c', accountId: id, idempotencyKey: 'm-2' }), {
    conflict: true
  })
  const other = await account('z@b.c')
  assert.deepEqual(await adoptMirror(db.pool, { email: 'z@b.c', accountId: other, idempotencyKey: 'm-1' }), {
    conflict: true
  })
})

test('an adopted or an invited person is a mirror; a stranger is not', opts, async () => {
  const adopted = await account('a@b.c')
  await adoptMirror(db.pool, { email: 'a@b.c', accountId: adopted, idempotencyKey: 'm-1' })
  const invited = await account('i@b.c')
  await db.pool.query("insert into site (site_key, label, host) values ('shop.tracy.ai', 'shop', 's2')")
  await db.pool.query(
    "insert into seat (site_key, account_id, role, accepted_at) values ('shop.tracy.ai', $1, 'owner', now())",
    [invited]
  )
  await account('s@b.c')
  assert.equal(await isMirror(db.pool, 'a@b.c'), true)
  assert.equal(await isMirror(db.pool, 'i@b.c'), true)
  assert.equal(await isMirror(db.pool, 's@b.c'), false)
})

test(
  'a ticket opens once, only with the nonce whose hash the master sent, only within sixty seconds',
  opts,
  async () => {
    const issued = await ticketFor()
    assert.match(issued.ticket, TICKET)
    assert.equal('nonce' in issued, false, 'the shard makes no nonce')
    assert.deepEqual(await redeemTicket(db.pool, { ticket: issued.ticket, nonce: NONCE, now: at + 1000 }), {
      email: 'a@b.c',
      next: '/new/'
    })
    assert.equal(await redeemTicket(db.pool, { ticket: issued.ticket, nonce: NONCE, now: at + 2000 }), null)
    const late = await ticketFor()
    assert.equal(await redeemTicket(db.pool, { ticket: late.ticket, nonce: NONCE, now: at + 61_000 }), null)
  }
)

test(
  'a ticket opened with another browser’s nonce is spent: the right nonce after it fails too',
  opts,
  async () => {
    const issued = await ticketFor()
    assert.equal(await redeemTicket(db.pool, { ticket: issued.ticket, nonce: OTHER_NONCE, now: at }), null)
    assert.equal(await redeemTicket(db.pool, { ticket: issued.ticket, nonce: NONCE, now: at }), null)
    assert.equal(await redeemTicket(db.pool, { ticket: issued.ticket, nonce: '', now: at }), null)
  }
)

test('two redemptions of one ticket racing: exactly one wins', opts, async () => {
  const issued = await ticketFor()
  const both = await Promise.all(
    [1, 2].map(() => redeemTicket(db.pool, { ticket: issued.ticket, nonce: NONCE, now: at }))
  )
  assert.equal(both.filter(Boolean).length, 1)
})

test(
  'only hashes are kept: the ticket’s own, and the nonce hash exactly as the master sent it',
  opts,
  async () => {
    const issued = await ticketFor({ next: '/invite/tok' })
    const { rows } = await db.pool.query(
      'select token_hash, email, nonce_hash, next, used from shard_handoff'
    )
    assert.equal(rows.length, 1)
    assert.equal(rows[0].token_hash, sha256(issued.ticket))
    assert.notEqual(rows[0].token_hash, issued.ticket)
    assert.equal(rows[0].nonce_hash, sha256(NONCE))
    assert.deepEqual([rows[0].email, rows[0].next, rows[0].used], ['a@b.c', '/invite/tok', false])
  }
)

test('the migration head is the last name in JavaScript string order, as the migrator runs them', () => {
  assert.equal(
    migrationHeadOf(['123-shard-node.sql', '122-shard-master.sql', '099-x.sql']),
    '123-shard-node.sql'
  )
  // Code-unit order: '-' (0x2d) sorts before '_' (0x5f); a database collation may not agree.
  assert.equal(migrationHeadOf(['999_a.sql', '999-z.sql']), '999_a.sql')
  assert.equal(migrationHeadOf([]), null)
})

test(
  'status: customer sites only, the last catalogue read, the newest migration, and whether it accepts',
  opts,
  async () => {
    const empty = await shardStatus(db.pool, { maxSites: null })
    assert.equal(empty.sites, 0)
    assert.equal(empty.releases_read_at, null)
    assert.equal(empty.accepting, false)
    const names = (await db.pool.query('select name from schema_migration')).rows.map((r) => r.name)
    assert.equal(empty.migration_head, [...names].sort().at(-1))
    assert.match(empty.migration_head, /^\d{3}-.+\.sql$/)
    await db.pool.query(
      "insert into quickstart_releases (tag, release, tracy) values ('test/none', '{}', 'no-setting')"
    )
    await db.pool.query("insert into site (site_key, label, host) values ('shop.tracy.ai', 'shop', 's2')")
    await db.pool.query(
      "insert into site (site_key, label, host, demo) values ('demo.tracy.ai', 'demo', 's2', true)"
    )
    const read = await shardStatus(db.pool, { maxSites: null })
    assert.equal(read.sites, 1)
    assert.match(read.releases_read_at, /^\d{4}-\d{2}-\d{2}T/)
    assert.equal(read.accepting, true)
    assert.equal((await shardStatus(db.pool, { maxSites: 1 })).accepting, false)
  }
)

test('accounts nobody reported yet are recorded once as invited, after a minute', opts, async () => {
  await account('i@b.c')
  assert.deepEqual(await sweepUnreportedAccounts(db.pool, { now: Date.now() }), [])
  const swept = await sweepUnreportedAccounts(db.pool, { now: Date.now() + 120_000 })
  assert.deepEqual(
    swept.map((a) => a.email),
    ['i@b.c']
  )
  assert.deepEqual(await sweepUnreportedAccounts(db.pool, { now: Date.now() + 120_000 }), [])
})
