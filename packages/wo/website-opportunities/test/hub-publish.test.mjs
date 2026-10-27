// Hub publish half on a real database: materialize, the change feed's ordering, and revocations.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import {
  appendChange,
  CursorError,
  decodeCursor,
  encodeCursor,
  pruneFeed,
  readFeed
} from '../src/hub/feed.js'
import { hubBriefFactsOf, materialize, materializeDirty, POLICY_VERSION } from '../src/hub/materialize.js'
import {
  excludeObservation,
  revocationRevisionOf,
  revokePlace,
  suppressBusiness,
  suppressedIdentities
} from '../src/hub/revocations.js'
import { evidenceRevisionOf, hubDatabase, makePlace, observe } from './hub-fixtures.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
let db
let pool

before(async () => {
  if (!process.env.TEST_DATABASE_URL) return
  db = await hubDatabase()
  pool = db.pool
})
after(async () => db?.close())

const publish = async (placeId, extra) =>
  materialize(pool, placeId, await evidenceRevisionOf(pool, placeId), POLICY_VERSION, extra)
const head = async (feed = 'changes') => (await readFeed(pool, feed)).cursor
const drain = async (feed, cursor) => {
  const events = []
  let page = { cursor, more: true }
  while (page.more) {
    page = await readFeed(pool, feed, { cursor: page.cursor, limit: 2 })
    events.push(...page.events)
  }
  return { events, cursor: page.cursor }
}

test('materialize publishes a snapshot with provenance, a revision and one upsert event', opts, async () => {
  const { placeId, identities } = await makePlace(pool)
  const subject = identities[0]
  await observe(pool, { subject, field: 'name', value: 'Cafe One' })
  await observe(pool, { subject, field: 'location', value: { latitude: 52.3701, longitude: 4.8952 } })
  const start = await head()
  const out = await publish(placeId)
  assert.equal(out.status, 'published')
  assert.equal(out.revision, 1)
  const { events } = await drain('changes', start)
  assert.deepEqual(
    events.map((e) => [e.kind, e.placeId, e.revision, e.contentChanged]),
    [['upsert', placeId, 1, true]]
  )
  const row = (await pool.query('select * from wo_hub_place where place_id = $1', [placeId])).rows[0]
  assert.equal(row.current_snapshot_id, out.snapshotId)
  assert.equal(row.cell, '5237:489')
  assert.notEqual(row.content_hash, row.provenance_hash)
  const field = (
    await pool.query(
      `select provenance from wo_hub_snapshot_field where snapshot_id = $1 and field = 'name'`,
      [out.snapshotId]
    )
  ).rows[0]
  assert.deepEqual(field.provenance.sources, ['google_maps'])
})

test(
  'the same evidence again publishes nothing; a re-check with the same content keeps the content hash',
  opts,
  async () => {
    const { placeId, identities } = await makePlace(pool)
    const subject = identities[0]
    await observe(pool, { subject, field: 'name', value: 'Cafe Two' })
    const first = await publish(placeId)
    assert.equal((await publish(placeId)).status, 'unchanged')
    await observe(pool, { subject, field: 'name', value: 'Cafe Two', fetchedAt: '2026-10-22T10:00:00Z' })
    const again = await publish(placeId)
    assert.equal(again.status, 'published')
    assert.equal(again.revision, first.revision + 1)
    assert.equal(again.contentChanged, false)
  }
)

test('a stale evidence revision is refused without writing anything', opts, async () => {
  const { placeId, identities } = await makePlace(pool)
  await observe(pool, { subject: identities[0], field: 'name', value: 'Cafe Three' })
  const seen = await evidenceRevisionOf(pool, placeId)
  await observe(pool, { subject: identities[0], field: 'phone', value: '+31 20 333' })
  await assert.rejects(materialize(pool, placeId, seen, POLICY_VERSION), { code: 'stale_evidence' })
  const row = (await pool.query('select revision from wo_hub_place where place_id = $1', [placeId])).rows[0]
  assert.equal(Number(row.revision), 0)
})

test('published snapshots and their fields are immutable', opts, async () => {
  const { placeId, identities } = await makePlace(pool)
  await observe(pool, { subject: identities[0], field: 'name', value: 'Cafe Four' })
  const { snapshotId } = await publish(placeId)
  await assert.rejects(
    pool.query(`update wo_hub_snapshot set content_hash = 'x' where snapshot_id = $1`, [snapshotId]),
    /immutable/
  )
  await assert.rejects(
    pool.query(`update wo_hub_snapshot_field set value = '"x"' where snapshot_id = $1`, [snapshotId]),
    /immutable/
  )
  await assert.rejects(
    pool.query(`delete from wo_hub_snapshot where snapshot_id = $1`, [snapshotId]),
    /never deleted/
  )
})

