/**
 * A shard's heartbeat and the answer its updater acts on (spec §4.1, §5; review amendment 8;
 * docs/sre/hop-dong-cua-shard.md §7): the master's own tags, a pin or a per-shard target, `hold` for
 * a pin, a schema ahead, an unknown tag or two others updating, and `granted_until` for the turn
 * given. Unknown fields are dropped, nulls are answered; the shard closes itself to new people when
 * full or short of memory; a stale backup and missing web images are told.
 */
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import { readConfig } from '../src/config.js'
import { dshTagOf, GRANT_MS, masterTags, migrationHeadOf, shardCheck } from '../src/shards/check.js'
import { shardCustomHostnames } from '../src/shards/custom-hostnames.js'
import { zoneNames } from '../src/shards/dns.js'
import { shardDoors } from '../src/shards/doors.js'
import { shardEvents } from '../src/shards/events-inbox.js'
import { createShardBook, readShards, updateShard } from '../src/shards/store.js'
import { fileDb } from './_db.mjs'
import { MASTER_ENV, SESSION_SECRET, seedTestShards, signedPost } from './_shards.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const MASTER = { appTag: 'app-0123456789ab', dshTag: 'ctx-abcdef012345', sourceCommit: 'abcdef0' }
const HEAD = '122-shard-master.sql'
const OLD = { app_tag: 'app-old000000000' }
const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString()

/** The heartbeat of contract §7, as W3 sends it. */
const beat = (over = {}) => ({
  app_tag: MASTER.appTag,
  dsh_tag: MASTER.dshTag,
  source_commit: 'abcdef0',
  updater_version: '1',
  sites: 10,
  mem_available_mb: 8000,
  disk_free_mb: 50000,
  load1: 0.4,
  releases_read_at: '2026-10-20T03:00:00.000Z',
  migration_head: HEAD,
  accepting: true,
  updating: false,
  last_update: null,
  last_backup: { at: minutesAgo(60), ok: true },
  ...over
})

async function harness(pool, { tags = MASTER, head = HEAD } = {}) {
  await seedTestShards(pool, ['s1', 's2', 's3'])
  const config = readConfig(MASTER_ENV)
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
    zone: zoneNames(null),
    reservedLabels: new Set(),
    events: shardEvents({ pool, config, dns: null }),
    customHostnames: shardCustomHostnames({ pool, config, hostnames: null }),
    check: shardCheck({ pool, signal, tags: { read: async () => tags }, masterHead: async () => head })
  })
  const check = async (shard, body) => {
    const res = await signedPost(app, shard, '/check', body)
    return { status: res.status, body: await res.json() }
  }
  const row = async (name) => (await readShards(pool, SESSION_SECRET)).get(name)
  return { alerts, check, row }
}

test(
  'a heartbeat is kept as read, unknown fields dropped, forgives a failed adopt, and a shard on the master s tags is not held',
  opts,
  async () => {
    const { pool } = db
    const h = await harness(pool)
    await pool.query('update shard set degraded_until = $1 where name = $2', [minutesAgo(-60), 's1'])
    const answer = await h.check('s1', beat({ extra: 'dropped', updater_version: 'v'.repeat(80) }))
    assert.deepEqual(answer, {
      status: 200,
      body: {
        app_tag: MASTER.appTag,
        dsh_tag: MASTER.dshTag,
        source_commit: 'abcdef0',
        hold: false,
        reason: null,
        granted_until: null
      }
    })
    const s1 = await h.row('s1')
    assert.equal(s1.degradedUntil, null)
    assert.ok(Date.now() - s1.heartbeatAt.getTime() < 5000)
    assert.equal(s1.heartbeat.extra, undefined)
    assert.equal(s1.heartbeat.updater_version.length, 40)
    assert.deepEqual([s1.sites, s1.migrationHead, s1.heartbeat.accepting], [10, HEAD, true])
  }
)

