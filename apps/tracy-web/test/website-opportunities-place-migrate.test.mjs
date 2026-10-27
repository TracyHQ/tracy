// Moving per-account research into shared places (tasks/todo-wo-shared-research.md P3): the backfill gives
// every saved opportunity its place and turns the newest completed research of a place into its first
// published snapshot, copying the stored pictures to the place's keys; a pasted-URL place whose site is a
// Google place's merges into it (deferred while either is being researched); an operator can merge and
// split places by hand, and a merged place stays a tombstone that lookups follow.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'
import { runBackfill } from 'website-opportunities/src/place-backfill.js'
import { createPlaceMaintenance } from 'website-opportunities/src/place-maintenance.js'
import { PlaceMergeError, mergePlaces, rootOf, splitPlace } from 'website-opportunities/src/place-merge.js'
import { resolvePlace } from 'website-opportunities/src/places.js'
import { placeViewOf } from 'website-opportunities/src/place-view.js'
import { placeMediaOf } from 'website-opportunities/src/store.js'
import { decideMergeCandidate } from 'website-opportunities/src/wo-places-store.js'
import { fileDb } from './_db.mjs'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const GOOGLE_ID = 'ChIJlegacyPho1'
const SITE = 'https://phoba.example/'
let PNG
let PNG2
before(async () => {
  const png = (r) =>
    sharp({ create: { width: 40, height: 30, channels: 3, background: { r, g: 40, b: 30 } } })
      .png()
      .toBuffer()
  PNG = new Uint8Array(await png(200))
  PNG2 = new Uint8Array(await png(20))
})

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const one = async (pool, sql, params) => (await pool.query(sql, params)).rows[0]
const count = async (pool, sql, params) => (await one(pool, sql, params)).n

async function account(pool, email) {
  return (await pool.query('insert into account (email) values ($1) returning id', [email])).rows[0].id
}

/** An artifact store in memory, as `storeObjects` answers (`get` returns a Response or null). */
function memoryStore({ failGet = () => false } = {}) {
  const held = new Map()
  return {
    held,
    gets: 0,
    async put(key, bytes) {
      held.set(key, new Uint8Array(bytes))
      return true
    },
    async get(key) {
      this.gets += 1
      if (failGet(key) || !held.has(key)) return null
      return new Response(held.get(key))
    }
  }
}

/**
 * Research one account did before places existed: an opportunity with no place, a completed research
 * job, its `wo_source`/`wo_profile` rows and its stored pictures (bytes put in `store` at the old key).
 */
async function legacyResearch(
  pool,
  store,
  accountId,
  {
    provider = 'google-places',
    providerId = GOOGLE_ID,
    name = 'Pho Ba',
    candidate = { website: SITE },
    website = SITE,
    googlePlace = { placeId: GOOGLE_ID, name: 'Pho Ba', website: SITE, fetchedAt: '2026-10-01T00:00:00Z' },
    pictures = [PNG],
    privateFacebook = null,
    // where the website's first page ended after redirects
    finalUrl = website,
    doneAt = '2026-10-02T00:00:00Z'
  } = {}
) {
  const opp = await one(
    pool,
    `insert into wo_opportunity (account_id, name, provider, provider_id, candidate) values ($1, $2, $3, $4, $5)
     returning *`,
    [accountId, name, provider, providerId, JSON.stringify(candidate)]
  )
  const job = await one(
    pool,
    `insert into wo_job (account_id, opportunity_id, kind, request_id, state, stage, updated_at)
     values ($1, $2, 'research', $3, 'completed', 'done', $4) returning *`,
    [accountId, opp.id, `legacy-${opp.id}`, doneAt]
  )
  const source = async (kind, ref, collected) =>
    pool.query(
      `insert into wo_source (opportunity_id, source, ref, status, collected, updated_at)
       values ($1, $2, $3, 'complete', $4, $5)`,
      [opp.id, kind, ref, JSON.stringify(collected), doneAt]
    )
  if (website)
    await source('website', website, {
      profile: { name: 'Pho Ba', bio: 'Noodles since 1990', links: [] },
      pages: [{ url: finalUrl, title: 'Pho Ba', text: 'Pho' }],
      media: pictures.map((_, i) => ({ url: `${website}p${i}.png`, kind: 'image' }))
    })
  if (privateFacebook)
    await source('facebook', privateFacebook, { profile: { name: 'Pho Ba FB' }, media: [] })
  await pool.query(`insert into wo_profile (opportunity_id, profile, brand) values ($1, $2, $3)`, [
    opp.id,
    JSON.stringify({ name: candidate.name ?? name, website, ...(googlePlace ? { googlePlace } : {}) }),
    JSON.stringify({ website: { origin: 'website', colors: ['#c00'] }, social: null })
  ])
  const media = []
  for (const [i, bytes] of pictures.entries()) {
    const key = `opportunities/${accountId}/${opp.id}/${sha(bytes)}.png`
    await store.put(key, bytes)
    media.push(
      await one(
        pool,
        `insert into wo_media (account_id, opportunity_id, sha256, object_key, status, mime, bytes, width, height,
           kind, source, source_url, collected_at)
         values ($1, $2, $3, $4, 'stored', 'image/png', $5, 40, 30, 'image', 'website', $6, $7) returning *`,
        [accountId, opp.id, sha(bytes), key, bytes.length, `${website ?? SITE}p${i}.png`, doneAt]
      )
    )
  }
  return { opp, job, media }
}

