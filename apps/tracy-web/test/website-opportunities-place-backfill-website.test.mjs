// The backfill's website pass (tasks/todo-wo-shared-research.md P3, migration 138): research made before
// P1 kept Google Place Details without `websiteUri`, so nothing it collected was vouched for and every
// picture stayed the account's own. The pass asks Google for the website ONCE per place (charged through
// the research ledger), verifies the website and the socials that website's own crawl links to from what
// the account already collected, and publishes a new snapshot that shares them.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'
import { createChargeable, createCostLedger } from 'website-opportunities/src/cost-ledger.js'
import { runBackfill } from 'website-opportunities/src/place-backfill.js'
import { createPlaceMaintenance } from 'website-opportunities/src/place-maintenance.js'
import { placeViewOf } from 'website-opportunities/src/place-view.js'
import { fileDb } from './_db.mjs'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const GOOGLE_ID = 'ChIJquillhausAlBarari'
const SITE = 'https://quillhaus.example/'
const INSTAGRAM = 'https://www.instagram.com/quillhaus.example'
const FACEBOOK = 'https://www.facebook.com/quillhausexample'
// Facts as the per-account executor kept them before P1 asked Google for `websiteUri`.
const OLD_FACTS = { placeId: GOOGLE_ID, name: 'QuillHaus', fetchedAt: '2026-10-01T00:00:00Z', photos: [] }

const pictures = {}
before(async () => {
  const png = (r) =>
    sharp({ create: { width: 40, height: 30, channels: 3, background: { r, g: 40, b: 30 } } })
      .png()
      .toBuffer()
  for (const [i, kind] of ['google-places', 'website', 'instagram', 'facebook', 'private'].entries())
    pictures[kind] = new Uint8Array(await png(30 + i * 40))
})

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const one = async (pool, sql, params) => (await pool.query(sql, params)).rows[0]
const all = async (pool, sql, params) => (await pool.query(sql, params)).rows

async function account(pool, email) {
  return (await pool.query('insert into account (email) values ($1) returning id', [email])).rows[0].id
}

function memoryStore() {
  const held = new Map()
  return {
    held,
    async put(key, bytes) {
      held.set(key, new Uint8Array(bytes))
      return true
    },
    async get(key) {
      return held.has(key) ? new Response(held.get(key)) : null
    }
  }
}

/** A Google door that answers `websiteUri`, counting its calls. */
function googleDoor(website = SITE) {
  const door = {
    calls: [],
    async available() {
      return true
    },
    async website(placeId) {
      door.calls.push(placeId)
      if (website instanceof Error) throw website
      return website
    }
  }
  return door
}

function ledgerOf(pool, caps = { dailyCapCents: 1000, jobCapCents: 1000 }) {
  return createChargeable(createCostLedger({ pool, caps: async () => caps }))
}

/**
 * QuillHaus's research from before places: the website (its crawl links to Instagram and Facebook), both
 * socials collected, a private Instagram page the account named itself, and a stored picture of each.
 */
async function legacyResearch(pool, store, accountId, { crawlLinks = [INSTAGRAM, FACEBOOK], ...over } = {}) {
  const website = over.website ?? SITE
  const opp = await one(
    pool,
    `insert into wo_opportunity (account_id, name, provider, provider_id, candidate)
     values ($1, 'QuillHaus', 'google-places', $2, $3) returning *`,
    [accountId, GOOGLE_ID, JSON.stringify({ website, socials: { instagram: INSTAGRAM } })]
  )
  const doneAt = '2026-10-02T00:00:00Z'
  await pool.query(
    `insert into wo_job (account_id, opportunity_id, kind, request_id, state, stage, updated_at)
     values ($1, $2, 'research', $3, 'completed', 'done', $4)`,
    [accountId, opp.id, `legacy-${opp.id}`, doneAt]
  )
  const source = (kind, ref, collected) =>
    pool.query(
      `insert into wo_source (opportunity_id, source, ref, status, collected, updated_at)
       values ($1, $2, $3, 'complete', $4, $5)`,
      [opp.id, kind, ref, JSON.stringify(collected), doneAt]
    )
  await source('website', website, {
    profile: { name: 'QuillHaus', bio: 'Garden cafe', links: crawlLinks },
    pages: [{ url: website, title: 'QuillHaus', text: 'Cafe' }]
  })
  await source('instagram', INSTAGRAM, { profile: { name: 'quillhaus' }, media: [] })
  await source('facebook', FACEBOOK, { profile: { name: 'QuillHaus FB' }, media: [] })
  await pool.query(`insert into wo_profile (opportunity_id, profile, brand) values ($1, $2, $3)`, [
    opp.id,
    JSON.stringify({ name: 'QuillHaus', website, googlePlace: OLD_FACTS }),
    JSON.stringify({ website: { origin: 'website', colors: ['#c00'] }, social: null })
  ])
  const media = {}
  for (const kind of ['google-places', 'website', 'instagram', 'facebook']) {
    const bytes = pictures[kind]
    const key = `opportunities/${accountId}/${opp.id}/${sha(bytes)}.png`
    await store.put(key, bytes)
    media[kind] = await one(
      pool,
      `insert into wo_media (account_id, opportunity_id, sha256, object_key, status, mime, bytes, width, height,
         kind, source, source_url, collected_at)
       values ($1, $2, $3, $4, 'stored', 'image/png', $5, 40, 30, 'image', $6, $7, $8) returning *`,
      [accountId, opp.id, sha(bytes), key, bytes.length, kind, `${SITE}${kind}.png`, doneAt]
    )
  }
  return { opp, media }
}

