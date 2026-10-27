import { test } from 'node:test'
import assert from 'node:assert/strict'
import { discoverRestaurants } from '../domain/discovery-gmaps.mjs'

const KEY = 'AIzaSECRETkey123'
const resolve = async () => [{ address: '93.184.216.34', family: 4 }]
const okJson = (b) =>
  new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })
const area = { lat: 38.71, lon: -9.14, radiusM: 2000 }
const gplace = (id, name, primaryType, types, o = {}) => ({
  id,
  displayName: { text: name },
  location: { latitude: 38.711, longitude: -9.141 },
  businessStatus: 'OPERATIONAL',
  primaryType,
  types,
  ...o
})

function fakeFetch({
  places = () => okJson({ places: [] }),
  apify = () => okJson([]),
  overpass = () => okJson({ elements: [] })
} = {}) {
  const seen = []
  const fetch = async (url, init = {}) => {
    const u = String(url)
    seen.push({
      url: u,
      init,
      body: typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : init.body
    })
    if (u.startsWith('https://places.googleapis.com/')) return places(init)
    if (u.startsWith('https://api.apify.com/')) return apify(init)
    return overpass(init)
  }
  return { fetch, seen }
}

test('an "any" area search is one Google Nearby call across every trade, and each place carries its trade', async () => {
  const f = fakeFetch({
    places: () =>
      okJson({
        places: [
          gplace('P1', 'Salon Rosa', 'hair_salon', [
            'hair_salon',
            'beauty_salon',
            'point_of_interest',
            'establishment'
          ]),
          gplace('P2', 'Dr. Sorriso', 'dentist', ['dentist', 'health']),
          gplace('P3', 'Tasca do Ze', 'portuguese_restaurant', [
            'portuguese_restaurant',
            'restaurant',
            'food'
          ]),
          gplace('P4', 'Canalizador Lda', 'plumber', ['plumber'])
        ]
      })
  })
  const r = await discoverRestaurants(area, {
    fetch: f.fetch,
    resolve,
    googleKey: KEY,
    limit: 60,
    filters: { trade: 'any' }
  })

  assert.equal(f.seen.length, 1, 'one billed call, whatever the depth')
  assert.ok(f.seen[0].url.endsWith('places:searchNearby'))
  const body = f.seen[0].body
  for (const t of [
    'restaurant',
    'cafe',
    'beauty_salon',
    'dentist',
    'plumber',
    'lodging',
    'car_repair',
    'lawyer',
    'store'
  ])
    assert.ok(body.includedTypes.includes(t), `asks for ${t}`)
  assert.ok(body.includedTypes.length <= 50, 'Google takes at most 50 included types')
  for (const t of ['atm', 'parking', 'government_office', 'city_hall', 'hospital', 'school', 'church'])
    assert.ok(!body.includedTypes.includes(t), `never asks for ${t}`)
  assert.equal(body.maxResultCount, 20)

  assert.deepEqual(
    r.candidates.map((c) => [c.name, c.trade]),
    [
      ['Salon Rosa', 'beauty'],
      ['Dr. Sorriso', 'health'],
      ['Tasca do Ze', 'food'],
      ['Canalizador Lda', 'home']
    ]
  )
  assert.equal(r.candidates[2].kind, 'restaurants', 'a food place still gets its Find tab')
  assert.equal(r.candidates[0].kind, null)
  assert.deepEqual([r.provider, r.pages], ['google-places', 1])
})

test('one kind asks Google for that kind only; rating and open-now, which Nearby cannot filter, are checked on our side', async () => {
  const f = fakeFetch({
    places: () =>
      okJson({
        places: [
          gplace('B1', 'Nails & Co', 'nail_salon', ['nail_salon'], {
            rating: 4.8,
            currentOpeningHours: { openNow: true }
          }),
          gplace('B2', 'Low Salon', 'beauty_salon', ['beauty_salon'], {
            rating: 3.1,
            currentOpeningHours: { openNow: true }
          }),
          gplace('B3', 'Closed Spa', 'spa', ['spa'], {
            rating: 4.9,
            currentOpeningHours: { openNow: false }
          }),
          gplace('B4', 'Mall Spa', 'shopping_mall', ['shopping_mall', 'spa'], {
            rating: 4.9,
            currentOpeningHours: { openNow: true }
          })
        ]
      })
  })
  const r = await discoverRestaurants(area, {
    fetch: f.fetch,
    resolve,
    googleKey: KEY,
    filters: { trade: 'beauty', minRating: 4, openNow: true }
  })
  const body = f.seen[0].body
  assert.ok(body.includedTypes.includes('nail_salon') && body.includedTypes.includes('barber_shop'))
  assert.ok(!body.includedTypes.includes('restaurant') && !body.includedTypes.includes('dentist'))
  assert.ok(body.excludedPrimaryTypes.includes('shopping_mall'))
  assert.equal('minRating' in body, false, 'Nearby takes no rating filter')
  assert.deepEqual(
    r.candidates.map((c) => [c.name, c.trade]),
    [['Nails & Co', 'beauty']]
  )
})

