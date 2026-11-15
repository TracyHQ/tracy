// The links a business keeps behind its social bio, on a real database (10Web idea 7): a place's Instagram bio points
// at a Linktree page; the research reads that page once, keeps the appointment platform it lists as the place's
// verified booking link, reads the price list PDF it lists into services and prices, and keeps the page with every
// link as the evidence. A place whose bio points at no such page is researched exactly as before. Scratch Postgres;
// the website, the Linktree page and the PDF are a fake web (the real crawler and PDF reader read them), Instagram is
// a fake connector.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { normalizeWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { createChargeable, createCostLedger } from 'website-opportunities/src/cost-ledger.js'
import { createExecutor } from 'website-opportunities/src/executor.js'
import { imageInfoWith } from 'website-opportunities/src/media-info.js'
import { requestResearch } from 'website-opportunities/src/place-requests.js'
import { insertOpportunity } from 'website-opportunities/src/store.js'
import { fileDb } from './_db.mjs'
import { createTracyWoHost } from '../src/wo-host.js'

const woHost = createTracyWoHost()
const imageInfo = imageInfoWith(woHost)
const db = fileDb()
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
before(db.open)
beforeEach(db.reset)
after(db.close)

const PLACE_ID = 'ChIJLinkSources1'
const SITE = 'https://harbourcuts.test/'
const INSTAGRAM = 'https://www.instagram.com/harbourcuts/'
const LINKTREE = 'https://linktr.ee/harbourcuts'
const FRESHA = 'https://www.fresha.com/a/harbour-cuts-bristol-12-quay-street-abc123'
const PRICES = 'https://harbourcuts.test/files/salon-2026.pdf'
const LINKTREE_PAGE = readFileSync(
  new URL(
    '../../../packages/wo/website-opportunities/test/fixtures/link-in-bio/linktree-salon.html',
    import.meta.url
  ),
  'utf8'
)

/** A one-page PDF with Helvetica text at the given positions (x, y in points), xref offsets computed. */
function pdfOf(lines) {
  const stream = lines
    .map(([x, y, text]) => `BT /F1 10 Tf ${x} ${y} Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`)
    .join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  ]
  let out = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'))
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = Buffer.byteLength(out, 'latin1')
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new Uint8Array(Buffer.from(out, 'latin1'))
}

const PRICE_LIST = pdfOf([
  [50, 780, 'Ladies cut and blow dry'],
  [400, 780, 'EUR 45.00'],
  [50, 760, 'Gel manicure'],
  [400, 760, 'EUR 30.00']
])

async function research({ bio }) {
  const { pool } = db
  const accountId = (await pool.query("insert into account(email) values('links@tracy.test') returning id"))
    .rows[0].id
  const { row: opportunity } = await insertOpportunity(pool, accountId, {
    name: 'Harbour Cuts',
    provider: 'google-places',
    providerId: PLACE_ID,
    candidate: { provider: 'google-places', providerId: PLACE_ID, name: 'Harbour Cuts' }
  })
  const real = await websiteOpportunitiesDomain()
  const requests = []
  const web = {
    [SITE]: `<html><head><title>Harbour Cuts</title></head><body><p>Hair and nails in the harbour since 2009.</p><a href="${INSTAGRAM}">Instagram</a></body></html>`,
    [LINKTREE]: LINKTREE_PAGE,
    [PRICES]: PRICE_LIST
  }
  const fetchImpl = async (url) => {
    requests.push(url)
    const body = web[url]
    if (body instanceof Uint8Array)
      return new Response(body, { status: 200, headers: { 'content-type': 'application/pdf' } })
    return typeof body === 'string'
      ? new Response(body, { status: 200, headers: { 'content-type': 'text/html' } })
      : new Response('', { status: 404 })
  }
  const blocked = { available: false, collect: async () => ({ status: 'blocked', media: [] }) }
  const domain = {
    ...real,
    connectorsFor: () => ({
      website: real.connectorsFor({}).website,
      instagram: {
        available: true,
        collect: async () => ({
          source: 'instagram',
          status: 'complete',
          cursor: null,
          profile: { name: 'Harbour Cuts', bio: 'Hair and nails studio', website: bio, url: INSTAGRAM },
          posts: [{ id: 'p1', url: 'https://www.instagram.com/p/AAA/', caption: 'New season colours' }],
          media: [],
          coverage: { fetched: 1 }
        })
      },
      facebook: blocked,
      tiktok: blocked,
      youtube: blocked
    }),
    fetchPlaceDetails: async () => ({
      id: PLACE_ID,
      displayName: { text: 'Harbour Cuts' },
      primaryType: 'hair_salon',
      types: ['hair_salon', 'beauty_salon'],
      websiteUri: SITE
    })
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
    objects: { put: async () => true, get: async () => null },
    imageInfo,
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchImpl,
    switchOn: async () => true,
    log: { warn() {}, error() {}, log() {}, info() {} }
  })
  await requestResearch(pool, { accountId, opportunity, requestId: 'links-first', requiredSources: {} })
  for (let i = 0; i < 20; i++) {
    const { claimed, done } = await ex.tick()
    if (!claimed) break
    await done
  }
  const place = (
    await pool.query(
      `select p.id, p.current_snapshot_id from wo_place p join wo_opportunity o on o.place_id = p.id where o.id = $1`,
      [opportunity.id]
    )
  ).rows[0]
  assert.ok(place?.current_snapshot_id, 'the research published a snapshot')
  const sources = Object.fromEntries(
    (
      await pool.query('select * from wo_place_snapshot_source where snapshot_id = $1', [
        place.current_snapshot_id
      ])
    ).rows.map((r) => [r.source, r])
  )
  const { profile } = (
    await pool.query('select profile from wo_place_snapshot_profile where snapshot_id = $1', [
      place.current_snapshot_id
    ])
  ).rows[0]
  const links = (await pool.query('select kind, url from wo_place_link where place_id = $1', [place.id])).rows
  return { sources, profile, requests, links }
}