test(
  'a heartbeat that could not read its counts is still answered, marks the shard degraded, and never blocks a rollback',
  opts,
  async () => {
    const { pool } = db
    const h = await harness(pool)
    const blind = await h.check('s1', beat({ ...OLD, sites: null, mem_available_mb: null }))
    assert.equal(blind.status, 200)
    assert.deepEqual([blind.body.app_tag, blind.body.hold, blind.body.reason], [MASTER.appTag, false, null])
    const s1 = await h.row('s1')
    assert.ok(s1.degradedUntil.getTime() > Date.now(), 'passed over for new people until a good heartbeat')
    assert.equal(s1.sites, null)
    const bare = await h.check('s2', {})
    assert.deepEqual(
      [bare.status, bare.body.app_tag],
      [200, MASTER.appTag],
      'nothing in a heartbeat is a 400'
    )
    await h.check('s1', beat())
    assert.equal((await h.row('s1')).degradedUntil, null, 'the next good heartbeat clears it')
  }
)

test(
  'a pinned shard is answered its pinned tags and holds; a target tag set in /ops is answered instead of the master s',
  opts,
  async () => {
    const { pool } = db
    const h = await harness(pool)
    await updateShard(pool, 's1', { pinnedAppTag: OLD.app_tag, pinnedDshTag: MASTER.dshTag })
    assert.deepEqual((await h.check('s1', beat(OLD))).body, {
      app_tag: OLD.app_tag,
      dsh_tag: MASTER.dshTag,
      source_commit: null,
      hold: true,
      reason: 'PINNED',
      granted_until: null
    })
    await updateShard(pool, 's1', {
      pinnedAppTag: null,
      pinnedDshTag: null,
      targetAppTag: 'app-try000000000'
    })
    const tried = (await h.check('s1', beat())).body
    assert.deepEqual(
      [tried.app_tag, tried.dsh_tag, tried.hold, tried.reason],
      ['app-try000000000', MASTER.dshTag, false, null]
    )
  }
)

test(
  'a schema ahead of the master holds that shard; tags the master cannot name hold every shard, answered as null',
  opts,
  async () => {
    const { pool } = db
    const h = await harness(pool)
    const ahead = await h.check('s1', beat({ ...OLD, migration_head: '999-later.sql' }))
    assert.deepEqual([ahead.body.hold, ahead.body.reason], [true, 'MIGRATION_AHEAD'])
    const blind = await harness(pool, { tags: { appTag: null, dshTag: MASTER.dshTag, sourceCommit: null } })
    const unknown = (await blind.check('s2', beat())).body
    assert.deepEqual(
      [unknown.app_tag, unknown.hold, unknown.reason, unknown.granted_until],
      [null, true, 'TAG_UNKNOWN', null]
    )
  }
)

test(
  'at most two shards update at once, each with a turn that ends; a shard already on its way keeps it; a finished one frees it',
  opts,
  async () => {
    const h = await harness(db.pool)
    const first = (await h.check('s1', beat(OLD))).body
    assert.equal(first.hold, false)
    const left = Date.parse(first.granted_until) - Date.now()
    assert.ok(left > GRANT_MS - 5000 && left <= GRANT_MS, String(left))
    assert.equal((await h.check('s2', beat(OLD))).body.hold, false)
    assert.deepEqual((await h.check('s3', beat(OLD))).body, {
      app_tag: MASTER.appTag,
      dsh_tag: MASTER.dshTag,
      source_commit: 'abcdef0',
      hold: true,
      reason: 'BUSY',
      granted_until: null
    })
    assert.equal((await h.check('s1', beat({ ...OLD, updating: true }))).body.hold, false)
    await h.check('s1', beat())
    assert.equal((await h.check('s3', beat(OLD))).body.hold, false)
  }
)

test('a turn not used for fifteen minutes lapses and frees its place', opts, async () => {
  const { pool } = db
  const h = await harness(pool)
  await h.check('s1', beat(OLD))
  await h.check('s2', beat(OLD))
  await pool.query('update shard set update_granted_at = $1 where name = $2', [minutesAgo(16), 's1'])
  assert.equal((await h.check('s3', beat(OLD))).body.hold, false)
})

test('three shards asking at the same moment: exactly two are let through', opts, async () => {
  const h = await harness(db.pool)
  const answers = await Promise.all(['s1', 's2', 's3'].map((name) => h.check(name, beat(OLD))))
  assert.deepEqual(answers.map((a) => a.body.reason).sort(), ['BUSY', null, null])
})

