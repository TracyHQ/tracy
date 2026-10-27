/** The master's two shard sweeps (spec §3.2, §5): a silent shard told once, the zone brought in step hourly. */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { readConfig } from '../src/config.js'
import { tunnelTarget } from '../src/shards/dns.js'
import { RECONCILE_LOCK_ID, reconcileDns, sweepSilentShards } from '../src/shards/reconcile.js'
import { fileDb } from './_db.mjs'
import { fakeDns } from './_fake-dns.mjs'
import { MASTER_ENV, TUNNELS, seedTestShards } from './_shards.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const S1 = tunnelTarget(TUNNELS.s1)
const S2 = tunnelTarget(TUNNELS.s2)

function recorder() {
  const alerts = []
  return {
    alerts,
    signal: {
      record: async (kind, input) => {
        alerts.push({ kind, ...input })
        return {}
      }
    }
  }
}

test(
  'a shard heard from and silent for three minutes is told, keyed by its silence; a fresh or never-heard one is not',
  opts,
  async () => {
    const { pool } = db
    await seedTestShards(pool, ['s1', 's2', 's3'])
    // Seeded on the JS clock, the one `sweepSilentShards` compares with (not SQL `now()`).
    await pool.query('update shard set last_seen_at = $1 where name = $2', [
      new Date(Date.now() - 4 * 60_000),
      's1'
    ])
    await pool.query('update shard set last_seen_at = $1 where name = $2', [new Date(Date.now()), 's2'])
    const { alerts, signal } = recorder()
    assert.deepEqual(await sweepSilentShards({ pool, signal }), { ran: true, silent: ['s1'] })
    const since = (
      await pool.query("select last_seen_at from shard where name = 's1'")
    ).rows[0].last_seen_at.toISOString()
    assert.deepEqual(alerts, [
      { kind: 'shard.silent', data: { shard: 's1', since }, dedupeKey: `silent:s1:${since}` }
    ])
  }
)

test(
  'the hourly pass writes what is missing, flags what points elsewhere, finishes deletes and removes orphans only',
  opts,
  async () => {
    const { pool } = db
    await seedTestShards(pool, ['s1', 's2'])
    const dns = fakeDns()
    await pool.query(`insert into directory_site (site_key, label, shard, dns_state) values
    ('shop.tracy.test', 'shop', 's1', 'pending'),
    ('cafe.tracy.test', 'cafe', 's2', 'ok'),
    ('taken.tracy.test', 'taken', 's1', 'pending'),
    ('gone.tracy.test', 'gone', 's1', 'removing')`)
    dns.seed('cafe.tracy.test', S2)
    dns.seed('taken.tracy.test', 'elsewhere.example')
    dns.seed('gone.tracy.test', S1)
    dns.seed('orphan.tracy.test', S1)
    dns.seed('held.tracy.test', S2)
    dns.seed('s1.tracy.test', S1)
    dns.seed('cowork.tracy.test', 'master.cfargotunnel.com')
    dns.seed('deep.sub.tracy.test', S1)
    await pool.query(`insert into label_registry (label, holder, expires_at) values
    ('held', 's2', now() + interval '10 minutes'), ('stale', 's1', now() - interval '1 minute')`)
    const { alerts, signal } = recorder()
    const result = await reconcileDns({ pool, config: readConfig(MASTER_ENV), dns: dns.client, signal })
    assert.deepEqual(result, {
      ran: true,
      dns: 'read',
      created: 1,
      ok: 1,
      conflicts: 1,
      removed: 1,
      orphans: 1
    })
    assert.deepEqual(dns.names(), [
      `CNAME cafe.tracy.test ${S2}`,
      'CNAME cowork.tracy.test master.cfargotunnel.com',
      `CNAME deep.sub.tracy.test ${S1}`,
      `CNAME held.tracy.test ${S2}`,
      `CNAME s1.tracy.test ${S1}`,
      `CNAME shop.tracy.test ${S1}`,
      'CNAME taken.tracy.test elsewhere.example'
    ])
    const states = Object.fromEntries(
      (await pool.query('select site_key, dns_state from directory_site')).rows.map((r) => [
        r.site_key,
        r.dns_state
      ])
    )
    assert.deepEqual(states, {
      'shop.tracy.test': 'ok',
      'cafe.tracy.test': 'ok',
      'taken.tracy.test': 'conflict'
    })
    assert.deepEqual(
      alerts.map((a) => a.dedupeKey),
      ['dns:taken.tracy.test']
    )
    assert.deepEqual((await pool.query('select label from label_registry')).rows, [{ label: 'held' }])
  }
)

test(
  'without a DNS token only lapsed holds are cleared; a zone that cannot be read changes nothing',
  opts,
  async () => {
    const { pool } = db
    await seedTestShards(pool, ['s1'])
    const config = readConfig(MASTER_ENV)
    await pool.query(
      "insert into label_registry (label, holder, expires_at) values ('stale', 's1', now() - interval '1 minute')"
    )
    assert.deepEqual(await reconcileDns({ pool, config, dns: null }), { ran: true, dns: 'off' })
    assert.equal((await pool.query('select 1 from label_registry')).rowCount, 0)
    const dns = fakeDns()
    dns.down = true
    await pool.query(
      "insert into directory_site (site_key, label, shard) values ('shop.tracy.test', 'shop', 's1')"
    )
    assert.deepEqual(await reconcileDns({ pool, config, dns: dns.client }), { ran: true, dns: 'unavailable' })
    assert.equal((await pool.query('select dns_state from directory_site')).rows[0].dns_state, 'pending')
  }
)

test('a pass another replica is running is skipped', opts, async () => {
  const client = await db.pool.connect()
  try {
    await client.query('select pg_advisory_lock($1)', [RECONCILE_LOCK_ID])
    assert.deepEqual(await reconcileDns({ pool: db.pool, config: readConfig(MASTER_ENV), dns: null }), {
      ran: false
    })
  } finally {
    await client.query('select pg_advisory_unlock($1)', [RECONCILE_LOCK_ID])
    client.release()
  }
})
