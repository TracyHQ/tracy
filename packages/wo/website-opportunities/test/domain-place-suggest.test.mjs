import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  GPLACES_AUTOCOMPLETE_URL,
  SUGGEST_PRIMARY_TYPES,
  suggestPlaces
} from '../domain/discovery-gplaces.mjs'
import { PLACE_LOCATION_FIELDS, fetchPlaceLocation } from '../domain/gplaces-details.mjs'
import * as domain from '../domain/index.mjs'

const KEY = 'AIzaSECRETkey123'
const TOKEN = '0f8b8c1e-4a8e-4c1e-9d55-6a9b1f2b9c11'
const resolve = async () => [{ address: '93.184.216.34', family: 4 }]
const okJson = (b, status = 200) =>
  new Response(typeof b === 'string' ? b : JSON.stringify(b), {
    status,
    headers: { 'content-type': 'application/json' }
  })
const prediction = (placeId, main, secondary, types) => ({
  placePrediction: {
    placeId,
    ...(types ? { types } : {}),
    text: { text: secondary ? `${main}, ${secondary}` : main },
    structuredFormat: {
      mainText: { text: main },
      ...(secondary ? { secondaryText: { text: secondary } } : {})
    }
  }
})

function recorder(answer) {
  const seen = []
  const fetch = async (url, init = {}) => {
    seen.push({ url: String(url), init })
    return typeof answer === 'function' ? answer(url, init) : answer
  }
  return { fetch, seen }
}

test('suggestPlaces: one Autocomplete (New) POST, key in the header only, businesses and areas, the session token and language', async () => {
  const { fetch, seen } = recorder(
    okJson({
      suggestions: [
        prediction('ChIJdn', 'Da Nang', 'Vietnam', ['locality', 'political', 'geocode', 7]),
        { queryPrediction: { text: { text: 'da nang food' } } }
      ]
    })
  )
  const out = await suggestPlaces(
    { input: '  da nang ', sessionToken: TOKEN, language: 'vi' },
    { googleKey: KEY, fetch, resolve }
  )
  // `types` rides along so the browser can tell a city (geocoded by name) from a neighbourhood (searched at its point).
  assert.deepEqual(out, [
    {
      placeId: 'ChIJdn',
      text: 'Da Nang, Vietnam',
      mainText: 'Da Nang',
      secondaryText: 'Vietnam',
      types: ['locality', 'political', 'geocode']
    }
  ])
  assert.match(
    new Headers(seen[0].init.headers).get('x-goog-fieldmask'),
    /suggestions\.placePrediction\.types/
  )
  assert.equal(seen.length, 1)
  assert.equal(seen[0].url, GPLACES_AUTOCOMPLETE_URL)
  assert.equal(seen[0].init.method, 'POST')
  assert.doesNotMatch(seen[0].url, /AIza/)
  const headers = new Headers(seen[0].init.headers)
  assert.equal(headers.get('x-goog-api-key'), KEY)
  const body = JSON.parse(seen[0].init.body)
  assert.deepEqual(body, { input: 'da nang', sessionToken: TOKEN, languageCode: 'vi' })
  // test-quality: contract an export kept for area-only callers outside this module; its list must not drift
  assert.deepEqual(SUGGEST_PRIMARY_TYPES, [
    'locality',
    'sublocality',
    'administrative_area_level_1',
    'administrative_area_level_2',
    'neighborhood'
  ])
})

test('suggestPlaces: no session token or language is simply left out; nameless or id-less predictions are dropped; at most 5', async () => {
  const many = Array.from({ length: 8 }, (_, i) => prediction(`ChIJ${i}`, `Town ${i}`))
  const { fetch, seen } = recorder(
    okJson({
      suggestions: [
        { placePrediction: { placeId: 'x' } },
        { placePrediction: { text: { text: 'No id' } } },
        ...many
      ]
    })
  )
  const out = await suggestPlaces({ input: 'town' }, { googleKey: KEY, fetch, resolve })
  assert.equal(out.length, 5)
  assert.deepEqual(out[0], {
    placeId: 'ChIJ0',
    text: 'Town 0',
    mainText: 'Town 0',
    secondaryText: null,
    types: []
  })
  const body = JSON.parse(seen[0].init.body)
  assert.equal('sessionToken' in body, false)
  assert.equal('languageCode' in body, false)
  const empty = recorder(okJson({}))
  assert.deepEqual(await suggestPlaces({ input: 'zzz' }, { googleKey: KEY, fetch: empty.fetch, resolve }), [])
})

