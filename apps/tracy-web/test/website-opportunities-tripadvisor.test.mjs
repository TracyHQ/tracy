import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  litescrapeCall,
  matchTripadvisor,
  tripadvisorPlace,
  tripadvisorReviews,
  TRIPADVISOR_VERSION
} from 'website-opportunities/src/tripadvisor.js'
import { snapshotDue, snapshotFresh, sourceDue } from 'website-opportunities/src/places.js'
import { addReviewSources, renderBriefWithReviews } from 'website-opportunities/src/review-sources.js'
import { briefOf } from '../src/opportunities-build/demo-qa.js'

const google = {
  name: 'Pho Ba',
  address: '12 River Road',
  phone: '+84 135550109',
  lat: 10,
  lon: 106,
  website: 'https://phoba.example'
}
const place = { ...google, placeId: '123', url: 'https://www.tripadvisor.com/Restaurant_Review-d123.html' }
const response = (body, status = 200) => new Response(JSON.stringify(body), { status })

test('branch matching needs corroborating facts, rejects ambiguity and phone conflicts', () => {
  assert.equal(matchTripadvisor(google, [place]).status, 'matched')
  assert.equal(matchTripadvisor(google, [place, { ...place, placeId: '456' }]).status, 'ambiguous')
  assert.equal(matchTripadvisor(google, [place], { truncated: true }).status, 'ambiguous')
  for (const p of [
    { ...place, address: 'Other address', phone: null },
    { ...place, lat: 12, lon: 108 },
    { ...place, phone: '+84 987654321' },
    { ...place, name: 'Another restaurant' }
  ])
    assert.equal(matchTripadvisor(google, [p], { allowBrand: false }).status, 'not_found')
  assert.equal(
    matchTripadvisor({ ...google, lat: null }, [place]).status,
    'matched',
    'missing coordinates requires exact address and phone'
  )
  assert.equal(
    matchTripadvisor({ ...google, lat: null, phone: null }, [place], { allowBrand: false }).status,
    'not_found'
  )
})

test('normalization preserves verbatim reviews, provenance and deduplicates source ids', () => {
  assert.equal(
    tripadvisorPlace({ place_id: 123, title: 'Pho Ba', gps_coordinates: { latitude: 10, longitude: 106 } })
      .placeId,
    '123'
  )
  const row = {
    id: 100,
    text: 'Lovely pho\nwith herbs.',
    user: { name: 'Lan' },
    rating: 5,
    published_date: '2026-10-20',
    language: 'en'
  }
  const reviews = tripadvisorReviews([row, row, { id: 2, text: 'No author' }], {
    fetchedAt: '2026-10-21',
    placeUrl: place.url
  })
  assert.equal(reviews.length, 1)
  assert.equal(reviews[0].text, row.text)
  assert.equal(reviews[0].source, 'tripadvisor')
  assert.equal(reviews[0].url, place.url)
  assert.equal(reviews[0].author, 'Lan')
})

test('adapter restricts endpoint, bearer headers and review bounds without redirects; retries only 429 and 5xx', async () => {
  let calls = 0
  const got = await litescrapeCall(
    'reviews',
    { place_id: '123', num: '10', translate: 'false', sort_by: 'recent' },
    {
      key: 'private-key',
      fetch: async (url, init) => {
        calls++
        assert.equal(new URL(url).origin, 'https://api.litescrape.com')
        assert.equal(new URL(url).searchParams.get('translate'), 'false')
        assert.ok(!url.includes('private-key'))
        assert.equal(init.headers.authorization, 'Bearer private-key')
        assert.equal(init.redirect, 'error')
        return response({ reviews: [] })
      }
    }
  )
  assert.deepEqual(got, [])
  assert.equal(calls, 1)
  await assert.rejects(litescrapeCall('not-allowed', {}, { key: 'private-key' }), {
    code: 'INVALID_OPERATION'
  })
  // 401 and 402 (paid quota spent) are final; a 429 or 5xx is tried again, within the wait budget.
  for (const [status, tries] of [
    [401, 1],
    [402, 1],
    [429, 3],
    [500, 3],
    [503, 3]
  ]) {
    let attempts = 0
    const waits = []
    await assert.rejects(
      litescrapeCall(
        'search',
        {},
        {
          key: 'private-key',
          retry: { sleep: async (ms) => void waits.push(ms) },
          fetch: async () => {
            attempts++
            return response({ secret: 'private-key' }, status)
          }
        }
      ),
      { code: `HTTP_${status}` }
    )
    assert.equal(attempts, tries, `HTTP ${status}`)
    assert.equal(waits.length, tries - 1)
  }
  for (const body of [{}, { reviews: null }, { error: 'provider secret', reviews: [] }])
    await assert.rejects(
      litescrapeCall('reviews', {}, { key: 'private-key', fetch: async () => response(body) }),
      { code: 'INVALID_RESPONSE' }
    )
  await assert.rejects(
    litescrapeCall('search', {}, { key: 'private-key', fetch: async () => new Response('not json') }),
    { code: 'INVALID_JSON' }
  )
  await assert.rejects(
    litescrapeCall(
      'search',
      {},
      { key: 'private-key', fetch: async () => new Response('x'.repeat(2 * 1024 * 1024 + 1)) }
    ),
    { code: 'BODY_LIMIT' }
  )
  await assert.rejects(
    litescrapeCall(
      'search',
      {},
      {
        key: 'private-key',
        timeoutMs: 1,
        fetch: async (_u, { signal }) =>
          new Promise((_r, reject) =>
            signal.addEventListener('abort', () => reject(new Error('private-key')))
          )
      }
    ),
    { code: 'TIMEOUT' }
  )
})