/** Run the backfill until it says nothing is left. */
async function backfillAll(pool, store, extra = {}) {
  const totals = { linked: 0, published: 0, skipped: 0, retried: 0, passes: 0 }
  for (let i = 0; i < 20; i += 1) {
    const r = await runBackfill(pool, { objects: store, batch: 50, ...extra })
    totals.passes += 1
    for (const k of ['linked', 'published', 'skipped', 'retried']) totals[k] += r[k]
    if (!r.more) return totals
  }
  throw new Error('backfill did not settle')
}

test(
  'backfill: two accounts, one Google place → one place, one snapshot from the newest research, both linked',
  opts,
  async () => {
    const { pool } = db
    const store = memoryStore()
    const a = await account(pool, 'a@tracy.test')
    const b = await account(pool, 'b@tracy.test')
    const older = await legacyResearch(pool, store, a, { doneAt: '2026-09-01T00:00:00Z' })
    const newer = await legacyResearch(pool, store, b, {
      doneAt: '2026-10-05T00:00:00Z',
      pictures: [PNG, PNG2],
      privateFacebook: 'https://facebook.com/someone-else'
    })

    const totals = await backfillAll(pool, store)
    assert.equal(totals.linked, 2)
    assert.equal(totals.published, 1)

    const oppA = await one(pool, 'select * from wo_opportunity where id = $1', [older.opp.id])
    const oppB = await one(pool, 'select * from wo_opportunity where id = $1', [newer.opp.id])
    assert.ok(oppA.place_id)
    assert.equal(oppA.place_id, oppB.place_id, 'one place for both accounts')
    assert.equal(await count(pool, 'select count(*)::int as n from wo_place'), 1)
    assert.equal(
      oppA.place_id,
      await resolvePlace(pool, { provider: 'google-maps', providerId: GOOGLE_ID }),
      'a later save of the same Google id finds the backfilled place'
    )

    const place = await one(pool, 'select * from wo_place where id = $1', [oppA.place_id])
    const snapshot = await one(pool, 'select * from wo_place_snapshot where id = $1', [
      place.current_snapshot_id
    ])
    assert.equal(snapshot.state, 'published')
    assert.equal(snapshot.published_at.toISOString(), '2026-10-05T00:00:00.000Z', 'as old as the research')
    assert.equal(await count(pool, 'select count(*)::int as n from wo_place_snapshot'), 1)

    const provenance = await one(pool, 'select * from wo_place_backfill where place_id = $1', [place.id])
    assert.equal(provenance.state, 'done')
    assert.equal(provenance.from_opportunity_id, newer.opp.id, 'the newest completed research wins')
    assert.equal(provenance.from_account_id, b)

    const sources = (
      await pool.query(
        'select source, ref from wo_place_snapshot_source where snapshot_id = $1 order by source',
        [snapshot.id]
      )
    ).rows
    assert.deepEqual(
      sources.map((s) => [s.source, s.ref]),
      [
        ['google-places', GOOGLE_ID],
        ['website', SITE]
      ],
      "the website Google names is the place's; a page only the account named stays its own"
    )
    const profile = (
      await one(pool, 'select profile from wo_place_snapshot_profile where snapshot_id = $1', [snapshot.id])
    ).profile
    assert.equal(profile.googlePlace.placeId, GOOGLE_ID)
    assert.equal(profile.name, 'Pho Ba')

    // Account A sees the shared snapshot (with B's two pictures) and its own overlay.
    const view = await placeViewOf(pool, oppA)
    assert.equal(view.snapshot.id, snapshot.id)
    assert.equal(view.media.filter((m) => m.origin === 'place').length, 2)
  }
)

