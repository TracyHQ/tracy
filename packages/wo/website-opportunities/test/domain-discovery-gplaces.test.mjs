import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  GPLACES_FIELDS,
  GPLACES_TEXT_FIELDS,
  candidateFromGplaces,
  searchRestaurantsGplaces,
  searchPlacesText
} from '../domain/discovery-gplaces.mjs'
import { discoverRestaurants } from '../domain/discovery-gmaps.mjs'
import * as domain from '../domain/index.mjs'

const KEY = 'AIzaSECRETkey123'
const resolve = async () => [{ address: '93.184.216.34', family: 4 }]
const okJson = (b) =>
  new Response(typeof b === 'string' ? b : JSON.stringify(b), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
const place = (o) => ({
  id: 'ChIJp1',
  displayName: { text: 'Tamarel Restaurant', languageCode: 'en' },
  formattedAddress: '27 Example Street, Hoi An',
  location: { latitude: 15.9, longitude: 108.3 },
  nationalPhoneNumber: '0900 000 510',
  internationalPhoneNumber: '+84 900 000 510',
  rating: 4.6,
  userRatingCount: 812,
  businessStatus: 'OPERATIONAL',
  googleMapsUri: 'https://maps.google.com/?cid=1',
  primaryTypeDisplayName: { text: 'Vietnamese Restaurant' },
  ...o
})
const osmBody = JSON.stringify({
  elements: [{ type: 'node', id: 7, lat: 1, lon: 2, tags: { amenity: 'restaurant', name: 'From OSM' } }]
})
const area = { lat: 1, lon: 2, radiusM: 500 }

// Routes by host: Places, Apify, anything else is Overpass.
function fakeFetch({
  places = () => okJson({ places: [place({})] }),
  apify = () => okJson([{ title: 'From Apify', placeId: 'A1' }])
} = {}) {
  const seen = []
  const fetch = async (url, init = {}) => {
    const u = String(url)
    seen.push({ url: u, init })
    if (u.startsWith('https://places.googleapis.com/')) return places(init)
    if (u.startsWith('https://api.apify.com/')) return apify(init)
    return okJson(osmBody)
  }
  return { fetch, seen, hosts: () => seen.map((s) => new URL(s.url).hostname) }
}

test('field mask asks for the listed fields only, every one prefixed, no Atmosphere field', () => {
  const fields = GPLACES_FIELDS.split(',')
  assert.ok(fields.every((f) => f.startsWith('places.')))
  assert.deepEqual(fields.map((f) => f.slice(7)).sort(), [
    'businessStatus',
    'displayName',
    'formattedAddress',
    'googleMapsUri',
    'id',
    'internationalPhoneNumber',
    'location',
    'nationalPhoneNumber',
    'primaryTypeDisplayName',
    'rating',
    'userRatingCount',
    'websiteUri'
  ])
  assert.doesNotMatch(
    GPLACES_FIELDS,
    /reviews|serves|editorialSummary|outdoorSeating|reservable|delivery|dineIn|takeout|\*/
  )
})

test('a Places result maps to the same candidate shape as Google Maps', () => {
  const c = candidateFromGplaces(place({ websiteUri: 'https://tamarel.example/' }))
  assert.deepEqual(c, {
    provider: 'google-places',
    providerId: 'ChIJp1',
    name: 'Tamarel Restaurant',
    address: '27 Example Street, Hoi An',
    phone: '+84 900 000 510',
    lat: 15.9,
    lon: 108.3,
    website: 'https://tamarel.example/',
    socials: {},
    category: 'Vietnamese Restaurant',
    rating: 4.6,
    reviews: 812,
    mapsUrl: 'https://maps.google.com/?cid=1'
  })
  assert.equal(candidateFromGplaces(place({ internationalPhoneNumber: undefined })).phone, '0900 000 510')
})

test('Facebook and chat "websites" go to socials and contacts; closed and nameless are dropped', () => {
  const fb = candidateFromGplaces(place({ websiteUri: 'https://www.facebook.com/TamarelHoiAn' }))
  assert.equal(fb.website, undefined)
  assert.equal(fb.socials.facebook, 'https://www.facebook.com/TamarelHoiAn')
  const zalo = candidateFromGplaces(place({ websiteUri: 'http://zalo.me/84905550101' }))
  assert.equal(zalo.website, undefined)
  assert.equal(zalo.contacts.zalo, 'http://zalo.me/84905550101')
  assert.equal(candidateFromGplaces(place({ businessStatus: 'CLOSED_PERMANENTLY' })), null)
  assert.equal(candidateFromGplaces(place({ displayName: { text: '  ' } })), null)
  assert.equal(candidateFromGplaces(place({ id: undefined })), null)
  assert.equal(candidateFromGplaces(place({ businessStatus: 'CLOSED_TEMPORARILY' })).temporarilyClosed, true)
  assert.equal(candidateFromGplaces(place({})).temporarilyClosed, undefined)
})

test('searchNearby request: key and mask in headers, body capped at 20 results and 50 km', async () => {
  const f = fakeFetch()
  const out = await searchRestaurantsGplaces(
    { lat: 15.88, lon: 108.33, radiusM: 90_000, limit: 60 },
    { fetch: f.fetch, resolve, googleKey: KEY }
  )
  assert.equal(out[0].provider, 'google-places')
  assert.equal(f.seen.length, 1)
  const { url, init } = f.seen[0]
  assert.equal(url, 'https://places.googleapis.com/v1/places:searchNearby')
  assert.ok(!url.includes(KEY))
  assert.equal(init.method, 'POST')
  assert.equal(init.headers['X-Goog-Api-Key'], KEY)
  assert.equal(init.headers['X-Goog-FieldMask'], GPLACES_FIELDS)
  assert.deepEqual(JSON.parse(init.body), {
    includedTypes: ['restaurant'],
    maxResultCount: 20,
    locationRestriction: { circle: { center: { latitude: 15.88, longitude: 108.33 }, radius: 50_000 } },
    rankPreference: 'DISTANCE'
  })
  await searchRestaurantsGplaces(
    { lat: 1, lon: 2, radiusM: 800, limit: 5 },
    { fetch: f.fetch, resolve, googleKey: KEY }
  )
  assert.equal(JSON.parse(f.seen[1].init.body).maxResultCount, 5)
  const empty = fakeFetch({ places: () => okJson({}) })
  assert.deepEqual(await searchRestaurantsGplaces(area, { fetch: empty.fetch, resolve, googleKey: KEY }), [])
})

test('error codes: missing key, quota on 429 and quota/billing 403, provider error otherwise, timeout', async () => {
  const code = async (deps) => {
    try {
      await searchRestaurantsGplaces(area, { resolve, googleKey: KEY, ...deps })
    } catch (err) {
      assert.ok(!String(err.message).includes(KEY), 'key leaked into the error')
      return err.code
    }
    return 'NO_THROW'
  }
  const status = (s, body = '{}') => fakeFetch({ places: () => new Response(body, { status: s }) }).fetch
  assert.equal(await code({ googleKey: undefined, fetch: status(200) }), 'CREDENTIAL_MISSING')
  assert.equal(await code({ fetch: status(429) }), 'QUOTA')
  assert.equal(
    await code({ fetch: status(403, '{"error":{"message":"Quota exceeded for quota metric"}}') }),
    'QUOTA'
  )
  assert.equal(
    await code({
      fetch: status(403, '{"error":{"message":"This API project is not authorized: billing not enabled"}}')
    }),
    'QUOTA'
  )
  assert.equal(
    await code({ fetch: status(403, '{"error":{"status":"PERMISSION_DENIED"}}') }),
    'PROVIDER_ERROR'
  )
  assert.equal(await code({ fetch: status(500) }), 'PROVIDER_ERROR')
  assert.equal(await code({ fetch: status(200, 'not json') }), 'PROVIDER_ERROR')
  assert.equal(
    await code({
      fetch: async () => {
        throw new Error(`boom ${KEY}`)
      }
    }),
    'PROVIDER_ERROR'
  )
  const hang = async (_u, init) =>
    new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))))
  assert.equal(await code({ fetch: hang, timeoutMs: 20 }), 'TIMEOUT')
})