test('fresh snapshot is enriched for a newly enabled source, cached retries respect existing TTL', () => {
  const now = Date.now()
  const snapshot = { state: 'published', published_at: new Date(now), sources: [] }
  const required = { tripadvisor: TRIPADVISOR_VERSION }
  assert.equal(snapshotFresh(snapshot, now), true)
  assert.equal(snapshotFresh(snapshot, now, required), false)
  const row = {
    source: 'tripadvisor',
    attempted_at: new Date(now),
    coverage: { version: TRIPADVISOR_VERSION }
  }
  assert.equal(sourceDue(row, now, TRIPADVISOR_VERSION), false)
  const failedVersion = {
    ...row,
    collected_at: new Date(now),
    collector_version: 'older',
    coverage: null,
    last_error: { version: TRIPADVISOR_VERSION }
  }
  assert.equal(sourceDue(failedVersion, now, TRIPADVISOR_VERSION), false)
  assert.equal(sourceDue(failedVersion, now + 2 * 86400000, TRIPADVISOR_VERSION), true)
  snapshot.sources.push(row)
  // A try that collected nothing is not fresh data, but its retry waits out the TTL (`snapshotDue`).
  assert.equal(snapshotFresh(snapshot, now, required), false)
  assert.equal(snapshotDue(snapshot, now, required), false)
  assert.equal(snapshotDue(snapshot, now + 2 * 86400000, required), true)
  assert.equal(
    snapshotFresh(snapshot, now + 2 * 86400000),
    true,
    'turning the optional provider off ignores its stale row'
  )
  assert.equal(snapshotDue(snapshot, now + 2 * 86400000), false)
})

test('TripAdvisor reaches brief, re-rendered handoff and QA while opinions remain outside business evidence', () => {
  const quote = 'We thought the wood fired oven was wonderful and the service was friendly'
  const source = {
    ...place,
    attribution: 'TripAdvisor',
    fetchedAt: '2026-10-21',
    reviews: [{ id: '100', source: 'tripadvisor', author: 'Lan', text: quote, url: place.url }]
  }
  const brief = addReviewSources(
    { business: { name: 'Pho Ba' }, googlePlace: { reviews: [{ text: 'Google quote', author: 'An' }] } },
    { reviewSources: { tripadvisor: source } }
  )
  const md = renderBriefWithReviews({ renderBriefMarkdown: () => '# Pho Ba' }, brief)
  assert.ok(md.includes(quote))
  assert.ok(md.includes('TripAdvisor'))
  assert.ok(md.includes(place.url))
  const qa = briefOf({ brief, brief_md: md })
  assert.ok(!qa.briefText.includes(quote))
  assert.equal(qa.googleReviewTestimonials.find((r) => r.provider === 'TripAdvisor').author, 'Lan')
  assert.equal(qa.googleReviewTestimonials.find((r) => !r.provider).text, 'Google quote')
})

