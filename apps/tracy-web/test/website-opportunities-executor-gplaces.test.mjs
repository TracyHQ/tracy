// The research job and Google Places (tasks/plan-ops-wo-wiring.md): a candidate found on Google Places gets one
// Place Details call per job, its facts land on the profile (refetched once they are 30 days old), and with the
// `googlePlacesPhotos` switch its photos become `wo_media` rows that keep their author attribution. Every
// failure is tolerated. The domain is the real subtree with its Google calls replaced.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { normalizeWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { createExecutor } from 'website-opportunities/src/executor.js'
import { imageInfoWith } from 'website-opportunities/src/media-info.js'
import { fileDb } from './_db.mjs'
import { createTracyWoHost } from '../src/wo-host.js'

const woHost = createTracyWoHost()
const imageInfo = imageInfoWith(woHost)

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const PLACE_ID = 'ChIJphoba123'
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

async function seed(pool, { provider = 'google-places', providerId = PLACE_ID } = {}) {
  const account = (await pool.query(`insert into account (email) values ('a@tracy.test') returning id`))
    .rows[0].id
  const opp = (
    await pool.query(
      `insert into wo_opportunity (account_id, name, provider, provider_id, candidate)
       values ($1, 'Pho Ba', $2, $3, $4) returning *`,
      [account, provider, providerId, JSON.stringify({ provider, providerId, name: 'Pho Ba', socials: {} })]
    )
  ).rows[0]
  const job = await queueJob(pool, account, opp.id)
  return { account, opp, job }
}

async function queueJob(pool, account, oppId) {
  return (
    await pool.query(
      `insert into wo_job (account_id, opportunity_id, kind, request_id)
       values ($1, $2, 'research', $3) returning *`,
      [account, oppId, `req-${Math.random().toString(16).slice(2, 10)}`]
    )
  ).rows[0]
}

const RAW_DETAILS = {
  id: PLACE_ID,
  servesDinner: true,
  outdoorSeating: false,
  reservable: true,
  reviews: [{ text: { text: 'Great pho' }, rating: 5, authorAttribution: { displayName: 'Lan' } }],
  photos: [
    {
      name: `places/${PLACE_ID}/photos/p1`,
      authorAttributions: [{ displayName: 'Minh', uri: 'https://maps.google.com/contrib/1' }]
    },
    { name: `places/${PLACE_ID}/photos/p2`, authorAttributions: [{ displayName: 'Hoa' }] }
  ]
}

/** The real domain, sources blocked, its Google Places calls replaced and counted. */
async function domainWith({ details = async () => RAW_DETAILS, photo } = {}) {
  const real = await websiteOpportunitiesDomain()
  const calls = { details: [], photos: [] }
  const blocked = {
    available: false,
    reason: 'credential_missing',
    collect: async () => ({ status: 'blocked', media: [] })
  }
  const domain = {
    ...real,
    connectorsFor: () => ({
      website: blocked,
      facebook: blocked,
      instagram: blocked,
      tiktok: blocked,
      youtube: blocked
    }),
    fetchPlaceDetails: async (placeId, deps) => {
      calls.details.push({ placeId, deps })
      return details(placeId, deps)
    },
    fetchPlacePhoto: async (name, deps) => {
      calls.photos.push({ name, deps })
      if (photo) return photo(name, deps)
      return {
        bytes: name.endsWith('p1') ? PNG : PNG2,
        mime: 'image/png',
        sourceUrl: `google-places:${name}`,
        attributions: deps.attributions ?? []
      }
    }
  }
  return { domain, calls }
}

function executor(pool, domain, { keys = { google: 'AIza-test' }, settings = {} } = {}) {
  const put = new Map()
  const ex = createExecutor({
    host: woHost,
    pool,
    loadDomain: async () => domain,
    runtime: async () => ({
      keys: { google: null, apify: null, ...keys },
      settings: normalizeWoOpsSettings({ pageSpeedCheckEnabled: false, ...settings })
    }),
    objects: {
      put: async (key, bytes) => {
        put.set(key, bytes)
        return true
      }
    },
    switchOn: async () => true,
    imageInfo,
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchImpl: async () => {
      throw new Error('no network in tests')
    },
    log: { warn() {}, error() {}, log() {} }
  })
  return { ex, put }
}

const runJob = async (ex) => (await ex.tick()).done
const stateOf = async (pool, id) => (await pool.query('select * from wo_job where id = $1', [id])).rows[0]
const profileOf = async (pool, oppId) =>
  (await pool.query('select profile from wo_profile where opportunity_id = $1', [oppId])).rows[0]?.profile
const mediaOf = async (pool, oppId) =>
  (await pool.query('select * from wo_media where opportunity_id = $1 order by source_url', [oppId])).rows

test('a Google Places candidate: one Place Details call, its facts on the profile', opts, async () => {
  const { pool } = db
  const { opp, job } = await seed(pool)
  const { domain, calls } = await domainWith()
  const { ex } = executor(pool, domain, { settings: { googlePlacesPhotos: false } })
  await runJob(ex)
  assert.equal((await stateOf(pool, job.id)).state, 'completed')
  assert.equal(calls.details.length, 1)
  assert.equal(calls.details[0].placeId, PLACE_ID)
  assert.equal(calls.details[0].deps.googleKey, 'AIza-test')
  const gp = (await profileOf(pool, opp.id)).googlePlace
  assert.equal(gp.placeId, PLACE_ID)
  assert.deepEqual(gp.amenities, { servesDinner: true, outdoorSeating: false })
  assert.equal(gp.reservable, true)
  assert.equal(gp.reviews[0].author, 'Lan')
  assert.equal(gp.photos.length, 2)
  assert.ok(!Number.isNaN(Date.parse(gp.fetchedAt)))
  assert.equal(calls.photos.length, 0, 'the photo switch is off: no photo is fetched')
  assert.equal((await mediaOf(pool, opp.id)).length, 0)
})

