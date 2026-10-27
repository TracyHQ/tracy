import test from 'node:test'
import assert from 'node:assert/strict'
import { mediaUrl } from '../src/lib/media.ts'

test('local storage keys stay same-origin even with an absolute public src', () => {
  const image = {
    provider: 'local',
    src: 'https://private.example/image.png',
    meta: { storageKey: 'asset.version.png' }
  }
  assert.equal(mediaUrl(image), '/_emdash/api/media/file/asset.version.png')
  assert.equal(mediaUrl({ meta: image.meta }), '/_emdash/api/media/file/asset.version.png')
})

test('external providers and external source URLs are preserved', () => {
  const src = 'https://cdn.example/image.png'
  assert.equal(mediaUrl({ provider: 'cdn', src, meta: { storageKey: 'external-key' } }), src)
  assert.equal(mediaUrl({ url: src }), src)
  assert.equal(mediaUrl(src), src)
})

test('missing images stay empty rather than manufacturing a URL', () => {
  assert.equal(mediaUrl(null), null)
  assert.equal(mediaUrl({}), null)
})

// Portable Text image blocks carry `asset.url` as an ABSOLUTE URL on the configured public origin
// (EmDash rebuilds it at upload). A direct preview or a private proxy at another origin cannot
// decode it (ORB), so the body renderer must serve local media from the viewing origin, like
// mediaUrl() does for image fields.
import { bodyImageUrl } from '../src/lib/media.ts'

test('body image: a local asset resolves to the same-origin media path whatever origin the stored url carries', () => {
  assert.equal(
    bodyImageUrl({
      _ref: 'id1',
      url: 'http://tracy-business-local-qa2.tracy.test:51710/_emdash/api/media/file/key.png'
    }),
    '/_emdash/api/media/file/key.png'
  )
  assert.equal(
    bodyImageUrl({ _ref: 'id1', url: '/_emdash/api/media/file/key.png' }),
    '/_emdash/api/media/file/key.png'
  )
  assert.equal(bodyImageUrl({ _ref: 'id1', provider: 'local' }), '/_emdash/api/media/file/id1')
})

test('body image: external providers and external urls are preserved; no asset → null', () => {
  assert.equal(
    bodyImageUrl({ _ref: 'x', provider: 'cloudflare-images', url: 'https://imagedelivery.net/x/public' }),
    'https://imagedelivery.net/x/public'
  )
  assert.equal(bodyImageUrl({ _ref: 'x', url: 'https://cdn.example/a.png' }), 'https://cdn.example/a.png')
  assert.equal(bodyImageUrl(null), null)
})
