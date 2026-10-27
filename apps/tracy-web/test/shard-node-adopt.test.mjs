import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { pgIdentityStore } from '../src/identity/store.js'
import { signShardRequest } from '../src/lib/shard-channel.js'
import { TICKET } from '../src/lib/shard-shapes.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const SECRET = 'ab'.repeat(32)
const at = Date.now()
const env = {
  TRACY_ORIGIN: 'https://s2.tracy.ai',
  SITE_DOMAIN: 'tracy.ai',
  SESSION_DOMAIN: 'tracy.ai',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 's2',
  HOST_NAME: 's2',
  HOST_s2_ORIGIN: 'http://host',
  HOST_s2_DSH_ORIGIN: 'http://dsh',
  HOST_s2_SECRET: 'h',
  SEAT_s2_SECRET: 'k',
  TRACY_DEPLOYMENT_ROLE: 'shard',
  MASTER_ORIGIN: 'https://cowork.tracy.ai',
  SHARD_SECRET: SECRET,
  SESSION_COOKIE_NAME: 'tracy_sess_s2'
}
const appOf = (extra = {}, config = readConfig({ ...env, ...extra })) =>
  buildApp({
    config,
    pool: db.pool,
    identity: pgIdentityStore(db.pool),
    mail: { send: async () => {} },
    now: () => at
  })
async function adopt(app, payload, { secret = SECRET, nonce } = {}) {
  const body = JSON.stringify(payload)
  const headers = signShardRequest({
    secret,
    method: 'POST',
    path: '/_shard/adopt',
    body,
    now: at,
    ...(nonce ? { nonce } : {})
  })
  return app.fetch(
    new Request('https://s2.tracy.ai/_shard/adopt', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body
    })
  )
}
const sha256 = (text) => createHash('sha256').update(text).digest('hex')
// The master's nonce (32 hex): it keeps the nonce for `tracy_handoff` and sends only the hash.
const NONCE = 'c0ffee'.repeat(5) + 'ab'
const person = {
  email: 'New@Example.com',
  displayName: 'New Person',
  locale: 'vi',
  source: 'master',
  idempotencyKey: 'master-acc-1',
  nonceHash: sha256(NONCE)
}
const catalogueRead = () =>
  db.pool.query(
    "insert into quickstart_releases (tag, release, tracy) values ('test/none', '{}', 'no-setting')"
  )

test('an unsigned, mis-signed or replayed adopt is refused with why, and creates nothing', opts, async () => {
  await catalogueRead()
  const app = appOf()
  const unsigned = await app.fetch(
    new Request('https://s2.tracy.ai/_shard/adopt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(person)
    })
  )
  assert.equal(unsigned.status, 403)
  assert.deepEqual(await unsigned.json(), { code: 'SIGNATURE_INVALID', why: 'signature' })
  const misSigned = await adopt(app, person, { secret: 'cd'.repeat(32) })
  assert.deepEqual([misSigned.status, (await misSigned.json()).why], [403, 'signature'])
  const SAME = 'a'.repeat(32)
  assert.equal((await adopt(app, person, { nonce: SAME })).status, 200)
  const replay = await adopt(app, person, { nonce: SAME })
  assert.equal(replay.status, 403)
  assert.deepEqual(await replay.json(), { code: 'SIGNATURE_INVALID', why: 'replay' })
  assert.equal((await db.pool.query('select count(*)::int as n from shard_mirror')).rows[0].n, 1)
})

