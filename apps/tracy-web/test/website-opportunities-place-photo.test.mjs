// `website-opportunities/src/place-photo.js`: the listing's first photo name through Place Details with the
// `photos` field mask only (Essentials IDs Only SKU), and the credit Google requires beside it.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  creditOf,
  fetchPlacePhotoName,
  isPlaceId,
  placeIdOfPhotoName
} from 'website-opportunities/src/place-photo.js'

test('place photo name: the photos mask only, the first photo with its authors, null without one', async () => {
  const asked = []
  const fetchLimited = async (url, deps) => {
    asked.push({ url, deps })
    const photos = url.endsWith('/ChIJ-none')
      ? []
      : [
          {
            name: 'places/ChIJ-x/photos/p1',
            authorAttributions: [{ displayName: 'Lan' }, { displayName: ' Minh ' }]
          },
          { name: 'places/ChIJ-x/photos/p2' }
        ]
    return {
      url,
      status: 200,
      mime: 'application/json',
      bytes: new TextEncoder().encode(JSON.stringify({ photos }))
    }
  }
  const got = await fetchPlacePhotoName('ChIJ-x', { googleKey: 'AIza-k', fetchLimited, fetch })
  assert.deepEqual(got, { name: 'places/ChIJ-x/photos/p1', credit: 'Lan, Minh' })
  assert.equal(asked[0].url, 'https://places.googleapis.com/v1/places/ChIJ-x')
  assert.deepEqual(asked[0].deps.headers, { 'X-Goog-Api-Key': 'AIza-k', 'X-Goog-FieldMask': 'photos' })
  assert.equal(await fetchPlacePhotoName('ChIJ-none', { googleKey: 'AIza-k', fetchLimited, fetch }), null)
  await assert.rejects(fetchPlacePhotoName('ChIJ-x', { fetchLimited, fetch }), { code: 'CREDENTIAL_MISSING' })
  await assert.rejects(fetchPlacePhotoName('bad id', { googleKey: 'k', fetchLimited, fetch }), {
    code: 'PROVIDER_ERROR'
  })
  const quota = async () => ({ status: 429, bytes: new Uint8Array() })
  await assert.rejects(fetchPlacePhotoName('ChIJ-x', { googleKey: 'k', fetchLimited: quota, fetch }), {
    code: 'QUOTA'
  })
  const timeout = async () => {
    throw Object.assign(new Error('x https://…?key=AIza-k'), { code: 'TIMEOUT' })
  }
  await assert.rejects(
    fetchPlacePhotoName('ChIJ-x', { googleKey: 'AIza-k', fetchLimited: timeout, fetch }),
    (e) => {
      assert.equal(e.code, 'TIMEOUT')
      assert.ok(!e.message.includes('AIza-k'))
      return true
    }
  )
  assert.equal(isPlaceId('ChIJN1t_tDeuEmsRUsoyG83frY4'), true)
  assert.equal(isPlaceId('a/b'), false)
  assert.equal(creditOf([{ displayName: 'A', uri: 'x' }, 'B', {}]), 'A, B')
  assert.equal(placeIdOfPhotoName('places/ChIJ-x/photos/p1'), 'ChIJ-x')
  assert.equal(placeIdOfPhotoName('places/ChIJ-x/photos'), null)
  assert.equal(placeIdOfPhotoName('x'), null)
})
