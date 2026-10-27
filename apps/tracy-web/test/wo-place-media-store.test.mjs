// Place media in the shared bucket (tasks/plan-wo-shared-places.md §7): content-addressed keys under
// `media/google/` or `media/other/`, and one objects adapter that reads each key from the store its
// prefix names. In-memory stores; no network.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  placeMediaOrigin,
  routePlaceMediaObjects,
  sharedMediaKey
} from 'website-opportunities/src/place-media-store.js'

const SHA = 'ab'.repeat(32)

function memoryStore(name) {
  const objects = new Map()
  return {
    objects,
    name,
    async put(key, bytes) {
      objects.set(key, Buffer.from(bytes))
      return true
    },
    async get(key) {
      return objects.has(key) ? new Response(objects.get(key)) : null
    },
    async head(key) {
      return objects.has(key) ? { size: objects.get(key).length } : null
    },
    async publicUrl(key) {
      return `https://${name}.example/${key}`
    },
    async delete(key) {
      objects.delete(key)
    }
  }
}

test('a shared key names the content, not the place, and its origin prefix', () => {
  assert.equal(sharedMediaKey({ sha256: SHA, ext: 'jpg', origin: 'google' }), `media/google/ab/${SHA}.jpg`)
  assert.equal(sharedMediaKey({ sha256: SHA, ext: 'mp4', origin: 'other' }), `media/other/ab/${SHA}.mp4`)
  assert.throws(() => sharedMediaKey({ sha256: 'nothex', ext: 'jpg', origin: 'google' }))
  assert.throws(() => sharedMediaKey({ sha256: SHA, ext: 'jpg', origin: 'mars' }))
})

test('Google-served media goes under google/: Places, Maps (also through SerpApi), and Google credits', () => {
  const google = [
    { source: 'google-places', provider: 'google' },
    { source: 'google-maps', provider: 'serpapi' },
    { source: 'google-maps', provider: 'tripadvisor' },
    { source: 'google-places-search', provider: null },
    { source: 'website', provider: 'website', credit: { provider: 'Google', authors: [] } },
    { source: 'website', provider: 'website', credit: { googlePlaceId: 'ChIJx' } }
  ]
  for (const m of google) assert.equal(placeMediaOrigin(m), 'google', JSON.stringify(m))
  const other = [
    { source: 'website', provider: 'website' },
    { source: 'instagram', provider: 'apify' },
    { source: 'tripadvisor', provider: 'tripadvisor' }
  ]
  for (const m of other) assert.equal(placeMediaOrigin(m), 'other', JSON.stringify(m))
})

test('reads and writes go to the store the key prefix names; the shared bucket is never deleted from', async () => {
  const local = memoryStore('local')
  const shared = memoryStore('shared')
  const objects = routePlaceMediaObjects({ local, shared })
  const key = sharedMediaKey({ sha256: SHA, ext: 'png', origin: 'other' })
  assert.equal(await objects.put(key, new Uint8Array([1, 2]), 'image/png'), true)
  assert.equal(await objects.put('places/p1/x.png', new Uint8Array([3]), 'image/png'), true)
  assert.ok(shared.objects.has(key))
  assert.ok(local.objects.has('places/p1/x.png'))
  assert.equal(local.objects.has(key), false)
  assert.deepEqual(Buffer.from(await (await objects.get(key)).arrayBuffer()), Buffer.from([1, 2]))
  assert.equal(await objects.publicUrl(key), `https://shared.example/${key}`)
  assert.equal(await objects.publicUrl('places/p1/x.png'), 'https://local.example/places/p1/x.png')
  assert.deepEqual(await objects.head(key), { size: 2 })
  await objects.delete(key)
  assert.ok(shared.objects.has(key), 'WO never deletes from the shared bucket')
  await objects.delete('places/p1/x.png')
  assert.equal(local.objects.has('places/p1/x.png'), false)
})

test('the shared key is offered only when the shared store is configured', () => {
  const m = { sha256: SHA, source: 'website', provider: 'website' }
  assert.equal(routePlaceMediaObjects({ local: memoryStore('l'), shared: null }).sharedKey(m, 'png'), null)
  assert.equal(
    routePlaceMediaObjects({ local: memoryStore('l'), shared: memoryStore('s') }).sharedKey(m, 'png'),
    `media/other/ab/${SHA}.png`
  )
})

test('with neither store there are no objects; a media/ key without the shared store is unreadable', async () => {
  assert.equal(routePlaceMediaObjects({ local: null, shared: null }), null)
  const objects = routePlaceMediaObjects({ local: memoryStore('l'), shared: null })
  assert.equal(await objects.get(`media/other/ab/${SHA}.png`), null)
  assert.equal(await objects.publicUrl(`media/other/ab/${SHA}.png`), null)
  assert.equal(await objects.put(`media/other/ab/${SHA}.png`, new Uint8Array([1]), 'image/png'), false)
})
