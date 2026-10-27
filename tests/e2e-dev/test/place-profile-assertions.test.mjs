import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BANNED_FILLERS,
  bannedFillers,
  brokenImages,
  ctaProblems,
  layoutAgainst,
  orphanCurrency,
  restaurantWords,
  templateLeftovers,
  unsourcedPrices,
  zeroedStats
} from '../lib/place-profile/assertions.mjs'
import { profileFacts } from '../lib/place-profile/profile-facts.mjs'
import { gymProfile, restaurantProfile } from '../lib/place-profile/fixtures.mjs'

const gym = profileFacts(gymProfile())
const food = profileFacts(restaurantProfile())

test('profile facts: trade, phone digits, printed prices, people and statistics', () => {
  assert.equal(gym.trade, 'fitness')
  assert.equal(food.trade, 'food')
  assert.equal(gym.phoneDigits, '15550100')
  assert.deepEqual([...food.priceDigits].sort(), ['12', '125000', '18', '9.5'].sort())
  assert.equal(gym.people.length, 0)
  assert.equal(gym.statistics.length, 0)
  assert.equal(food.hasBooking, true)
  assert.equal(gym.hasBooking, false)
})

test('every banned filler is caught, curly apostrophes and case included', () => {
  for (const word of BANNED_FILLERS) assert.deepEqual(bannedFillers(`x ${word.toUpperCase()} y`), [word])
  assert.deepEqual(bannedFillers('Chef’s selection of the day'), ["Chef's selection"])
  assert.deepEqual(bannedFillers('A soon-to-come class'), [])
})

test('restaurant words on a gym page are named; the same words pass on a restaurant', () => {
  const text = 'Book a table tonight. See our menu and the chef’s dishes.'
  assert.deepEqual(restaurantWords(text, 'fitness').sort(), ['book a table', 'chef', 'dishes', 'menu'].sort())
  assert.deepEqual(restaurantWords(text, 'food'), [])
  assert.deepEqual(restaurantWords('Monthly membership and personal training', 'fitness'), [])
})

test('a price is sourced only when the profile printed it (scaled prices included)', () => {
  assert.deepEqual(unsourcedPrices('Pho $12 · Banh mi $9.50 · Lau 125.000₫', food), [])
  assert.deepEqual(unsourcedPrices('Pho $12 · Special $29', food), ['$29'])
  assert.deepEqual(unsourcedPrices('Membership $49 / month', gym), ['$49'])
  assert.deepEqual(unsourcedPrices('Open since 1998, 24 hours', gym), [])
})

test('a currency sign or a period with no amount is an orphan', () => {
  assert.deepEqual(orphanCurrency('Basic $ / month'), ['$', '/ month'])
  assert.deepEqual(orphanCurrency('Basic $49 / month'), [])
  assert.deepEqual(orphanCurrency('Prices from'), ['from'])
  assert.deepEqual(orphanCurrency('from 9 am to 5 pm'), [])
})

test('a stat shown as 0 while the profile holds no statistic is a dash turned zero', () => {
  assert.deepEqual(zeroedStats(['—', '0', '0+', '12%'], gym), ['0', '0+'])
  assert.deepEqual(zeroedStats(['—', ''], gym), [])
})

test('CTAs: dead links, a tel: that is not the profile phone, a booking nobody offers', () => {
  const problems = ctaProblems(
    [
      { text: 'Contact', href: '#' },
      { text: 'Call', href: 'tel:+1-555-0100' },
      { text: 'Call', href: 'tel:+1 555 0199' },
      { text: 'Book a table', href: '/reserve' },
      { text: 'Email', href: 'mailto:hello@example.test' }
    ],
    gym
  )
  assert.deepEqual(
    problems.map((p) => p.code),
    ['dead-link', 'tel-mismatch', 'booking-unsourced', 'restaurant-cta', 'mailto-unsourced']
  )
  assert.deepEqual(ctaProblems([{ text: 'Book a table', href: 'https://book.example/x' }], food), [])
})

test('an image frame is broken when it is visible and its picture did not load', () => {
  const broken = brokenImages([
    { src: 'a.jpg', complete: true, naturalWidth: 0, width: 300, height: 200 },
    { src: '', complete: true, naturalWidth: 0, width: 300, height: 200 },
    { src: 'b.jpg', complete: true, naturalWidth: 800, width: 300, height: 200 },
    { src: 'pixel.gif', complete: true, naturalWidth: 0, width: 1, height: 1 }
  ])
  assert.deepEqual(
    broken.map((b) => b.src),
    ['a.jpg', '']
  )
})

test('template samples of fact roles left on the page are named, unless the profile holds them', () => {
  const samples = [
    { slotKey: 'm.1', role: 'person.name', sample: 'Jane Cooper' },
    { slotKey: 'm.2', role: 'offering.price', sample: '$29' },
    { slotKey: 'm.3', role: 'business.tagline', sample: 'We build' },
    { slotKey: 'm.4', role: 'offering.name', sample: 'Pho' }
  ]
  const left = templateLeftovers('Meet Jane Cooper. Pho $12. We build', samples, food)
  assert.deepEqual(
    left.map((l) => l.slotKey),
    ['m.1']
  )
})

test('layout: fewer sections or cards than the baseline is named per section', () => {
  const baseline = {
    sections: [
      { id: 'module-183', cards: 3 },
      { id: 'module-184', cards: 3 }
    ]
  }
  assert.deepEqual(
    layoutAgainst(baseline, {
      sections: [
        { id: 'module-183', cards: 3 },
        { id: 'module-184', cards: 3 }
      ]
    }),
    []
  )
  assert.deepEqual(layoutAgainst(baseline, { sections: [{ id: 'module-183', cards: 2 }] }), [
    { id: 'module-183', want: 3, got: 2, code: 'cards-lost' },
    { id: 'module-184', want: 3, got: 0, code: 'section-lost' }
  ])
})