test('ACCEPTANCE: two transactions committing out of order lose no event', opts, async () => {
  const a = await makePlace(pool)
  const b = await makePlace(pool)
  const start = await head()
  const ca = await pool.connect()
  const cb = await pool.connect()
  try {
    await ca.query('begin')
    await appendChange(ca, { kind: 'upsert', placeId: a.placeId, revision: 1 })
    await cb.query('begin')
    let bDone = false
    const bAppend = appendChange(cb, { kind: 'upsert', placeId: b.placeId, revision: 1 }).then((seq) => {
      bDone = true
      return seq
    })
    await new Promise((r) => setTimeout(r, 300))
    assert.equal(bDone, false, 'the second publisher waits for the counter row')
    // A reader in between sees neither and keeps its cursor where it was.
    const mid = await readFeed(pool, 'changes', { cursor: start })
    assert.deepEqual(mid.events, [])
    await ca.query('commit')
    const seqB = await bAppend
    await cb.query('commit')
    const { events } = await drain('changes', mid.cursor)
    assert.deepEqual(
      events.map((e) => e.placeId),
      [a.placeId, b.placeId]
    )
    assert.ok(seqB > decodeCursor('changes', mid.cursor))
  } finally {
    ca.release()
    cb.release()
  }
})

test(
  'ACCEPTANCE: under concurrent publishers a polling reader sees every event once, in order',
  opts,
  async () => {
    const places = await Promise.all(Array.from({ length: 12 }, () => makePlace(pool)))
    const start = await head()
    const seen = []
    let cursor = start
    let stop = false
    const poller = (async () => {
      while (!stop) {
        const page = await readFeed(pool, 'changes', { cursor, limit: 3 })
        seen.push(...page.events)
        cursor = page.cursor
        await new Promise((r) => setTimeout(r, 5))
      }
    })()
    await Promise.all(
      places.map(async ({ placeId }, i) => {
        const c = await pool.connect()
        try {
          await c.query('begin')
          await appendChange(c, { kind: 'upsert', placeId, revision: 1 })
          await new Promise((r) => setTimeout(r, (i * 37) % 60))
          await c.query('commit')
        } finally {
          c.release()
        }
      })
    )
    stop = true
    await poller
    seen.push(...(await drain('changes', cursor)).events)
    assert.deepEqual(seen.map((e) => e.placeId).sort(), places.map((p) => p.placeId).sort())
  }
)

test('cursors are opaque and versioned; a pruned cursor answers cursor_expired', opts, async () => {
  assert.throws(
    () => decodeCursor('changes', 'garbage'),
    (e) => e instanceof CursorError && e.code === 'bad_cursor'
  )
  assert.throws(() => decodeCursor('revocations', encodeCursor('changes', 5)), { code: 'bad_cursor' })
  const { placeId } = await makePlace(pool)
  const old = await head()
  const c = await pool.connect()
  await c.query('begin')
  await appendChange(c, { kind: 'upsert', placeId, revision: 1 })
  await c.query('commit')
  c.release()
  await pruneFeed(pool, 'changes', { before: new Date(Date.now() + 60_000) })
  await assert.rejects(readFeed(pool, 'changes', { cursor: old }), { code: 'cursor_expired' })
  await readFeed(pool, 'changes', { cursor: await head() })
})

test(
  'a withdrawn observation revokes the snapshot at once; the rebuild drops it and what was derived from it',
  opts,
  async () => {
    const { placeId, identities } = await makePlace(pool)
    const subject = identities[0]
    await observe(pool, { subject, field: 'name', value: 'Cafe Five' })
    const site = await observe(pool, { subject, field: 'website', value: 'https://five.example/' })
    const first = await publish(placeId)
    const start = await head('revocations')
    await pool.query(`update wo_hub_observation set status = 'withdrawn' where id = $1`, [site])
    const revoked = (
      await pool.query('select revoked_at from wo_hub_snapshot where snapshot_id = $1', [first.snapshotId])
    ).rows[0]
    assert.ok(revoked.revoked_at, 'revoked in the withdrawal transaction, before any rebuild')
    const { events } = await drain('revocations', start)
    assert.deepEqual(
      events.map((e) => [e.kind, e.scope, e.revision]),
      [['revoke', 'data', first.revision]]
    )
    await materializeDirty(pool, POLICY_VERSION)
    const profile = (
      await pool.query(
        `select pr.profile from wo_hub_place p join wo_place_snapshot_profile pr on pr.snapshot_id = p.current_snapshot_id
        where p.place_id = $1`,
        [placeId]
      )
    ).rows[0].profile
    assert.equal(profile.hub.fields.website, undefined)
    assert.deepEqual(profile.hub.websiteVerdict, { state: 'not_found', checkedSources: ['google_maps'] })
  }
)