test('auto chain: Places first, Apify next, OSM last; tiers without a key are skipped', async () => {
  const both = fakeFetch()
  const g = await discoverRestaurants(area, { fetch: both.fetch, resolve, googleKey: KEY, token: 'tok' })
  assert.deepEqual(
    [g.provider, g.fallbackFrom, both.hosts()],
    ['google-places', undefined, ['places.googleapis.com']]
  )

  const apifyOnly = fakeFetch({
    places: () => {
      throw new Error('no Places without a key')
    }
  })
  const a = await discoverRestaurants(area, { fetch: apifyOnly.fetch, resolve, token: 'tok' })
  assert.deepEqual(
    [a.provider, a.fallbackFrom, a.candidates[0].name],
    ['google-maps', undefined, 'From Apify']
  )

  const quota = fakeFetch({ places: () => new Response('{}', { status: 429 }) })
  const q = await discoverRestaurants(area, { fetch: quota.fetch, resolve, googleKey: KEY, token: 'tok' })
  assert.deepEqual(
    [q.provider, q.fallbackFrom],
    ['google-maps', { provider: 'google-places', code: 'QUOTA' }]
  )

  const allDown = fakeFetch({
    places: () => new Response('{}', { status: 429 }),
    apify: () => new Response('{}', { status: 500 })
  })
  const d = await discoverRestaurants(area, {
    fetch: allDown.fetch,
    resolve,
    googleKey: KEY,
    token: 'tok',
    provider: 'auto'
  })
  assert.deepEqual(
    [d.provider, d.fallbackFrom, d.candidates[0].name],
    ['osm', { provider: 'google-places', code: 'QUOTA' }, 'From OSM']
  )

  const none = fakeFetch()
  const n = await discoverRestaurants(area, { fetch: none.fetch, resolve })
  assert.deepEqual(
    [n.provider, n.fallbackFrom, none.hosts().includes('places.googleapis.com')],
    ['osm', undefined, false]
  )
})