test(
  'backfill: pictures are copied to places/<place>/<sha>.<ext>, old keys kept and mapped; a re-run changes nothing',
  opts,
  async () => {
    const { pool } = db
    const store = memoryStore()
    const a = await account(pool, 'a@tracy.test')
    const { media } = await legacyResearch(pool, store, a, { pictures: [PNG, PNG2] })
    await backfillAll(pool, store)

    const placeId = (await one(pool, 'select place_id from wo_opportunity')).place_id
    const rows = (
      await pool.query('select * from wo_place_media where place_id = $1 order by sha256', [placeId])
    ).rows
    assert.deepEqual(
      rows.map((r) => r.object_key).sort(),
      [`places/${placeId}/${sha(PNG)}.png`, `places/${placeId}/${sha(PNG2)}.png`].sort()
    )
    for (const r of rows) assert.deepEqual(store.held.get(r.object_key), r.sha256 === sha(PNG) ? PNG : PNG2)
    for (const m of media) assert.ok(store.held.has(m.object_key), 'the old object is never deleted')
    const legacy = (await pool.query('select * from wo_place_media_legacy order by old_object_key')).rows
    assert.deepEqual(legacy.map((l) => l.old_object_key).sort(), media.map((m) => m.object_key).sort())
    assert.equal(await count(pool, 'select count(*)::int as n from wo_media'), 2, 'wo_media rows stay')

    const before = {
      snapshots: await count(pool, 'select count(*)::int as n from wo_place_snapshot'),
      media: await count(pool, 'select count(*)::int as n from wo_place_media'),
      gets: store.gets
    }
    const again = await backfillAll(pool, store)
    assert.deepEqual(
      { linked: again.linked, published: again.published, skipped: again.skipped, retried: again.retried },
      { linked: 0, published: 0, skipped: 0, retried: 0 }
    )
    assert.equal(await count(pool, 'select count(*)::int as n from wo_place_snapshot'), before.snapshots)
    assert.equal(await count(pool, 'select count(*)::int as n from wo_place_media'), before.media)
    assert.equal(store.gets, before.gets, 'nothing is read from the store again')
  }
)

test(
  'backfill: a run stopped by failing copies resumes on the next pass and publishes once',
  opts,
  async () => {
    const { pool } = db
    let down = true
    const store = memoryStore({ failGet: () => down })
    const a = await account(pool, 'a@tracy.test')
    await legacyResearch(pool, store, a, { pictures: [PNG, PNG2] })

    const first = await runBackfill(pool, { objects: store, batch: 50, retryAfterMs: 0 })
    assert.equal(first.linked, 1)
    assert.equal(first.retried, 1)
    const placeId = (await one(pool, 'select place_id from wo_opportunity')).place_id
    assert.equal(
      (await one(pool, 'select current_snapshot_id from wo_place where id = $1', [placeId]))
        .current_snapshot_id,
      null,
      'nothing half-published'
    )
    assert.equal(await count(pool, 'select count(*)::int as n from wo_place_media'), 0)
    assert.equal((await one(pool, 'select * from wo_place_backfill')).state, 'retry')

    down = false
    const second = await runBackfill(pool, { objects: store, batch: 50, retryAfterMs: 0 })
    assert.equal(second.published, 1)
    assert.equal(await count(pool, 'select count(*)::int as n from wo_place_media'), 2)
    assert.equal((await one(pool, 'select * from wo_place_backfill')).state, 'done')
    assert.equal(await count(pool, 'select count(*)::int as n from wo_place_snapshot'), 1)
  }
)