async function backfillAll(pool, store, deps = {}) {
  const totals = { published: 0, upgraded: 0, waiting: 0 }
  for (let i = 0; i < 20; i += 1) {
    const r = await runBackfill(pool, { objects: store, batch: 50, retryAfterMs: 0, ...deps })
    totals.published += r.published
    totals.upgraded += r.upgraded ?? 0
    totals.waiting += r.waiting ?? 0
    if (!r.more) return totals
  }
  throw new Error('backfill did not settle')
}

const placeOf = async (pool, oppId) =>
  one(pool, 'select p.* from wo_place p join wo_opportunity o on o.place_id = p.id where o.id = $1', [oppId])
const sourcesOf = async (pool, snapshotId) =>
  (
    await all(pool, 'select source from wo_place_snapshot_source where snapshot_id = $1 order by source', [
      snapshotId
    ])
  ).map((r) => r.source)
const linksOf = async (pool, placeId) =>
  (
    await all(pool, 'select kind, verified_by from wo_place_link where place_id = $1 order by kind', [
      placeId
    ])
  ).map((l) => `${l.kind}:${l.verified_by}`)

/** The first backfill (no Google key, as before P1): only Google's facts are the place's. */
async function backfilledWithoutWebsite(pool, store) {
  const a = await account(pool, 'a@tracy.test')
  const legacy = await legacyResearch(pool, store, a)
  await backfillAll(pool, store)
  const place = await placeOf(pool, legacy.opp.id)
  assert.deepEqual(await sourcesOf(pool, place.current_snapshot_id), ['google-places'])
  return { a, legacy, place, oldSnapshotId: place.current_snapshot_id }
}

