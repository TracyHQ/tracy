import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { normalizeWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { createChargeable, createCostLedger } from 'website-opportunities/src/cost-ledger.js'
import { createExecutor } from 'website-opportunities/src/executor.js'
import {
  GOOGLE_MAPS_VERSION,
  googleMapsSourcesRequired,
  researchGoogleMaps
} from 'website-opportunities/src/google-maps-research.js'
import {
  googleMapsSerpapiCall,
  normalizeMapsReviews,
  supplementalMapsReviews
} from 'website-opportunities/src/google-maps-serpapi.js'
import { imageInfoWith } from 'website-opportunities/src/media-info.js'
import { requestResearch, resumeRequest } from 'website-opportunities/src/place-requests.js'
import { placeViewOf } from 'website-opportunities/src/place-view.js'
import { snapshotProfileOf } from 'website-opportunities/src/places.js'
import { createRevision } from '../src/opportunities-build/revisions.js'
import { insertOpportunity } from 'website-opportunities/src/store.js'
import { buildPlaced } from '../src/opportunities-build/build-store.js'
import { fileDb } from './_db.mjs'
import { createTracyWoHost } from '../src/wo-host.js'

const woHost = createTracyWoHost()
const imageInfo = imageInfoWith(woHost)

const PLACE_ID = 'ChIJMapsTest1',
  DATA_ID = '0x123:0x456',
  CATEGORY = 'ActualMenuId'
const CDN = 'https://lh3.googleusercontent.com/p/'
const MENU_LINK = 'https://places.singleplatform.com/phoba/menu?ref=google'
const REVIEW = {
  username: 'Lan',
  description: 'Exact guest opinion.',
  rating: 5,
  contributor_id: '138592309',
  user_thumbnail: `${CDN}avatar`,
  link: 'https://www.google.com/maps/reviews/data=review1',
  images: [{ thumbnail: `${CDN}review-photo` }],
  date_iso8601: '2026-10-20T12:00:00Z'
}
const response = (body) => Response.json(body)
const metadata = { status: 'Success' }
const placePayload = (id = PLACE_ID) => ({
  search_metadata: metadata,
  place_results: {
    place_id: id,
    data_id: DATA_ID,
    title: 'Pho Ba',
    menu: { link: MENU_LINK, source: 'places.singleplatform.com' },
    user_reviews: { most_relevant: [REVIEW] }
  }
})
const photosPayload = (kind = 'menu', count = 20) => ({
  search_metadata: metadata,
  search_parameters: { data_id: DATA_ID, ...(kind === 'menu' ? { category_id: CATEGORY } : {}) },
  categories: [{ title: 'Menu', id: CATEGORY }],
  photos: Array.from({ length: count }, (_, i) => ({
    image: `${CDN}${kind}-${i}`,
    thumbnail: `${CDN}thumb-${i}`
  }))
})

test('Maps adapter binds exact place/category IDs, normalizes linked reviews and never follows pagination', async () => {
  const seen = []
  const run = (op, body) =>
    googleMapsSerpapiCall(
      op,
      { placeId: PLACE_ID, dataId: DATA_ID, categoryId: CATEGORY },
      {
        key: 'private-test',
        fetch: async (url, init) => {
          seen.push(new URL(url))
          assert.equal(init.redirect, 'error')
          return response(body)
        }
      }
    )
  await assert.rejects(run('place', placePayload('other-place')), { code: 'INVALID_RESPONSE' })
  await assert.rejects(
    run('menu', { ...photosPayload(), search_parameters: { data_id: '0x111:0x222', category_id: CATEGORY } }),
    { code: 'INVALID_RESPONSE' }
  )
  await assert.rejects(run('menu', { error: 'private quota message', search_metadata: metadata }), {
    code: 'APPLICATION_ERROR'
  })
  const place = await run('place', placePayload())
  assert.equal(place.reviews[0].authorAvatarUrl, `${CDN}avatar`)
  assert.equal(place.reviews[0].photos[0].reviewId, place.reviews[0].id)
  const photos = await run('menu', {
    ...photosPayload('menu', 25),
    serpapi_pagination: { next: 'https://evil.test/' }
  })
  assert.equal(photos.photos.length, 20)
  const query = seen.at(-1).searchParams
  assert.equal(query.get('category_id'), CATEGORY)
  assert.equal(query.has('q'), false)
  assert.equal(query.has('next_page_token'), false)
  assert.equal(query.has('no_cache'), false)
  assert.equal(
    supplementalMapsReviews(place.reviews, [{ author: 'Lan', text: REVIEW.description }]).length,
    0
  )
  assert.equal(
    normalizeMapsReviews([{ ...REVIEW, images: [{ thumbnail: 'https://evil.test/image' }] }], PLACE_ID)[0]
      .photos.length,
    0
  )
  assert.deepEqual(googleMapsSourcesRequired({ keys: { serpapi: 'key' }, settings: {} }), {
    'google-maps': GOOGLE_MAPS_VERSION
  })
})

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
const one = async (pool, sql, params) => (await pool.query(sql, params)).rows[0]
async function drain(ex) {
  for (let i = 0; i < 20; i++) {
    const { claimed, done } = await ex.tick()
    if (!claimed) return
    await done
  }
}
async function fixture({
  cap = { value: 1000 },
  failure = null,
  noCategory = false,
  emptyMenu = false,
  hook = null,
  extraSettings = {}
} = {}) {
  const { pool } = db
  const accountId = (
    await pool.query("insert into account(email) values('maps-menu@tracy.test') returning id")
  ).rows[0].id
  const { row: opportunity } = await insertOpportunity(pool, accountId, {
    name: 'Pho Ba',
    provider: 'google-places',
    providerId: PLACE_ID,
    candidate: { provider: 'google-places', providerId: PLACE_ID, name: 'Pho Ba' }
  })
  const real = await websiteOpportunitiesDomain()
  const calls = [],
    downloads = [],
    puts = []
  let googleCalls = 0,
    clock = Date.now()
  const blocked = { available: false, collect: async () => ({ status: 'blocked', media: [] }) }
  const domain = {
    ...real,
    connectorsFor: () =>
      Object.fromEntries(['website', 'facebook', 'instagram', 'tiktok', 'youtube'].map((s) => [s, blocked])),
    fetchPlaceDetails: async () => {
      googleCalls++
      return {
        id: PLACE_ID,
        displayName: { text: 'Pho Ba' },
        reviews: [
          {
            authorAttribution: {
              displayName: 'Official author',
              uri: 'https://www.google.com/maps/contrib/999',
              photoUri: `${CDN}official-avatar`
            },
            text: { text: 'Official review stays unchanged.' }
          }
        ]
      }
    },
    fetchLimited: async (url) => {
      downloads.push(url)
      return {
        url,
        status: 200,
        mime: 'image/png',
        bytes: await sharp(png)
          .modulate({ brightness: 0.5 + downloads.length / 100 })
          .png()
          .toBuffer()
      }
    }
  }
  const settings = {
    ...normalizeWoOpsSettings({ pageSpeedCheckEnabled: false, googlePlacesPhotos: false }),
    tripadvisorReviews: false,
    ...extraSettings
  }
  const runtime = async () => ({ keys: { google: 'test-google', serpapi: 'test-serp' }, settings })
  const ledger = createCostLedger({
    pool,
    now: () => clock,
    caps: async () => ({ dailyCapCents: cap.value, jobCapCents: cap.value })
  })
  const ex = createExecutor({
    host: woHost,
    pool,
    shared: true,
    now: () => clock,
    loadDomain: async () => domain,
    runtime,
    chargeable: createChargeable(ledger),
    apiFetch: async (url) => {
      const q = new URL(url).searchParams
      const operation =
        q.get('engine') === 'google_maps' ? 'place' : q.has('category_id') ? 'menu' : 'overview'
      calls.push(operation)
      if (hook) await hook(operation)
      if (failure === operation) return new Response('{}', { status: 429 })
      if (failure?.operation === operation)
        return response({ search_metadata: metadata, error: `Invalid ${failure.parameter} parameter` })
      if (operation === 'place') return response(placePayload())
      const body = photosPayload(operation, emptyMenu && operation === 'menu' ? 0 : 20)
      if (noCategory) body.categories = []
      return response(body)
    },
    objects: {
      put: async (key) => {
        puts.push(key)
        return true
      }
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
    requestResearch(pool, {
      accountId,
      opportunity,
      requestId,
      requiredSources: googleMapsSourcesRequired(awaitableRuntime()),
      now: () => clock,
      ...extra
    })
  function awaitableRuntime() {
    return { keys: { serpapi: 'test-serp' }, settings }
  }
  return {
    pool,
    accountId,
    opportunity,
    ex,
    calls,
    downloads,
    puts,
    domain,
    research,
    cap,
    advance: (days) => {
      clock += days * 86400000
    },
    googleCalls: () => googleCalls,
    fail: (value) => {
      failure = value
    }
  }
}

test(
  'menu photos switched off on /ops/wo: no SerpApi menu call, place and overview still run',
  opts,
  async () => {
    const h = await fixture({ extraSettings: { providerOrder: { 'menu-photos': [] } } })
    await h.research('off')
    await drain(h.ex)
    assert.deepEqual(h.calls, ['place', 'overview'])
    const maps = (await placeViewOf(h.pool, h.opportunity)).profile.reviewSources.googleMaps
    assert.deepEqual(maps.menuPhotos ?? [], [])
  }
)

test(
  'shared Research collects menu20 separately, preserves official Google and carries menu sources to brief/demo',
  opts,
  async () => {
    const h = await fixture()
    await h.research('first')
    await drain(h.ex)
    assert.deepEqual(h.calls, ['place', 'overview', 'menu'])
    const view = await placeViewOf(h.pool, h.opportunity)
    const maps = view.profile.reviewSources.googleMaps
    assert.equal(maps.menuPhotos.length, 20)
    assert.ok(maps.menuPhotos.every((photo) => photo.mediaId))
    assert.equal(view.profile.googlePlace.reviews[0].author, 'Official author')
    assert.equal(maps.reviews[0].author, 'Lan')
    assert.deepEqual(maps.menuLink, { url: MENU_LINK, source: 'places.singleplatform.com' })
    assert.deepEqual(
      ((await snapshotProfileOf(h.pool, view.snapshot.id)).profile.menus ?? []).filter(
        (m) => m.url === MENU_LINK
      ),
      [{ url: MENU_LINK, source: 'google-maps' }],
      'the menu link Google lists reaches the profile once, tagged as a Maps link'
    )
    assert.equal(h.downloads.includes(`${CDN}avatar`), false)
    assert.equal(
      view.sources.some((source) => source.source === 'google-maps'),
      false
    )
    const stored = (await h.pool.query("select * from wo_place_media where source='google-maps'")).rows
    assert.equal(stored.filter((media) => media.category === 'menu').length, 20)
    assert.ok(stored.every((media) => media.credit.provider === 'Google' && media.provider === 'serpapi'))
    const templates = {
      cards: [
        {
          id: 'ja-restaurant',
          label: 'Restaurant',
          platforms: [{ platform: 'joomla', tag: 'ja-restaurant/j6', version: '2.0.1' }]
        }
      ]
    }
    const made = await createRevision(h.pool, {
      accountId: h.accountId,
      opportunityId: h.opportunity.id,
      domain: h.domain,
      templates
    })
    assert.ok(made.revision, JSON.stringify(made))
    assert.equal(made.revision.brief.reviewSources.googleMaps.menuPhotos.length, 20)
    assert.ok(made.revision.brief_md.includes('Photographed menu sources'))
    assert.ok(made.revision.brief_md.includes('collected data, shown as read and never replaced'))
    assert.equal(made.revision.asset_manifest.filter((m) => m.category === 'menu').length, 20)
    assert.ok(
      made.revision.asset_manifest
        .filter((m) => m.category === 'menu')
        .every((m) => m.credit.provider === 'Google')
    )
    assert.ok(
      made.revision.brief.sitemap
        .flatMap((p) => p.sections)
        .filter((s) => s.kind === 'hero')
        .every((s) => s.assetIds.every((id) => !maps.menuPhotos.some((photo) => photo.mediaId === id)))
    )
    assert.equal(
      (await buildPlaced(h.pool, h.accountId, made.revision)).length,
      made.revision.asset_manifest.length
    )
    await h.research('fresh')
    await drain(h.ex)
    assert.equal(h.calls.length, 3, 'fresh makes zero provider calls')
    await h.pool.query(
      "update wo_place_snapshot_source set collected_at=collected_at-interval '31 days',attempted_at=attempted_at-interval '31 days' where source='google-maps'"
    )
    await h.research('refresh')
    await drain(h.ex)
    assert.deepEqual(
      h.calls,
      ['place', 'overview', 'menu', 'menu'],
      'cached identifiers refresh the menu with one call'
    )
    assert.equal(
      h.googleCalls(),
      1,
      'fresh official Google is not refreshed for an expired optional Maps source'
    )
  }
)

test(
  'negative menu cache and empty menu do not trigger extra searches or overwrite previous good data',
  opts,
  async () => {
    const h = await fixture({ noCategory: true })
    await h.research('no-menu')
    await drain(h.ex)
    assert.deepEqual(h.calls, ['place', 'overview'])
    await h.research('no-menu-fresh')
    await drain(h.ex)
    assert.equal(h.calls.length, 2)
    assert.equal(
      (await placeViewOf(h.pool, h.opportunity)).profile.reviewSources.googleMaps.cache.categoryId,
      null
    )
  }
)

test(
  'menu budget refusal resumes cached place and category without paying for them twice',
  opts,
  async () => {
    const h = await fixture({ cap: { value: 9 } })
    const { job } = await h.research('budget')
    await drain(h.ex)
    assert.deepEqual(h.calls, ['place', 'overview'])
    assert.equal(
      (await one(h.pool, "select * from wo_place_job where state='paused'")).last_error.source,
      'google-maps'
    )
    h.cap.value = 100
    await resumeRequest(h.pool, h.accountId, job.id, { shared: true })
    await drain(h.ex)
    assert.deepEqual(h.calls, ['place', 'overview', 'menu'])
    assert.equal(
      (await one(h.pool, "select count(*)::int n from wo_cost_ledger where provider='serpapi'")).n,
      3
    )
  }
)

test(
  'optional menu quota failure keeps successful place checkpoints and stays silent to the customer',
  opts,
  async () => {
    const h = await fixture({ failure: 'menu' })
    await h.research('quota')
    await drain(h.ex)
    const view = await placeViewOf(h.pool, h.opportunity)
    assert.equal(view.profile.reviewSources.googleMaps.reviews.length, 1)
    assert.equal(view.profile.googlePlace.reviews[0].author, 'Official author')
    assert.equal(
      view.sources.some((s) => s.reason === 'HTTP_429'),
      false
    )
    assert.equal(
      (await one(h.pool, "select last_error from wo_place_snapshot_source where source='google-maps'"))
        .last_error.reason,
      'HTTP_429'
    )
  }
)

test(
  'a failed menu refresh preserves old content freshness and retry delay instead of marking old menus fresh',
  opts,
  async () => {
    const h = await fixture()
    await h.research('good')
    await drain(h.ex)
    h.advance(31)
    h.fail('menu')
    const old = await one(h.pool, "select * from wo_place_snapshot_source where source='google-maps'")
    const goodMenu = (await placeViewOf(h.pool, h.opportunity)).profile.reviewSources.googleMaps.menuPhotos
    await h.research('refresh-fails')
    await drain(h.ex)
    const source = await one(
      h.pool,
      "select s.* from wo_place_snapshot_source s join wo_place p on p.current_snapshot_id=s.snapshot_id where s.source='google-maps'"
    )
    assert.equal(source.collected_at.toISOString(), old.collected_at.toISOString())
    assert.equal(source.collector_version, 'google-maps-0')
    assert.equal(source.last_error.reason, 'HTTP_429')
    assert.deepEqual(
      (await placeViewOf(h.pool, h.opportunity)).profile.reviewSources.googleMaps.menuPhotos,
      goodMenu
    )
    const calls = h.calls.length
    await h.research('retry-too-soon')
    await drain(h.ex)
    assert.equal(h.calls.length, calls)
  }
)

test(
  'customer Research API enriches a fresh Google snapshot with menu sources and repeated requests use the cache',
  opts,
  async () => {
    const h = await fixture()
    await h.research('initial')
    await drain(h.ex)
    await h.pool.query(
      "update wo_place_snapshot_source set collected_at=collected_at-interval '31 days',attempted_at=attempted_at-interval '31 days' where source='google-maps'"
    )
    await h.pool.query(
      "insert into ui_setting(id,overrides,updated_by) values(true,'{\"website-opportunities\":true}'::jsonb,'test') on conflict(id) do update set overrides=excluded.overrides"
    )
    await h.pool.query(
      `insert into wo_ops_setting(id,settings,updated_by) values(true,'{"tripadvisorReviews":false,"pageSpeedCheckEnabled":false}'::jsonb,'test') on conflict(id) do update set settings=excluded.settings`
    )
    const origin = 'http://tracy.test:8080'
    const config = readConfig({
      TRACY_ORIGIN: origin,
      SITE_DOMAIN: 'localhost',
      SESSION_SECRET: 's'.repeat(32),
      HOSTS: 'local',
      HOST_local_ORIGIN: 'http://tracy-host.test',
      HOST_local_DSH_ORIGIN: 'http://dsh.test',
      HOST_local_SECRET: 'h',
      SEAT_local_SECRET: 'k',
      SERPAPI_API_KEY: 'test-serp'
    })
    const app = buildApp({
      config,
      pool: h.pool,
      mail: { send: async () => {} },
      websiteOpportunitiesDomain: async () => h.domain,
      fetchImpl: async () => Response.json({}, { status: 500 })
    })
    const cookie = `tracy_sess=${await mintSession('maps-menu@tracy.test', config.sessionSecret)}`
    const call = (method, path, body) =>
      app.fetch(
        new Request(`${origin}/api/website-opportunities${path}`, {
          method,
          headers: { origin, cookie, 'content-type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {})
        })
      )
    const start = await call('POST', `/${h.opportunity.id}/research`, { requestId: 'user-menu-refresh' })
    assert.equal(start.status, 202)
    await drain(h.ex)
    assert.deepEqual(h.calls, ['place', 'overview', 'menu', 'menu'])
    assert.equal(h.googleCalls(), 1)
    const detail = await (await call('GET', `/${h.opportunity.id}`)).json()
    assert.equal(detail.profile.reviewSources.googleMaps.menuPhotos.length, 20)
    assert.ok(detail.media.some((media) => media.category === 'menu'))
    assert.equal(detail.profile.googlePlace.reviews[0].author, 'Official author')
    const again = await call('POST', `/${h.opportunity.id}/research`, { requestId: 'user-menu-cached' })
    assert.equal(again.status, 202)
    await drain(h.ex)
    assert.equal(h.calls.length, 4)
  }
)

test(
  'explicit expired identifier errors reset only the affected cache; generic quota does not invalidate it',
  opts,
  async () => {
    const h = await fixture()
    await h.research('good-identifiers')
    await drain(h.ex)
    h.advance(31)
    h.fail({ operation: 'menu', parameter: 'category_id' })
    await h.research('category-expired')
    await drain(h.ex)
    let source = (await placeViewOf(h.pool, h.opportunity)).profile.reviewSources.googleMaps
    assert.equal(source.cache.categoryId, undefined)
    assert.equal(source.cache.dataId, DATA_ID)
    assert.equal(source.menuPhotos.length, 20)
    h.fail(null)
    h.advance(2)
    await h.research('category-recovered')
    await drain(h.ex)
    assert.deepEqual(h.calls, ['place', 'overview', 'menu', 'menu', 'overview', 'menu'])
    h.fail({ operation: 'menu', parameter: 'data_id' })
    h.advance(31)
    await h.research('data-expired')
    await drain(h.ex)
    source = (await placeViewOf(h.pool, h.opportunity)).profile.reviewSources.googleMaps
    assert.equal(source.cache.dataId, undefined)
    assert.equal(source.cache.categoryId, undefined)
    h.fail(null)
    h.advance(2)
    await h.research('data-recovered')
    await drain(h.ex)
    assert.deepEqual(h.calls.slice(-3), ['place', 'overview', 'menu'])
  }
)

test(
  'null author links are not a duplicate identity and empty menu is a valid cached result',
  opts,
  async () => {
    const normalized = normalizeMapsReviews([REVIEW], PLACE_ID)
    assert.equal(
      supplementalMapsReviews(
        [{ ...normalized[0], authorUrl: null }],
        [{ author: 'Another reviewer', authorUri: null, text: REVIEW.description }]
      ).length,
      1
    )
    const h = await fixture({ emptyMenu: true })
    await h.research('empty-menu')
    await drain(h.ex)
    assert.deepEqual(h.calls, ['place', 'overview', 'menu'])
    assert.deepEqual(
      (await placeViewOf(h.pool, h.opportunity)).profile.reviewSources.googleMaps.menuPhotos,
      []
    )
    await h.research('cached-empty-menu')
    await drain(h.ex)
    assert.equal(h.calls.length, 3)
  }
)

test(
  'non-Google places ignore the Maps freshness requirement instead of creating an unfulfillable research loop',
  opts,
  async () => {
    const h = await fixture()
    const { row } = await insertOpportunity(h.pool, h.accountId, {
      name: 'Own URL',
      provider: 'url',
      providerId: 'https://own.example/',
      candidate: { website: 'https://own.example/' }
    })
    assert.ok(row.place_id)
    const snapshot = (
      await h.pool.query(
        "insert into wo_place_snapshot(place_id,state,published_at) values($1,'published',$2) returning id",
        [row.place_id, new Date()]
      )
    ).rows[0].id
    await h.pool.query('update wo_place set current_snapshot_id=$2 where id=$1', [row.place_id, snapshot])
    const result = await requestResearch(h.pool, {
      accountId: h.accountId,
      opportunity: row,
      requestId: 'url-fresh',
      requiredSources: { 'google-maps': GOOGLE_MAPS_VERSION }
    })
    assert.equal(result.job.state, 'completed')
    assert.equal(h.calls.length, 0)
  }
)

test('a response arriving after the lease changes cannot publish menu images', opts, async () => {
  let h
  h = await fixture({
    hook: async (operation) => {
      if (operation === 'menu')
        await h.pool.query("update wo_place_job set lease_token=lease_token+1 where state='running'")
    }
  })
  await h.research('stale-menu-response')
  await drain(h.ex)
  assert.equal(
    (await one(h.pool, 'select current_snapshot_id from wo_place where id=$1', [h.opportunity.place_id]))
      .current_snapshot_id,
    null
  )
  assert.equal((await one(h.pool, 'select count(*)::int n from wo_place_media')).n, 0)
})

test('website-only research starts no Maps requests and campaign control errors propagate before billing', async () => {
  let calls = 0
  const deps = {
    now: Date.now,
    chargeable: async () => {
      calls++
      throw new Error('must not bill')
    }
  }
  await researchGoogleMaps({ prefetch: true }, deps)
  await researchGoogleMaps({ job: { research_mode: 'website' } }, deps)
  await assert.rejects(
    researchGoogleMaps(
      {
        job: { id: 'test' },
        place: { id: 'place' },
        keys: { serpapi: 'test' },
        settings: {},
        identity: { namespace: 'google', external_id: PLACE_ID },
        lease: { token: '1' },
        pausePoint: async () => {
          throw Object.assign(new Error('stopped'), { code: 'PREFETCH_STOPPED' })
        }
      },
      deps
    ),
    { code: 'PREFETCH_STOPPED' }
  )
  assert.equal(calls, 0)
})

test('every review the Maps lookup returned is kept, past five', () => {
  const many = Array.from({ length: 8 }, (_, i) => ({
    ...REVIEW,
    username: `Guest ${i}`,
    link: `https://www.google.com/maps/reviews/data=review${i}`
  }))
  assert.equal(normalizeMapsReviews(many, PLACE_ID).length, 8)
})