test(
  'backfill: research that named only pages of its own is not shared (no snapshot, the opportunity reads its rows)',
  opts,
  async () => {
    const { pool } = db
    const store = memoryStore()
    const a = await account(pool, 'a@tracy.test')
    // An OSM place: the server vouches for no page of it, so the account's research stays its own.
    const { opp } = await legacyResearch(pool, store, a, {
      provider: 'osm',
      providerId: 'node/42',
      googlePlace: null
    })
    const totals = await backfillAll(pool, store)
    assert.equal(totals.published, 0)
    assert.equal(totals.skipped, 1)
    const placeId = (await one(pool, 'select place_id from wo_opportunity where id = $1', [opp.id])).place_id
    assert.ok(placeId, 'it still gets its place')
    assert.equal(await count(pool, 'select count(*)::int as n from wo_place_snapshot'), 0)
    assert.equal(
      await placeViewOf(pool, { ...opp, place_id: placeId }),
      null,
      'it reads its own rows as before'
    )
  }
)

const quiet = { warn() {}, error() {}, log() {} }
const placeOf = async (pool, oppId) =>
  (await one(pool, 'select place_id from wo_opportunity where id = $1', [oppId])).place_id

/** The Google place (account A) and a pasted http:// address of its site that redirects to it (account C). */
async function googleAndPastedUrl(pool, store) {
  const a = await account(pool, 'a@tracy.test')
  const c = await account(pool, 'c@tracy.test')
  const google = await legacyResearch(pool, store, a, { pictures: [PNG] })
  const pasted = await legacyResearch(pool, store, c, {
    provider: 'url',
    providerId: 'http://PhoBa.example',
    name: 'phoba.example',
    candidate: { website: 'http://phoba.example' },
    website: 'http://phoba.example/',
    finalUrl: 'https://phoba.example/',
    googlePlace: null,
    pictures: [PNG2]
  })
  return { a, c, google, pasted }
}

test(
  'url ↔ Google: a pasted site that redirects to the website Google names merges into the Google place',
  opts,
  async () => {
    const { pool } = db
    const store = memoryStore()
    const { c, google, pasted } = await googleAndPastedUrl(pool, store)
    const maintenance = createPlaceMaintenance({ pool, objects: store, log: quiet, retryAfterMs: 0 })
    for (let i = 0; i < 5; i += 1) await maintenance.tick()

    const googlePlace = await placeOf(pool, google.opp.id)
    assert.equal(
      await placeOf(pool, pasted.opp.id),
      googlePlace,
      'the pasted opportunity reads the Google place'
    )
    const urlPlace = (
      await one(pool, `select place_id from wo_place_identity where namespace = 'url' and external_id = $1`, [
        'http://phoba.example/'
      ])
    ).place_id
    assert.notEqual(urlPlace, googlePlace)
    const tomb = await one(pool, 'select * from wo_place where id = $1', [urlPlace])
    assert.equal(tomb.merged_into, googlePlace, 'the url place stays as a tombstone')
    assert.ok(tomb.current_snapshot_id, 'its snapshot is kept')
    assert.equal(
      (await one(pool, 'select state from wo_place_snapshot where id = $1', [tomb.current_snapshot_id]))
        .state,
      'published'
    )
    assert.equal(await rootOf(pool, urlPlace), googlePlace)
    assert.equal(
      await resolvePlace(pool, { provider: 'url', providerId: 'https://phoba.example/' }),
      googlePlace,
      'the final URL is an identity too'
    )
    assert.equal(
      await resolvePlace(pool, { provider: 'url', providerId: 'http://phoba.example' }),
      googlePlace
    )
    const merge = await one(pool, `select * from wo_place_ops_event where action = 'merge'`)
    assert.equal(merge.place_id, urlPlace)
    assert.equal(merge.actor, 'auto')
    assert.deepEqual(merge.detail.opportunities, [pasted.opp.id])
    // Account C can still open the url place's pictures through its (moved) opportunity.
    const loserMedia = await one(pool, 'select id from wo_place_media where place_id = $1', [urlPlace])
    assert.ok(await placeMediaOf(pool, c, loserMedia.id), 'a tombstone media row stays readable')
    // A Google place's links never take the pasted site's own: nothing was copied from the url place.
    assert.deepEqual(
      (await pool.query('select url from wo_place_link where place_id = $1', [googlePlace])).rows.map(
        (r) => r.url
      ),
      ['https://phoba.example/']
    )
  }
)

