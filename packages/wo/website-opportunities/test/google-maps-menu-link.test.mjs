import assert from 'node:assert/strict'
import { test } from 'node:test'
import { googleMapsSerpapiCall, mapsMenuLink } from '../src/google-maps-serpapi.js'

const PLACE_ID = 'ChIJMenuLink1'
const DATA_ID = '0x123:0x456'
const placeBody = (menu) => ({
  search_metadata: { status: 'Success' },
  place_results: {
    place_id: PLACE_ID,
    data_id: DATA_ID,
    title: 'Ravi',
    ...(menu === undefined ? {} : { menu })
  }
})
const call = (body) =>
  googleMapsSerpapiCall('place', { placeId: PLACE_ID }, { key: 'k', fetch: async () => Response.json(body) })

test('the place lookup returns the menu link Google lists for the place', async () => {
  const place = await call(
    placeBody({
      link: 'https://places.singleplatform.com/ravi/menu?ref=google',
      source: 'places.singleplatform.com'
    })
  )
  assert.deepEqual(place.menuLink, {
    url: 'https://places.singleplatform.com/ravi/menu?ref=google',
    source: 'places.singleplatform.com'
  })
})

test('a place that lists no menu link has menuLink null', async () => {
  assert.equal((await call(placeBody())).menuLink, null)
})

test('a menu link that is not a public https page is dropped', () => {
  for (const link of [
    'http://example.com/menu',
    'https://user:pw@example.com/menu',
    'javascript:alert(1)',
    'not a url',
    undefined
  ])
    assert.equal(mapsMenuLink({ link, source: 'x' }), null, String(link))
  assert.equal(mapsMenuLink(undefined), null)
})