test('observed Mizuren branch disagreement permits a brand source without claiming branch identity', () => {
  const google = {
    name: 'Mizuren Authentic Japanese Restaurant',
    website: 'https://mizurendubai.example/',
    phone: '+971 58 555 0179',
    address: 'Umm Hurrair - 1 شارع السيف - Bur Dubai - Umm Hurair 1 - دبي - United Arab Emirates',
    lat: 25.258894,
    lon: 55.3138445
  }
  const tripadvisor = {
    placeId: '25261234',
    name: google.name,
    website: google.website,
    phone: '+971 58 555 0196',
    address: 'Al Seef Street, Building 12 Al Seef, Dubai 35449 United Arab Emirates',
    lat: 25.258917,
    lon: 55.31373
  }
  const result = matchTripadvisor(google, [tripadvisor])
  assert.equal(result.status, 'matched')
  assert.equal(result.scope, 'brand')
  assert.equal(result.branchVerified, false)
  assert.equal(result.candidates[0].website, true)
  assert.ok(result.candidates[0].distanceM < 20)
  assert.equal(result.candidates[0].phone, false)
})

test('website-only prefetch never calls paid enrichment and campaign control errors propagate', async () => {
  const { researchTripadvisor } = await import('website-opportunities/src/tripadvisor-research.js')
  const ctx = {
    job: { id: 'job', research_mode: 'website' },
    keys: { rapidapi: 'test', litescrape: 'test' },
    settings: {},
    lease: { token: '1' },
    place: { id: 'place' },
    pausePoint: async () => false
  }
  await researchTripadvisor(ctx, {
    chargeable: async () => {
      throw new Error('must not call')
    }
  })
  ctx.job.research_mode = 'full'
  for (const code of ['STALE_LEASE', 'PREFETCH_STOPPED', 'SOURCE_START_UNKNOWN', 'CHARGE_SPENT']) {
    const error = Object.assign(new Error('control'), { code })
    await assert.rejects(
      researchTripadvisor(ctx, {
        now: Date.now,
        google: { name: 'Pho Ba', matchFacts: google },
        chargeable: async () => {
          throw error
        }
      }),
      (caught) => caught === error
    )
  }
})

test('OneAPI uses documented RapidAPI endpoints and rejects application errors inside HTTP 200', async () => {
  const { oneapiTripadvisorCall } = await import('website-opportunities/src/tripadvisor-oneapi.js')
  const calls = []
  const one = {
    locationId: 123,
    name: 'Pho Ba',
    latitude: 10,
    longitude: 106,
    officialUrl: google.website,
    tripadvisorUrl: place.url
  }
  const fetch = async (url, init) => {
    const u = new URL(url)
    calls.push(u)
    assert.equal(u.hostname, 'tripadvisor-api1.p.rapidapi.com')
    assert.equal(init.headers['x-rapidapi-host'], u.hostname)
    assert.equal(init.headers['x-rapidapi-key'], 'private-key')
    assert.equal(init.redirect, 'error')
    assert.ok(!url.includes('private-key'))
    if (u.pathname === '/autocomplete')
      return response({ message: 'Success', source: 'tripadvisor.com', searchResults: [one] })
    if (u.pathname === '/details_byid')
      return response({ message: 'Success', source: 'tripadvisor.com', detail: one })
    return response({
      message: 'Success',
      source: 'tripadvisor.com',
      reviews: [
        {
          reviewId: 42,
          locationId: 123,
          text: 'Great pho!',
          author: 'Lan',
          publishedDate: '1 month ago',
          rating: 5
        }
      ]
    })
  }
  const options = { key: 'private-key', fetch }
  assert.equal(
    (await oneapiTripadvisorCall('search', { q: 'Pho Ba River Road' }, options))[0].place_id,
    '123'
  )
  assert.equal(calls[0].searchParams.get('input'), 'Pho Ba River Road')
  assert.equal(calls[0].searchParams.get('searchType'), 'Restaurants')
  const detail = await oneapiTripadvisorCall('place', { place_id: '123' }, options)
  assert.equal(detail.phone, undefined, 'absent branch facts are never invented')
  assert.equal(detail.address, undefined)
  const rows = await oneapiTripadvisorCall('reviews', { place_id: '123' }, options)
  const normalized = tripadvisorReviews(rows, { fetchedAt: '2026-10-21', placeUrl: detail.link })
  assert.equal(normalized[0].date, '1 month ago')
  assert.equal(normalized[0].text, 'Great pho!')
  assert.equal(normalized[0].url, place.url)
  assert.equal(calls[2].searchParams.get('contentType'), 'RESTAURANT')
  assert.equal(calls[2].searchParams.get('sortOrder'), 'Newest')
  assert.equal(calls[2].searchParams.get('resultCount'), '10')
  assert.equal(calls[2].searchParams.get('page'), '1')
  for (const message of [
    '500: typeahead error: PersistedQueryNotFound',
    '404: locationId required',
    'Unauthorized',
    'Quota exceeded'
  ]) {
    await assert.rejects(
      oneapiTripadvisorCall(
        'search',
        { q: 'Pho Ba' },
        {
          key: 'private-key',
          fetch: async () => response({ message, source: 'tripadvisor.com', searchResults: [] })
        }
      ),
      { code: 'APPLICATION_ERROR' }
    )
  }
  await assert.rejects(
    oneapiTripadvisorCall(
      'place',
      { place_id: '123' },
      {
        key: 'private-key',
        fetch: async () =>
          response({ message: 'Success', source: 'tripadvisor.com', detail: { ...one, locationId: 456 } })
      }
    ),
    { code: 'INVALID_RESPONSE' }
  )
  await assert.rejects(
    oneapiTripadvisorCall(
      'reviews',
      { place_id: '123' },
      {
        key: 'private-key',
        fetch: async () =>
          response({ message: 'Success', source: 'tripadvisor.com', reviews: [{ locationId: 456 }] })
      }
    ),
    { code: 'INVALID_RESPONSE' }
  )
})