test('explicit provider: one tier then OSM', async () => {
  const run = async (provider, deps = {}, fakes = {}) => {
    const f = fakeFetch(fakes)
    const r = await discoverRestaurants(area, {
      fetch: f.fetch,
      resolve,
      googleKey: KEY,
      token: 'tok',
      provider,
      ...deps
    })
    return { ...r, hosts: f.hosts() }
  }
  const g = await run('google')
  assert.equal(g.provider, 'google-places')
  const gq = await run('google', {}, { places: () => new Response('{}', { status: 429 }) })
  assert.deepEqual(
    [gq.provider, gq.fallbackFrom.provider, gq.hosts.includes('api.apify.com')],
    ['osm', 'google-places', false]
  )
  const gk = await run('google', { googleKey: undefined })
  assert.deepEqual(
    [gk.provider, gk.fallbackFrom],
    ['osm', { provider: 'google-places', code: 'CREDENTIAL_MISSING' }]
  )
  const a = await run('apify')
  assert.deepEqual([a.provider, a.hosts.includes('places.googleapis.com')], ['google-maps', false])
  const af = await run('apify', {}, { apify: () => new Response('{}', { status: 402 }) })
  assert.deepEqual([af.provider, af.fallbackFrom], ['osm', { provider: 'google-maps', code: 'QUOTA' }])
  const o = await run('osm')
  assert.deepEqual(
    [o.provider, o.fallbackFrom, o.hosts.some((h) => h.endsWith('googleapis.com') || h === 'api.apify.com')],
    ['osm', undefined, false]
  )
})

