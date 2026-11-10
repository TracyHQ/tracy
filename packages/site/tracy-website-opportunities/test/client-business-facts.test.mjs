/**
 * The Business facts sub-page as stacked fixed-height bands (#537, layout C): the opportunity payload sorted into the
 * business band and one band per group, with origins and edit marks; every band stays, N/A when research found
 * nothing. Every business in this file is invented.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-business-facts.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  BAND_CAPACITY,
  BAND_HEIGHTS,
  BAND_IDS,
  aboutOverflows,
  businessFactsView,
  clipQuote,
  contrast,
  editMarkOf,
  filterMedia,
  hoursLineParts,
  initialsOf,
  markColorsOf,
  overflows,
  socialPagesOf
} from '../src/client/business-facts-model.ts'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const item = (id, label, kind, extra = {}) => ({
  id,
  label,
  quote: `${label} quote`,
  source: { kind },
  ...extra
})
const PROFILE = {
  address: '12 Lagoon Walk, Sandbar Bay',
  phone: '+10 555 0100',
  otherPhones: [{ phone: '+10 555 0199', sources: ['instagram'] }],
  bio: 'Kite lessons on the lagoon\nAll year',
  provenance: {
    name: { source: 'google-places' },
    address: { source: 'google-places' },
    bio: { source: 'instagram' },
    phone: { source: 'seller' }
  },
  editedBySeller: ['phone'],
  googleRating: { state: 'left', score: 4.5, reviews: 3, few: true, choice: null },
  hoursCheck: {
    state: 'check',
    hours: [],
    claims: [{ source: 'google', hours: DAYS.map((d) => `${d}: Open 24 hours`) }]
  },
  readingCard: {
    method: 'model',
    services: [item('s1', 'Kite lessons', 'bio'), item('s2', 'Board rental', 'post')],
    audience: [item('a1', 'Beginners', 'post')],
    serviceAreas: [],
    team: [item('t1', 'Rina', 'review', { role: 'instructor', reviewsOnly: true, onSite: true })],
    keyMessages: [{ id: 'k1', label: 'Learn in three days', quotes: [{ quote: 'Ride in three days' }] }]
  },
  brand: { logo: null }
}
const CANDIDATE = {
  name: 'Harbour Kite Lessons',
  category: 'Water sports school',
  address: '12 Lagoon Walk',
  phone: '+10 555 0100',
  website: null,
  profileEdits: { phone: { at: '2026-03-02T10:00:00Z', value: '+10 555 0100' } }
}
const base = {
  profile: PROFILE,
  candidate: CANDIDATE,
  name: 'Harbour Kite Lessons',
  researched: true,
  approval: { profile: 'needed' },
  briefCreatedAt: null,
  colors: [
    { hex: '#0b2a4a', role: 'primary' },
    { hex: '#f2c94c', role: 'accent' }
  ],
  reviews: [{ author: 'Jo Example', text: 'Great day on the water.', rating: 5, source: 'google' }]
}
const ids = (view) => view.cards.map((c) => `${c.id}:${c.state}`)

const CASES = [
  {
    name: 'researched: every group is a band, team and reviews included, social N/A without a page',
    input: base,
    cards: [
      'hours:filled',
      'services:filled',
      'about:filled',
      'team:filled',
      'brand:filled',
      'messages:filled',
      'reviews:filled',
      'social:none'
    ]
  },
  {
    name: 'before research: the cards say Not collected yet, team and reviews too',
    input: { ...base, researched: false },
    cards: [
      'hours:notCollected',
      'services:notCollected',
      'about:notCollected',
      'team:notCollected',
      'brand:notCollected',
      'messages:notCollected',
      'reviews:notCollected',
      'social:notCollected'
    ]
  },
  {
    name: 'researched but empty: every band stays and reads N/A, team and reviews included',
    input: { ...base, profile: {}, colors: [], reviews: [] },
    cards: [
      'hours:none',
      'services:none',
      'about:none',
      'team:none',
      'brand:none',
      'messages:none',
      'reviews:none',
      'social:none'
    ]
  }
]
for (const c of CASES)
  test(c.name, () => {
    assert.deepEqual(ids(businessFactsView(c.input)), c.cards)
  })

test('the business card: what research holds, with its origins and the Main phone', () => {
  const { business } = businessFactsView(base)
  assert.equal(business.initials, 'HK')
  assert.equal(business.category, 'Water sports school')
  assert.equal(business.address, '12 Lagoon Walk, Sandbar Bay')
  assert.equal(business.phones.main, '+10 555 0100')
  assert.deepEqual(
    business.phones.others.map((o) => o.phone),
    ['+10 555 0199']
  )
  assert.equal(business.rating.few, true)
  assert.equal(business.website, null)
  assert.deepEqual(business.origins, [
    { kind: 'source', source: 'google-places' },
    { kind: 'you' },
    { kind: 'source', source: 'instagram' }
  ])
  assert.deepEqual(business.markColors, { background: '#0b2a4a', letters: '#f2c94c' })
})

test('before research the business card keeps what the pasted links gave, nothing researched', () => {
  const { business, hours, services } = businessFactsView({ ...base, researched: false })
  assert.equal(business.address, '12 Lagoon Walk')
  assert.deepEqual(business.phones, { main: '+10 555 0100', mainWhatsapp: false, others: [] })
  assert.equal(business.rating, null)
  assert.equal(business.markColors, null)
  assert.deepEqual(business.origins, [])
  assert.equal(hours, null)
  assert.deepEqual(services, [])
})

test('card origins: hours from Google Places, services from the bio and a post, about from Instagram', () => {
  const by = Object.fromEntries(businessFactsView(base).cards.map((c) => [c.id, c.origins]))
  assert.deepEqual(by.hours, [{ kind: 'source', source: 'google-places' }])
  assert.deepEqual(by.services, [
    { kind: 'reading', from: 'bio' },
    { kind: 'reading', from: 'post' }
  ])
  assert.deepEqual(by.about, [{ kind: 'source', source: 'instagram' }])
  assert.deepEqual(by.team, [{ kind: 'reading', from: 'review' }])
})

const MARKS = [
  ['not edited', { ...base }, 'address', null],
  ['edited, no brief yet', base, 'phone', 'byYou'],
  ['edited before the latest brief', { ...base, briefCreatedAt: '2026-03-03T10:00:00Z' }, 'phone', 'byYou'],
  [
    'edited after the latest brief, facts waiting again',
    { ...base, briefCreatedAt: '2026-03-01T10:00:00Z' },
    'phone',
    'afterApproval'
  ],
  [
    'edited after the brief, approved again',
    { ...base, approval: { profile: 'approved' }, briefCreatedAt: '2026-03-01T10:00:00Z' },
    'phone',
    'byYou'
  ]
]
for (const [name, input, field, expected] of MARKS)
  test(`edit mark: ${name}`, () => {
    assert.equal(editMarkOf(input, field), expected)
  })

test('initials, mark colours and contrast', () => {
  assert.equal(initialsOf('Tide & Sail Club'), 'TS')
  assert.equal(initialsOf('kiteworks'), 'K')
  assert.equal(initialsOf('  '), '?')
  assert.equal(markColorsOf([]), null)
  // An accent too close to the background gives white or black letters instead.
  assert.deepEqual(
    markColorsOf([
      { hex: '#202020', role: 'primary' },
      { hex: '#262626', role: 'accent' }
    ]),
    {
      background: '#202020',
      letters: '#ffffff'
    }
  )
  assert.ok(contrast('#000000', '#ffffff') > 20)
})

test('quotes, media filters and hours lines', () => {
  assert.equal(clipQuote('short one'), 'short one')
  const long = clipQuote('word '.repeat(80), 40)
  assert.ok(long.endsWith('…') && long.length <= 41)
  const tiles = [{ kind: 'image' }, { kind: 'video' }, { kind: 'image' }]
  assert.equal(filterMedia(tiles, 'all').length, 3)
  assert.equal(filterMedia(tiles, 'photos').length, 2)
  assert.equal(filterMedia(tiles, 'videos').length, 1)
  assert.deepEqual(hoursLineParts('Monday: 09:00 - 18:00'), { days: 'Monday', times: '09:00 - 18:00' })
  assert.deepEqual(hoursLineParts('Mo-Fr 09:00-18:00'), { days: '', times: 'Mo-Fr 09:00-18:00' })
})

test('the band set is complete and every band kind has one fixed height, taller on a narrow page', () => {
  assert.deepEqual(BAND_IDS, [
    'business',
    'hours',
    'services',
    'about',
    'team',
    'brand',
    'messages',
    'reviews',
    'social',
    'media',
    'research'
  ])
  for (const id of BAND_IDS) {
    const [wide, narrow] = BAND_HEIGHTS[id]
    assert.ok(Number.isInteger(wide) && wide > 0, id)
    assert.ok(narrow >= wide, id)
  }
  assert.deepEqual(
    BAND_IDS.map((id) => BAND_HEIGHTS[id][0]),
    [112, 72, 64, 72, 64, 96, 88, 156, 64, 184, 52]
  )
})

test('Show all only past a band capacity; About only when longer than two lines', () => {
  for (const [band, cap] of Object.entries(BAND_CAPACITY)) {
    assert.equal(overflows(band, cap), false, band)
    assert.equal(overflows(band, cap + 1), true, band)
  }
  assert.equal(aboutOverflows(null), false)
  assert.equal(aboutOverflows('Kite lessons\nAll year'), false)
  assert.equal(aboutOverflows('One\nTwo\nThree'), true)
  assert.equal(aboutOverflows('word '.repeat(50)), true)
})

test('social pages: pasted pages and listings with their glyph, once each; the website and Google stay out', () => {
  const pages = socialPagesOf([
    { source: 'instagram', ref: 'https://instagram.example/harbourkite' },
    {
      source: 'instagram',
      ref: 'https://instagram.example/harbourkite',
      collectedAt: '2026-11-09T08:00:00Z'
    },
    { source: 'listing', ref: 'https://listing.example/harbour-kite' },
    { source: 'website', ref: 'https://harbourkite.example' },
    { source: 'google-places', ref: 'https://maps.example/place' },
    { source: 'facebook', ref: null }
  ])
  assert.deepEqual(
    pages.map((p) => [p.source, p.logo]),
    [
      ['instagram', 'instagram'],
      ['listing', 'website']
    ]
  )
  const view = businessFactsView({
    ...base,
    researched: false,
    sources: [{ source: 'instagram', ref: 'https://instagram.example/harbourkite' }]
  })
  assert.equal(view.cards.find((c) => c.id === 'social').state, 'filled')
})
