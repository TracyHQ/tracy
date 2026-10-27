// A place researched before listing pages were told apart from websites (#1780, measured on dev 26/10/2026 on
// opportunity 9c3d4e5f): its magicpin page was crawled as the Website, magicpin's own Facebook page became the place's
// Facebook, and page speed scored magicpin. Running research again re-judges every source with today's link rules, and
// adding a link to a researched opportunity starts a new run. Scratch Postgres; collectors are fakes.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { normalizeWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { createChargeable, createCostLedger } from 'website-opportunities/src/cost-ledger.js'
import { createExecutor } from 'website-opportunities/src/executor.js'
import { imageInfoWith } from 'website-opportunities/src/media-info.js'
import { requestResearch } from 'website-opportunities/src/place-requests.js'
import { placeViewOf } from 'website-opportunities/src/place-view.js'
import { insertOpportunity } from 'website-opportunities/src/store.js'
import { saveListingSource } from 'website-opportunities/src/link-fields.js'
import { sourceVersionOf } from 'website-opportunities/src/collector-versions.js'
import { readListingPage } from 'website-opportunities/domain/listing-page.mjs'
import { readPlaceProfile } from 'website-opportunities/src/place-profile-read.js'
import { readFileSync } from 'node:fs'
import { briefResearchOf, makeSiteBrief, opportunityOf } from 'website-opportunities/src/brief-research.js'
import { websiteOpportunitiesRoutes } from 'website-opportunities/src/route.js'
import { socialFiguresOf } from 'website-opportunities/domain/agent-prompt.mjs'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { ensureAccount } from '../src/seats/store.js'
import { fileDb } from './_db.mjs'
import { createTracyWoHost } from '../src/wo-host.js'

const woHost = createTracyWoHost()
const db = fileDb()
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
before(db.open)
beforeEach(db.reset)
after(db.close)

const MAGICPIN = 'https://magicpin.com/uae/Dubai/Al-Barsha/Fitness/Padel-and-Tennis-Coach/store/1000001'
const MAGICPIN_FB = 'https://www.facebook.com/mymagicpin'
const MAGICPIN_IG = 'https://www.instagram.com/mymagicpindelhi'
const CLUB_IG = 'https://www.instagram.com/harbour.sportclub'

/**
 * @param {{ig?: string, candidate?: object, google?: object}} [old] what the old run stored: the club Instagram's address,
 *   extra candidate fields, the Google facts of the snapshot profile
 */
