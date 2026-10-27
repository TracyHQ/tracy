import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dedupeCandidates } from '../domain/dedupe.mjs'

const c = (over) => ({
  provider: 'osm',
  providerId: 'node/1',
  name: 'Brewlet Coffee',
  lat: 15.8771,
  lon: 108.3261,
  socials: {},
  ...over
})

test('the same providerId collapses to one candidate, merging fields that were missing', () => {
  const out = dedupeCandidates([
    c({ phone: '+84 1' }),
    c({ website: 'https://phin.vn/', socials: { facebook: 'https://facebook.com/phin' } })
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].phone, '+84 1')
  assert.equal(out[0].website, 'https://phin.vn/')
  assert.equal(out[0].socials.facebook, 'https://facebook.com/phin')
})

test('same normalised name within 60 m is one place (node + way of the same cafe)', () => {
  const out = dedupeCandidates([
    c({ providerId: 'node/1', name: 'Brewlet Coffee' }),
    c({ providerId: 'way/9', name: 'BREWLET  coffee!', lat: 15.8773, lon: 108.3262 }) // ~25 m
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].providerId, 'node/1')
})

test('Vietnamese diacritics do not split a name', () => {
  const out = dedupeCandidates([
    c({ name: 'Bánh Mì Sương' }),
    c({ providerId: 'way/2', name: 'Banh Mi Suong', lat: 15.8772 })
  ])
  assert.equal(out.length, 1)
})

test('same name farther than 60 m stays separate (another branch)', () => {
  const out = dedupeCandidates([c(), c({ providerId: 'node/2', lat: 15.879 })]) // ~210 m
  assert.equal(out.length, 2)
})

test('different branches stay separate even when close', () => {
  const out = dedupeCandidates([
    c({ branch: 'Old Town' }),
    c({ providerId: 'node/2', branch: 'An Bang', lat: 15.8772 })
  ])
  assert.equal(out.length, 2)
})

test('different names close together stay separate', () => {
  const out = dedupeCandidates([c(), c({ providerId: 'node/2', name: 'Moon Lotus', lat: 15.8771 })])
  assert.equal(out.length, 2)
})