test('deps.limit reaches the provider request', async () => {
  const f = fakeFetch()
  await discoverRestaurants(area, { fetch: f.fetch, resolve, googleKey: KEY, limit: 7 })
  assert.equal(JSON.parse(f.seen[0].init.body).maxResultCount, 7)
  const a = fakeFetch()
  await discoverRestaurants(area, { fetch: a.fetch, resolve, token: 'tok', limit: 9 })
  assert.equal(JSON.parse(a.seen[0].init.body).maxCrawledPlacesPerSearch, 9)
})

test('index exports Places discovery and declares the capability', () => {
  assert.equal(typeof domain.searchRestaurantsGplaces, 'function')
  assert.equal(typeof domain.candidateFromGplaces, 'function')
  assert.equal(domain.GPLACES_FIELDS, GPLACES_FIELDS)
  assert.ok(domain.CONTRACT.capabilities.includes('discovery.google-places'))
  assert.equal(domain.CONTRACT.version, 1)
})

// ---------- Text Search (New): Find places v2 ----------

const textPlace = (i, o = {}) =>
  place({
    id: `T${i}`,
    displayName: { text: `Quán ${i}` },
    location: { latitude: 15.88 + i * 0.0001, longitude: 108.33 },
    primaryType: 'vietnamese_restaurant',
    priceLevel: 'PRICE_LEVEL_MODERATE',
    currentOpeningHours: { openNow: true },
    photos: [
      {
        name: `places/T${i}/photos/p1`,
        widthPx: 4000,
        heightPx: 3000,
        authorAttributions: [{ displayName: 'An Nguyen', uri: 'https://maps.google.com/u/1' }]
      },
      { name: `places/T${i}/photos/p2`, authorAttributions: [] }
    ],
    ...o
  })
const center = { lat: 15.88, lon: 108.33 }

// Two pages of 20, the second one only when asked with the token of the first.
function twoPages(mutate = (p) => p) {
  return fakeFetch({
    places: (init) => {
      const body = JSON.parse(init.body)
      const from = body.pageToken === 'tok-2' ? 20 : 0
      const places = Array.from({ length: 20 }, (_, i) => mutate(textPlace(from + i), from + i))
      return okJson(from === 0 ? { places, nextPageToken: 'tok-2' } : { places })
    }
  })
}

test('searchText field mask: Enterprise fields plus primaryType, priceLevel, openNow, photos and nextPageToken; no Atmosphere field', () => {
  const fields = GPLACES_TEXT_FIELDS.split(',')
  for (const f of GPLACES_FIELDS.split(',')) assert.ok(fields.includes(f), f)
  for (const f of [
    'places.primaryType',
    'places.priceLevel',
    'places.currentOpeningHours.openNow',
    'places.photos',
    'nextPageToken'
  ])
    assert.ok(fields.includes(f), f)
  assert.doesNotMatch(
    GPLACES_TEXT_FIELDS,
    /reviews|serves|editorialSummary|generativeSummary|outdoorSeating|reservable|delivery|dineIn|takeout|\*/
  )
})