test(
  'url ↔ Google: while either place is being researched the merge waits, then is applied once',
  opts,
  async () => {
    const { pool } = db
    const store = memoryStore()
    const { google, pasted } = await googleAndPastedUrl(pool, store)
    await backfillAll(pool, store)
    const googlePlace = await placeOf(pool, google.opp.id)
    const urlPlace = await placeOf(pool, pasted.opp.id)
    const running = await one(
      pool,
      `insert into wo_place_job (place_id, state, lease_token, lease_until) values ($1, 'running', 3, now() + interval '1 minute')
       returning *`,
      [googlePlace]
    )
    const maintenance = createPlaceMaintenance({ pool, objects: store, log: quiet })
    await maintenance.afterPublish(urlPlace)
    await maintenance.tick()
    assert.equal(
      (await one(pool, 'select merged_into from wo_place where id = $1', [urlPlace])).merged_into,
      null
    )
    assert.equal(await placeOf(pool, pasted.opp.id), urlPlace, 'nothing moved under the running job')
    const job = await one(pool, 'select * from wo_place_job where id = $1', [running.id])
    assert.equal(job.state, 'running')
    assert.equal(Number(job.lease_token), 3, 'the run keeps its lease')
    const waiting = await one(pool, 'select * from wo_place_merge_candidate')
    assert.equal(waiting.state, 'approved')
    assert.equal(waiting.applied_at, null)

    await pool.query(`update wo_place_job set state = 'completed' where id = $1`, [running.id])
    await maintenance.tick()
    await maintenance.tick()
    assert.equal(
      (await one(pool, 'select merged_into from wo_place where id = $1', [urlPlace])).merged_into,
      googlePlace
    )
    assert.equal(await placeOf(pool, pasted.opp.id), googlePlace)
    assert.ok((await one(pool, 'select applied_at from wo_place_merge_candidate')).applied_at)
    assert.equal(
      await count(pool, `select count(*)::int as n from wo_place_ops_event where action = 'merge'`),
      1
    )
  }
)

test(
  'url ↔ Google: a site two Google places name is not merged by itself; it waits for an operator',
  opts,
  async () => {
    const { pool } = db
    const store = memoryStore()
    const { pasted } = await googleAndPastedUrl(pool, store)
    const b = await account(pool, 'b@tracy.test')
    await legacyResearch(pool, store, b, {
      providerId: 'ChIJlegacyPho2',
      googlePlace: {
        placeId: 'ChIJlegacyPho2',
        name: 'Pho Ba 2',
        website: SITE,
        fetchedAt: '2026-10-01T00:00:00Z'
      }
    })
    const maintenance = createPlaceMaintenance({ pool, objects: store, log: quiet, retryAfterMs: 0 })
    for (let i = 0; i < 5; i += 1) await maintenance.tick()
    const urlPlace = await placeOf(pool, pasted.opp.id)
    assert.equal(
      (await one(pool, 'select merged_into from wo_place where id = $1', [urlPlace])).merged_into,
      null
    )
    const pending = (await pool.query(`select * from wo_place_merge_candidate where state = 'pending'`)).rows
    assert.equal(pending.length, 2, 'one candidate per Google place, for an operator to decide')
    assert.ok(pending.every((p) => p.url_place_id === urlPlace))
  }
)

/** Two Google places, each with a published snapshot and an opportunity of its own account. */
async function twoGooglePlaces(pool, store) {
  const a = await account(pool, 'a@tracy.test')
  const b = await account(pool, 'b@tracy.test')
  const one1 = await legacyResearch(pool, store, a, { pictures: [PNG] })
  const two = await legacyResearch(pool, store, b, {
    providerId: 'ChIJlegacyPho2',
    website: 'https://phoba-two.example/',
    candidate: { website: 'https://phoba-two.example/' },
    googlePlace: {
      placeId: 'ChIJlegacyPho2',
      name: 'Pho Ba',
      website: 'https://phoba-two.example/',
      fetchedAt: '2026-10-01T00:00:00Z'
    },
    pictures: [PNG2]
  })
  await backfillAll(pool, store)
  return { a, b, one: one1, two, p1: await placeOf(pool, one1.opp.id), p2: await placeOf(pool, two.opp.id) }
}

