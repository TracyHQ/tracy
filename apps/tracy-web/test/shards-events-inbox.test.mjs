/**
 * What a shard tells its master (spec §4.4; review amendments 6, 7; docs/sre/hop-dong-cua-shard.md
 * §5): a closed set of kinds, scoped to the sender, idempotent by eventId, DNS by event.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { readConfig } from '../src/config.js'
import { tunnelTarget, zoneNames } from '../src/shards/dns.js'
import { shardDoors } from '../src/shards/doors.js'
import { shardEvents } from '../src/shards/events-inbox.js'
import { placesOf, shardInvitesFor } from '../src/shards/directory.js'
import { createShardBook } from '../src/shards/store.js'
import { fileDb } from './_db.mjs'
import { fakeCloudflare } from './_fake-cloudflare.mjs'
import { fakeDns } from './_fake-dns.mjs'
import { MASTER_ENV, SESSION_SECRET, TUNNELS, seedTestShards, signedPost } from './_shards.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const S1 = tunnelTarget(TUNNELS.s1)

async function harness(pool) {
  await seedTestShards(pool, ['s1', 's2'])
  const config = readConfig(MASTER_ENV)
  const dns = fakeDns()
  const cf = fakeCloudflare()
  const alerts = []
  const signal = {
    record: async (kind, input) => {
      alerts.push({ kind, ...input })
      return {}
    }
  }
  const app = shardDoors({
    pool,
    config,
    book: createShardBook({ pool, sessionSecret: SESSION_SECRET }),
    zone: zoneNames(dns.client),
    reservedLabels: new Set(),
    events: shardEvents({ pool, config, dns: dns.client, hostnames: cf.client, signal })
  })
  // Event ids are 32 hex (contract §5): a counter, zero-padded.
  let n = 0
  const send = async (
    shard,
    kind,
    data,
    eventId = (++n).toString(16).padStart(32, '0'),
    at = new Date().toISOString()
  ) => {
    const res = await signedPost(app, shard, '/events', { eventId, kind, at, data })
    return { status: res.status, body: await res.json() }
  }
  const site = async (siteKey) =>
    (await pool.query('select * from directory_site where site_key = $1', [siteKey])).rows[0]
  return { app, dns, cf, alerts, send, site }
}

const SHOP = { siteKey: 'shop.tracy.test', label: 'shop', platform: 'wordpress' }

test(
  'site.created lists the site, points its name at the shard, confirms the hold, and answers a replay as a duplicate',
  opts,
  async () => {
    const { pool } = db
    const h = await harness(pool)
    await pool.query(
      "insert into label_registry (label, holder, expires_at) values ('shop', 's1', now() + interval '30 minutes')"
    )
    const first = await h.send('s1', 'site.created', SHOP, 'a'.repeat(32))
    assert.deepEqual(first, { status: 200, body: { ok: true, dns: 'created' } })
    assert.deepEqual(h.dns.names(), [`CNAME shop.tracy.test ${S1}`])
    assert.equal((await h.site('shop.tracy.test')).dns_state, 'ok')
    assert.equal((await pool.query("select 1 from label_registry where label = 'shop'")).rowCount, 0)
    assert.deepEqual(await h.send('s1', 'site.created', SHOP, 'a'.repeat(32)), {
      status: 200,
      body: { ok: true, dns: 'created', duplicate: true }
    })
    assert.equal(h.dns.calls.filter((call) => call.startsWith('POST')).length, 1)
  }
)

test(
  'a label another holder has, or this master uses, is LABEL_TAKEN, told to the ops topic, and nothing is written',
  opts,
  async () => {
    const { pool } = db
    const h = await harness(pool)
    await pool.query(
      "insert into label_registry (label, holder, expires_at) values ('shop', 's2', now() + interval '30 minutes')"
    )
    assert.deepEqual(await h.send('s1', 'site.created', SHOP), {
      status: 409,
      body: { code: 'LABEL_TAKEN', shard: 's2' }
    })
    await pool.query("insert into site (site_key, label, host) values ('bake.tracy.test', 'bake', 'prod1')")
    assert.deepEqual(
      await h.send('s1', 'site.created', {
        siteKey: 'bake2.tracy.test',
        label: 'bake',
        platform: 'wordpress'
      }),
      {
        status: 409,
        body: { code: 'LABEL_TAKEN', shard: 's0' }
      }
    )
    assert.deepEqual(
      h.alerts.map((a) => [a.kind, a.data, a.dedupeKey]),
      [
        ['shard.label_conflict', { shard: 's1', label: 'shop', holder: 's2' }, 'label:s1:shop'],
        ['shard.label_conflict', { shard: 's1', label: 'bake', holder: 's0' }, 'label:s1:bake']
      ]
    )
    assert.deepEqual(h.dns.names(), [])
    assert.equal(await h.site('shop.tracy.test'), undefined)
  }
)

test(
  'a name already pointing elsewhere is listed as a DNS conflict: 200, told once to the ops topic, the record untouched',
  opts,
  async () => {
    const { pool } = db
    const h = await harness(pool)
    h.dns.seed('shop.tracy.test', 'elsewhere.example')
    assert.deepEqual(await h.send('s1', 'site.created', SHOP), {
      status: 200,
      body: { ok: true, dns: 'conflict' }
    })
    assert.equal((await h.site('shop.tracy.test')).dns_state, 'conflict')
    assert.deepEqual(
      h.alerts.map((a) => [a.kind, a.data, a.dedupeKey]),
      [['shard.dns_conflict', { shard: 's1', hostname: 'shop.tracy.test' }, 'dns:shop.tracy.test']]
    )
    assert.deepEqual(h.dns.names(), ['CNAME shop.tracy.test elsewhere.example'])
  }
)

test(
  'a zone that does not answer leaves the site listed as pending, for the hourly reconcile',
  opts,
  async () => {
    const { pool } = db
    const h = await harness(pool)
    h.dns.down = true
    assert.deepEqual(await h.send('s1', 'site.created', SHOP), {
      status: 200,
      body: { ok: true, dns: 'pending' }
    })
    assert.equal((await h.site('shop.tracy.test')).dns_state, 'pending')
  }
)

test('site.deleted: only by its own shard; the name, the own domains and the row all go', opts, async () => {
  const { pool } = db
  const h = await harness(pool)
  await h.send('s1', 'site.created', SHOP)
  const made = await h.cf.client.create('shop.example.com')
  await pool.query(
    "insert into directory_domain (domain, site_key, shard, hostname_id) values ('shop.example.com', 'shop.tracy.test', 's1', $1)",
    [made.created.id]
  )
  const DELETED = { siteKey: 'shop.tracy.test', label: 'shop' }
  assert.deepEqual(await h.send('s2', 'site.deleted', DELETED), { status: 403, body: { code: 'SCOPE' } })
  assert.deepEqual(await h.send('s1', 'site.deleted', DELETED), {
    status: 200,
    body: { ok: true, dns: 'removed' }
  })
  assert.equal(await h.site('shop.tracy.test'), undefined)
  assert.deepEqual(h.dns.names(), [])
  assert.equal(h.cf.byName('shop.example.com'), null)
  assert.equal((await pool.query('select 1 from directory_domain')).rowCount, 0)
  assert.deepEqual(await h.send('s1', 'site.deleted', { siteKey: 'gone.tracy.test', label: 'gone' }), {
    status: 200,
    body: { ok: true, dns: 'absent' }
  })
})

test(
  'site.renamed points the new name first, then lets the listed one go; a taken name is refused and told; another shard s site is out of scope',
  opts,
  async () => {
    const { pool } = db
    const h = await harness(pool)
    await h.send('s1', 'site.created', SHOP)
    await pool.query(
      "insert into label_registry (label, holder, expires_at) values ('held', 's2', now() + interval '30 minutes')"
    )
    assert.deepEqual(
      await h.send('s1', 'site.renamed', { siteKey: 'shop.tracy.test', from: 'shop', to: 'held' }),
      {
        status: 409,
        body: { code: 'LABEL_TAKEN', shard: 's2' }
      }
    )
    assert.deepEqual(
      h.alerts.map((a) => a.kind),
      ['shard.label_conflict']
    )
    assert.deepEqual(
      await h.send('s2', 'site.renamed', { siteKey: 'shop.tracy.test', from: 'shop', to: 'market' }),
      {
        status: 403,
        body: { code: 'SCOPE' }
      }
    )
    // A stale `from` does not stop the rename: the shard owns its site's label, the listed one goes.
    assert.deepEqual(
      await h.send('s1', 'site.renamed', { siteKey: 'shop.tracy.test', from: 'other', to: 'market' }),
      {
        status: 200,
        body: { ok: true, dns: 'created', previous: 'removed' }
      }
    )
    assert.equal((await h.site('shop.tracy.test')).label, 'market')
    assert.deepEqual(h.dns.names(), [`CNAME market.tracy.test ${S1}`])
  }
)

test(
  'account.created writes the sending shard s row with its source; an invitation opens the beta gate',
  opts,
  async () => {
    const { pool } = db
    const h = await harness(pool)
    const shardsOf = async (email) => (await placesOf(pool, email)).map((p) => p.shard).sort()
    assert.deepEqual(await h.send('s1', 'account.created', { email: 'Mai@Tracy.test', source: 'adopt' }), {
      status: 200,
      body: { ok: true }
    })
    assert.deepEqual(await shardsOf('mai@tracy.test'), ['s1'])
    assert.deepEqual(await shardInvitesFor(pool, 'mai@tracy.test'), [])
    assert.equal(
      (await h.send('s2', 'account.created', { email: 'mai@tracy.test', source: 'invitation' })).status,
      200
    )
    assert.deepEqual(await shardsOf('mai@tracy.test'), ['s1', 's2'])
    assert.deepEqual(await shardInvitesFor(pool, 'Mai@Tracy.test'), [{ shard: 's2' }])
    assert.equal(
      (await h.send('s1', 'account.created', { email: 'ops@tracy.test', source: 'seed' })).status,
      200
    )
    assert.deepEqual(
      await shardInvitesFor(pool, 'ops@tracy.test'),
      [],
      'a seeded operator is not an invitation'
    )
    assert.deepEqual(await h.send('s1', 'account.created', { email: 'x@tracy.test', source: 'mirror' }), {
      status: 400,
      body: { code: 'BAD_EVENT' }
    })
  }
)

test(
  'a kind outside the closed set, a domain event, a bad id or time, or missing data is BAD_EVENT and is not remembered',
  opts,
  async () => {
    const { pool } = db
    const h = await harness(pool)
    const good = new Date().toISOString()
    for (const [kind, data, id, at] of [
      ['domain.added', { siteKey: 'shop.tracy.test', domain: 'shop.example.com' }, 'b'.repeat(32), good],
      ['email.changed', { from: 'a@tracy.test', to: 'b@tracy.test' }, 'c'.repeat(32), good],
      ['account.deleted', { email: 'a@tracy.test' }, 'd'.repeat(32), good],
      ['site.created', SHOP, 'evt-00000001', good],
      ['site.created', SHOP, 'E'.repeat(32), good],
      ['site.created', SHOP, 'e'.repeat(32), 'yesterday'],
      ['site.created', null, 'f'.repeat(32), good],
      ['site.created', { siteKey: 'shop.tracy.test', label: 'Bad_Label' }, '1'.repeat(32), good],
      ['site.deleted', { siteKey: 'shop.tracy.test' }, '2'.repeat(32), good]
    ])
      assert.deepEqual(
        await h.send('s1', kind, data, id, at),
        { status: 400, body: { code: 'BAD_EVENT' } },
        `${kind} ${id}`
      )
    assert.deepEqual((await signedPost(h.app, 's1', '/events', '[1]')).status, 400)
    assert.equal((await pool.query('select 1 from shard_event')).rowCount, 0)
  }
)