test('a shard backing off after a failed update gets no turn for an hour', opts, async () => {
  const { pool } = db
  const h = await harness(pool)
  const failed = (minutes) => ({
    app_tag: 'app-new000000000',
    dsh_tag: MASTER.dshTag,
    ok: false,
    finished_at: minutesAgo(minutes),
    log_tail: 'healthcheck failed',
    web_images_missing: false
  })
  assert.deepEqual((await h.check('s1', beat({ ...OLD, last_update: failed(10) }))).body.reason, 'BUSY')
  assert.equal(
    (await pool.query("select update_granted_at from shard where name = 's1'")).rows[0].update_granted_at,
    null
  )
  assert.equal((await h.check('s1', beat({ ...OLD, last_update: failed(61) }))).body.hold, false)
})

test(
  'a full shard, or one short of memory three beats running, stops taking people, told once; a failed update and missing web images are told once',
  opts,
  async () => {
    const { pool } = db
    const h = await harness(pool)
    await updateShard(pool, 's1', { accepting: true, maxSites: 20 })
    await h.check('s1', beat({ sites: 17 }))
    assert.equal((await h.row('s1')).accepting, true)
    await h.check('s1', beat({ sites: 18 }))
    await h.check('s1', beat({ sites: 18 }))
    assert.equal((await h.row('s1')).accepting, false)
    await updateShard(pool, 's2', { accepting: true })
    await h.check('s2', beat({ mem_available_mb: 1500 }))
    await h.check('s2', beat({ mem_available_mb: 1500 }))
    assert.equal((await h.row('s2')).accepting, true)
    await h.check('s2', beat({ mem_available_mb: 1500 }))
    assert.equal((await h.row('s2')).accepting, false)
    const failed = {
      app_tag: 'app-new000000000',
      dsh_tag: MASTER.dshTag,
      ok: false,
      finished_at: '2026-10-20T03:10:00Z',
      log_tail: 'healthcheck failed',
      web_images_missing: true
    }
    await h.check('s3', beat({ last_update: failed }))
    await h.check('s3', beat({ last_update: failed }))
    assert.deepEqual(
      h.alerts.filter((a) => a.kind === 'shard.closed').map((a) => a.data),
      [
        { shard: 's1', reason: 'FULL' },
        { shard: 's2', reason: 'LOW_MEMORY' }
      ]
    )
    const told = h.alerts.filter((a) => a.kind === 'shard.update_failed')
    assert.deepEqual(new Set(told.map((a) => a.dedupeKey)), new Set(['update:s3:2026-10-20T03:10:00Z']))
    assert.deepEqual(told[0].data, {
      shard: 's3',
      tag: 'app-new000000000',
      finished_at: '2026-10-20T03:10:00Z'
    })
    const images = h.alerts.filter((a) => a.kind === 'shard.web_images_missing')
    assert.deepEqual(new Set(images.map((a) => a.dedupeKey)), new Set(['webimg:s3:2026-10-20T03:10:00Z']))
    assert.deepEqual(images[0].data, { shard: 's3', tag: 'app-new000000000' })
  }
)

test(
  'a backup older than 36 hours or failed is told once per backup; a fresh good one is not',
  opts,
  async () => {
    const { pool } = db
    const h = await harness(pool)
    const old = minutesAgo(37 * 60)
    const failedAt = minutesAgo(30)
    await h.check('s1', beat())
    await h.check('s1', beat({ last_backup: { at: old, ok: true } }))
    await h.check('s1', beat({ last_backup: { at: old, ok: true } }))
    await h.check('s2', beat({ last_backup: { at: failedAt, ok: false } }))
    const told = h.alerts.filter((a) => a.kind === 'shard.backup_stale')
    assert.deepEqual(
      new Set(told.map((a) => a.dedupeKey)),
      new Set([`backup:s1:${old}`, `backup:s2:${failedAt}`])
    )
    assert.deepEqual(told.find((a) => a.data.shard === 's1').data, { shard: 's1', at: old, result: 'stale' })
    assert.deepEqual(told.find((a) => a.data.shard === 's2').data, {
      shard: 's2',
      at: failedAt,
      result: 'failed'
    })
    await pool.query("update shard set created_at = now() - interval '2 days' where name = 's3'")
    await h.check('s3', beat({ last_backup: null }))
    assert.deepEqual(
      h.alerts.filter((a) => a.kind === 'shard.backup_stale' && a.data.shard === 's3').map((a) => a.data),
      [{ shard: 's3', at: 'never', result: 'stale' }]
    )
  }
)

