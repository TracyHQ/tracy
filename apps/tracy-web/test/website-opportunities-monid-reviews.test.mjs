// Monid's Google reviews through the real place executor: off unless declared and keyed, a supplement after the
// Maps step that never calls Places again, its reviews kept once and replaced on refresh, a failure harmless.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { normalizeWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { createChargeable, createCostLedger } from 'website-opportunities/src/cost-ledger.js'
import { createExecutor } from 'website-opportunities/src/executor.js'
import { googleMapsSourcesRequired } from 'website-opportunities/src/google-maps-research.js'
import { imageInfoWith } from 'website-opportunities/src/media-info.js'
import { requestResearch } from 'website-opportunities/src/place-requests.js'
import { placeViewOf } from 'website-opportunities/src/place-view.js'
import { insertOpportunity } from 'website-opportunities/src/store.js'
import { fileDb } from './_db.mjs'
import { createTracyWoHost } from '../src/wo-host.js'

const imageInfo = imageInfoWith(createTracyWoHost())
const FIXTURES = new URL('../../../packages/wo/website-opportunities/test/fixtures/monid/', import.meta.url)
const fixture = (name) => JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'))
const HIDEOUT = fixture('litescrape-reviews-hideout.json')
const TARTINE = fixture('litescrape-reviews-tartine.json')
const ENVELOPE = fixture('run-download-link.json')
const PLACE_ID = HIDEOUT.search_parameters.place_id
const CDN = 'https://lh3.googleusercontent.com/p/'
const ON = { 'google-reviews': ['google-places', 'serpapi-google-maps', 'monid-google-reviews'] }
// Place Details holds the first Monid review already (same Google review id, its own link shape).
const OFFICIAL_LINK = `https://www.google.com/maps/reviews/data=!4m6!14m5!1m4!2m3!1s${HIDEOUT.reviews[0].review_id}!2m1!1s0x3e5f:0x89`

const db = fileDb()
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
before(db.open)
beforeEach(db.reset)
after(db.close)
let png
before(async () => {
  png = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#945432' } })
    .png()
    .toBuffer()
})

async function drain(ex) {
  for (let i = 0; i < 20; i++) {
    const { claimed, done } = await ex.tick()
    if (!claimed) return
    await done
  }
}