test('searchText request: text query from kinds, circle bias, filters, page size 20, relevance; page 2 repeats the body with the token', async () => {
  const f = twoPages()
  const out = await searchPlacesText(
    {
      ...center,
      radiusM: 3000,
      limit: 40,
      kinds: ['cafes', 'bars'],
      minRating: 4,
      priceLevels: [1, 2],
      openNow: true
    },
    { fetch: f.fetch, resolve, googleKey: KEY }
  )
  assert.equal(f.seen.length, 2)
  for (const { url, init } of f.seen) {
    assert.equal(url, 'https://places.googleapis.com/v1/places:searchText')
    assert.equal(init.method, 'POST')
    assert.equal(init.headers['X-Goog-Api-Key'], KEY)
    assert.equal(init.headers['X-Goog-FieldMask'], GPLACES_TEXT_FIELDS)
  }
  const first = JSON.parse(f.seen[0].init.body)
  // A restriction, not a bias: the box around the 3 km circle (±0.02698° lat, ±0.02805° lon at 15.88°N).
  const { locationRestriction, ...rest } = first
  assert.equal('locationBias' in first, false)
  const { low, high } = locationRestriction.rectangle
  assert.ok(
    Math.abs(low.latitude - 15.85302) < 1e-4 && Math.abs(high.latitude - 15.90698) < 1e-4,
    JSON.stringify(locationRestriction)
  )
  assert.ok(
    Math.abs(low.longitude - 108.30195) < 1e-4 && Math.abs(high.longitude - 108.35805) < 1e-4,
    JSON.stringify(locationRestriction)
  )
  assert.deepEqual(rest, {
    textQuery: 'cafe bar',
    minRating: 4,
    priceLevels: ['PRICE_LEVEL_INEXPENSIVE', 'PRICE_LEVEL_MODERATE'],
    openNow: true,
    pageSize: 20,
    rankPreference: 'RELEVANCE'
  })
  assert.deepEqual(JSON.parse(f.seen[1].init.body), { ...first, pageToken: 'tok-2' })
  assert.equal(out.pages, 2)
  assert.equal(out.candidates.length, 0, 'cafes/bars asked, every result is a restaurant')
})

test('searchText defaults: no kinds → generic eat-and-drink query, no filter keys sent, one page for limit 20', async () => {
  const f = twoPages()
  const out = await searchPlacesText(
    { ...center, radiusM: 1000 },
    { fetch: f.fetch, resolve, googleKey: KEY }
  )
  assert.equal(f.seen.length, 1)
  const { locationRestriction, ...rest } = JSON.parse(f.seen[0].init.body)
  assert.deepEqual(rest, { textQuery: 'restaurant cafe bar', pageSize: 20, rankPreference: 'RELEVANCE' })
  assert.ok(
    locationRestriction.rectangle.low.latitude < 15.88 && locationRestriction.rectangle.high.latitude > 15.88
  )
  assert.deepEqual([out.pages, out.candidates.length], [1, 20])
})

test('searchText: every kind asked (the door default when the body names none) = no kind at all, not a six-word query', async () => {
  // Stand wo2 19/10: "restaurant cafe fast food bakery bar night club" made Google answer 20 loose matches and no next
  // page, so `Đà Nẵng` 5 km Standard came back with 8 places instead of ~40.
  const f = twoPages()
  await searchPlacesText(
    {
      ...center,
      radiusM: 1000,
      kinds: ['restaurants', 'cafes', 'fast-food', 'bakeries', 'bars', 'nightlife']
    },
    { fetch: f.fetch, resolve, googleKey: KEY }
  )
  const { locationRestriction: _locationRestriction, ...rest } = JSON.parse(f.seen[0].init.body)
  assert.deepEqual(rest, { textQuery: 'restaurant cafe bar', pageSize: 20, rankPreference: 'RELEVANCE' })
})

test('searchText box: latitude clamps at the poles and longitude wraps across the antimeridian', async () => {
  const box = async (lat, lon, radiusM) => {
    const f = twoPages()
    await searchPlacesText({ lat, lon, radiusM }, { fetch: f.fetch, resolve, googleKey: KEY })
    return JSON.parse(f.seen[0].init.body).locationRestriction.rectangle
  }
  const pole = await box(89.99, 10, 5000)
  assert.equal(pole.high.latitude, 90)
  assert.ok(pole.low.latitude < 89.99)
  const date = await box(0, 179.99, 5000)
  assert.ok(date.low.longitude > 179.9 && date.low.longitude < 180, String(date.low.longitude))
  assert.ok(date.high.longitude < -179.9 && date.high.longitude > -180, String(date.high.longitude))
  const west = await box(0, -179.99, 5000)
  assert.ok(west.low.longitude > 179.9 && west.high.longitude < -179.9)
  const equator = await box(0, 0, 1000)
  assert.ok(
    Math.abs(equator.high.latitude - 0.008993) < 1e-5 && Math.abs(equator.high.longitude - 0.008993) < 1e-5
  )
})