test('food keeps its Text Search, and no trade at all (an older client) is still food', async () => {
  for (const filters of [{ trade: 'food', kinds: ['cafes'] }, { kinds: ['cafes'] }]) {
    const f = fakeFetch({ places: () => okJson({ places: [] }) })
    await discoverRestaurants(area, { fetch: f.fetch, resolve, googleKey: KEY, filters })
    assert.ok(f.seen[0].url.endsWith('places:searchText'))
  }
})

test('OSM, the free fallback: "any" asks for every kind in one Overpass query and tags each place with its kind', async () => {
  const f = fakeFetch({
    overpass: () =>
      okJson({
        elements: [
          {
            type: 'node',
            id: 1,
            lat: 38.711,
            lon: -9.141,
            tags: { shop: 'hairdresser', name: 'Cabeleireiro Ana' }
          },
          { type: 'node', id: 2, lat: 38.711, lon: -9.141, tags: { amenity: 'cafe', name: 'Cafe Luz' } },
          {
            type: 'node',
            id: 3,
            lat: 38.711,
            lon: -9.141,
            tags: { craft: 'electrician', name: 'Luz Electrica' }
          }
        ]
      })
  })
  const r = await discoverRestaurants(area, {
    fetch: f.fetch,
    resolve,
    provider: 'osm',
    filters: { trade: 'any' }
  })
  assert.equal(f.seen.length, 1)
  const q = new URLSearchParams(f.seen[0].body).get('data')
  assert.match(q, /^\[out:json\]\[timeout:25\];\(nwr\[amenity~"\^\(restaurant\|/)
  assert.match(q, /craft~"\^\(plumber\|electrician/)
  assert.match(q, /\);out tags center 300;$/)
  assert.equal(r.provider, 'osm')
  assert.deepEqual(
    r.candidates.map((c) => [c.name, c.trade]),
    [
      ['Cabeleireiro Ana', 'beauty'],
      ['Cafe Luz', 'food'],
      ['Luz Electrica', 'home']
    ]
  )
})

test('OSM with one kind asks for that kind only', async () => {
  const f = fakeFetch()
  await discoverRestaurants(area, { fetch: f.fetch, resolve, provider: 'osm', filters: { trade: 'auto' } })
  const q = new URLSearchParams(f.seen[0].body).get('data')
  assert.match(q, /shop~"\^\(car\|car_repair/)
  assert.doesNotMatch(q, /restaurant|hairdresser/)
})

test('Google Maps on Apify: "any" splits the same place budget over one phrase per kind, so it costs no more than food', async () => {
  const f = fakeFetch({
    apify: () => okJson([{ title: 'Oficina Rui', placeId: 'G1', categoryName: 'Auto repair shop' }])
  })
  const r = await discoverRestaurants(area, {
    fetch: f.fetch,
    resolve,
    provider: 'apify',
    token: 'tok',
    limit: 40,
    filters: { trade: 'any' }
  })
  const input = f.seen[0].body
  assert.equal(input.searchStringsArray.length, 13)
  assert.ok(
    input.searchStringsArray.includes('restaurant') && input.searchStringsArray.includes('car repair')
  )
  assert.ok(input.maxCrawledPlacesPerSearch * input.searchStringsArray.length <= 40)
  assert.equal(r.provider, 'google-maps')

  const one = fakeFetch()
  await discoverRestaurants(area, {
    fetch: one.fetch,
    resolve,
    provider: 'apify',
    token: 'tok',
    limit: 40,
    filters: { trade: 'home' }
  })
  assert.deepEqual(
    [one.seen[0].body.searchStringsArray, one.seen[0].body.maxCrawledPlacesPerSearch],
    [['plumber'], 40]
  )
})

test('an area search ranks by distance from the point, so small places nearby come before famous ones further out', async () => {
  for (const trade of ['any', 'beauty']) {
    const f = fakeFetch()
    await discoverRestaurants(area, { fetch: f.fetch, resolve, googleKey: KEY, filters: { trade } })
    const nearby = f.seen.find((s) => s.url.endsWith('places:searchNearby'))
    assert.ok(nearby, `${trade}: a Nearby call`)
    assert.equal(nearby.body.rankPreference, 'DISTANCE', trade)
  }
})
