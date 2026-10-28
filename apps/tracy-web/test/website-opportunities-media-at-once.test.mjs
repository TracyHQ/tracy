// Scratch Postgres only; Google, the website and its pictures are fakes. Nothing reaches the network.
// A research run downloads its pictures a few at once and keeps them in list order (28/10/2026).
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
import { insertOpportunity } from 'website-opportunities/src/store.js'
import { fileDb } from './_db.mjs'
import { createTracyWoHost } from '../src/wo-host.js'

const woHost = createTracyWoHost()
const imageInfo = imageInfoWith(woHost)
const PLACE_ID = 'ChIJMediaAtOnce1'
const db = fileDb()
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
before(db.open)
beforeEach(db.reset)
after(db.close)

async function drain(ex) {
  for (let i = 0; i < 20; i++) {
    const { claimed, done } = await ex.tick()
    if (!claimed) return
    await done
  }
}

const picture = (shade) =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: { r: shade, g: 90, b: 40 } } })
    .jpeg()
    .toBuffer()
// The smallest bytes sniffed as an MP4: a `ftyp` box.
const video = (n) => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(12, n)])

test(
  'pictures download a few at once, a video alone, and are kept in list order: the first of two equal pictures owns the row',
  opts,
  async () => {
    const { pool } = db
    const accountId = (await pool.query("insert into account(email) values('media@tracy.test') returning id"))
      .rows[0].id
    const { row: opportunity } = await insertOpportunity(pool, accountId, {
      name: 'Cafe Media',
      provider: 'google-places',
      providerId: PLACE_ID,
      candidate: { provider: 'google-places', providerId: PLACE_ID, name: 'Cafe Media' }
    })
    // p3 and p9 are the same picture; earlier pictures answer later, so finishing order is not list order.
    const urls = Array.from({ length: 12 }, (_, i) => `https://cdn.test/p${i}.jpg`)
    const bytes = new Map()
    for (const [i, url] of urls.entries()) bytes.set(url, await picture(i === 9 ? 3 * 20 : i * 20))
    const media = [
      ...urls.slice(0, 6).map((url) => ({ url, caption: url })),
      { url: 'https://cdn.test/v1.mp4', kind: 'video' },
      { url: 'https://cdn.test/v2.mp4', kind: 'video' },
      ...urls.slice(6).map((url) => ({ url, caption: url }))
    ]
    let open = 0
    let most = 0
    let videosOpen = 0
    let videosMost = 0
    const real = await websiteOpportunitiesDomain()
    const domain = {
      ...real,
      connectorsFor: () => ({
        website: {
          available: true,
          collect: async () => ({
            source: 'website',
            status: 'complete',
            cursor: null,
            profile: { name: 'Cafe Media' },
            pages: [],
            menus: [],
            bookings: [],
            socials: {},
            media,
            coverage: { fetched: 1 }
          })
        },
        ...Object.fromEntries(
          ['facebook', 'instagram', 'tiktok', 'youtube'].map((s) => [
            s,
            { available: false, collect: async () => null }
          ])
        )
      }),
      fetchPlaceDetails: async () => ({
        id: PLACE_ID,
        displayName: { text: 'Cafe Media' },
        websiteUri: 'https://cafe-media.test/'
      }),
      fetchLimited: async (url) => {
        if (!url.startsWith('https://cdn.test/'))
          return { url, status: 200, mime: 'text/html', bytes: Buffer.from('<html></html>') }
        const isVideo = url.endsWith('.mp4')
        open++
        most = Math.max(most, open)
        if (isVideo) videosMost = Math.max(videosMost, ++videosOpen)
        try {
          const n = Number(/(\d+)\.\w+$/.exec(url)[1])
          await new Promise((r) => setTimeout(r, isVideo ? 5 : 40 - (n % 6) * 6))
          return { url, status: 200, bytes: isVideo ? video(n) : bytes.get(url) }
        } finally {
          open--
          if (isVideo) videosOpen--
        }
      }
    }
    const settings = {
      ...normalizeWoOpsSettings({ pageSpeedCheckEnabled: false }),
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
      menuVisionDoor: async () => menuVisionDoorOf({ state: 'unassigned' }, woHost),
      apiFetch: async () => {
        throw new Error('no network in tests')
      },
      objects: { put: async () => true, get: async () => null },
      imageInfo,
      resolve: async () => [{ address: '93.184.216.34', family: 4 }],
      fetchImpl: async () => {
        throw new Error('no network in tests')
      },
      switchOn: async () => true,
      log: { warn() {}, error() {}, log() {} }
    })
    await requestResearch(pool, { accountId, opportunity, requestId: 'first', requiredSources: {} })
    await drain(ex)
    const job = (await pool.query('select state from wo_place_job')).rows[0]
    assert.equal(job.state, 'completed')
    assert.ok(most > 1, 'pictures download together')
    assert.ok(most <= 5, `at most five at once, saw ${most}`)
    assert.equal(videosMost, 1, 'a video downloads alone')
    const kept = (
      await pool.query(
        "select source_url, kind from wo_place_media where status = 'stored' order by collected_at, id"
      )
    ).rows
    // In list order; p9 is p3's picture, so p3's row is the one kept.
    assert.deepEqual(
      kept.map((r) => r.source_url),
      [
        ...urls.slice(0, 6),
        'https://cdn.test/v1.mp4',
        'https://cdn.test/v2.mp4',
        ...urls.slice(6, 9),
        ...urls.slice(10)
      ]
    )
  }
)