test('searchText: one cuisine → includedType and a cuisine query; several → query only, filtered on our side', async () => {
  const one = twoPages()
  await searchPlacesText(
    { ...center, radiusM: 1000, cuisines: ['vietnamese'] },
    { fetch: one.fetch, resolve, googleKey: KEY }
  )
  const body = JSON.parse(one.seen[0].init.body)
  assert.equal(body.textQuery, 'vietnamese restaurant')
  assert.equal(body.includedType, 'vietnamese_restaurant')

  const two = twoPages((p, i) => ({ ...p, primaryType: i % 2 ? 'thai_restaurant' : 'italian_restaurant' }))
  const out = await searchPlacesText(
    { ...center, radiusM: 1000, cuisines: ['thai', 'vietnamese'] },
    { fetch: two.fetch, resolve, googleKey: KEY }
  )
  const sent = JSON.parse(two.seen[0].init.body)
  assert.equal(sent.textQuery, 'thai vietnamese restaurant')
  assert.equal('includedType' in sent, false)
  assert.equal(out.candidates.length, 10)
  assert.ok(out.candidates.every((c) => c.cuisine === 'thai'))

  const kind = twoPages()
  await searchPlacesText(
    { ...center, radiusM: 1000, kinds: ['bakeries'] },
    { fetch: kind.fetch, resolve, googleKey: KEY }
  )
  assert.equal(JSON.parse(kind.seen[0].init.body).includedType, 'bakery')
})

test('searchText pages until limit (≤ 60) or no token, drops out-of-radius and non-food places, slices to limit', async () => {
  const f = twoPages((p, i) => {
    if (i === 3) return { ...p, location: { latitude: 15.95, longitude: 108.33 } } // ~7.8 km
    if (i === 5) return { ...p, primaryType: 'hotel' }
    if (i === 7) return { ...p, primaryType: undefined }
    return p
  })
  const out = await searchPlacesText(
    { ...center, radiusM: 2000, limit: 40 },
    { fetch: f.fetch, resolve, googleKey: KEY }
  )
  assert.deepEqual([out.pages, out.candidates.length], [2, 37])
  assert.ok(!out.candidates.some((c) => ['T3', 'T5', 'T7'].includes(c.providerId)))

  const capped = twoPages()
  const c = await searchPlacesText(
    { ...center, radiusM: 2000, limit: 25 },
    { fetch: capped.fetch, resolve, googleKey: KEY }
  )
  assert.deepEqual([c.pages, c.candidates.length], [2, 25])

  const endless = fakeFetch({
    places: () =>
      okJson({ places: Array.from({ length: 20 }, (_, i) => textPlace(i)), nextPageToken: 'more' })
  })
  const e = await searchPlacesText(
    { ...center, radiusM: 2000, limit: 500 },
    { fetch: endless.fetch, resolve, googleKey: KEY }
  )
  assert.deepEqual([e.pages, endless.seen.length], [3, 3])

  const empty = fakeFetch({ places: () => okJson({}) })
  assert.deepEqual(
    await searchPlacesText({ ...center, radiusM: 2000 }, { fetch: empty.fetch, resolve, googleKey: KEY }),
    { candidates: [], pages: 1 }
  )
})