test(
  'adopt makes the mirror once and answers a one-time ticket as a string, with the master’s nonce hash kept',
  opts,
  async () => {
    await catalogueRead()
    const app = appOf()
    const first = await adopt(app, person)
    assert.equal(first.status, 200)
    const one = await first.json()
    assert.deepEqual(Object.keys(one).sort(), ['accountId', 'expiresAt', 'handoff'])
    assert.equal(typeof one.handoff, 'string')
    assert.match(one.handoff, TICKET)
    assert.ok(Date.parse(one.expiresAt) - at <= 60_000)
    const stored = (await db.pool.query('select token_hash, nonce_hash, next from shard_handoff')).rows[0]
    assert.equal(stored.token_hash, sha256(one.handoff))
    assert.equal(stored.nonce_hash, person.nonceHash, 'the nonce hash exactly as the master sent it')
    assert.equal(stored.next, '/new/')
    const row = (
      await db.pool.query(
        "select a.id, a.last_seen_at, a.language, m.source from account a join shard_mirror m on m.account_id = a.id where a.email = 'new@example.com'"
      )
    ).rows[0]
    assert.equal(row.id, one.accountId)
    assert.ok(row.last_seen_at, 'touchAccount ran: the shard beta gate sees an existing account')
    assert.equal(row.source, 'master')
    const again = await (await adopt(app, person)).json()
    assert.equal(again.accountId, one.accountId)
    assert.notEqual(again.handoff, one.handoff)
    const conflict = await adopt(app, { ...person, idempotencyKey: 'master-acc-2' })
    assert.equal(conflict.status, 409)
    assert.equal((await conflict.json()).code, 'MIRROR_CONFLICT')
  }
)

test('next is kept with the ticket, as a path of this shard, never /handoff itself', opts, async () => {
  await catalogueRead()
  const app = appOf()
  const nextOf = async (next) => {
    await adopt(app, { ...person, next })
    return (await db.pool.query('select next from shard_handoff order by created_at desc limit 1')).rows[0]
      .next
  }
  assert.equal(await nextOf('/invite/tok'), '/invite/tok')
  assert.equal(
    await nextOf('https://s2.tracy.ai/sites/shop.tracy.ai?tab=chat'),
    '/sites/shop.tracy.ai?tab=chat'
  )
  assert.equal(
    await nextOf('/handoff?next=%2Fx'),
    '/new/',
    'a failed handoff sends next=/handoff back here: no loop'
  )
})

test('a body off the contract is 400 BAD_BODY, and the master gets 404 NOT_A_SHARD', opts, async () => {
  await catalogueRead()
  const { nonceHash: _dropped, ...noNonceHash } = person
  for (const bad of [
    { ...person, email: 'nope' },
    { ...person, source: 'shard' },
    { ...person, idempotencyKey: '' },
    noNonceHash,
    { ...person, nonceHash: NONCE },
    { ...person, displayName: 7 },
    { ...person, locale: ['vi'] },
    { ...person, next: 7 }
  ]) {
    const res = await adopt(appOf(), bad)
    assert.equal(res.status, 400)
    assert.deepEqual(await res.json(), { code: 'BAD_BODY' })
  }
  const masterEnv = { ...env }
  for (const key of ['TRACY_DEPLOYMENT_ROLE', 'MASTER_ORIGIN', 'SHARD_SECRET', 'SESSION_COOKIE_NAME'])
    delete masterEnv[key]
  const onMaster = await adopt(appOf({}, readConfig(masterEnv)), person)
  assert.equal(onMaster.status, 404)
  assert.equal((await onMaster.json()).code, 'NOT_A_SHARD')
})

test(
  'a shard that has not read the catalogue, or is full, answers SHARD_FULL to a NEW person and still takes back a known one',
  opts,
  async () => {
    const notRead = await adopt(appOf(), person)
    assert.equal(notRead.status, 503)
    assert.deepEqual(await notRead.json(), { code: 'SHARD_FULL' })
    await catalogueRead()
    assert.equal((await adopt(appOf({ SHARD_MAX_SITES: '1' }), person)).status, 200)
    await db.pool.query("insert into site (site_key, label, host) values ('shop.tracy.ai', 'shop', 's2')")
    const full = appOf({ SHARD_MAX_SITES: '1' })
    assert.equal((await adopt(full, person)).status, 200, 'a known person comes back')
    const stranger = await adopt(full, {
      ...person,
      email: 'other@example.com',
      idempotencyKey: 'master-acc-9'
    })
    assert.equal(stranger.status, 503)
    assert.deepEqual(await stranger.json(), { code: 'SHARD_FULL' })
  }
)
