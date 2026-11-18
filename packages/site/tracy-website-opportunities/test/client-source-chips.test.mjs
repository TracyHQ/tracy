/**
 * The source chips of the Business facts sub-page (#537, design A): one word and a glyph after each value, a hover
 * title with the full source name and the collected date, a glyph badge on each photo, and no chip at all where the
 * payload names no source. Every business in this file is invented.
 *
 *   node --test --test-concurrency=1 packages/site/tracy-website-opportunities/test/client-source-chips.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  businessFactsView,
  itemChipOf,
  messageChipOf,
  reviewChipOf
} from '../src/client/business-facts-model.ts'
import {
  chipDate,
  chipLogo,
  chipTitle,
  fieldChip,
  mediaBadgeLogo,
  noneChip,
  readingChip,
  youChip
} from '../src/client/source-chip-model.ts'

const ROWS = [
  { source: 'google-places', ref: null, collectedAt: '2026-11-09T08:00:00Z' },
  {
    source: 'instagram',
    ref: 'https://www.instagram.com/harbourkite.example/',
    collectedAt: '2026-11-08T08:00:00Z'
  },
  {
    source: 'listing',
    ref: 'https://www.magicpin.in/harbour-kite-example/',
    collectedAt: '2026-11-07T08:00:00Z'
  },
  { source: 'facebook', ref: null, collectedAt: null }
]
const t = (key, params) => `[${key}${params ? JSON.stringify(params) : ''}]`
const label = (source) => source.toUpperCase()

test('a profile field: the word follows the source the server credits it to', () => {
  assert.deepEqual(fieldChip('google', 'address', ROWS), {
    word: 'google',
    source: 'google-places',
    ref: null,
    at: '2026-11-09T08:00:00Z'
  })
  assert.equal(fieldChip('instagram', 'bio', ROWS)?.word, 'bio')
  assert.equal(fieldChip('instagram', 'address', ROWS)?.word, 'profile')
  assert.equal(fieldChip('listing', 'phone', ROWS)?.ref, 'https://www.magicpin.in/harbour-kite-example/')
  assert.equal(fieldChip('website', 'name', ROWS)?.word, 'website')
  assert.deepEqual(
    fieldChip('seller', 'phone', ROWS, '2026-11-10T09:00:00Z'),
    youChip('2026-11-10T09:00:00Z')
  )
  // No row collected: the chip still names the source, with no date.
  assert.equal(fieldChip('facebook', 'name', ROWS)?.at, null)
})

test('no source, or a source this screen does not know, gives no chip', () => {
  assert.equal(fieldChip(null, 'address', ROWS), null)
  assert.equal(fieldChip('url', 'name', ROWS), null)
  assert.equal(fieldChip('account-overlay', 'name', ROWS), null)
})

test('a reading item: Bio, Post or Review, on its platform when the server names one', () => {
  const post = readingChip('post', 'instagram', 'https://www.instagram.com/p/abc/', ROWS)
  assert.deepEqual(post, {
    word: 'post',
    source: 'instagram',
    ref: 'https://www.instagram.com/p/abc/',
    at: '2026-11-08T08:00:00Z'
  })
  assert.equal(readingChip('review', null, null, ROWS).source, 'google-places')
  assert.equal(readingChip('review', 'tripadvisor', null, ROWS).source, 'tripadvisor')
  assert.deepEqual(readingChip('bio', null, null, ROWS), { word: 'bio', source: null, ref: null, at: null })
})

test('glyphs: platform, globe for an unnamed source or a listing, person for the seller; media badges', () => {
  assert.equal(chipLogo(readingChip('post', 'instagram', null, ROWS)), 'instagram')
  assert.equal(chipLogo(fieldChip('google', 'address', ROWS)), 'maps')
  assert.equal(chipLogo(fieldChip('listing', 'phone', ROWS)), 'website')
  assert.equal(chipLogo(readingChip('bio', null, null, ROWS)), 'website')
  assert.equal(chipLogo(youChip()), 'you')
  assert.equal(chipLogo(noneChip()), 'website')
  assert.equal(mediaBadgeLogo('instagram'), 'instagram')
  assert.equal(mediaBadgeLogo('google-maps'), 'maps')
  assert.equal(mediaBadgeLogo('listing', 'https://www.tripadvisor.com/x'), 'tripadvisor')
  assert.equal(mediaBadgeLogo('owner'), null)
  assert.equal(mediaBadgeLogo(null), null)
})

test('the hover title names the source in full and when it was collected, in the interface language', () => {
  assert.equal(chipDate('2026-11-09T08:00:00Z', 'en-GB'), '9 Nov')
  assert.equal(chipDate('soon', 'en-GB'), null)
  assert.equal(
    chipTitle(t, readingChip('post', 'instagram', null, ROWS), 'en-GB', label),
    '[chip.title.collected{"source":"[chip.full.post{\\"source\\":\\"INSTAGRAM\\"}]","date":"8 Nov"}]'
  )
  assert.equal(chipTitle(t, readingChip('bio', null, null, ROWS), 'en-GB', label), '[chip.full.bio.plain]')
  assert.equal(
    chipTitle(t, fieldChip('facebook', 'name', ROWS), 'en-GB', label),
    '[chip.full.profile{"source":"FACEBOOK"}]'
  )
  assert.equal(
    chipTitle(t, youChip('2026-11-10T09:00:00Z'), 'en-GB', label),
    '[chip.title.youOn{"date":"10 Nov"}]'
  )
  assert.equal(chipTitle(t, youChip(), 'en-GB', label), '[chip.title.you]')
  assert.equal(chipTitle(t, noneChip(), 'en-GB', label, ['A', 'B']), '[chip.title.looked{"list":"A, B"}]')
  assert.equal(chipTitle(t, noneChip(), 'en-GB', label), '[chip.title.none]')
})

const PROFILE = {
  name: 'Harbour Kite Lessons',
  address: '12 Lagoon Walk, Sandbar Bay',
  phone: '+10 555 0100',
  otherPhones: [
    { phone: '+10 555 0199', sources: ['instagram'] },
    { phone: '+10 555 0188', sources: [] }
  ],
  bio: 'Kite lessons on the lagoon',
  provenance: {
    name: { source: 'google-places' },
    address: { source: 'google' },
    bio: { source: 'instagram' },
    phone: { source: 'seller', seenAt: '2026-11-10T09:00:00Z' }
  },
  evidence: {
    name: [
      { value: 'Harbour Kite Co', sources: ['google'] },
      { value: 'Harbour Kite Lessons', sources: ['instagram'] }
    ],
    bio: [{ value: 'Kite lessons on the lagoon', sources: ['instagram'] }]
  },
  editedBySeller: ['phone'],
  googleRating: { state: 'shown', score: 4.5, reviews: 30, few: false, choice: null },
  hoursCheck: {
    state: 'agreed',
    hours: ['Monday: 09:00-17:00'],
    claims: [{ source: 'google', hours: ['Monday: 09:00-17:00'] }]
  },
  readingCard: {
    method: 'model',
    services: [
      { id: 's1', label: 'Kite lessons', quote: 'Kite lessons', source: { kind: 'bio', ref: 'bio' } },
      {
        id: 's2',
        label: 'Board rental',
        quote: 'Board rental',
        source: {
          kind: 'post',
          ref: 'post:instagram:1',
          url: 'https://www.instagram.com/p/abc/',
          source: 'instagram'
        }
      }
    ],
    audience: [],
    serviceAreas: [],
    team: [],
    keyMessages: [
      {
        id: 'k1',
        label: 'Lessons on the lagoon',
        quotes: [{ quote: 'lessons on the lagoon', source: { kind: 'bio' } }]
      },
      { id: 'k2', label: 'Since spring', quotes: [{ quote: 'since spring' }] }
    ]
  }
}
const base = {
  profile: PROFILE,
  candidate: { name: 'Harbour Kite Lessons', website: null },
  name: 'Harbour Kite Lessons',
  researched: true,
  approval: { profile: 'needed' },
  briefCreatedAt: null,
  colors: [],
  reviews: [{ author: 'Jo Example', text: 'Great day.', rating: 5, source: 'tripadvisor' }],
  sources: ROWS
}

test('the business card: a chip per value from the payload, Not found for a website research did not find', () => {
  const { chips } = businessFactsView(base).business
  // The name on the site is credited to the source that states that very name, not the first one.
  assert.equal(chips.name?.word, 'profile')
  assert.equal(chips.name?.source, 'instagram')
  assert.equal(chips.address?.word, 'google')
  assert.deepEqual(chips.phone, youChip('2026-11-10T09:00:00Z'))
  assert.equal(chips.rating?.word, 'google')
  assert.equal(chips.website?.word, 'none')
  assert.deepEqual(
    chips.others.map((c) => c?.word ?? null),
    ['profile', null]
  )
})

test('block values carry one header chip; reading items, key messages and reviews their own', () => {
  const view = businessFactsView(base)
  const card = (id) => view.cards.find((c) => c.id === id)
  assert.equal(card('hours')?.chip?.word, 'google')
  assert.equal(card('about')?.chip?.word, 'bio')
  assert.equal(card('services')?.chip, null)
  const [bio, post] = view.services.map((s) => itemChipOf(view, s))
  assert.deepEqual([bio.word, bio.source], ['bio', 'instagram'])
  assert.deepEqual([post.word, post.ref], ['post', 'https://www.instagram.com/p/abc/'])
  assert.equal(messageChipOf(view, view.messages[0])?.word, 'bio')
  // A quote the server gives no source for: no chip.
  assert.equal(messageChipOf(view, view.messages[1]), null)
  assert.equal(reviewChipOf(view, view.reviews[0]).source, 'tripadvisor')
})

test('a seller edit of the hours or the bio reads You; nothing is attributed before research or without a source', () => {
  const edited = businessFactsView({
    ...base,
    profile: {
      ...PROFILE,
      editedBySeller: ['phone', 'bio'],
      hoursCheck: { ...PROFILE.hoursCheck, state: 'chosen', choice: 'edit' }
    },
    candidate: { ...base.candidate, profileEdits: { bio: { at: '2026-11-10T10:00:00Z', value: 'x' } } }
  })
  assert.equal(edited.cards.find((c) => c.id === 'hours')?.chip?.word, 'you')
  assert.deepEqual(edited.cards.find((c) => c.id === 'about')?.chip, youChip('2026-11-10T10:00:00Z'))

  const bare = businessFactsView({ ...base, profile: { ...PROFILE, provenance: {}, evidence: {} } })
  assert.equal(bare.business.chips.address, null)
  assert.equal(bare.business.chips.name, null)
  assert.equal(bare.cards.find((c) => c.id === 'about')?.chip, null)

  const before = businessFactsView({ ...base, researched: false })
  const { chips } = before.business
  assert.deepEqual(
    [chips.name, chips.address, chips.phone, chips.rating, chips.website],
    [null, null, null, null, null]
  )
  assert.ok(before.cards.every((c) => c.chip === null))
})