test('a Text Search result carries kind, cuisine, primaryType, distance, price, openNow and the first photo only', async () => {
  const f = fakeFetch({
    places: () =>
      okJson({
        places: [
          textPlace(1, { websiteUri: 'https://quan1.vn/' }),
          textPlace(2, {
            priceLevel: 'PRICE_LEVEL_VERY_EXPENSIVE',
            currentOpeningHours: undefined,
            photos: undefined,
            primaryType: 'coffee_shop'
          }),
          textPlace(3, { priceLevel: 'PRICE_LEVEL_FREE', photos: [{ name: 'places/T3/photos/x' }] })
        ]
      })
  })
  const { candidates } = await searchPlacesText(
    { ...center, radiusM: 1000 },
    { fetch: f.fetch, resolve, googleKey: KEY }
  )
  const [a, b, c] = candidates
  assert.deepEqual(a, {
    provider: 'google-places',
    providerId: 'T1',
    name: 'Quán 1',
    address: '27 Example Street, Hoi An',
    phone: '+84 900 000 510',
    lat: 15.8801,
    lon: 108.33,
    website: 'https://quan1.vn/',
    socials: {},
    category: 'Vietnamese Restaurant',
    rating: 4.6,
    reviews: 812,
    mapsUrl: 'https://maps.google.com/?cid=1',
    primaryType: 'vietnamese_restaurant',
    kind: 'restaurants',
    cuisine: 'vietnamese',
    distanceM: 11,
    priceLevel: 2,
    openNow: true,
    photo: { name: 'places/T1/photos/p1', credit: 'An Nguyen' }
  })
  assert.deepEqual([b.kind, b.cuisine, b.priceLevel, b.openNow, b.photo], ['cafes', null, 4, null, null])
  assert.deepEqual([c.priceLevel, c.photo], [0, { name: 'places/T3/photos/x', credit: null }])
  // The Nearby mapper is untouched by the new fields.
  assert.equal('kind' in candidateFromGplaces(textPlace(1)), false)
})

test('searchText errors: same codes as Nearby, key never in the message', async () => {
  const code = async (deps) => {
    try {
      await searchPlacesText({ ...center, radiusM: 1000 }, { resolve, googleKey: KEY, ...deps })
    } catch (err) {
      assert.ok(!String(err.message).includes(KEY), 'key leaked into the error')
      return err.code
    }
    return 'NO_THROW'
  }
  const status = (s, body = '{}') => fakeFetch({ places: () => new Response(body, { status: s }) }).fetch
  assert.equal(await code({ googleKey: undefined, fetch: status(200) }), 'CREDENTIAL_MISSING')
  assert.equal(await code({ fetch: status(429) }), 'QUOTA')
  assert.equal(await code({ fetch: status(403, '{"error":{"message":"billing not enabled"}}') }), 'QUOTA')
  assert.equal(await code({ fetch: status(500) }), 'PROVIDER_ERROR')
  assert.equal(await code({ fetch: status(200, 'nope') }), 'PROVIDER_ERROR')
  assert.equal(
    await code({
      fetch: async () => {
        throw new Error(`boom ${KEY}`)
      }
    }),
    'PROVIDER_ERROR'
  )
})

test('discoverRestaurants with deps.filters takes the Text Search path and reports pages; without it Nearby is unchanged', async () => {
  const f = twoPages()
  const r = await discoverRestaurants(
    { ...center, radiusM: 2000 },
    {
      fetch: f.fetch,
      resolve,
      googleKey: KEY,
      limit: 40,
      filters: { kinds: ['restaurants'], minRating: 4.5 }
    }
  )
  assert.deepEqual(
    [r.provider, r.pages, r.candidates.length, r.fallbackFrom],
    ['google-places', 2, 40, undefined]
  )
  assert.ok(f.seen.every((s) => s.url.endsWith('places:searchText')))
  assert.equal(JSON.parse(f.seen[0].init.body).minRating, 4.5)

  const n = fakeFetch()
  const plain = await discoverRestaurants(area, { fetch: n.fetch, resolve, googleKey: KEY })
  assert.deepEqual(
    [plain.provider, 'pages' in plain, n.seen[0].url.endsWith('places:searchNearby')],
    ['google-places', false, true]
  )

  const quota = fakeFetch({ places: () => new Response('{}', { status: 429 }) })
  const q = await discoverRestaurants(area, {
    fetch: quota.fetch,
    resolve,
    googleKey: KEY,
    token: 'tok',
    filters: {}
  })
  assert.deepEqual(
    [q.provider, q.fallbackFrom],
    ['google-maps', { provider: 'google-places', code: 'QUOTA' }]
  )
})

