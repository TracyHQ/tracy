import { test } from 'node:test'
import assert from 'node:assert/strict'
import { candidateFromGmaps, discoverRestaurants } from '../domain/discovery-gmaps.mjs'

const resolve = async () => [{ address: '93.184.216.34', family: 4 }]
const place = (o) => ({
  title: 'Tamarel Restaurant',
  placeId: 'ChIJ1',
  address: '27 Example Street',
  phone: '+84 900 000 510',
  location: { lat: 15.9, lng: 108.3 },
  ...o
})

test('a Facebook "website" becomes a social link; closed places are dropped', () => {
  const c = candidateFromGmaps(place({ website: 'https://www.facebook.com/TamarelHoiAn' }))
  assert.equal(c.provider, 'google-maps')
  assert.equal(c.providerId, 'ChIJ1')
  assert.equal(c.website, undefined)
  assert.equal(c.socials.facebook, 'https://www.facebook.com/TamarelHoiAn')
  assert.equal(c.lon, 108.3)
  assert.equal(candidateFromGmaps(place({ permanentlyClosed: true })), null)
  assert.equal(
    candidateFromGmaps(place({ website: 'https://tamarel.example/' })).website,
    'https://tamarel.example/'
  )
  const zalo = candidateFromGmaps(place({ website: 'http://zalo.me/84905550101' }))
  assert.equal(zalo.website, undefined)
  assert.equal(zalo.contacts.zalo, 'http://zalo.me/84905550101')
})

test('Google Maps with a token; OSM when it fails or without a token', async () => {
  const osm = JSON.stringify({
    elements: [{ type: 'node', id: 7, lat: 1, lon: 2, tags: { amenity: 'restaurant', name: 'From OSM' } }]
  })
  const okJson = (b) => new Response(b, { status: 200, headers: { 'content-type': 'application/json' } })
  const seen = []
  const fetch =
    (gmaps) =>
    async (url, init = {}) => {
      seen.push({ url: String(url), auth: init.headers?.authorization })
      return String(url).startsWith('https://api.apify.com/') ? gmaps() : okJson(osm)
    }
  const area = { lat: 1, lon: 2, radiusM: 500, overpassEndpoints: undefined }
  const g = await discoverRestaurants(area, {
    fetch: fetch(() => okJson(JSON.stringify([place({})]))),
    resolve,
    token: 'tok'
  })
  assert.equal(g.provider, 'google-maps')
  assert.equal(g.candidates[0].name, 'Tamarel Restaurant')
  assert.ok(!seen[0].url.includes('tok'))
  const q = await discoverRestaurants(area, {
    fetch: fetch(() => new Response('{}', { status: 402 })),
    resolve,
    token: 'tok'
  })
  assert.deepEqual([q.provider, q.fallbackFrom.code, q.candidates[0].name], ['osm', 'QUOTA', 'From OSM'])
  const n = await discoverRestaurants(area, {
    fetch: fetch(() => {
      throw new Error('no apify without token')
    }),
    resolve
  })
  assert.equal(n.provider, 'osm')
})