async function fixture(old = {}) {
  const { pool } = db
  const accountId = (await pool.query("insert into account(email) values('rejudge@tracy.test') returning id"))
    .rows[0].id
  const candidate = {
    name: 'magicpin.com',
    website: MAGICPIN,
    listings: [{ url: MAGICPIN, source: 'magicpin' }],
    provider: 'url',
    providerId: MAGICPIN,
    ...old.candidate
  }
  const { row: opportunity } = await insertOpportunity(pool, accountId, {
    name: 'magicpin.com',
    provider: 'url',
    providerId: MAGICPIN,
    candidate
  })
  await saveListingSource(pool, opportunity.id, [
    {
      url: MAGICPIN,
      source: 'magicpin',
      ok: true,
      facts: { name: 'Padel & Tennis Coach', category: 'Fitness', telephone: '+971500005678' }
    }
  ])
  const stats = { website: 0, facebook: 0, instagram: 0, pageSpeed: 0 }
  const real = await websiteOpportunitiesDomain()
  const connector = (source, result) => ({
    available: true,
    collect: async () => {
      stats[source] += 1
      return {
        source,
        status: 'complete',
        cursor: null,
        media: [],
        logos: [],
        coverage: { fetched: 1 },
        ...result
      }
    }
  })
  const domain = {
    ...real,
    connectorsFor: () => ({
      website: connector('website', {
        profile: { name: 'magicpin', links: [MAGICPIN_FB, MAGICPIN_IG] },
        pages: [{ url: MAGICPIN, title: 'magicpin fashion deals' }],
        menus: [],
        bookings: [],
        socials: {}
      }),
      facebook: connector('facebook', {
        profile: { name: 'magicpin', bio: 'Shop fashion deals on magicpin' }
      }),
      instagram: connector('instagram', {
        profile: { name: 'Harbour Sport Club', bio: 'European Coaching in Dubai' }
      }),
      tiktok: { available: false, collect: async () => ({ status: 'blocked', media: [] }) },
      youtube: { available: false, collect: async () => ({ status: 'blocked', media: [] }) }
    })
  }
  const settings = {
    ...normalizeWoOpsSettings({ pageSpeedCheckEnabled: true, googlePlacesPhotos: false }),
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
    apiFetch: async (url) => {
      if (String(url).includes('pagespeed')) stats.pageSpeed += 1
      throw new Error('no network in tests')
    },
    objects: { put: async () => true, get: async () => null },
    imageInfo: imageInfoWith(woHost),
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchImpl: async () => {
      throw new Error('no network in tests')
    },
    switchOn: async () => true,
    log: { warn() {}, error() {}, log() {}, info() {} }
  })
  const drain = async () => {
    for (let i = 0; i < 20; i++) {
      const { claimed, done } = await ex.tick()
      if (!claimed) return
      await done
    }
  }
  await requestResearch(pool, { accountId, opportunity, requestId: 'first' })
  await drain()
  const placeId = (await pool.query('select place_id from wo_opportunity where id = $1', [opportunity.id]))
    .rows[0].place_id
  await seedOldResearch(pool, placeId, old)
  return {
    pool,
    accountId,
    opportunity,
    placeId,
    stats,
    drain,
    deps: { keys: { google: 'test-google' }, settings, domain }
  }
}

/**
 * What the place held on dev before #1770: magicpin as the Website, with everything read through it. Written into the
 * published snapshot past its guard (a published snapshot takes no new rows), as the old runs left it.
 */
async function seedOldResearch(db, placeId, old) {
  const pool = await db.connect()
  try {
    await pool.query('begin')
    await pool.query('set local session_replication_role = replica')
    await writeOldResearch(pool, placeId, old)
    await pool.query('commit')
  } finally {
    pool.release()
  }
}

async function writeOldResearch(pool, placeId, { ig = CLUB_IG, google = null } = {}) {
  const link = (kind, url, by, evidence = {}) =>
    pool.query(
      'insert into wo_place_link (place_id, kind, url, verified_by, evidence) values ($1, $2, $3, $4, $5::jsonb)',
      [placeId, kind, url, by, JSON.stringify(evidence)]
    )
  await link('website', MAGICPIN, 'identity', { from: 'identity' })
  await link('facebook', MAGICPIN_FB, 'website', { page: MAGICPIN })
  await link('instagram', ig, 'operator')
  const snapshotId = (await pool.query('select current_snapshot_id from wo_place where id = $1', [placeId]))
    .rows[0].current_snapshot_id
  assert.ok(snapshotId, 'the first run published a snapshot')
  const now = new Date()
  const source = (name, ref, collected) =>
    pool.query(
      `insert into wo_place_snapshot_source (snapshot_id, source, ref, status, collected, collected_at, attempted_at,
         collector_version, coverage)
       values ($1, $2, $3, 'complete', $4::jsonb, $5, $5, $6, '{}'::jsonb)
       on conflict (snapshot_id, source) do update set ref = excluded.ref, collected = excluded.collected`,
      [snapshotId, name, ref, JSON.stringify(collected), now, sourceVersionOf(name) ?? 'wo-place-1']
    )
  await source('website', MAGICPIN, {
    profile: { name: 'magicpin', bio: 'magicpin fashion deals', links: [MAGICPIN_FB, MAGICPIN_IG] },
    pages: [{ url: MAGICPIN, title: 'magicpin fashion deals' }]
  })
  await source('facebook', MAGICPIN_FB, {
    profile: { name: 'magicpin', bio: 'Shop fashion deals on magicpin' }
  })
  await source('instagram', ig, {
    profile: { name: 'Harbour Sport Club', bio: 'European Coaching in Dubai', followers: 1819 }
  })
  const media = async (src, url) => {
    const id = (
      await pool.query(
        `insert into wo_place_media (place_id, sha256, status, kind, source, source_url)
         values ($1, $2, 'reference', 'image', $3, $4) returning id`,
        [placeId, `sha-${src}-${url}`, src, url]
      )
    ).rows[0].id
    await pool.query('insert into wo_place_snapshot_media (snapshot_id, media_id) values ($1, $2)', [
      snapshotId,
      id
    ])
  }
  await media('website', 'https://static.magicpin.com/fashion-banner.jpg')
  await media('facebook', 'https://www.facebook.com/mymagicpin/photos/1')
  await media('instagram', 'https://www.instagram.com/p/club-court/')
  await pool.query(
    `insert into wo_place_snapshot_profile (snapshot_id, profile) values ($1, $2::jsonb)
     on conflict (snapshot_id) do update set profile = excluded.profile`,
    [
      snapshotId,
      JSON.stringify({
        website: MAGICPIN,
        socials: { facebook: MAGICPIN_FB, instagram: ig },
        ...(google ? { googlePlace: google } : {}),
        pageSpeed: { url: MAGICPIN, checkedAt: now.toISOString(), mobile: { performance: 40 } }
      })
    ]
  )
}

