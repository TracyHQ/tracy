/**
 * A shard site's own domain, registered by the master (review amendment 7; docs/sre/hop-dong-cua-shard.md
 * §5): `custom_origin_server` is the shard's host, so the customer's traffic goes straight to that
 * shard (spec §3.4). One answer shape for every op, three error codes.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { readConfig } from '../src/config.js'
import { zoneNames } from '../src/shards/dns.js'
import { shardCustomHostnames } from '../src/shards/custom-hostnames.js'
import { shardDoors } from '../src/shards/doors.js'
import { shardEvents } from '../src/shards/events-inbox.js'
import { createShardBook } from '../src/shards/store.js'
import { fileDb } from './_db.mjs'
import { fakeCloudflare } from './_fake-cloudflare.mjs'
import { MASTER_ENV, SESSION_SECRET, seedTestShards, signedPost } from './_shards.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

async function harness(pool, { saas = true, callMs = 300 } = {}) {
  await seedTestShards(pool, ['s1', 's2'])
  await pool.query(
    "insert into directory_site (site_key, label, shard) values ('shop.tracy.test', 'shop', 's1'), ('cafe.tracy.test', 'cafe', 's2') on conflict do nothing"
  )
  const config = readConfig(MASTER_ENV)
  const cf = fakeCloudflare({ callMs })
  const app = shardDoors({
    pool,
    config,
    book: createShardBook({ pool, sessionSecret: SESSION_SECRET }),
    zone: zoneNames(null),
    reservedLabels: new Set(),
    events: shardEvents({ pool, config, dns: null }),
    customHostnames: shardCustomHostnames({ pool, config, hostnames: saas ? cf.client : null })
  })
  const ask = async (shard, body) => {
    const res = await signedPost(app, shard, '/custom-hostname', body)
    return { status: res.status, body: await res.json() }
  }
  const row = async (domain) =>
    (await pool.query('select * from directory_domain where domain = $1', [domain])).rows[0]
  return { cf, ask, row }
}

const ADD = { siteKey: 'shop.tracy.test', domain: 'shop.example.com', op: 'add' }

test(
  'add registers the hostname with the shard as its origin and records whose it is; asked again it is read, not made twice',
  opts,
  async () => {
    const h = await harness(db.pool)
    const added = await h.ask('s1', ADD)
    assert.equal(added.status, 200)
    assert.deepEqual(Object.keys(added.body).sort(), [
      'hostname',
      'id',
      'sslStatus',
      'status',
      'validationRecords'
    ])
    assert.equal(added.body.hostname, 'shop.example.com')
    assert.equal(added.body.id, h.cf.byName('shop.example.com').id)
    assert.ok(Array.isArray(added.body.validationRecords))
    for (const record of added.body.validationRecords)
      assert.deepEqual(Object.keys(record).sort(), ['name', 'type', 'value'])
    assert.equal(h.cf.byName('shop.example.com').custom_origin_server, 's1.tracy.test')
    assert.equal((await h.row('shop.example.com')).shard, 's1')
    assert.equal((await h.row('shop.example.com')).hostname_id, h.cf.byName('shop.example.com').id)
    assert.equal((await h.ask('s1', ADD)).status, 200)
    assert.equal(h.cf.calls.filter((call) => call.startsWith('POST')).length, 1)
  }
)

test(
  'status reads Cloudflare; remove deletes the hostname and the row; every op answers the same shape',
  opts,
  async () => {
    const h = await harness(db.pool)
    await h.ask('s1', ADD)
    const id = h.cf.byName('shop.example.com').id
    const status = await h.ask('s1', { ...ADD, op: 'status' })
    assert.deepEqual([status.status, status.body.id], [200, id])
    assert.deepEqual(Object.keys(status.body).sort(), [
      'hostname',
      'id',
      'sslStatus',
      'status',
      'validationRecords'
    ])
    assert.deepEqual(await h.ask('s1', { ...ADD, op: 'remove' }), {
      status: 200,
      body: { hostname: 'shop.example.com', id, status: 'deleted', sslStatus: null, validationRecords: [] }
    })
    assert.equal(h.cf.byName('shop.example.com'), null)
    assert.equal(await h.row('shop.example.com'), undefined)
    assert.deepEqual(await h.ask('s1', { ...ADD, op: 'remove' }), {
      status: 200,
      body: {
        hostname: 'shop.example.com',
        id: null,
        status: 'deleted',
        sslStatus: null,
        validationRecords: []
      }
    })
    assert.deepEqual(await h.ask('s1', { ...ADD, op: 'status' }), {
      status: 200,
      body: {
        hostname: 'shop.example.com',
        id: null,
        status: 'absent',
        sslStatus: null,
        validationRecords: []
      }
    })
  }
)

test(
  'another shard s site is UNKNOWN_SITE; a domain held elsewhere is DOMAIN_TAKEN with its holder; a Tracy name is a bad request; no SaaS is CLOUDFLARE',
  opts,
  async () => {
    const { pool } = db
    const h = await harness(pool)
    await h.ask('s1', ADD)
    assert.deepEqual(await h.ask('s2', ADD), { status: 404, body: { code: 'UNKNOWN_SITE' } })
    assert.deepEqual(await h.ask('s1', { ...ADD, siteKey: 'nowhere.tracy.test' }), {
      status: 404,
      body: { code: 'UNKNOWN_SITE' }
    })
    assert.deepEqual(
      await h.ask('s2', { siteKey: 'cafe.tracy.test', domain: 'shop.example.com', op: 'add' }),
      {
        status: 409,
        body: { code: 'DOMAIN_TAKEN', shard: 's1' }
      }
    )
    await pool.query("insert into site (site_key, label, host) values ('old.tracy.test', 'old', 'prod1')")
    await pool.query(
      "insert into site_name (name, site_key, kind) values ('old.example.com', 'old.tracy.test', 'custom')"
    )
    assert.deepEqual(await h.ask('s1', { ...ADD, domain: 'old.example.com' }), {
      status: 409,
      body: { code: 'DOMAIN_TAKEN', shard: 's0' }
    })
    await h.cf.client.create('stray.example.com')
    assert.deepEqual(await h.ask('s1', { ...ADD, domain: 'stray.example.com' }), {
      status: 409,
      body: { code: 'DOMAIN_TAKEN', shard: null }
    })
    assert.deepEqual(await h.ask('s1', { ...ADD, domain: 'other.tracy.test' }), {
      status: 400,
      body: { code: 'INVALID_REQUEST' }
    })
    assert.deepEqual(await h.ask('s1', { ...ADD, op: 'move' }), {
      status: 400,
      body: { code: 'INVALID_REQUEST' }
    })
    const off = await harness(pool, { saas: false })
    assert.deepEqual(await off.ask('s1', { ...ADD, domain: 'new.example.com' }), {
      status: 502,
      body: { code: 'CLOUDFLARE', detail: 'NOT_CONFIGURED' }
    })
  }
)

test(
  'an add whose answer was lost keeps its claim, and the next add takes the hostname that was made',
  opts,
  async () => {
    const h = await harness(db.pool, { callMs: 50 })
    h.cf.fail = ({ call }) => (call.startsWith('POST') ? 'land-then-hang' : undefined)
    const lost = await h.ask('s1', ADD)
    assert.equal(lost.status, 502)
    assert.equal(lost.body.code, 'CLOUDFLARE')
    assert.match(lost.body.detail, /^UNCERTAIN:/)
    assert.equal((await h.row('shop.example.com')).hostname_id, null)
    h.cf.fail = () => undefined
    assert.equal((await h.ask('s1', ADD)).status, 200)
    assert.equal((await h.row('shop.example.com')).hostname_id, h.cf.byName('shop.example.com').id)
    assert.equal(h.cf.calls.filter((call) => call.startsWith('POST')).length, 1)
  }
)