test('the master s tags: app from its env, dsh from its own host, asked once per ten minutes, the last good kept', async () => {
  let t = 0
  let up = true
  const asked = []
  const hostCall = async (_config, host, path) => {
    asked.push([host, path])
    return up
      ? { ok: true, status: 200, body: { image: { tag: MASTER.dshTag } } }
      : { ok: false, status: 502, body: {} }
  }
  const tags = masterTags({
    config: { hostName: 'prod1', defaultHost: 'prod1' },
    hostCall,
    env: { APP_IMAGE_TAG: MASTER.appTag, TRACY_SOURCE_COMMIT: 'abcdef0' },
    now: () => t
  })
  assert.deepEqual(await tags.read(), MASTER)
  t += 9 * 60_000
  await tags.read()
  assert.deepEqual(asked, [['prod1', '/dsh-versions']])
  t += 2 * 60_000
  up = false
  assert.equal((await tags.read()).dshTag, MASTER.dshTag, 'the last good answer while the host is down')
  t += 30_000
  await tags.read()
  assert.equal(asked.length, 2, 'asked again only after a minute')
  const blank = masterTags({ config: {}, hostCall, env: {} })
  assert.deepEqual(await blank.read(), { appTag: null, dshTag: null, sourceCommit: null })
  assert.equal(asked.length, 2, 'no host named: nobody is asked')
})

test('the master s dsh tag falls back to the running container when the host cannot read host-dsh.env', async () => {
  // What tracy-host answers on a real master: its container has no /etc/tracy/host-dsh.env.
  const unreadable = {
    image: { repository: 'ghcr.io/tracyhq/tracy-dsh', tag: null },
    container: { image: 'ghcr.io/tracyhq/tracy-dsh:ctx-21fed5366408' }
  }
  assert.equal(dshTagOf(unreadable), 'ctx-21fed5366408')
  assert.equal(
    dshTagOf({ ...unreadable, image: { tag: 'ctx-aaaaaaaaaaaa' } }),
    'ctx-aaaaaaaaaaaa',
    'the env file wins when read'
  )
  assert.equal(
    dshTagOf({ container: { image: 'ghcr.io/someone/else:ctx-21fed5366408' } }),
    null,
    'another repository'
  )
  assert.equal(
    dshTagOf({ container: { image: 'ghcr.io/tracyhq/tracy-dsh@sha256:0123' } }),
    null,
    'a digest is no tag'
  )
  assert.equal(dshTagOf({ container: null }), null)
  const ecr = '123456789012.dkr.ecr.us-east-1.amazonaws.com/lab3-image/tracy-ai/tracy-dsh'
  assert.equal(
    dshTagOf({ container: { image: `${ecr}:ctx-21fed5366408` } }),
    'ctx-21fed5366408',
    'the ECR mirror'
  )
  for (const other of [
    `evil.example/${ecr}:ctx-21fed5366408`,
    '123456789012.dkr.ecr.us-east-1.amazonaws.com/other/tracy-dsh:ctx-21fed5366408',
    '123456789012.dkr.ecr.us-east-1.amazonaws.com.evil.example/lab3-image/tracy-ai/tracy-dsh:ctx-21fed5366408',
    `${ecr}@sha256:0123`
  ])
    assert.equal(dshTagOf({ container: { image: other } }), null, other)
  const tags = masterTags({
    config: { hostName: 'dev' },
    hostCall: async () => ({ ok: true, status: 200, body: unreadable }),
    env: { APP_IMAGE_TAG: MASTER.appTag }
  })
  assert.equal((await tags.read()).dshTag, 'ctx-21fed5366408')
})

test(
  'the master s migration head is the last file applied, in the order migrate applies them',
  opts,
  async () => {
    const files = readdirSync(new URL('../src/db/migrations/', import.meta.url))
      .filter((name) => name.endsWith('.sql'))
      .sort()
    assert.equal(await migrationHeadOf(db.pool)(), files.at(-1))
  }
)
