import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readBusinessByRules, readingSourcesOf } from '../domain/business-reading.mjs'
import { placeProfileFromResearch } from '../domain/place-profile-from-research.mjs'
import { validatePlaceProfile } from '../domain/place-profile.mjs'

// Harbour Sport Club's post (dev, 26/10/2026): one line says where it coaches, a stray word follows.
const POST = {
  source: 'instagram',
  id: 'p1',
  url: 'https://www.instagram.com/p/HSCpost0001/',
  caption: '✨Join our padel sessions in Dubai!🎾\n📍Locations across Dubai\n📲050 000 1234\n\ntrenere)'
}
const ADDRESS = 'Harbour Lane - Al Barsha - Dubai - United Arab Emirates'
const reading = {
  method: 'rules',
  version: 'business-reading-2-test',
  ...readBusinessByRules(readingSourcesOf({ posts: [POST] }))
}
const profileOf = (extra = {}) =>
  placeProfileFromResearch({
    identity: { id: 'o1', provider: 'google-places', providerId: 'ChIJdsc', name: 'Harbour Sport Club' },
    profile: { name: 'Harbour Sport Club', address: ADDRESS, businessReading: reading },
    sources: [
      { source: 'instagram', ref: 'https://www.instagram.com/harbour.sportclub', status: 'complete' }
    ],
    madeAt: '2026-10-26T10:00:00.000Z',
    ...extra
  })

test('the place profile writes business.serviceAreas from the reading, each with its verbatim quote as evidence', () => {
  const doc = profileOf()
  assert.deepEqual(doc.business.serviceAreas.value, ['Locations across Dubai'])
  const evidence = doc.evidence.filter((e) => doc.business.serviceAreas.evidenceRefs.includes(e.id))
  assert.deepEqual(
    evidence.map((e) => e.excerpt),
    ['Locations across Dubai']
  )
  assert.ok(POST.caption.includes(evidence[0].excerpt))
  assert.equal(doc.business.address.value, ADDRESS, 'a service area never becomes the address')
  assert.deepEqual(validatePlaceProfile(doc).errors ?? [], [])
})

test('a service area the person removed stays out of the place profile', () => {
  const doc = profileOf({
    identity: {
      id: 'o1',
      provider: 'google-places',
      providerId: 'ChIJdsc',
      candidate: { readingPicks: { removed: [reading.serviceAreas[0].id] } }
    }
  })
  assert.equal(doc.business.serviceAreas, undefined)
})

test('the brand colours read from the logo say so in their derivation; the accent is one of them', () => {
  const doc = profileOf({
    brand: {
      social: {
        origin: 'social',
        official: false,
        colorsFrom: 'logo',
        colors: [
          { hex: '#042515', role: 'primary' },
          { hex: '#a78f45', role: 'accent' }
        ],
        accent: { hex: '#a78f45', source: 'logo', share: 0.047 },
        fonts: [],
        evidence: []
      }
    }
  })
  assert.deepEqual(doc.brand.colors.value, [
    { hex: '#042515', role: 'primary' },
    { hex: '#a78f45', role: 'accent' }
  ])
  assert.equal(doc.brand.colors.derivation.method, 'logo-palette')
  assert.deepEqual(validatePlaceProfile(doc).errors ?? [], [])
})