test(
  "a bio link to a Linktree page: its appointment platform is the place's booking link, its price list read",
  opts,
  async () => {
    const r = await research({ bio: `https://l.instagram.com/?u=${encodeURIComponent(LINKTREE)}&e=AT0abc` })
    assert.equal(r.requests.filter((u) => u === LINKTREE).length, 1, 'the Linktree page is read once')
    // The evidence: the page read, from the Instagram profile, with every link it listed.
    const page = r.sources.instagram.collected.bioPages[0]
    assert.equal(page.url, LINKTREE)
    assert.equal(page.status, 'complete')
    assert.equal(page.sourceUrl, INSTAGRAM)
    assert.ok(page.links.some((l) => l.url === FRESHA))
    assert.deepEqual(r.profile.booking, [{ url: FRESHA, verified: true, source: 'instagram', via: LINKTREE }])
    assert.ok(r.profile.menus.some((m) => m.url === PRICES && m.source === 'instagram' && m.via === LINKTREE))
    // The price list, read like a menu PDF: each service with its price, the file and page it came from.
    assert.deepEqual(
      r.profile.menuItems.map((i) => [
        i.name,
        i.price,
        i.currency,
        i.source.url,
        i.source.kind,
        i.source.page
      ]),
      [
        ['Ladies cut and blow dry', 'EUR 45.00', 'EUR', PRICES, 'pdf', 1],
        ['Gel manicure', 'EUR 30.00', 'EUR', PRICES, 'pdf', 1]
      ]
    )
    assert.equal(r.sources['menu-file'].status, 'complete')
    // The social pages the Linktree page lists are kept as links of the profile, not made sources of the place.
    assert.ok(r.profile.links.includes('https://www.tiktok.com/@harbourcuts'))
    assert.deepEqual(r.links.map((l) => l.kind).sort(), ['instagram', 'website'])
  }
)

test('a bio link that is a booking platform page is the booking link, with no page read', opts, async () => {
  const booksy = 'https://booksy.com/en-gb/12345_harbour-cuts_hair-salon_6789_bristol'
  const r = await research({ bio: booksy })
  assert.deepEqual(r.profile.booking, [{ url: booksy, verified: true, source: 'instagram' }])
  assert.equal(r.requests.includes(LINKTREE), false)
  assert.equal(r.sources.instagram.collected.bioPages, undefined)
})

test(
  'a bio link to the business website: the research reads and keeps what it did before',
  opts,
  async () => {
    const r = await research({ bio: SITE })
    assert.equal(r.requests.includes(LINKTREE), false)
    assert.equal(r.sources.instagram.collected.bioPages, undefined)
    assert.equal(r.profile.booking, undefined)
    assert.equal(r.profile.menus, undefined)
    assert.equal(r.profile.menuItems, undefined)
    assert.equal(r.sources.website.status, 'complete')
    assert.equal(r.sources.instagram.status, 'complete')
  }
)
