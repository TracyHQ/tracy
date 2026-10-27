// Scratch Postgres only; the vision model, the website and the file store are fakes. Nothing reaches the network.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { normalizeWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { createChargeable, createCostLedger } from 'website-opportunities/src/cost-ledger.js'
import { createExecutor } from 'website-opportunities/src/executor.js'
import { imageInfoWith } from 'website-opportunities/src/media-info.js'
import { menuVisionDoorOf } from 'website-opportunities/src/menu-photo-reading.js'
import { requestResearch } from 'website-opportunities/src/place-requests.js'
import { placeViewOf } from 'website-opportunities/src/place-view.js'
import { mediaJunk } from 'website-opportunities/src/media-junk.js'
import { insertOpportunity } from 'website-opportunities/src/store.js'
import { fileDb } from './_db.mjs'
import { createTracyWoHost } from '../src/wo-host.js'

const woHost = createTracyWoHost()
const imageInfo = imageInfoWith(woHost)

const PLACE_ID = 'ChIJLogoTest1'
const db = fileDb()
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
before(db.open)
beforeEach(db.reset)
after(db.close)

let logoPng, dishPng, fbPng
before(async () => {
  // A small logo (64 px, under the 480 px picture rule) with a transparent corner, and a large dish.
  logoPng = await sharp({
    create: { width: 64, height: 40, channels: 4, background: { r: 120, g: 30, b: 20, alpha: 0.5 } }
  })
    .png()
    .toBuffer()
  fbPng = await sharp({ create: { width: 30, height: 30, channels: 3, background: '#3b599c' } })
    .png()
    .toBuffer()
  dishPng = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#945432' } })
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

const READY = menuVisionDoorOf(
  {
    state: 'ok',
    credential: { apiKey: 'k', baseUrl: 'https://vision.test', model: 'deepseek-flash' },
    snapshot: { presetId: 'deepseek', metadata: { vision: true } }
  },
  woHost
)

async function fixture({
  vision = READY,
  verdict = { kind: 'logo', showsName: true, readsAs: 'Pho Ba' }
} = {}) {
  const { pool } = db
  const accountId = (await pool.query("insert into account(email) values('logo@tracy.test') returning id"))
    .rows[0].id
  const { row: opportunity } = await insertOpportunity(pool, accountId, {
    name: 'Pho Ba',
    provider: 'google-places',
    providerId: PLACE_ID,
    candidate: { provider: 'google-places', providerId: PLACE_ID, name: 'Pho Ba' }
  })
  const real = await websiteOpportunitiesDomain()
  const stats = { website: 0, vision: 0, downloads: [] }
  const blocked = { available: false, collect: async () => ({ status: 'blocked', media: [] }) }
  const stored = new Map()
  const domain = {
    ...real,
    connectorsFor: () => ({
      ...Object.fromEntries(['facebook', 'instagram', 'tiktok', 'youtube'].map((s) => [s, blocked])),
      website: {
        available: true,
        collect: async () => {
          stats.website += 1
          return {
            source: 'website',
            status: 'complete',
            cursor: null,
            profile: { name: 'Pho Ba' },
            pages: [],
            menus: [],
            bookings: [],
            socials: {},
            media: [
              { url: 'https://pho.test/dish.png', kind: 'image', sourceUrl: 'https://pho.test/' },
              { url: 'https://pho.test/img/facebook-icon.png', kind: 'image', sourceUrl: 'https://pho.test/' }
            ],
            logos: [
              { url: 'https://pho.test/brand/logo.png', via: 'jsonld-logo', sourceUrl: 'https://pho.test/' },
              { url: 'https://pho.test/favicon.png', via: 'icon', sourceUrl: 'https://pho.test/' },
              {
                url: 'https://pho.test/img/facebook-icon.png',
                via: 'header-img',
                sourceUrl: 'https://pho.test/'
              }
            ],
            coverage: { fetched: 1 }
          }
        }
      }
    }),
    fetchPlaceDetails: async () => ({
      id: PLACE_ID,
      displayName: { text: 'Pho Ba' },
      websiteUri: 'https://pho.test/'
    }),
    fetchLimited: async (url) => {
      stats.downloads.push(url)
      if (url === 'https://pho.test/')
        return { url, status: 200, mime: 'text/html', bytes: Buffer.from('<html></html>') }
      if (url.includes('facebook')) return { url, status: 200, mime: 'image/png', bytes: fbPng }
      const big = url.includes('dish')
      return {
        url,
        status: 200,
        mime: 'image/png',
        bytes: big
          ? dishPng
          : url.includes('favicon')
            ? await sharp(logoPng).resize(32, 32).png().toBuffer()
            : logoPng
      }
    }
  }
  const settings = {
    ...normalizeWoOpsSettings({ pageSpeedCheckEnabled: false, googlePlacesPhotos: false }),
    tripadvisorReviews: false
  }
  const ledger = createCostLedger({ pool, caps: async () => ({ dailyCapCents: 1000, jobCapCents: 1000 }) })
  const ex = createExecutor({
    host: woHost,
    pool,
    shared: true,
    loadDomain: async () => domain,
    runtime: async () => ({ keys: { google: 'test-google' }, settings }),
    chargeable: createChargeable(ledger),
    menuVisionDoor: async () => vision,
    apiFetch: async (url) => {
      assert.match(String(url), /^https:\/\/vision\.test\//)
      stats.vision += 1
      return Response.json({
        id: 'r',
        choices: [{ message: { content: JSON.stringify(verdict) } }],
        usage: { prompt_tokens: 900, completion_tokens: 600 }
      })
    },
    objects: {
      put: async (key, bytes) => {
        stored.set(key, Buffer.from(bytes))
        return true
      },
      get: async (key) => (stored.has(key) ? new Response(stored.get(key)) : null)
    },
    imageInfo,
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchImpl: async () => {
      throw new Error('no network in tests')
    },
    switchOn: async () => true,
    log: { warn() {}, error() {}, log() {} }
  })
  const research = (requestId, extra = {}) =>
    requestResearch(pool, { accountId, opportunity, requestId, requiredSources: {}, ...extra })
  return { pool, ex, opportunity, research, stats }
}

const brandOf = async (h) => (await placeViewOf(h.pool, h.opportunity)).brand

test(
  'a small logo the website points at is stored, read by the vision model, chosen and charged as vision',
  opts,
  async () => {
    const h = await fixture()
    await h.research('first-run')
    await drain(h.ex)
    const brand = await brandOf(h)
    assert.equal(brand.logoResearch.status, 'found')
    assert.equal(brand.logoResearch.chosen.via, 'jsonld-logo')
    assert.equal(brand.logoResearch.chosen.recognised, 'vision')
    assert.equal(brand.logoResearch.chosen.width, 64)
    assert.equal(brand.logoResearch.chosen.hasAlpha, true)
    assert.equal(brand.logo, brand.logoResearch.chosen.mediaId)
    // The favicon was a candidate too, kept beside the chosen one; the dish is not.
    assert.deepEqual(brand.logoResearch.candidates.map((c) => c.via).sort(), ['icon', 'jsonld-logo'])
    assert.equal(
      brand.logoResearch.candidates.some((c) => 'objectKey' in c),
      false
    )
    assert.equal(brand.logoResearch.vision.status, 'complete')
    assert.equal(h.stats.vision, 2)
    const ledger = (
      await h.pool.query(
        "select provider, count(*)::int n from wo_cost_ledger where provider = 'vision' group by 1"
      )
    ).rows
    assert.deepEqual(ledger, [{ provider: 'vision', n: 2 }])
  }
)

test(
  "the brand's colours are the chosen logo's own, read from its stored bytes, with its accent (#1780 item 15)",
  opts,
  async () => {
    const h = await fixture()
    await h.research('logo-colours')
    await drain(h.ex)
    const brand = await brandOf(h)
    assert.equal(brand.logoResearch.chosen.via, 'jsonld-logo')
    // The logo is one deep red (#781e14); the dish photo's brown (#945432) is no colour of the brand.
    assert.equal(brand.website.colorsFrom, 'logo')
    assert.deepEqual(brand.website.colors, [{ hex: '#781e14', role: 'primary' }])
    assert.deepEqual(brand.website.accent, { hex: '#781e14', source: 'logo', share: 1 })
    assert.ok(brand.website.evidence.some((e) => e.kind === 'palette' && /from the logo/.test(e.detail)))
  }
)

test(
  'with no vision model assigned the word of the page decides and the state says so; nothing is charged',
  opts,
  async () => {
    const h = await fixture({ vision: menuVisionDoorOf({ state: 'unassigned' }, woHost) })
    await h.research('first-run')
    await drain(h.ex)
    const brand = await brandOf(h)
    assert.equal(brand.logoResearch.vision.status, 'not_configured')
    assert.equal(brand.logoResearch.chosen.recognised, 'words')
    assert.equal(brand.logoResearch.chosen.via, 'jsonld-logo')
    assert.equal(h.stats.vision, 0)
    assert.equal((await h.pool.query("select 1 from wo_cost_ledger where provider = 'vision'")).rowCount, 0)
  }
)

test(
  'the model saying none of them is a logo leaves an explicit none, with the candidates kept',
  opts,
  async () => {
    const h = await fixture({ verdict: { kind: 'photo' } })
    await h.research('first-run')
    await drain(h.ex)
    const brand = await brandOf(h)
    assert.equal(brand.logoResearch.status, 'none')
    assert.equal(brand.logoResearch.chosen, null)
    assert.equal(brand.logo, undefined)
    assert.equal(brand.logoResearch.candidates.length, 2)
  }
)

test(
  'Retry on the logo runs the logo alone: no website crawl, no second paid reading, the profile and colours carried over',
  opts,
  async () => {
    const h = await fixture()
    await h.research('first-run')
    await drain(h.ex)
    const before = await placeViewOf(h.pool, h.opportunity)
    assert.equal(h.stats.website, 1)
    const { job } = await h.research('retry-logo', { onlySource: 'logo' })
    assert.ok(job)
    const queued = (
      await h.pool.query('select only_source, state from wo_place_job order by created_at desc limit 1')
    ).rows[0]
    assert.deepEqual(queued, { only_source: 'logo', state: 'queued' })
    await drain(h.ex)
    assert.equal(h.stats.website, 1)
    assert.equal(h.stats.vision, 2)
    const after = await placeViewOf(h.pool, h.opportunity)
    assert.notEqual(after.snapshot.id, before.snapshot.id)
    assert.equal(after.brand.logoResearch.status, 'found')
    assert.equal(after.brand.logoResearch.chosen.mediaId, before.brand.logoResearch.chosen.mediaId)
    assert.equal(after.profile.name, before.profile.name)
    assert.equal(after.media.length, before.media.length)
  }
)

test('a request for the whole research turns a waiting logo-only run into a whole one', opts, async () => {
  const h = await fixture()
  await h.research('first-run')
  await drain(h.ex)
  const placeId = (await h.pool.query('select id from wo_place limit 1')).rows[0].id
  const { joinPlace } = await import('website-opportunities/src/place-jobs.js')
  const client = await h.pool.connect()
  try {
    const part = await joinPlace(client, placeId, { onlySource: 'logo' })
    assert.equal(part.job.only_source, 'logo')
    const again = await joinPlace(client, placeId, { onlySource: 'logo' })
    assert.equal(again.job.id, part.job.id)
    const whole = await joinPlace(client, placeId, { force: true })
    assert.equal(whole.job.id, part.job.id)
    assert.equal(whole.job.only_source, null)
  } finally {
    client.release()
  }
})

test(
  'a social network icon of the website is hidden: not a logo candidate, not in the brand colors, not in the brief',
  opts,
  async () => {
    const h = await fixture()
    await h.research('first-run')
    await drain(h.ex)
    const view = await placeViewOf(h.pool, h.opportunity)
    const icon = view.media.find((m) => m.source_url.includes('facebook-icon'))
    assert.ok(icon, 'the icon is kept as a row, never deleted')
    assert.equal(mediaJunk(icon), 'social-icon')
    assert.equal(
      view.brand.logoResearch.candidates.some((c) => c.mediaId === icon.id),
      false
    )
    const colors = [...(view.brand.website?.colors ?? []), ...(view.brand.social?.colors ?? [])]
    assert.ok(colors.length > 0)
    assert.equal(
      colors.some((c) => c.hex === '#3b599c'),
      false
    )
    const brief = (await import('../src/opportunities-build/revisions.js')).briefBrand(view.brand)
    assert.equal(
      brief.logoResearch.candidates.some((c) => c.mediaId === icon.id),
      false
    )
  }
)