const assertCleaned = async (h) => {
  const view = await placeViewOf(h.pool, { ...h.opportunity, place_id: h.placeId })
  assert.deepEqual(
    view.sources.map((s) => [s.source, s.ref]).sort(),
    [
      ['instagram', CLUB_IG],
      ['listing', MAGICPIN]
    ],
    'the listing is the only source of magicpin; the club Instagram stays'
  )
  assert.equal(view.profile.website ?? null, null, 'magicpin is not the website')
  assert.equal(view.profile.socials.facebook, undefined, 'magicpin Facebook dropped')
  assert.ok(!view.profile.links.some((l) => /magicpin/.test(l) && l !== MAGICPIN), 'no magicpin social links')
  assert.equal(view.profile.pageSpeed, undefined, 'no page speed of magicpin')
  assert.deepEqual(
    view.media.map((m) => m.source_url),
    ['https://www.instagram.com/p/club-court/'],
    'no magicpin photos'
  )
  const links = (await h.pool.query('select kind, url from wo_place_link where place_id = $1', [h.placeId]))
    .rows
  assert.deepEqual(
    links.map((l) => [l.kind, l.url]),
    [['instagram', CLUB_IG]]
  )
  assert.equal(h.stats.website, 0, 'magicpin is never crawled')
  assert.equal(h.stats.pageSpeed, 0, 'magicpin is never scored')
}

test(
  'Research again re-judges a listing page held as the Website and drops what came through it',
  opts,
  async () => {
    const h = await fixture()
    const out = await requestResearch(h.pool, {
      accountId: h.accountId,
      opportunity: h.opportunity,
      requestId: 'again',
      again: h.deps
    })
    assert.ok(out.plan.run.some((r) => r.part === 'website' && r.reason === 'rule-changed'))
    await h.drain()
    await assertCleaned(h)
  }
)

test(
  'adding a link to a researched opportunity starts a new run, which re-judges its sources',
  opts,
  async () => {
    const h = await fixture()
    const { row } = await insertOpportunity(h.pool, h.accountId, {
      name: 'magicpin.com',
      provider: 'url',
      providerId: MAGICPIN,
      candidate: { ...h.opportunity.candidate, socials: { instagram: CLUB_IG } }
    })
    assert.ok(row.candidate.linksAddedAt, 'the new link is stamped')
    const out = await requestResearch(h.pool, {
      accountId: h.accountId,
      opportunity: row,
      requestId: 'added'
    })
    assert.ok(out.job.place_job_id, 'a new place run, not the old completed job')
    await h.drain()
    await assertCleaned(h)
  }
)

