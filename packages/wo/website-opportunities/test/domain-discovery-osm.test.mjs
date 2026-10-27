import { test } from 'node:test'
import assert from 'node:assert/strict'
import { geocode, searchRestaurants, normaliseSocial, OVERPASS_ENDPOINTS } from '../domain/discovery-osm.mjs'

const resolve = async () => [{ address: '93.184.216.34', family: 4 }]
const json = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

const OVERPASS_FIXTURE = {
  elements: [
    {
      type: 'node',
      id: 101,
      lat: 15.8771,
      lon: 108.3261,
      tags: {
        amenity: 'cafe',
        name: 'Brewlet Coffee',
        branch: 'Old Town',
        'contact:website': 'brewletcoffee.example',
        'contact:facebook': 'brewletcoffeehoian',
        instagram: '@brewletcoffeehoian',
        'contact:tiktok': 'brewlet.coffee',
        'contact:youtube': 'https://www.youtube.com/@brewletcoffee',
        'contact:phone': '+84 235 555 0134',
        'addr:housenumber': '12',
        'addr:street': 'Trần Phú',
        'addr:city': 'Hội An'
      }
    },
    {
      type: 'way',
      id: 202,
      center: { lat: 15.88, lon: 108.33 },
      tags: {
        amenity: 'restaurant',
        name: 'Moon Lotus',
        website: 'https://msthu-tastevietnam.example/',
        phone: '+84 235 555 0155',
        brand: 'Ms Thu',
        facebook: 'https://facebook.com/moonlotus'
      }
    },
    { type: 'node', id: 303, lat: 1, lon: 2, tags: { amenity: 'bar' } }
  ]
}

test('searchRestaurants posts the agreed Overpass query and maps tags to candidates', async () => {
  const calls = []
  const fetch = async (url, init) => {
    calls.push({ url, init })
    return json(OVERPASS_FIXTURE)
  }
  const list = await searchRestaurants({ lat: 15.8771, lon: 108.3261, radiusM: 3000 }, { fetch, resolve })

  assert.equal(calls[0].url, OVERPASS_ENDPOINTS[0])
  assert.equal(calls[0].init.method, 'POST')
  assert.match(
    calls[0].init.headers['user-agent'],
    /^TracyWebsiteOpportunities\/0\.1 \(\+https:\/\/tracy\.ai\)$/
  )
  const q = new URLSearchParams(calls[0].init.body).get('data')
  assert.match(
    q,
    /nwr\[amenity~"\^\(restaurant\|cafe\|fast_food\|bar\|pub\)\$"\]\(around:3000,15\.8771,108\.3261\);out tags center 300;/
  )

  assert.equal(list.length, 2, 'unnamed places are dropped')
  assert.deepEqual(list[0], {
    provider: 'osm',
    providerId: 'node/101',
    name: 'Brewlet Coffee',
    branch: 'Old Town',
    address: '12 Trần Phú, Hội An',
    phone: '+84 235 555 0134',
    lat: 15.8771,
    lon: 108.3261,
    website: 'https://brewletcoffee.example/',
    socials: {
      facebook: 'https://www.facebook.com/brewletcoffeehoian',
      instagram: 'https://www.instagram.com/brewletcoffeehoian/',
      tiktok: 'https://www.tiktok.com/@brewlet.coffee',
      youtube: 'https://www.youtube.com/@brewletcoffee'
    }
  })
  assert.equal(list[1].providerId, 'way/202')
  assert.equal(list[1].lat, 15.88)
  assert.equal(list[1].brand, 'Ms Thu')
  assert.equal(list[1].socials.facebook, 'https://facebook.com/moonlotus')
  assert.equal('address' in list[1], false, 'missing data stays absent, never invented')
})

test('searchRestaurants clamps the radius to 10 km', async () => {
  let body
  const fetch = async (url, init) => {
    body = init.body
    return json({ elements: [] })
  }
  await searchRestaurants({ lat: 1, lon: 2, radiusM: 999_999 }, { fetch, resolve })
  assert.match(new URLSearchParams(body).get('data'), /around:10000,1,2\)/)
})

test('geocode calls Nominatim and returns the first hit or null', async () => {
  const urls = []
  const fetch = async (url) => {
    urls.push(url)
    return url.includes('nowhere')
      ? json([])
      : json([{ display_name: 'Hội An, Quảng Nam, Việt Nam', lat: '15.8794', lon: '108.3350' }])
  }
  assert.deepEqual(await geocode('Hội An', { fetch, resolve }), {
    label: 'Hội An, Quảng Nam, Việt Nam',
    lat: 15.8794,
    lon: 108.335
  })
  assert.equal(urls[0], 'https://nominatim.openstreetmap.org/search?format=json&limit=5&q=H%E1%BB%99i%20An')
  assert.equal(await geocode('nowhere', { fetch, resolve }), null)
})