test('suggestPlaces: errors carry a code and never the key', async () => {
  await assert.rejects(suggestPlaces({ input: 'da nang' }, { fetch: async () => okJson({}), resolve }), {
    code: 'CREDENTIAL_MISSING'
  })
  await assert.rejects(
    suggestPlaces(
      { input: 'da nang' },
      { googleKey: KEY, fetch: async () => okJson({ error: {} }, 429), resolve }
    ),
    { code: 'QUOTA' }
  )
  await assert.rejects(
    suggestPlaces(
      { input: 'da nang' },
      { googleKey: KEY, fetch: async () => okJson('billing not enabled', 403), resolve }
    ),
    { code: 'QUOTA' }
  )
  await assert.rejects(
    suggestPlaces({ input: 'da nang' }, { googleKey: KEY, fetch: async () => okJson({}, 500), resolve }),
    { code: 'PROVIDER_ERROR', status: 500 }
  )
  await assert.rejects(
    suggestPlaces({ input: 'da nang' }, { googleKey: KEY, fetch: async () => okJson('not json'), resolve }),
    { code: 'PROVIDER_ERROR' }
  )
  const leaky = async () => {
    throw new Error(`socket hang up for key=${KEY}`)
  }
  await assert.rejects(
    suggestPlaces({ input: 'da nang' }, { googleKey: KEY, fetch: leaky, resolve }),
    (err) => {
      assert.equal(err.code, 'PROVIDER_ERROR')
      assert.doesNotMatch(err.message, /AIzaSECRET/)
      return true
    }
  )
})

test('fetchPlaceLocation: Place Details with the narrow mask and the session token; label, lat, lon', async () => {
  const { fetch, seen } = recorder(
    okJson({
      id: 'ChIJdn',
      displayName: { text: 'Da Nang' },
      formattedAddress: 'Da Nang, Vietnam',
      location: { latitude: 16.054, longitude: 108.202 }
    })
  )
  const out = await fetchPlaceLocation('ChIJdn', {
    googleKey: KEY,
    fetch,
    resolve,
    sessionToken: TOKEN,
    language: 'en'
  })
  assert.deepEqual(out, { placeId: 'ChIJdn', label: 'Da Nang, Vietnam', lat: 16.054, lon: 108.202 })
  assert.equal(PLACE_LOCATION_FIELDS, 'id,displayName,formattedAddress,location')
  const url = new URL(seen[0].url)
  assert.equal(url.origin + url.pathname, 'https://places.googleapis.com/v1/places/ChIJdn')
  assert.equal(url.searchParams.get('sessionToken'), TOKEN)
  assert.equal(url.searchParams.get('languageCode'), 'en')
  assert.doesNotMatch(seen[0].url, /AIza/)
  const headers = new Headers(seen[0].init.headers)
  assert.equal(headers.get('x-goog-fieldmask'), PLACE_LOCATION_FIELDS)
  assert.equal(headers.get('x-goog-api-key'), KEY)
})

test('fetchPlaceLocation: the display name when there is no address; null without a location; bad ids and missing keys refused', async () => {
  const named = recorder(
    okJson({ id: 'ChIJa', displayName: { text: 'Hoi An' }, location: { latitude: 15.88, longitude: 108.33 } })
  )
  assert.deepEqual(await fetchPlaceLocation('ChIJa', { googleKey: KEY, fetch: named.fetch, resolve }), {
    placeId: 'ChIJa',
    label: 'Hoi An',
    lat: 15.88,
    lon: 108.33
  })
  assert.equal(new URL(named.seen[0].url).searchParams.has('sessionToken'), false)
  const nowhere = recorder(okJson({ id: 'ChIJb', displayName: { text: 'Nowhere' } }))
  assert.equal(await fetchPlaceLocation('ChIJb', { googleKey: KEY, fetch: nowhere.fetch, resolve }), null)
  await assert.rejects(fetchPlaceLocation('../x', { googleKey: KEY, fetch: named.fetch, resolve }), {
    code: 'PROVIDER_ERROR'
  })
  await assert.rejects(fetchPlaceLocation('ChIJa', { fetch: named.fetch, resolve }), {
    code: 'CREDENTIAL_MISSING'
  })
  await assert.rejects(
    fetchPlaceLocation('ChIJa', { googleKey: KEY, fetch: async () => okJson({}, 429), resolve }),
    { code: 'QUOTA' }
  )
})

test('the domain index exports both and names the capability', () => {
  assert.equal(domain.suggestPlaces, suggestPlaces)
  assert.equal(domain.fetchPlaceLocation, fetchPlaceLocation)
  assert.ok(domain.CONTRACT.capabilities.includes('discovery.google-places.autocomplete'))
})