test(
  'the magicpin page saved from dev gives its rating, 5.0 from 16, as a rating source of its own',
  opts,
  async () => {
    const h = await fixture()
    const page = readFileSync(new URL('./fixtures/magicpin-harbour-sport-club.html', import.meta.url))
    const read = await readListingPage(MAGICPIN, {
      resolve: async () => [{ address: '93.184.216.34', family: 4 }],
      fetch: async () => new Response(page, { status: 200, headers: { 'content-type': 'text/html' } })
    })
    assert.equal(read.ok, true)
    assert.deepEqual([read.facts.rating, read.facts.reviews, read.facts.ratingOf], [5, 16, 'google'])
    await saveListingSource(h.pool, h.opportunity.id, [{ url: MAGICPIN, source: 'magicpin', ...read }])
    const doc = await readPlaceProfile(h.pool, { opportunityId: h.opportunity.id })
    const fromListing = doc.claims.statistics.filter((s) => s.value.scope === MAGICPIN)
    assert.deepEqual(
      fromListing.map((s) => [s.value.label, s.value.amount, s.value.restrictions]),
      [
        ['rating', 5, ["the Google rating as the listing shows it, not the listing's own"]],
        ['reviewCount', 16, ["the Google rating as the listing shows it, not the listing's own"]]
      ]
    )
    assert.ok(
      !doc.claims.statistics.some((s) => s.value.label === 'rating' && s.value.scope !== MAGICPIN),
      'no Google rating was made of it'
    )
  }
)

const ORIGIN = 'http://tracy.test:8080'

/**
 * What a person is shown of the opportunity: the Details answer and its row in the list (through the real doors, with
 * the site check cache holding magicpin's audit as on dev), the brief made now and its markdown, and the place profile's
 * social figures (the brief's "Social figures" line).
 */
async function shownOf(h) {
  const config = readConfig({
    TRACY_ORIGIN: ORIGIN,
    SITE_DOMAIN: 'localhost',
    SESSION_SECRET: 's'.repeat(32),
    HOSTS: 'local',
    HOST_local_ORIGIN: 'http://tracy-host.test',
    HOST_local_DSH_ORIGIN: 'http://dsh.test',
    HOST_local_SECRET: 'h',
    SEAT_local_SECRET: 'k'
  })
  const checked = { status: 'done', performance: 62, seo: 100, checkedAt: '2026-10-26T06:10:00.000Z' }
  const app = websiteOpportunitiesRoutes({
    config,
    pool: h.pool,
    host: woHost,
    request: async () => Response.json({ code: 'UNEXPECTED' }, { status: 500 }),
    ensureAccount,
    loadDomain: async () => h.deps.domain,
    objects: null,
    runtime: async () => ({ keys: h.deps.keys, settings: h.deps.settings }),
    siteChecks: {
      lookup: async (urls) => Object.fromEntries(urls.map((u) => [u, { url: u, ...checked }])),
      request: async () => ({})
    },
    fetchImpl: async () => Response.json({ code: 'NO_NETWORK' }, { status: 500 })
  })
  await h.pool.query(
    `insert into ui_setting (id, overrides, updated_by) values (true, $1::jsonb, 'test')
     on conflict (id) do update set overrides = excluded.overrides`,
    [JSON.stringify({ 'website-opportunities': true })]
  )
  const cookie = `tracy_sess=${await mintSession('rejudge@tracy.test', config.sessionSecret)}`
  const get = async (path) => {
    const res = await app.fetch(new Request(`${ORIGIN}${path}`, { headers: { origin: ORIGIN, cookie } }))
    assert.equal(res.status, 200, path)
    return res.json()
  }
  const detail = await get(`/api/website-opportunities/${h.opportunity.id}`)
  const listed = (await get(`/api/website-opportunities?ids=${h.opportunity.id}`)).opportunities[0]
  const opp = (await h.pool.query('select * from wo_opportunity where id = $1', [h.opportunity.id])).rows[0]
  const { read } = await briefResearchOf(h.pool, opp)
  const brief = makeSiteBrief(h.deps.domain, read, {
    opportunity: opportunityOf(opp),
    madeAt: '2026-10-26T20:40:00.000Z'
  })
  const markdown = h.deps.domain.renderBriefMarkdown(brief)
  const figures = socialFiguresOf({ profile: await readPlaceProfile(h.pool, { opportunityId: opp.id }) })
  return { detail, listed, brief, markdown, figures }
}

