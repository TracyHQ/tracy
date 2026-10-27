import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBrief, renderBriefMarkdown, validateBrief } from '../domain/brief.mjs'
import { briefTradeOf } from '../domain/trades.mjs'

// The words a brief speaks in follow the trade (#1780): a restaurant's for food, its own trade's for a known one,
// neutral words for an unknown one, and a record saved before trades whose place types are food stays food.
const google = (primaryType) => ({
  placeId: 'ChIJtest',
  primaryType,
  types: [primaryType, 'point_of_interest'],
  reservable: true,
  nationalPhoneNumber: '+1 555 0100'
})
const brief = (candidate, googlePlace) =>
  buildBrief({
    opportunity: {
      id: 'o',
      name: 'Test Place',
      candidate: { provider: 'osm', providerId: 'node/1', ...candidate }
    },
    profile: { name: 'Test Place', phone: '+1 555 0100' },
    googlePlace,
    sources: [],
    media: [],
    madeAt: '2026-10-26T10:00:00.000Z'
  })

const CASES = [
  {
    name: 'food',
    candidate: { trade: 'food' },
    trade: 'food',
    has: [/Book a table/, /restaurant/],
    hasNot: [/Takes bookings/]
  },
  {
    name: 'a known trade (fitness)',
    candidate: { trade: 'fitness' },
    trade: 'fitness',
    has: [/Takes bookings/],
    hasNot: [/restaurant|\bdish|Book a table|\bmenu\b|reservation/i]
  },
  {
    name: 'an unknown trade',
    candidate: {},
    googlePlace: google('point_of_interest'),
    trade: 'unknown',
    has: [/Takes bookings/],
    hasNot: [/restaurant|\bdish|Book a table|\bmenu\b|reservation/i]
  },
  {
    name: 'an old food record without a trade',
    candidate: { types: ['restaurant'] },
    googlePlace: google('restaurant'),
    trade: 'food',
    has: [/Book a table/],
    hasNot: []
  }
]

for (const c of CASES)
  test(`trade words: ${c.name}`, () => {
    const b = brief(c.candidate, c.googlePlace ?? google(c.trade === 'food' ? 'restaurant' : 'gym'))
    assert.equal(briefTradeOf({ candidate: b && { ...c.candidate }, googlePlace: c.googlePlace }), c.trade)
    assert.deepEqual(validateBrief(b), { ok: true, errors: [] })
    const md = renderBriefMarkdown(b)
    for (const re of c.has) assert.match(md, re)
    for (const re of c.hasNot)
      assert.doesNotMatch(md, re, md.match(new RegExp(`.*${re.source}.*`, 'gi'))?.join('\n'))
  })

test('a record without a trade or types that holds collected menu items stays food; none is unknown', () => {
  assert.equal(briefTradeOf({ candidate: {}, menuItems: [{ name: 'Pho bo' }] }), 'food')
  assert.equal(briefTradeOf({ candidate: {} }), 'unknown')
  assert.equal(briefTradeOf({ candidate: { kind: 'cafes' } }), 'food')
  assert.equal(briefTradeOf({ candidate: {}, googlePlace: { primaryType: 'sports_club' } }), 'fitness')
})