test(
  'manual merge then split: the loser is a tombstone lookups follow; split restores it exactly',
  opts,
  async () => {
    const { pool } = db
    const store = memoryStore()
    const { b, two, p1, p2 } = await twoGooglePlaces(pool, store)
    const survivorSnapshot = (await one(pool, 'select current_snapshot_id from wo_place where id = $1', [p1]))
      .current_snapshot_id
    const loserSnapshot = (await one(pool, 'select current_snapshot_id from wo_place where id = $1', [p2]))
      .current_snapshot_id

    const merged = await mergePlaces(pool, p1, p2, { actor: 'ops@tracy.test' })
    assert.equal(merged.opportunities, 1)
    assert.equal(await placeOf(pool, two.opp.id), p1)
    assert.equal(await rootOf(pool, p2), p1)
    assert.equal(await resolvePlace(pool, { provider: 'google-places', providerId: 'ChIJlegacyPho2' }), p1)
    const survivor = await one(pool, 'select * from wo_place where id = $1', [p1])
    assert.equal(survivor.current_snapshot_id, survivorSnapshot, "the survivor's snapshot wins")
    assert.equal(
      (await one(pool, 'select current_snapshot_id from wo_place where id = $1', [p2])).current_snapshot_id,
      loserSnapshot,
      "the loser's snapshot is kept"
    )
    assert.ok(
      (
        await pool.query('select 1 from wo_place_link where place_id = $1 and url = $2', [
          p1,
          'https://phoba-two.example/'
        ])
      ).rows[0],
      "an operator's merge carries the loser's links"
    )
    const loserMedia = await one(pool, 'select id from wo_place_media where place_id = $1', [p2])
    assert.ok(
      await placeMediaOf(pool, b, loserMedia.id),
      "the moved account still reads the loser's pictures"
    )
    await assert.rejects(
      mergePlaces(pool, p1, p2, { actor: 'ops@tracy.test' }),
      (e) => e.code === 'PLACE_MERGED'
    )

    const split = await splitPlace(pool, p1, [{ namespace: 'google', externalId: 'ChIJlegacyPho2' }], {
      actor: 'ops@tracy.test'
    })
    assert.equal(split.place, p2)
    assert.equal(split.restored, true)
    assert.equal((await one(pool, 'select merged_into from wo_place where id = $1', [p2])).merged_into, null)
    assert.equal(await placeOf(pool, two.opp.id), p2, 'its opportunity goes back')
    assert.equal(await resolvePlace(pool, { provider: 'google-places', providerId: 'ChIJlegacyPho2' }), p2)
    assert.equal(await rootOf(pool, p2), p2)
    const events = (await pool.query('select action, actor from wo_place_ops_event order by id')).rows
    assert.deepEqual(
      events.map((e) => [e.action, e.actor]),
      [
        ['merge', 'ops@tracy.test'],
        ['split', 'ops@tracy.test']
      ]
    )
  }
)

test(
  'manual merge is refused while a place is being researched; split of an own identity makes a new place',
  opts,
  async () => {
    const { pool } = db
    const store = memoryStore()
    const { a, one: first, p1, p2 } = await twoGooglePlaces(pool, store)
    await pool.query(`insert into wo_place_job (place_id, state) values ($1, 'queued')`, [p2])
    await assert.rejects(
      mergePlaces(pool, p1, p2, { actor: 'ops@tracy.test' }),
      (e) => e instanceof PlaceMergeError && e.code === 'PLACE_BUSY' && e.status === 409
    )
    assert.equal((await one(pool, 'select merged_into from wo_place where id = $1', [p2])).merged_into, null)

    // Two Google ids on one place (a listing Google re-issued): split one off with its opportunity.
    await pool.query(
      `insert into wo_place_identity (namespace, external_id, place_id, source) values ('google', 'ChIJreissued', $1, 'google-maps')`,
      [p1]
    )
    const other = await one(
      pool,
      `insert into wo_opportunity (account_id, name, provider, provider_id, place_id) values ($1, 'Pho Ba', 'google-maps', 'ChIJreissued', $2)
     returning *`,
      [a, p1]
    )
    const split = await splitPlace(pool, p1, [{ namespace: 'google', externalId: 'ChIJreissued' }], {
      actor: 'ops@tracy.test'
    })
    assert.equal(split.restored, false)
    assert.notEqual(split.place, p1)
    assert.equal(await placeOf(pool, other.id), split.place)
    assert.equal(await placeOf(pool, first.opp.id), p1, 'an opportunity naming the other identity stays')
    await assert.rejects(
      splitPlace(pool, p1, [{ namespace: 'google', externalId: GOOGLE_ID }], { actor: 'ops@tracy.test' }),
      (e) => e.code === 'LAST_IDENTITY'
    )
  }
)