/** `monid(call)` answers each Monid request; `keys` and `providerOrder` are the deployment's. */
async function stand({ keys, providerOrder = ON, monid }) {
  const { pool } = db
  const accountId = (await pool.query("insert into account(email) values('monid@tracy.test') returning id"))
    .rows[0].id
  const { row: opportunity } = await insertOpportunity(pool, accountId, {
    name: 'HideOut',
    provider: 'google-places',
    providerId: PLACE_ID,
    candidate: { provider: 'google-places', providerId: PLACE_ID, name: 'HideOut' }
  })
  const real = await websiteOpportunitiesDomain()
  const calls = []
  let placesCalls = 0,
    serpFails = false,
    clock = Date.parse('2026-10-29T10:00:00Z')
  const blocked = { available: false, collect: async () => ({ status: 'blocked', media: [] }) }
  const domain = {
    ...real,
    connectorsFor: () =>
      Object.fromEntries(['website', 'facebook', 'instagram', 'tiktok', 'youtube'].map((s) => [s, blocked])),
    fetchPlaceDetails: async () => {
      placesCalls++
      return {
        id: PLACE_ID,
        displayName: { text: 'HideOut' },
        reviews: [
          {
            authorAttribution: {
              displayName: 'Official author',
              uri: 'https://www.google.com/maps/contrib/999'
            },
            text: { text: 'Official review stays unchanged.' },
            googleMapsUri: OFFICIAL_LINK
          }
        ]
      }
    },
    fetchLimited: async (url) => ({ url, status: 200, mime: 'image/png', bytes: png })
  }
  const settings = {
    ...normalizeWoOpsSettings({ pageSpeedCheckEnabled: false, googlePlacesPhotos: false }),
    tripadvisorReviews: false,
    providerOrder
  }
  const ledger = createCostLedger({
    pool,
    now: () => clock,
    caps: async () => ({ dailyCapCents: 1000, jobCapCents: 1000 })
  })
  const ex = createExecutor({
    host: createTracyWoHost(),
    pool,
    shared: true,
    now: () => clock,
    loadDomain: async () => domain,
    runtime: async () => ({ keys, settings }),
    chargeable: createChargeable(ledger),
    apiFetch: async (url, init = {}) => {
      const u = new URL(url)
      if (u.hostname.endsWith('monid.ai')) {
        calls.push(`monid:${u.pathname}`)
        return monid({ url: u, init })
      }
      const q = u.searchParams
      const operation =
        q.get('engine') === 'google_maps' ? 'place' : q.has('category_id') ? 'menu' : 'overview'
      calls.push(`serpapi:${operation}`)
      if (serpFails) return new Response('{}', { status: 429 })
      if (operation === 'place')
        return Response.json({
          search_metadata: { status: 'Success' },
          place_results: {
            place_id: PLACE_ID,
            data_id: '0x123:0x456',
            title: 'HideOut',
            user_reviews: {
              most_relevant: [
                {
                  username: 'Lan',
                  description: 'SerpApi guest opinion.',
                  rating: 5,
                  link: 'https://www.google.com/maps/reviews/data=serp1',
                  images: [{ thumbnail: `${CDN}serp-photo` }]
                }
              ]
            }
          }
        })
      return Response.json({
        search_metadata: { status: 'Success' },
        search_parameters: { data_id: '0x123:0x456', ...(operation === 'menu' ? { category_id: 'M' } : {}) },
        categories: [],
        photos: []
      })
    },
    objects: { put: async () => true },
    imageInfo,
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchImpl: async () => {
      throw new Error('no network in tests')
    },
    switchOn: async () => true,
    log: { warn() {}, error() {}, log() {} }
  })
  const research = async (requestId, extra = {}) => {
    await requestResearch(pool, {
      accountId,
      opportunity,
      requestId,
      ...extra,
      requiredSources: googleMapsSourcesRequired({ keys, settings }),
      now: () => clock
    })
    await drain(ex)
  }
  const maps = async () => (await placeViewOf(pool, opportunity)).profile?.reviewSources?.googleMaps ?? null
  const row = async () =>
    (
      await pool.query(
        `select s.* from wo_place_snapshot_source s join wo_place p on p.current_snapshot_id = s.snapshot_id
          where s.source = 'google-maps'`
      )
    ).rows[0] ?? null
  const charges = async () =>
    (await pool.query("select operation, state, actual_cents from wo_cost_ledger where provider = 'monid'"))
      .rows
  return {
    pool,
    calls,
    research,
    maps,
    row,
    charges,
    placesCalls: () => placesCalls,
    serpFails: (value) => {
      serpFails = value
    },
    advance: (days) => {
      clock += days * 86_400_000
    }
  }
}

const completed =
  (output, cost = 0.00015) =>
  () =>
    Response.json({ runId: 'run-1', status: 'COMPLETED', output, cost: { value: cost } })

test(
  'off by default: a Monid key alone, or Monid declared with no key, sends no Monid request',
  opts,
  async () => {
    let h = await stand({
      keys: { google: 'g', monid: 'test-monid' },
      providerOrder: {},
      monid: completed(HIDEOUT)
    })
    await h.research('undeclared')
    assert.deepEqual(h.calls, [])
    assert.deepEqual(await h.charges(), [])
    await db.reset()
    h = await stand({ keys: { google: 'g' }, monid: completed(HIDEOUT) })
    await h.research('no-key')
    assert.deepEqual(h.calls, [])
    assert.deepEqual(await h.charges(), [])
  }
)

test(
  'no SerpApi key: Monid alone fills the Maps reviews, the Place Details duplicate dropped, one charge settled',
  opts,
  async () => {
    const h = await stand({
      keys: { google: 'g', monid: 'test-monid' },
      monid: ({ url }) =>
        url.hostname === 'sfs.monid.ai'
          ? Response.json(HIDEOUT)
          : Response.json({ runId: 'run-1', status: 'COMPLETED', output: ENVELOPE, cost: { value: 0.00015 } })
    })
    await h.research('first')
    assert.deepEqual(h.calls, ['monid:/v1/run', 'monid:/o-test-signed-object'])
    assert.equal(h.placesCalls(), 1)
    const maps = await h.maps()
    assert.ok(maps, 'the Maps reviews reach the profile')
    assert.equal(maps.reviews.length, HIDEOUT.reviews.length - 1)
    assert.ok(maps.reviews.every((r) => r.provider === 'monid' && r.route === 'litescrape/google-reviews'))
    assert.equal(
      maps.reviews.some((r) => r.googleReviewId === HIDEOUT.reviews[0].review_id),
      false,
      'the review Place Details already holds is not added twice'
    )
    assert.ok(maps.reviews.some((r) => r.ownerResponse?.text))
    assert.equal(maps.monid.state, 'done')
    assert.deepEqual(await h.charges(), [{ operation: 'google-reviews', state: 'settled', actual_cents: 1 }])
    // Kept once: the raw answer is not in the coverage.
    assert.equal(JSON.stringify((await h.row()).coverage ?? {}).includes('review_id'), false)
  }
)

