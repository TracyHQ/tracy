import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import osm from '../src/plugins/sources/osm.js'
import {
  defineSource,
  discoverInOrder,
  fallbackReasonOf,
  loadSources,
  sourceRegistry
} from '../src/plugins/sources.js'
import { searchRestaurants } from '../domain/discovery-osm.mjs'

const resolve = async () => [{ address: '93.184.216.34', family: 4 }]
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const ELEMENTS = {
  elements: [
    {
      type: 'node',
      id: 1,
      lat: 40.7,
      lon: -74,
      tags: { amenity: 'cafe', name: 'Corner Cafe', website: 'corner.example', phone: '+1 555 0100' }
    },
    {
      type: 'way',
      id: 2,
      center: { lat: 40.71, lon: -74.01 },
      tags: { amenity: 'restaurant', name: 'Harbor Grill', 'contact:instagram': '@harborgrill' }
    },
    { type: 'node', id: 3, lat: 1, lon: 2, tags: { amenity: 'bar' } }
  ]
}
const AREA = { lat: 40.7, lon: -74, radiusM: 1500 }

test('osm: discovers exactly what the OpenStreetMap search returns, with the same request', async () => {
  const seen = []
  const fetch = async (url, init) => (seen.push([String(url), init.body]), json(ELEMENTS))
  const viaPlugin = await osm.discover(AREA, { fetch, resolve })
  const direct = await searchRestaurants(AREA, { fetch, resolve })
  assert.deepEqual(viaPlugin, direct)
  assert.deepEqual(seen[0], seen[1])
  assert.deepEqual(
    viaPlugin.map((c) => [c.provider, c.providerId, c.name]),
    [
      ['osm', 'node/1', 'Corner Cafe'],
      ['osm', 'way/2', 'Harbor Grill']
    ]
  )
  assert.deepEqual(defineSource(osm), {
    id: 'osm',
    label: 'OpenStreetMap',
    credential: null,
    groups: ['map-discovery'],
    discover: osm.discover
  })
})

test('discoverInOrder: osm answers; an empty area is not_found; a provider down falls through as skipped', async () => {
  const registry = sourceRegistry()
  const found = await discoverInOrder(registry, ['osm'], AREA, { fetch: async () => json(ELEMENTS), resolve })
  assert.equal(found.answer.provider, 'osm')
  assert.equal(found.answer.data.length, 2)
  const none = await discoverInOrder(registry, ['osm'], AREA, {
    fetch: async () => json({ elements: [] }),
    resolve
  })
  assert.deepEqual(none.attempts, [{ provider: 'osm', status: 'not_found' }])
  const down = await discoverInOrder(registry, ['osm'], AREA, { fetch: async () => json({}, 503), resolve })
  assert.deepEqual(down.attempts, [{ provider: 'osm', status: 'skipped', reason: 'provider_error' }])
  assert.equal(down.answer, null)
})

test('a keyed source without its key is skipped, and the next source answers', async () => {
  const paid = {
    id: 'example-directory',
    label: 'Example Directory',
    credential: 'google',
    groups: ['map-discovery'],
    discover: async () => [{ provider: 'example-directory', providerId: '1', name: 'X' }]
  }
  const registry = sourceRegistry([paid, osm])
  assert.deepEqual(
    registry.forGroup('map-discovery').map((s) => s.id),
    ['example-directory', 'osm']
  )
  const r = await discoverInOrder(registry, ['example-directory', 'osm'], AREA, {
    fetch: async () => json(ELEMENTS),
    resolve
  })
  assert.deepEqual(r.attempts, [
    { provider: 'example-directory', status: 'skipped', reason: 'credential_missing' },
    { provider: 'osm', status: 'complete' }
  ])
  let keySeen
  paid.discover = async (_area, deps) => (
    (keySeen = deps.key), [{ provider: 'example-directory', providerId: '1', name: 'X' }]
  )
  const keyed = await discoverInOrder(sourceRegistry([paid]), ['example-directory'], AREA, {
    keys: { google: 'k1' }
  })
  assert.equal(keyed.answer.provider, 'example-directory')
  assert.equal(keySeen, 'k1')
})

test('fallbackReasonOf maps provider failures to the catalogue reasons', () => {
  assert.equal(fallbackReasonOf({ code: 'TIMEOUT' }), 'timeout')
  assert.equal(fallbackReasonOf({ status: 429 }), 'quota')
  assert.equal(fallbackReasonOf({ code: 'QUOTA' }), 'quota')
  assert.equal(fallbackReasonOf({ status: 403 }), 'credential_invalid')
  assert.equal(fallbackReasonOf({ code: 'CREDENTIAL_MISSING' }), 'credential_missing')
  assert.equal(fallbackReasonOf(new Error('x')), 'provider_error')
})

test('defineSource refuses an unknown group, a missing function, and an id listed twice', () => {
  assert.throws(() => defineSource({ ...osm, groups: ['maps'] }), /not a capability group/)
  assert.throws(() => defineSource({ id: 'x', label: 'X', groups: ['map-discovery'] }), /needs discover/)
  assert.throws(
    () => defineSource({ id: 'x', label: 'X', groups: ['web-search'], discover: () => [] }),
    /needs collect/
  )
  assert.throws(() => sourceRegistry([osm, osm]), /twice/)
})

test('loadSources: the source files of a folder join the built-in ones', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wo-sources-'))
  await writeFile(
    join(dir, 'menu-site.js'),
    "export default { id: 'menu-site', label: 'Menu site', credential: null, groups: ['menu-links'], collect: async () => ({ links: [] }) }\n"
  )
  const registry = await loadSources(dir)
  assert.deepEqual(
    registry.list().map((s) => s.id),
    ['osm', 'menu-site']
  )
  assert.deepEqual(
    registry.forGroup('menu-links').map((s) => s.id),
    ['menu-site']
  )
})