test(
  'Place Details never fails the job, and is not called without a key or for another provider',
  opts,
  async () => {
    const { pool } = db
    const cases = [
      { details: async () => Promise.reject(Object.assign(new Error('quota'), { code: 'QUOTA' })), calls: 1 },
      { details: async () => ({ id: PLACE_ID, reviews: 'not a list' }), calls: 1, keepsFacts: true },
      { keys: { google: null }, calls: 0 },
      { provider: 'osm', providerId: 'node/1', calls: 0 }
    ]
    for (const [i, c] of cases.entries()) {
      await pool.query('delete from account')
      const { opp, job } = await seed(pool, c)
      const { domain, calls } = await domainWith(c.details ? { details: c.details } : {})
      const { ex } = executor(pool, domain, { keys: c.keys })
      await runJob(ex)
      assert.equal((await stateOf(pool, job.id)).state, 'completed', `case ${i}`)
      assert.equal(calls.details.length, c.calls, `case ${i}`)
      const gp = (await profileOf(pool, opp.id)).googlePlace
      if (c.keepsFacts) assert.equal(gp.placeId, PLACE_ID, `case ${i}: odd fields are dropped, not fatal`)
      else assert.equal(gp, undefined, `case ${i}`)
      assert.equal(calls.photos.length, 0, `case ${i}`)
    }
  }
)

test('stored Place Details are reused for 30 days, then fetched again', opts, async () => {
  const { pool } = db
  const { account, opp } = await seed(pool)
  const { domain, calls } = await domainWith()
  const again = () => runJob(executor(pool, domain, { settings: { googlePlacesPhotos: false } }).ex)
  await again()
  await queueJob(pool, account, opp.id)
  await again()
  assert.equal(calls.details.length, 1, 'a second job within 30 days reuses the stored facts')
  const old = new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString()
  await pool.query(
    `update wo_profile set profile = jsonb_set(profile, '{googlePlace,fetchedAt}', to_jsonb($2::text)) where opportunity_id = $1`,
    [opp.id, old]
  )
  await queueJob(pool, account, opp.id)
  await again()
  assert.equal(calls.details.length, 2)
  assert.notEqual((await profileOf(pool, opp.id)).googlePlace.fetchedAt, old)
})

test(
  'with the photo switch on, Places photos become stored media that keep their author credit',
  opts,
  async () => {
    const { pool } = db
    const { account, opp, job } = await seed(pool)
    const { domain, calls } = await domainWith()
    const { ex, put } = executor(pool, domain, { settings: { googlePlacesPhotos: true } })
    await runJob(ex)
    assert.equal((await stateOf(pool, job.id)).state, 'completed')
    assert.deepEqual(
      calls.photos.map((c) => c.name),
      [`places/${PLACE_ID}/photos/p1`, `places/${PLACE_ID}/photos/p2`]
    )
    assert.equal(calls.photos[0].deps.googleKey, 'AIza-test')
    const media = await mediaOf(pool, opp.id)
    assert.equal(media.length, 2)
    const [p1, p2] = media
    assert.equal(p1.source, 'google-places')
    assert.equal(p1.source_url, `google-places:places/${PLACE_ID}/photos/p1`)
    assert.equal(p1.status, 'stored')
    assert.equal(p1.mime, 'image/png')
    assert.equal(p1.width, 40)
    assert.ok(put.has(p1.object_key))
    assert.deepEqual(p1.labels.credit, {
      provider: 'Google',
      authors: [{ displayName: 'Minh', uri: 'https://maps.google.com/contrib/1' }]
    })
    assert.ok(p1.labels.features, 'measured like every other stored picture')
    assert.deepEqual(p2.labels.credit.authors, [{ displayName: 'Hoa' }])

    // A second job downloads nothing it already holds.
    await queueJob(pool, account, opp.id)
    await runJob(executor(pool, domain, { settings: { googlePlacesPhotos: true } }).ex)
    assert.equal(calls.photos.length, 2)
    assert.equal((await mediaOf(pool, opp.id)).length, 2)
  }
)

test('a Places photo that fails is skipped; the others and the job go on', opts, async () => {
  const { pool } = db
  const { opp, job } = await seed(pool)
  const { domain } = await domainWith({
    photo: async (name, deps) => {
      if (name.endsWith('p1')) throw Object.assign(new Error('too big'), { code: 'TOO_LARGE' })
      return {
        bytes: PNG2,
        mime: 'image/png',
        sourceUrl: `google-places:${name}`,
        attributions: deps.attributions
      }
    }
  })
  const { ex } = executor(pool, domain, { settings: { googlePlacesPhotos: true } })
  await runJob(ex)
  assert.equal((await stateOf(pool, job.id)).state, 'completed')
  const media = await mediaOf(pool, opp.id)
  assert.deepEqual(
    media.map((m) => m.source_url),
    [`google-places:places/${PLACE_ID}/photos/p2`]
  )
})
