/** /ops › Shards: what each row says, and what a change sends (apps/tracy-web/src/shards/ops-routes.js). */
import assert from 'node:assert/strict'
import test from 'node:test'

const { addShard, draftProblems, fillText, onTarget, saveShard, shardState, targetFromInput, wantedTags } =
  await import(new URL('../src/shards/shards-api.ts', import.meta.url).href)

const MASTER = {
  appTag: 'app-0123456789ab',
  dshTag: 'ctx-abcdef012345',
  sourceCommit: 'abcdef0',
  migrationHead: '122-shard-master.sql',
  people: 3
}
const BEAT = {
  app_tag: MASTER.appTag,
  dsh_tag: MASTER.dshTag,
  source_commit: null,
  migration_head: null,
  updater_version: '1',
  sites: 10,
  mem_available_mb: 8000,
  disk_free_mb: null,
  load1: null,
  releases_read_at: null,
  accepting: true,
  updating: false,
  last_update: null,
  last_backup: null
}
const row = (over = {}) => ({
  name: 's1',
  origin: 'https://s1.tracy.test',
  provider: 'do',
  region: 'asia',
  accepting: true,
  pinned: false,
  pinnedAppTag: null,
  pinnedDshTag: null,
  maxSites: 200,
  targetAppTag: null,
  targetDshTag: null,
  degradedUntil: null,
  heartbeatAt: '2026-10-20T03:00:00Z',
  silent: false,
  lowMemBeats: 0,
  updateGrantedAt: null,
  migrationHead: null,
  heartbeat: BEAT,
  sites: 9,
  people: 4,
  ...over
})
const DRAFT = {
  name: 's3',
  origin: 'https://s3.tracy.test',
  secret: 'c'.repeat(64),
  tunnelId: '33333333-3333-4333-8333-333333333333',
  provider: '',
  region: ''
}

test('a row names its worst state first', () => {
  const NOW = Date.parse('2026-10-20T03:00:00Z')
  assert.equal(shardState(row({ silent: true, pinned: true }), NOW), 'silent')
  assert.equal(shardState(row({ heartbeat: { ...BEAT, updating: true } }), NOW), 'updating')
  const failed = {
    app_tag: 'app-x',
    dsh_tag: null,
    ok: false,
    finished_at: 'T',
    log_tail: '',
    web_images_missing: false
  }
  assert.equal(shardState(row({ heartbeat: { ...BEAT, last_update: failed } }), NOW), 'failed')
  assert.equal(shardState(row({ degradedUntil: '2026-10-20T03:05:00Z' }), NOW), 'degraded')
  assert.equal(
    shardState(row({ degradedUntil: '2026-10-20T02:55:00Z' }), NOW),
    'open',
    'a lapsed mark is no mark'
  )
  assert.equal(shardState(row({ pinned: true }), NOW), 'pinned')
  assert.equal(shardState(row({ accepting: false }), NOW), 'closed')
  assert.equal(
    shardState(row({ heartbeat: { ...BEAT, accepting: false } }), NOW),
    'closed',
    'the shard itself said no'
  )
  assert.equal(shardState(row(), NOW), 'open')
})

test('a pin wins, then a target tag set in /ops, then the master s; a side that is unknown answers null', () => {
  assert.deepEqual(wantedTags(row(), MASTER), { app: MASTER.appTag, dsh: MASTER.dshTag, overridden: false })
  assert.deepEqual(wantedTags(row({ targetAppTag: 'app-try' }), MASTER), {
    app: 'app-try',
    dsh: MASTER.dshTag,
    overridden: true
  })
  assert.deepEqual(
    wantedTags(
      row({ pinned: true, pinnedAppTag: 'app-old', pinnedDshTag: 'ctx-old', targetAppTag: 'app-try' }),
      MASTER
    ),
    {
      app: 'app-old',
      dsh: 'ctx-old',
      overridden: true
    }
  )
  assert.equal(onTarget(row(), MASTER), true)
  assert.equal(onTarget(row({ targetAppTag: 'app-try' }), MASTER), false)
  assert.equal(onTarget(row({ heartbeat: null }), MASTER), null)
  assert.equal(onTarget(row(), { ...MASTER, dshTag: null }), null)
})

test('fill reads the heartbeat s own count first, the directory s when it could not; a typed tag clears, sets or is refused', () => {
  assert.equal(fillText(row()), '10 / 200 (5 %)')
  assert.equal(fillText(row({ heartbeat: null, sites: 50 })), '50 / 200 (25 %)')
  assert.equal(fillText(row({ heartbeat: { ...BEAT, sites: null }, sites: 50 })), '50 / 200 (25 %)')
  assert.equal(targetFromInput('  '), null)
  assert.equal(targetFromInput(' app-0123456789ab '), 'app-0123456789ab')
  assert.equal(targetFromInput('bad tag!'), undefined)
})

test('a change is one PATCH carrying only what changed, and a refusal is an error', async () => {
  const asked = []
  const ok = async (url, init) => {
    asked.push([url, init.method, JSON.parse(init.body)])
    return new Response('{}', { status: 200 })
  }
  await saveShard(ok, 's1', { targetAppTag: null })
  assert.deepEqual(asked, [['/api/ops/shards/s1', 'PATCH', { targetAppTag: null }]])
  await assert.rejects(
    saveShard(async () => new Response('', { status: 403 }), 's1', { pinned: true }),
    /403/
  )
})

test('an Add draft names what is wrong with each field before anything is sent', () => {
  assert.deepEqual(draftProblems(DRAFT), {})
  const wrong = draftProblems({
    ...DRAFT,
    name: 's0',
    origin: 'https://s3.tracy.test/app',
    secret: 'short',
    tunnelId: 'x',
    region: 'mars'
  })
  assert.deepEqual(Object.keys(wrong).sort(), ['name', 'origin', 'region', 'secret', 'tunnelId'])
  assert.ok(draftProblems({ ...DRAFT, name: 'S3' }).name)
  assert.ok(draftProblems({ ...DRAFT, secret: 'C'.repeat(64) }).secret)
})

test('Add is one POST with a blank region sent as unknown and a blank provider left out; a refusal names its code', async () => {
  const asked = []
  const ok = async (url, init) => {
    asked.push([url, init.method, JSON.parse(init.body)])
    return Response.json({ name: 's3' }, { status: 201 })
  }
  await addShard(ok, DRAFT)
  const { provider: _p, ...sent } = { ...DRAFT, region: 'unknown' }
  assert.deepEqual(asked, [['/api/ops/shards', 'POST', sent]])
  await assert.rejects(
    addShard(async () => Response.json({ code: 'SHARD_EXISTS' }, { status: 409 }), DRAFT),
    /409 SHARD_EXISTS/
  )
})
