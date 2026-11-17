// The needs profile research keeps a map photo the step chain's ownership rule calls the business's own (`isOwnersPhoto`,
// `asset-origin.mjs`): a Google author named as the business, or a vision label saying it is the business's own photo
// (`assetRelationsOf` `isOwnPhoto`). A map photo by a stranger, or one nobody vouched for, stays set aside as not own.
// An invented florist; no real place, person or photo.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-needs-research-own-photo.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { researchOf } from '../domain/needs-research.mjs'

const photo = (id, more) => ({
  id,
  kind: 'image',
  category: 'other',
  source: 'google-places',
  credit: '',
  uploaderRole: 'unknown',
  content: 'venue',
  ...more
})

const brief = () => ({
  schemaVersion: 2,
  business: { name: 'Thistlegate Florals' },
  facts: [],
  content: { items: [] },
  brand: {},
  assets: [
    photo('g-author', { credit: 'Thistlegate Florals', isOwnPhoto: true }),
    photo('g-vision', { credit: 'Invented Visitor One', isOwnPhoto: true }),
    photo('g-stranger', { credit: 'Invented Visitor Two', isOwnPhoto: false }),
    photo('g-unknown', { credit: 'Invented Visitor Three', isOwnPhoto: null })
  ]
})

const manifest = ['g-author', 'g-vision', 'g-stranger', 'g-unknown'].map((id) => ({
  id,
  sourceUrl: `google-places:places/invented/photos/${id}`
}))

test('a map photo the ownership rule calls the business own is kept; the others stay set aside as not own', () => {
  const { sources, setAside } = researchOf(brief(), { manifest })
  const kept = sources.flatMap((s) => (s.pictures ?? []).map((p) => [s.id, p.id]))
  assert.deepEqual(kept, [
    ['google', 'g-author'],
    ['google', 'g-vision']
  ])
  assert.deepEqual(
    setAside.filter((s) => s.what === 'picture').map((s) => [s.id, s.reason, s.source, s.notOwn === true]),
    [
      ['g-stranger', 'a map photo posted by someone else', 'google-places', true],
      ['g-unknown', 'a map photo posted by someone else', 'google-places', true]
    ]
  )
})

test('a picture from a source that names no owner is kept only when the ownership rule vouches for it', () => {
  const b = brief()
  b.assets = [
    photo('l-own', { source: 'listing', isOwnPhoto: true }),
    photo('l-other', { source: 'listing', isOwnPhoto: null })
  ]
  const { sources, setAside } = researchOf(b, {
    manifest: [
      { id: 'l-own', sourceUrl: 'https://img.listing.example/own.jpg' },
      { id: 'l-other', sourceUrl: 'https://img.listing.example/other.jpg' }
    ]
  })
  assert.deepEqual(
    sources.flatMap((s) => (s.pictures ?? []).map((p) => p.id)),
    ['l-own']
  )
  assert.deepEqual(
    setAside.filter((s) => s.what === 'picture').map((s) => [s.id, s.reason, s.notOwn === true]),
    [['l-other', 'not the business own photo', true]]
  )
})