test('TripAdvisor freshness accepts either provider key and neither key makes no enrichment call', async () => {
  const { reviewSourcesRequired, researchTripadvisor } = await import(
    'website-opportunities/src/tripadvisor-research.js'
  )
  for (const keys of [{ serpapi: 'private' }, { rapidapi: 'private' }, { litescrape: 'private' }])
    assert.deepEqual(reviewSourcesRequired({ keys, settings: {} }), {
      ...(keys.serpapi ? { 'google-maps': 'google-maps-1' } : {}),
      tripadvisor: TRIPADVISOR_VERSION
    })
  assert.deepEqual(reviewSourcesRequired({ keys: {}, settings: {} }), {})
  assert.deepEqual(
    reviewSourcesRequired({ keys: { rapidapi: 'private' }, settings: { tripadvisorReviews: false } }),
    {}
  )
  await researchTripadvisor(
    { keys: {}, settings: {}, job: {} },
    { chargeable: async () => assert.fail('no key must not charge') }
  )
})

test('SerpApi validates application errors, exact place echo and bounded engine parameters', async () => {
  const { serpapiTripadvisorCall, serpapiCoordinates } = await import(
    'website-opportunities/src/tripadvisor-serpapi.js'
  )
  const calls = []
  const base = { search_metadata: { status: 'Success' }, search_parameters: { place_id: '123' } }
  const run = (operation, body) =>
    serpapiTripadvisorCall(
      operation,
      { place_id: '123', q: 'Pho Ba', lat: '10', lon: '106' },
      {
        key: 'private-test-key',
        fetch: async (url) => {
          calls.push(new URL(url))
          return response(body)
        }
      }
    )
  await assert.rejects(run('search', { error: 'Quota exceeded' }), { code: 'APPLICATION_ERROR' })
  await assert.rejects(
    run('place', { ...base, search_parameters: { place_id: '456' }, place_result: { name: 'Pho Ba' } }),
    { code: 'INVALID_RESPONSE' }
  )
  const detail = await run('place', {
    ...base,
    place_result: {
      name: 'Pho Ba',
      phone: google.phone,
      address_link: 'https://maps.google.com/maps?daddr=River@10,106',
      images: []
    }
  })
  assert.equal(detail.place_id, '123')
  assert.equal(detail.latitude, 10)
  assert.deepEqual(detail.images, [])
  assert.deepEqual(serpapiCoordinates('https://maps.google.com/maps?daddr=River@91,106'), {})
  assert.deepEqual(serpapiCoordinates('https://maps.google.com.evil.test/maps?daddr=River@10,106'), {})
  assert.deepEqual(await run('reviews', { ...base, reviews: [] }), [])
  const query = calls.at(-1).searchParams
  assert.equal(query.get('engine'), 'tripadvisor_reviews')
  assert.equal(query.get('sort_by'), 'most_recent')
  assert.equal(query.get('limit'), '20')
  assert.equal(query.has('translate'), false)
  assert.equal(query.has('original_language'), false)
})