test('named search sends the original restaurant/address query without geocoding, circle or generic cuisine rewrite', async () => {
  const seen = []
  const query = 'GREEN MESA RESTAURANT - AL FAHIDI'
  const result = await domain.searchNamedPlaces(
    { query, limit: 60 },
    {
      googleKey: KEY,
      resolve,
      fetch: async (url, init) => {
        seen.push({ url, init })
        return okJson({
          places: [
            {
              id: 'greenmesa',
              displayName: { text: query },
              primaryType: 'indian_restaurant',
              location: { latitude: 25.26, longitude: 55.3 },
              formattedAddress: 'Al Fahidi, Dubai'
            }
          ]
        })
      }
    }
  )
  assert.deepEqual(JSON.parse(seen[0].init.body), {
    textQuery: query,
    pageSize: 20,
    rankPreference: 'RELEVANCE'
  })
  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0].providerId, 'greenmesa')
  assert.equal(result.candidates[0].distanceM, null)
  assert.equal(result.area, null)
  assert.equal(result.pages, 1)
})

test('a business autocomplete pick reads the exact place ID once and terminates its session without a text search', async () => {
  const seen = []
  const result = await domain.searchNamedPlaces(
    { query: 'Green Mesa', placeId: 'ChIJgreenmesa', sessionToken: 'session-1' },
    {
      googleKey: KEY,
      resolve,
      fetch: async (url, init) => {
        seen.push({ url: String(url), init })
        return okJson({
          id: 'ChIJgreenmesa',
          displayName: { text: 'Green Mesa' },
          primaryType: 'restaurant',
          location: { latitude: 25.26, longitude: 55.3 }
        })
      }
    }
  )
  assert.equal(seen.length, 1)
  assert.equal(seen[0].url, 'https://places.googleapis.com/v1/places/ChIJgreenmesa?sessionToken=session-1')
  assert.equal(seen[0].init.method, 'GET')
  assert.equal(seen[0].init.body, undefined)
  assert.doesNotMatch(
    new Headers(seen[0].init.headers).get('x-goog-fieldmask'),
    /places\.|nextPageToken|reviews|editorialSummary/
  )
  assert.equal(result.candidates[0].providerId, 'ChIJgreenmesa')
})

test('a bare city returned by Google is an area; empty named results remain empty instead of broadening the query', async () => {
  const result = await domain.searchNamedPlaces(
    { query: 'Dubai' },
    {
      googleKey: KEY,
      resolve,
      fetch: async () =>
        okJson({
          places: [
            {
              id: 'dubai',
              displayName: { text: 'Dubai' },
              primaryType: 'locality',
              location: { latitude: 25.2, longitude: 55.3 }
            }
          ]
        })
    }
  )
  assert.deepEqual(result.area, { lat: 25.2, lon: 55.3, label: 'Dubai' })
  assert.deepEqual(result.candidates, [])
  const empty = await domain.searchNamedPlaces(
    { query: 'No such restaurant' },
    { googleKey: KEY, resolve, fetch: async () => okJson({}) }
  )
  assert.deepEqual(empty.candidates, [])
  assert.equal(empty.area, null)
  assert.equal(empty.center, null)
})

test('searchText maxPages: 1 stops after the first page even when it is short and names a next page', async () => {
  const f = fakeFetch({ places: () => okJson({ places: [place({})], nextPageToken: 'more' }) })
  const out = await searchPlacesText(
    { ...center, radiusM: 1000, limit: 20, maxPages: 1 },
    { fetch: f.fetch, resolve, googleKey: KEY }
  )
  assert.equal(f.seen.length, 1)
  assert.equal(out.pages, 1)
  const unbounded = fakeFetch({ places: () => okJson({ places: [place({})], nextPageToken: 'more' }) })
  await searchPlacesText(
    { ...center, radiusM: 1000, limit: 20 },
    { fetch: unbounded.fetch, resolve, googleKey: KEY }
  )
  assert.ok(unbounded.seen.length > 1, 'without maxPages a short page keeps paging (the signed-in default)')
})