test(
  'with SerpApi: its review stays first and its photo stays Maps media; Monid photos are not media',
  opts,
  async () => {
    const h = await stand({
      keys: { google: 'g', serpapi: 's', monid: 'test-monid' },
      monid: completed(HIDEOUT)
    })
    await h.research('first')
    assert.deepEqual(
      h.calls.filter((c) => c.startsWith('monid')),
      ['monid:/v1/run']
    )
    const maps = await h.maps()
    assert.equal(maps.reviews[0].provider, 'serpapi')
    assert.equal(maps.reviews.filter((r) => r.provider === 'monid').length, HIDEOUT.reviews.length - 1)
    const media = (await h.pool.query("select source_url from wo_place_media where source = 'google-maps'"))
      .rows
    assert.deepEqual(
      media.map((m) => m.source_url),
      [`${CDN}serp-photo`]
    )
  }
)

test('a refresh replaces the Monid set whole and keeps the SerpApi review', opts, async () => {
  let output = HIDEOUT
  const h = await stand({
    keys: { google: 'g', serpapi: 's', monid: 'test-monid' },
    monid: () => Response.json({ runId: 'run-1', status: 'COMPLETED', output })
  })
  await h.research('first')
  const first = (await h.maps()).reviews
  // Same place, the next fetch answers other reviews.
  output = { ...TARTINE, search_parameters: { ...TARTINE.search_parameters, place_id: PLACE_ID } }
  h.advance(91)
  await h.research('again')
  const second = (await h.maps()).reviews
  assert.equal(second[0].provider, 'serpapi')
  const monid = second.filter((r) => r.provider === 'monid')
  assert.equal(monid.length, TARTINE.reviews.length)
  assert.equal(
    monid.some((r) => first.some((old) => old.id === r.id)),
    false,
    'no review of the first Monid set is left'
  )
  assert.equal((await h.charges()).length, 2)
})

test('a fresh Monid fetch is not repeated when the Maps step alone is due again', opts, async () => {
  const h = await stand({
    keys: { google: 'g', serpapi: 's', monid: 'test-monid' },
    monid: completed(HIDEOUT)
  })
  h.serpFails(true)
  await h.research('first')
  assert.equal(h.calls.filter((c) => c === 'monid:/v1/run').length, 1)
  // Two days on, SerpApi's failed step is due again; Monid's fetch is two days old and is not repeated.
  h.serpFails(false)
  h.advance(2)
  h.calls.length = 0
  await h.research('second')
  assert.ok(h.calls.includes('serpapi:place'), h.calls.join())
  assert.equal(h.calls.includes('monid:/v1/run'), false)
  const maps = await h.maps()
  assert.equal(maps.reviews[0].provider, 'serpapi')
  assert.equal(maps.reviews.filter((r) => r.provider === 'monid').length, HIDEOUT.reviews.length - 1)
})

test(
  'a refused key never fails the research and keeps held reviews; a busy provider is recorded and tried again',
  opts,
  async () => {
    let answer = () => new Response('{"error":{"code":"UNAUTHORIZED"}}', { status: 401 })
    const h = await stand({ keys: { google: 'g', serpapi: 's', monid: 'test-monid' }, monid: () => answer() })
    await h.research('refused')
    const job = (await h.pool.query('select state from wo_place_job order by created_at desc limit 1'))
      .rows[0]
    assert.equal(job.state, 'completed')
    const maps = await h.maps()
    assert.deepEqual(
      maps.reviews.map((r) => r.provider),
      ['serpapi']
    )
    assert.equal(maps.monid.state, 'failed')
    assert.equal(maps.monid.lastError.reason, 'HTTP_401')
    // A 5xx is a busy provider: recorded, not counted as a settled try.
    answer = () => new Response('{}', { status: 503 })
    h.advance(2)
    // The Maps row's Retry (one part) runs the Monid pass again.
    await h.research('busy', { onlySource: 'google-maps' })
    assert.equal((await h.maps()).monid.state, 'retry')
    assert.deepEqual(
      (await h.maps()).reviews.map((r) => r.provider),
      ['serpapi']
    )
    answer = completed(HIDEOUT)
    await h.research('recovered', { onlySource: 'google-maps' })
    assert.equal((await h.maps()).monid.state, 'done')
  }
)
