// C18: a demo map that is not a Google iframe is found by structure (spec TracyHQ/tracy#189). A bakery with a place of its
// own and a dental clinic with none, both made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkDemoLeftovers } from '../domain/demo-leftovers.mjs'

const page = (html) => ({
  path: '/contact',
  status: 200,
  html: `<html><body><main>${html}</main></body></html>`
})
const run = (html, brief) =>
  checkDemoLeftovers({ pages: [page(html)], contentMap: { entities: [], slots: [] }, brief })
const mapPlaces = (r) =>
  r.findings.filter((f) => f.kind === 'C18' && f.place.startsWith('map')).map((f) => f.place)

test('a map shortcode that was never turned into a map, and a provider embed, are demo maps', () => {
  const clinic = { business: { name: 'Northgate Dental', address: '9 Harbour Road' } }
  assert.deepEqual(mapPlaces(run(`<div>{gmap zoom='9' location='Demo Street'}</div>`, clinic)), [
    'map shortcode'
  ])
  assert.deepEqual(
    mapPlaces(
      run(`<iframe src="https://www.openstreetmap.org/export/embed.html?bbox=1,2,3,4"></iframe>`, clinic)
    ),
    ['map']
  )
})

test('a rendered map container holding the demo coordinates is found, the business coordinates are not', () => {
  const demo = `<div class="map-canvas" id="x"></div><script>var p={"latitude":"40.7049955","longitude":"-74.0069912"}</script>`
  const bakery = {
    business: { name: 'Copperleaf Bakery' },
    googlePlace: { location: { latitude: 51.5074, longitude: -0.1278 } }
  }
  assert.deepEqual(mapPlaces(run(demo, bakery)), ['map container'])
  const own = `<div class="leaflet-container"></div><script>var p={"lat":51.5074,"lng":-0.1278}</script>`
  assert.deepEqual(mapPlaces(run(own, bakery)), [])
})

test('a page with no map reports none', () => {
  assert.deepEqual(mapPlaces(run('<p>Open daily</p>', { business: { name: 'Copperleaf Bakery' } })), [])
})
