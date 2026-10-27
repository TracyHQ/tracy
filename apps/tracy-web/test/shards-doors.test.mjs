import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { readConfig } from '../src/config.js'
import { signShardRequest } from '../src/lib/shard-channel.js'
import { zoneNames } from '../src/shards/dns.js'
import { shardDoors } from '../src/shards/doors.js'
import { createShardBook } from '../src/shards/store.js'
import { fileDb } from './_db.mjs'
import { fakeDns } from './_fake-dns.mjs'
import { MASTER_ENV, SESSION_SECRET, SHARD_SECRETS, seedTestShards, signedPost } from './_shards.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

async function harness(pool) {
  await seedTestShards(pool, ['s1', 's2'])
  const dns = fakeDns()
  dns.seed('cowork.tracy.test', 'master.cfargotunnel.com')
  const app = shardDoors({
    pool,
    config: readConfig(MASTER_ENV),
    book: createShardBook({ pool, sessionSecret: SESSION_SECRET }),
    zone: zoneNames(dns.client),
    reservedLabels: new Set(['admin', 'connect'])
  })
  const reserve = (shard, label, siteKey) =>
    signedPost(app, shard, '/labels/reserve', { label, ...(siteKey ? { siteKey } : {}) })
  return { app, reserve }
}

test(
  'every refused signature is 403 SIGNATURE_INVALID with why: signature, unknown_shard or clock',
  opts,
  async () => {
    const { app } = await harness(db.pool)
    const body = { label: 'bakery' }
    const unsigned = await app.request('https://cowork.tracy.test/api/shards/s1/labels/reserve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    const answers = [
      ['signature', unsigned],
      ['signature', await signedPost(app, 's1', '/labels/reserve', body, 'f'.repeat(64))],
      ['signature', await signedPost(app, 's1', '/labels/reserve', body, SHARD_SECRETS.s2)],
      ['unknown_shard', await signedPost(app, 's9', '/labels/reserve', body, SHARD_SECRETS.s1)],
      ['clock', await signedPost(app, 's1', '/labels/reserve', body, SHARD_SECRETS.s1, Date.now() - 121_000)]
    ]
    for (const [why, res] of answers) {
      assert.equal(res.status, 403, why)
      assert.deepEqual(await res.json(), { code: 'SIGNATURE_INVALID', why })
    }
  }
)

test(
  'a replayed request is refused as a replay, and a body that is not a JSON object is a 400',
  opts,
  async () => {
    const { app } = await harness(db.pool)
    const raw = JSON.stringify({ label: 'bakery' })
    const path = '/api/shards/s1/labels/reserve'
    const signed = await signShardRequest({ secret: SHARD_SECRETS.s1, method: 'POST', path, body: raw })
    const headers = { 'content-type': 'application/json', ...signed }
    const send = () => app.request(`https://cowork.tracy.test${path}`, { method: 'POST', headers, body: raw })
    assert.equal((await send()).status, 200)
    const replay = await send()
    assert.deepEqual(
      [replay.status, await replay.json()],
      [403, { code: 'SIGNATURE_INVALID', why: 'replay' }]
    )
    assert.equal((await signedPost(app, 's1', '/labels/reserve', '[1,2]')).status, 400)
    assert.equal((await signedPost(app, 's1', '/labels/reserve', 'not json')).status, 400)
  }
)

test(
  'a free label is held for thirty minutes by one shard; the holder may ask again, another shard may not until it lapses',
  opts,
  async () => {
    const { pool } = db
    const { reserve } = await harness(pool)
    const first = await reserve('s1', 'Bakery')
    assert.equal(first.status, 200)
    const { label, expiresAt } = await first.json()
    assert.equal(label, 'bakery')
    const minutes = (Date.parse(expiresAt) - Date.now()) / 60_000
    assert.ok(minutes > 29 && minutes <= 30, String(minutes))
    assert.equal((await reserve('s1', 'bakery')).status, 200)
    const other = await reserve('s2', 'bakery')
    assert.equal(other.status, 409)
    assert.deepEqual(await other.json(), { code: 'LABEL_TAKEN', reason: 'reserved', shard: 's1' })
    await pool.query(
      "update label_registry set expires_at = now() - interval '1 second' where label = 'bakery'"
    )
    assert.equal((await reserve('s2', 'bakery')).status, 200)
  }
)

test(
  'a reserved word, a shard name, a zone record, this master s own sites and another shard s site are all taken',
  opts,
  async () => {
    const { pool } = db
    const { reserve } = await harness(pool)
    await pool.query("insert into site (site_key, label, host) values ('shop.tracy.test', 'shop', 'prod1')")
    await pool.query(
      "insert into site_name (name, site_key, kind) values ('brand.tracy.test', 'shop.tracy.test', 'managed')"
    )
    await pool.query(
      "insert into directory_site (site_key, label, shard) values ('market.tracy.test', 'market', 's2')"
    )
    const refused = async (shard, label, siteKey) => (await reserve(shard, label, siteKey)).json()
    assert.deepEqual(await refused('s1', 'admin'), { code: 'LABEL_TAKEN', reason: 'reserved_name' })
    assert.deepEqual(await refused('s1', 's2'), { code: 'LABEL_TAKEN', reason: 'reserved_name' })
    assert.deepEqual(await refused('s1', 's0'), { code: 'LABEL_TAKEN', reason: 'reserved_name' })
    assert.deepEqual(await refused('s1', 'cowork'), { code: 'LABEL_TAKEN', reason: 'zone_record' })
    assert.deepEqual(await refused('s1', 'shop'), { code: 'LABEL_TAKEN', reason: 'in_use', shard: 's0' })
    assert.deepEqual(await refused('s1', 'brand'), { code: 'LABEL_TAKEN', reason: 'in_use', shard: 's0' })
    assert.deepEqual(await refused('s1', 'market'), { code: 'LABEL_TAKEN', reason: 'in_use', shard: 's2' })
    assert.equal(
      (await reserve('s2', 'market', 'market.tracy.test')).status,
      200,
      'its own site, asked again'
    )
    assert.equal((await reserve('s1', 'Bad_Label!')).status, 400)
  }
)

test('two shards asking for one label at the same moment: exactly one gets it', opts, async () => {
  const { reserve } = await harness(db.pool)
  const answers = await Promise.all([reserve('s1', 'racer'), reserve('s2', 'racer')])
  assert.deepEqual(answers.map((res) => res.status).sort(), [200, 409])
})