test('TripAdvisor photos prioritize attached images, keep review identity and never infer photographer', async () => {
  const { tripadvisorPhotos } = await import('website-opportunities/src/tripadvisor-media.js')
  const avatar = 'https://media-cdn.tripadvisor.com/media/photo-o/01/avatar.jpg'
  const photo = 'https://media-cdn.tripadvisor.com/media/photo-o/01/review.jpg'
  const reviews = tripadvisorReviews(
    [
      {
        id: '99',
        text: 'Exact quote',
        author: { name: 'Lan', url: 'https://www.tripadvisor.com/Profile/Lan', avatar },
        images: [photo, 'https://evil.test/photo.jpg'],
        link: 'https://www.tripadvisor.com/ShowUserReviews-d123-r99.html'
      }
    ],
    { placeUrl: place.url, fetchedAt: '2026-10-21', provider: 'serpapi' }
  )
  assert.equal(reviews[0].authorAvatarUrl, avatar)
  assert.equal(reviews[0].photos.length, 1)
  assert.equal(reviews[0].photos[0].reviewId, '99')
  const photos = tripadvisorPhotos(
    {
      images: Array.from(
        { length: 15 },
        (_, i) => `https://media-cdn.tripadvisor.com/media/photo-o/01/gallery${i}.jpg`
      )
    },
    reviews,
    { placeId: '123', placeUrl: place.url, provider: 'serpapi' }
  )
  assert.equal(photos.length, 10)
  assert.equal(photos[0].url, photo)
  assert.equal(
    photos.some((p) => p.url === avatar),
    false
  )
  assert.deepEqual(photos[0].credit.authors, [])
  assert.equal(photos[0].credit.reviewId, '99')
  assert.equal(photos[0].credit.sourceUrl, reviews[0].url)
  assert.equal(photos[1].credit.photoSource, 'gallery')
})

test('Google brief keeps supplied author profile and avatar alongside the original review source', async () => {
  const { renderBriefMarkdown } = await import('../../../packages/wo/website-opportunities/domain/brief.mjs')
  const review = {
    author: 'An',
    text: 'Exact Google opinion',
    googleMapsUri: 'https://maps.google.com/review',
    authorUri: 'https://maps.google.com/contrib/123',
    authorAvatarUrl: 'https://lh3.googleusercontent.com/avatar'
  }
  const brief = { business: { name: 'Pho Ba' }, googlePlace: { placeId: 'google-123', reviews: [review] } }
  const md = renderBriefWithReviews(
    { renderBriefMarkdown: (b) => renderBriefMarkdown(b, { includeGoogleReviews: true }) },
    brief
  )
  for (const value of [review.googleMapsUri, review.authorUri, review.authorAvatarUrl])
    assert.ok(md.includes(value))
})