test(
  'website pass: Google is asked once, the website and the socials its crawl names become the place’s, with their pictures',
  opts,
  async () => {
    const { pool } = db
    const store = memoryStore()
    const { a, legacy, place, oldSnapshotId } = await backfilledWithoutWebsite(pool, store)
    const brief = await one(
      pool,
      `insert into wo_revision (opportunity_id, account_id, n, brief, brief_md, place_snapshot_id)
       values ($1, $2, 1, '{}', '', $3) returning *`,
      [legacy.opp.id, a, oldSnapshotId]
    )
    const google = googleDoor('http://www.QuillHaus.example/?utm_source=google')
    const chargeable = ledgerOf(pool)

    const totals = await backfillAll(pool, store, { googleWebsite: google, chargeable })
    assert.equal(totals.upgraded, 1)
    assert.deepEqual(google.calls, [GOOGLE_ID], 'one Place Details call for the website')

    const now = await placeOf(pool, legacy.opp.id)
    assert.notEqual(now.current_snapshot_id, oldSnapshotId, 'a new snapshot is current')
    assert.deepEqual(await sourcesOf(pool, now.current_snapshot_id), [
      'facebook',
      'google-places',
      'instagram',
      'website'
    ])
    assert.deepEqual(await sourcesOf(pool, oldSnapshotId), ['google-places'], 'the old snapshot is unchanged')
    assert.deepEqual(await linksOf(pool, place.id), [
      'facebook:website',
      'instagram:website',
      'website:google'
    ])
    const facts = await one(
      pool,
      `select collected from wo_place_snapshot_source where snapshot_id = $1 and source = 'google-places'`,
      [now.current_snapshot_id]
    )
    assert.equal(facts.collected.website, 'http://www.QuillHaus.example/?utm_source=google')

    // Another account on the same place sees every shared picture, copied to the place's keys.
    const b = await account(pool, 'b@tracy.test')
    const other = await one(
      pool,
      `insert into wo_opportunity (account_id, name, provider, provider_id, candidate, place_id)
       values ($1, 'QuillHaus', 'google-places', $2, '{}', $3) returning *`,
      [b, GOOGLE_ID, place.id]
    )
    const view = await placeViewOf(pool, other)
    const shown = view.media.filter((m) => m.origin === 'place')
    assert.deepEqual(shown.map((m) => m.source).sort(), ['facebook', 'google-places', 'instagram', 'website'])
    for (const m of shown) {
      assert.equal(m.object_key, `places/${place.id}/${m.sha256}.png`)
      assert.ok(store.held.has(m.object_key))
    }
    assert.ok(store.held.has(legacy.media.website.object_key), 'the old key stays')

    const pinned = await one(pool, 'select place_snapshot_id from wo_revision where id = $1', [brief.id])
    assert.equal(pinned.place_snapshot_id, oldSnapshotId, 'a brief made before keeps its snapshot')

    const charges = await all(pool, 'select * from wo_cost_ledger')
    assert.equal(charges.length, 1)
    assert.deepEqual(
      [charges[0].provider, charges[0].operation, charges[0].state, charges[0].place_id],
      ['google', 'place-details', 'settled', place.id]
    )

    // A re-run asks nothing and charges nothing.
    const again = await backfillAll(pool, store, { googleWebsite: google, chargeable })
    assert.equal(again.upgraded, 0)
    assert.equal(google.calls.length, 1)
    assert.equal((await all(pool, 'select id from wo_cost_ledger')).length, 1)
    assert.equal((await placeOf(pool, legacy.opp.id)).current_snapshot_id, now.current_snapshot_id)
  }
)

test('website pass: over the research cap the place waits, and a later pass finishes it', opts, async () => {
  const { pool } = db
  const store = memoryStore()
  const { legacy, oldSnapshotId } = await backfilledWithoutWebsite(pool, store)
  const google = googleDoor()
  const caps = { dailyCapCents: 0, jobCapCents: 1000 }
  const chargeable = ledgerOf(pool, caps)

  const first = await backfillAll(pool, store, { googleWebsite: google, chargeable })
  assert.equal(first.upgraded, 0)
  assert.equal(first.waiting, 1)
  assert.equal(google.calls.length, 0, 'no call goes out over the cap')
  const row = await one(pool, 'select * from wo_place_backfill')
  assert.equal(row.website_pass, 'waiting')
  assert.equal((await placeOf(pool, legacy.opp.id)).current_snapshot_id, oldSnapshotId)

  caps.dailyCapCents = 1000
  const later = await backfillAll(pool, store, { googleWebsite: google, chargeable })
  assert.equal(later.upgraded, 1)
  assert.equal(google.calls.length, 1)
  assert.equal((await one(pool, 'select * from wo_place_backfill')).website_pass, 'done')
})

test(
  'website pass: a Google website that is not the one the account collected verifies nothing',
  opts,
  async () => {
    const { pool } = db
    const store = memoryStore()
    const { legacy, place, oldSnapshotId } = await backfilledWithoutWebsite(pool, store)
    const google = googleDoor('https://another-place.example/')

    const totals = await backfillAll(pool, store, { googleWebsite: google, chargeable: ledgerOf(pool) })
    assert.equal(totals.upgraded, 0)
    assert.equal(google.calls.length, 1)
    assert.deepEqual(await linksOf(pool, place.id), [])
    assert.equal((await placeOf(pool, legacy.opp.id)).current_snapshot_id, oldSnapshotId)
    const row = await one(pool, 'select * from wo_place_backfill')
    assert.equal(row.website_pass, 'done')
    assert.equal(row.google_website, 'https://another-place.example/', 'kept: Google is not asked again')
  }
)