test(
  "an operator's approval of a queued pair while a place is researched stands, and the sweep applies it",
  opts,
  async () => {
    const { pool } = db
    const store = memoryStore()
    const { pasted } = await googleAndPastedUrl(pool, store)
    const b = await account(pool, 'b@tracy.test')
    await legacyResearch(pool, store, b, {
      providerId: 'ChIJlegacyPho2',
      googlePlace: {
        placeId: 'ChIJlegacyPho2',
        name: 'Pho Ba 2',
        website: SITE,
        fetchedAt: '2026-10-01T00:00:00Z'
      }
    })
    const maintenance = createPlaceMaintenance({ pool, objects: store, log: quiet, retryAfterMs: 0 })
    for (let i = 0; i < 3; i += 1) await maintenance.tick()
    const urlPlace = await placeOf(pool, pasted.opp.id)
    const pick = await one(
      pool,
      `select * from wo_place_merge_candidate where state = 'pending' order by id limit 1`
    )
    const job = await one(
      pool,
      `insert into wo_place_job (place_id, state) values ($1, 'queued') returning id`,
      [pick.google_place_id]
    )

    const decided = await decideMergeCandidate(pool, pick.id, 'approve', 'ops@tracy.test')
    assert.deepEqual(decided, { id: pick.id, state: 'approved', applied: false })
    assert.equal(
      (await one(pool, 'select merged_into from wo_place where id = $1', [urlPlace])).merged_into,
      null
    )

    await pool.query(`update wo_place_job set state = 'completed' where id = $1`, [job.id])
    await maintenance.tick()
    assert.equal(
      (await one(pool, 'select merged_into from wo_place where id = $1', [urlPlace])).merged_into,
      pick.google_place_id
    )
    assert.equal(await placeOf(pool, pasted.opp.id), pick.google_place_id)
    const other = await one(pool, 'select state, decided_by from wo_place_merge_candidate where id <> $1', [
      pick.id
    ])
    assert.deepEqual(other, { state: 'rejected', decided_by: 'merge' }, 'the other pair is moot once merged')
    const merge = await one(pool, `select actor from wo_place_ops_event where action = 'merge'`)
    assert.equal(merge.actor, 'ops@tracy.test')
  }
)

test(
  "place view: the account's own website keeps the PageSpeed its own research measured",
  opts,
  async () => {
    const { pool } = db
    const store = memoryStore()
    const a = await account(pool, 'a@tracy.test')
    const { opp } = await legacyResearch(pool, store, a, {
      googlePlace: {
        placeId: GOOGLE_ID,
        name: 'Pho Ba',
        website: 'https://other.example/',
        fetchedAt: '2026-10-01T00:00:00Z'
      }
    })
    const pageSpeed = { url: SITE, performance: 0.42, checkedAt: '2026-10-02T00:00:00Z' }
    await pool.query(`update wo_profile set profile = profile || $2::jsonb where opportunity_id = $1`, [
      opp.id,
      JSON.stringify({ pageSpeed })
    ])
    await backfillAll(pool, store)
    const linked = await one(pool, 'select * from wo_opportunity where id = $1', [opp.id])
    const view = await placeViewOf(pool, linked)
    assert.ok(view, 'the place has a published snapshot')
    assert.equal(
      view.sources.find((s) => s.source === 'website')?.shared,
      false,
      'the website is the account’s own'
    )
    assert.deepEqual(view.profile.pageSpeed, pageSpeed)
  }
)