test('restaurant association accepts Green Mesa without a website or matching branch, preserves ambiguity and source scope', async () => {
  const { tripadvisorRestaurantName, tripadvisorNameMatches } = await import(
    'website-opportunities/src/tripadvisor.js'
  )
  const facts = {
    name: 'GREEN MESA RESTAURANT - KARAMA',
    address: '18 5B St - Al Karama - Dubai - United Arab Emirates',
    website: null,
    phone: '+97140000000',
    lat: 25.2423516,
    lon: 55.3050931
  }
  const candidate = {
    placeId: '8731234',
    name: 'Green Mesa',
    address: '12c Street, 104/3 Hor Al Anz, Dubai United Arab Emirates',
    market: 'Dubai',
    website: null,
    phone: '+97145550194',
    lat: 25.28052,
    lon: 55.34199,
    url: 'https://www.tripadvisor.com/Restaurant_Review-d7654321.html'
  }
  assert.equal(tripadvisorRestaurantName(facts.name, facts.address), 'GREEN MESA RESTAURANT')
  assert.equal(tripadvisorRestaurantName('Fish - Chips', facts.address), 'Fish - Chips')
  assert.equal(tripadvisorNameMatches(candidate.name, facts.name, { addressB: facts.address }), true)
  const match = matchTripadvisor(facts, [candidate])
  assert.equal(match.status, 'matched')
  assert.equal(match.scope, 'brand')
  assert.equal(match.branchVerified, false)
  assert.equal(match.reason, 'brand_name_and_city')
  assert.equal(match.candidates[0].confident, false)
  assert.equal(
    matchTripadvisor(facts, [{ ...candidate, market: null }]).status,
    'not_found',
    'distance alone is not city evidence'
  )
  assert.equal(
    matchTripadvisor(facts, [{ ...candidate, name: 'Green City', website: 'https://greencity.example' }])
      .status,
    'not_found'
  )
  assert.equal(matchTripadvisor(facts, [{ ...candidate, market: 'Abu Dhabi' }]).status, 'not_found')
  assert.equal(matchTripadvisor(facts, [candidate, { ...candidate, placeId: '9876543' }]).status, 'ambiguous')
  assert.equal(
    matchTripadvisor({ ...facts, name: 'Restaurant' }, [{ ...candidate, name: 'Restaurant' }]).status,
    'not_found'
  )
  const md = renderBriefWithReviews(
    { renderBriefMarkdown: () => '# Google branch' },
    { reviewSources: { tripadvisor: { ...candidate, scope: 'brand', match, reviews: [] } } }
  )
  assert.ok(md.includes('Reviews for "Green Mesa"'))
  assert.ok(md.includes('not verified as the selected Google branch'))
  const brandedFacts = { ...facts, website: 'https://greenmesa.example' }
  const sameBrand = [candidate, { ...candidate, placeId: '123' }].map((p) => ({
    ...p,
    website: brandedFacts.website
  }))
  assert.equal(matchTripadvisor(brandedFacts, sameBrand).placeId, '123')
  assert.equal(matchTripadvisor(brandedFacts, [...sameBrand].reverse()).placeId, '123')
})

test('SerpApi uses one request for twenty reviews and normalization keeps the twentieth review photos', async () => {
  const { serpapiTripadvisorCall } = await import('website-opportunities/src/tripadvisor-serpapi.js')
  let calls = 0
  const raw = await serpapiTripadvisorCall(
    'reviews',
    { place_id: '123' },
    {
      key: 'private',
      fetch: async (url) => {
        calls++
        assert.equal(new URL(url).searchParams.get('limit'), '20')
        return response({
          search_metadata: { status: 'Success' },
          search_parameters: { place_id: '123' },
          reviews: Array.from({ length: 25 }, (_, i) => ({
            review_id: String(i + 1),
            snippet: `Review ${i + 1}`,
            author: {
              display_name: `Guest ${i + 1}`,
              avatar: 'https://media-cdn.tripadvisor.com/media/photo-o/avatar.jpg',
              link: `https://www.tripadvisor.com/Profile/Guest${i + 1}`
            },
            images: [`https://media-cdn.tripadvisor.com/media/photo-o/${i + 1}.jpg`]
          }))
        })
      }
    }
  )
  const reviews = tripadvisorReviews(raw, {
    placeUrl: place.url,
    fetchedAt: '2026-10-22',
    provider: 'serpapi'
  })
  assert.equal(calls, 1)
  assert.equal(reviews.length, 20)
  assert.equal(reviews[19].id, '20')
  assert.equal(reviews[19].photos[0].reviewId, '20')
  assert.ok(reviews[19].authorAvatarUrl)
  assert.equal(reviews[19].authorUrl, 'https://www.tripadvisor.com/Profile/Guest20')
})

test('Supplemental Maps reviews reach attributed testimonials without supplying business facts to QA', () => {
  const quote = 'The rooftop swimming pool and wood fired oven were wonderful.'
  const url = 'https://www.google.com/maps/reviews/data=test'
  const source = { placeId: 'p', url, reviews: [{ text: quote, author: 'Lan', url }], menuPhotos: [] }
  const brief = addReviewSources({ business: { name: 'Pho Ba' } }, { reviewSources: { googleMaps: source } })
  const md = renderBriefWithReviews({ renderBriefMarkdown: () => '# Pho Ba' }, brief)
  const qa = briefOf({ brief, brief_md: md })
  assert.ok(md.includes(quote))
  assert.ok(!qa.briefText.includes(quote))
  assert.ok(qa.briefText.includes('Pho Ba'))
  assert.deepEqual(qa.googleReviewTestimonials, [{ text: quote, author: 'Lan', url }])
  assert.deepEqual(qa.googleReviews, [quote])
})