test('website pass: only the socials the website’s own crawl links to are shared', opts, async () => {
  const { pool } = db
  const store = memoryStore()
  const a = await account(pool, 'a@tracy.test')
  // The crawl names Facebook only; the Instagram page is the account's own candidate.
  const legacy = await legacyResearch(pool, store, a, { crawlLinks: [FACEBOOK] })
  await backfillAll(pool, store)
  const google = googleDoor()

  await backfillAll(pool, store, { googleWebsite: google, chargeable: ledgerOf(pool) })
  const place = await placeOf(pool, legacy.opp.id)
  assert.deepEqual(await sourcesOf(pool, place.current_snapshot_id), ['facebook', 'google-places', 'website'])
  assert.deepEqual(await linksOf(pool, place.id), ['facebook:website', 'website:google'])
  const media = await all(
    pool,
    `select m.source from wo_place_snapshot_media sm join wo_place_media m on m.id = sm.media_id
     where sm.snapshot_id = $1 order by m.source`,
    [place.current_snapshot_id]
  )
  assert.deepEqual(
    media.map((m) => m.source),
    ['facebook', 'google-places', 'website']
  )
})

test('website pass: no Google key → no call, the place is left as it is', opts, async () => {
  const { pool } = db
  const store = memoryStore()
  const { legacy, oldSnapshotId } = await backfilledWithoutWebsite(pool, store)
  const google = { ...googleDoor(), available: async () => false }
  google.website = async () => assert.fail('no key: Google is never called')

  await backfillAll(pool, store, { googleWebsite: google, chargeable: ledgerOf(pool) })
  assert.equal((await one(pool, 'select * from wo_place_backfill')).website_pass, null)
  assert.equal((await placeOf(pool, legacy.opp.id)).current_snapshot_id, oldSnapshotId)
  assert.equal((await all(pool, 'select id from wo_cost_ledger')).length, 0)
})

test('website pass: a place its own research already published is left alone', opts, async () => {
  const { pool } = db
  const store = memoryStore()
  const { legacy, place } = await backfilledWithoutWebsite(pool, store)
  const researched = await one(
    pool,
    `insert into wo_place_snapshot (place_id, state, published_at) values ($1, 'published', now()) returning id`,
    [place.id]
  )
  await pool.query('update wo_place set current_snapshot_id = $2 where id = $1', [place.id, researched.id])
  const google = googleDoor()

  await backfillAll(pool, store, { googleWebsite: google, chargeable: ledgerOf(pool) })
  assert.equal(google.calls.length, 0)
  assert.equal((await placeOf(pool, legacy.opp.id)).current_snapshot_id, researched.id)
})

test(
  'first backfill with a Google key: one snapshot shares the website and its socials at once',
  opts,
  async () => {
    const { pool } = db
    const store = memoryStore()
    const a = await account(pool, 'a@tracy.test')
    const legacy = await legacyResearch(pool, store, a)
    const google = googleDoor()

    const totals = await backfillAll(pool, store, { googleWebsite: google, chargeable: ledgerOf(pool) })
    assert.equal(totals.published, 1)
    assert.equal(totals.upgraded, 0)
    assert.equal(google.calls.length, 1)
    const place = await placeOf(pool, legacy.opp.id)
    assert.deepEqual(await sourcesOf(pool, place.current_snapshot_id), [
      'facebook',
      'google-places',
      'instagram',
      'website'
    ])
    assert.equal((await all(pool, 'select id from wo_place_snapshot')).length, 1)
    assert.equal((await one(pool, 'select * from wo_place_backfill')).website_pass, 'done')
  }
)

test(
  'the maintenance sweep asks Google with the /ops/wo key through the domain, charged once',
  opts,
  async () => {
    const { pool } = db
    const store = memoryStore()
    const { legacy, oldSnapshotId } = await backfilledWithoutWebsite(pool, store)
    const asked = []
    const sweep = createPlaceMaintenance({
      pool,
      objects: store,
      retryAfterMs: 0,
      runtime: async () => ({ keys: { google: 'AIzaKEY' } }),
      loadDomain: async () => ({
        fetchPlaceWebsite: async (id, deps) => {
          asked.push([id, deps.googleKey])
          return SITE
        }
      }),
      chargeable: ledgerOf(pool)
    })
    await sweep.tick()
    await sweep.tick()
    assert.deepEqual(asked, [[GOOGLE_ID, 'AIzaKEY']])
    assert.notEqual((await placeOf(pool, legacy.opp.id)).current_snapshot_id, oldSnapshotId)
    assert.equal((await all(pool, 'select id from wo_cost_ledger')).length, 1)
  }
)