// Dev 26/10/2026, opportunity 5a1e2b3c: after Research again and a new brief, the Instagram link saved with share
// tracking still sat in the candidate, the profile's socials and links, Google's website and the brief's figures line.
const TRACKED_IG = 'https://www.instagram.com/harbour.sportclub?igsh=ZmFrZXNoYXJlMDE&utm_source=qr'

test(
  'an old record shows its social links without share tracking on Details, in the list and in the brief',
  opts,
  async () => {
    const h = await fixture({
      ig: TRACKED_IG,
      candidate: { socials: { instagram: TRACKED_IG } },
      google: { website: TRACKED_IG, matchFacts: { website: TRACKED_IG } }
    })
    const shown = await shownOf(h)
    for (const [where, value] of Object.entries(shown))
      assert.ok(!/igsh=|utm_source=/.test(JSON.stringify(value)), `${where} carries no share tracking`)
    assert.equal(shown.detail.profile.socials.instagram, 'https://www.instagram.com/harbour.sportclub/')
    assert.equal(
      shown.detail.opportunity.candidate.socials.instagram,
      'https://www.instagram.com/harbour.sportclub/'
    )
    assert.deepEqual(
      shown.figures.map((f) => [f.platform, f.amount, f.url]),
      [['Instagram', 1819, 'https://www.instagram.com/harbour.sportclub/']]
    )
  }
)

// Dev 26/10/2026, opportunity 9c3d4e5f: after Research again the place no longer held magicpin as its website, but the
// candidate saved at paste time still did, so Details read "magicpin.com", the brief said `Website: https://magicpin.com/…`
// and the list kept magicpin's site check (performance 62).
test(
  'a listing URL saved as the candidate website is never the website on Details, in the list or the brief',
  opts,
  async () => {
    const h = await fixture()
    await requestResearch(h.pool, {
      accountId: h.accountId,
      opportunity: h.opportunity,
      requestId: 'again',
      again: h.deps
    })
    await h.drain()
    const stored = (
      await h.pool.query('select candidate from wo_opportunity where id = $1', [h.opportunity.id])
    ).rows[0].candidate
    assert.equal(stored.website, MAGICPIN, 'the stored row is as dev holds it: not rewritten')
    const shown = await shownOf(h)
    const candidate = shown.detail.opportunity.candidate
    assert.equal(candidate.website ?? null, null, 'Details: no website')
    assert.deepEqual(candidate.listings, [{ url: MAGICPIN, source: 'magicpin' }], 'still a listing')
    assert.equal(shown.listed.candidate.website ?? null, null, 'list: no website')
    assert.equal(shown.listed.siteCheck, null, 'list: no site check of magicpin')
    assert.equal(shown.detail.profile.pageSpeed, undefined, 'Details: no page speed')
    assert.equal(shown.brief.business.website, undefined, 'brief: no website')
    assert.ok(!/Website: .*magicpin/.test(shown.markdown), 'brief markdown: no magicpin website')
    assert.equal(
      shown.brief.agentDemoSnapshot?.opportunity?.candidate?.website ?? null,
      null,
      'brief snapshot: no website'
    )
  }
)