test('an observation linked to the wrong business is excluded the same way', opts, async () => {
  const { placeId, identities } = await makePlace(pool)
  const phone = await observe(pool, { subject: identities[0], field: 'phone', value: '+31 20 666' })
  await observe(pool, { subject: identities[0], field: 'name', value: 'Cafe Six' })
  const first = await publish(placeId)
  await excludeObservation(pool, { observationId: phone, reason: 'mis_linked', actor: 'operator' })
  assert.ok(
    (await pool.query('select revoked_at from wo_hub_snapshot where snapshot_id = $1', [first.snapshotId]))
      .rows[0].revoked_at
  )
  await materializeDirty(pool, POLICY_VERSION)
  const facts = await hubBriefFactsOf(pool, placeId)
  assert.equal(facts.facts.phone, undefined)
  assert.equal(facts.facts.name, 'Cafe Six')
})

test(
  'ACCEPTANCE: a revocation during a running research is not republished by the worker',
  opts,
  async () => {
    const { placeId, identities } = await makePlace(pool)
    await observe(pool, { subject: identities[0], field: 'name', value: 'Cafe Seven' })
    await publish(placeId)
    // The worker starts: it reads the revocation revision, then researches.
    const seen = await revocationRevisionOf(pool, placeId)
    const start = await head()
    await revokePlace(pool, { placeId, reason: 'operator review', actor: 'operator' })
    // The worker finishes: its new observation lands and it tries to publish.
    await observe(pool, { subject: identities[0], field: 'phone', value: '+31 20 777' })
    await assert.rejects(publish(placeId, { revocationRevision: seen }), { code: 'revoked' })
    await assert.rejects(publish(placeId), { code: 'revoked' })
    await materializeDirty(pool, POLICY_VERSION)
    const { events } = await drain('changes', start)
    assert.deepEqual(
      events.filter((e) => e.placeId === placeId).map((e) => e.kind),
      ['revoke']
    )
    assert.equal(await hubBriefFactsOf(pool, placeId), null)
  }
)

test(
  'a worker that saw an older revocation revision is refused even if the place is live again',
  opts,
  async () => {
    const { placeId, identities } = await makePlace(pool)
    await observe(pool, { subject: identities[0], field: 'name', value: 'Cafe Eight' })
    const seen = await revocationRevisionOf(pool, placeId)
    await pool.query(
      'update wo_hub_place set revocation_revision = revocation_revision + 1 where place_id = $1',
      [placeId]
    )
    await assert.rejects(publish(placeId, { revocationRevision: seen }), { code: 'revoked' })
  }
)

test(
  'removal at the business request suppresses every known identity, so it never comes back',
  opts,
  async () => {
    const google = { namespace: 'google', externalId: 'ChIJ-removed' }
    const url = { namespace: 'url', externalId: 'removed.example' }
    const { placeId } = await makePlace(pool, { identities: [google, url] })
    await observe(pool, { subject: google, field: 'name', value: 'Removed Cafe' })
    await publish(placeId)
    const start = await head('revocations')
    await suppressBusiness(pool, { placeId, reason: 'owner request', actor: 'operator' })
    const { events } = await drain('revocations', start)
    assert.deepEqual(
      events.map((e) => e.kind),
      ['delete']
    )
    assert.deepEqual(
      (await suppressedIdentities(pool, [google, url, { namespace: 'osm', externalId: 'n1' }])).length,
      2
    )
    // An accepted observation through any known identity is refused by the database.
    await assert.rejects(
      observe(pool, { subject: url, field: 'name', value: 'Back again' }),
      /removed at the business/
    )
    // A new place record carrying one of those identities cannot be published either.
    await pool.query('update wo_place_identity set place_id = $2 where namespace = $1 and external_id = $3', [
      'url',
      (await pool.query(`insert into wo_place (display_name) values ('x') returning id`)).rows[0].id,
      'removed.example'
    ])
    const moved = (
      await pool.query(
        `select place_id from wo_place_identity where namespace = 'url' and external_id = 'removed.example'`
      )
    ).rows[0].place_id
    await assert.rejects(publish(moved), { code: 'revoked' })
  }
)

test('a conflicted website is not offered to a brief', opts, async () => {
  const { placeId, identities } = await makePlace(pool)
  const subject = identities[0]
  await observe(pool, { subject, field: 'name', value: 'Cafe Nine' })
  await observe(pool, { subject, field: 'website', value: 'https://nine-a.example/' })
  await observe(pool, {
    subject,
    field: 'website',
    value: 'https://nine-b.example/',
    family: 'osm',
    objectId: 'node/9'
  })
  await publish(placeId)
  const facts = await hubBriefFactsOf(pool, placeId)
  assert.equal('website' in facts.facts, false)
  assert.deepEqual(facts.blocked, [{ field: 'website', status: 'conflicted' }])
})