// Measured on dev 19/10/2026: Vietnam's 2025 reform turned former cities into `boundary=historic`
// relations that Nominatim ranks first; Nha Trang's centroid lies 10 km out at sea (1 place found).
test('geocode skips a defunct (historic) boundary for the place node of the same name', async () => {
  const hits = [
    {
      class: 'boundary',
      type: 'historic',
      display_name: 'Thành phố Nha Trang, Tỉnh Khánh Hòa, Việt Nam',
      lat: '12.2084991',
      lon: '109.2871204'
    },
    {
      class: 'office',
      type: 'government',
      display_name: 'White House, 1600, Pennsylvania Avenue Northwest',
      lat: '38.8976387',
      lon: '-77.0365525'
    },
    {
      class: 'railway',
      type: 'station',
      display_name: 'Nha Trang, Thái Nguyên, Phường Nha Trang',
      lat: '12.2484820',
      lon: '109.1842855'
    },
    {
      class: 'boundary',
      type: 'administrative',
      display_name: 'Phường Nha Trang, Nha Trang, Tỉnh Khánh Hòa, Việt Nam',
      lat: '12.2348769',
      lon: '109.1941443'
    },
    {
      class: 'place',
      type: 'city',
      display_name: 'Nha Trang, Tỉnh Khánh Hòa, 57100, Việt Nam',
      lat: '12.2471850',
      lon: '109.1892066'
    }
  ]
  const fetch = async () => json(hits)
  assert.deepEqual(await geocode('Nha Trang', { fetch, resolve }), {
    label: 'Nha Trang, Tỉnh Khánh Hòa, 57100, Việt Nam',
    lat: 12.247185,
    lon: 109.1892066
  })
  // No place node: the current administrative boundary, never an unrelated hit like the White House.
  const noPlace = hits.slice(0, 4)
  assert.equal((await geocode('Nha Trang', { fetch: async () => json(noPlace), resolve })).lat, 12.2348769)
  // Nothing better than the historic boundary: keep it rather than jump to another country.
  const onlyHistoric = hits.slice(0, 3)
  assert.equal(
    (await geocode('Nha Trang', { fetch: async () => json(onlyHistoric), resolve })).lat,
    12.2084991
  )
  // A first hit that is not historic is kept as Nominatim ranked it.
  const current = [hits[3], hits[4]]
  assert.equal((await geocode('Nha Trang', { fetch: async () => json(current), resolve })).lat, 12.2348769)
})

test('provider errors surface with a code instead of an empty list', async () => {
  const fetch = async () => new Response('busy', { status: 429 })
  await assert.rejects(searchRestaurants({ lat: 1, lon: 2, radiusM: 100 }, { fetch, resolve }), {
    code: 'PROVIDER_ERROR',
    status: 429
  })
})

test('normaliseSocial turns bare handles into full URLs per network', () => {
  assert.equal(
    normaliseSocial('facebook', 'brewletcoffeehoian'),
    'https://www.facebook.com/brewletcoffeehoian'
  )
  assert.equal(normaliseSocial('instagram', '@abc'), 'https://www.instagram.com/abc/')
  assert.equal(normaliseSocial('tiktok', '@abc'), 'https://www.tiktok.com/@abc')
  assert.equal(normaliseSocial('youtube', 'abc'), 'https://www.youtube.com/@abc')
  assert.equal(normaliseSocial('facebook', 'www.facebook.com/abc'), 'https://www.facebook.com/abc')
  assert.equal(normaliseSocial('instagram', 'http://instagram.com/abc'), 'http://instagram.com/abc')
  assert.equal(normaliseSocial('facebook', ''), undefined)
  assert.equal(normaliseSocial('facebook', 'has space'), undefined)
})

test('searchRestaurants falls back to the next Overpass endpoint on 502', async () => {
  const { searchRestaurants } = await import('../domain/discovery-osm.mjs')
  const calls = []
  const fetch = async (url) => {
    calls.push(String(url))
    if (calls.length === 1) return new Response('busy', { status: 502 })
    return new Response(
      JSON.stringify({
        elements: [{ type: 'node', id: 1, lat: 1, lon: 2, tags: { amenity: 'restaurant', name: 'A' } }]
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  }
  const resolve = async () => [{ address: '93.184.216.34', family: 4 }]
  const list = await searchRestaurants(
    { lat: 1, lon: 2, radiusM: 500 },
    {
      fetch,
      resolve,
      overpassEndpoints: ['https://a.example/api/interpreter', 'https://b.example/api/interpreter']
    }
  )
  assert.equal(calls.length, 2)
  assert.equal(list[0].name, 'A')
})
