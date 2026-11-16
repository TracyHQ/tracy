// Trade must-haves (`domain/trade-must-haves.mjs`): what each trade's customers expect on its website, which of these
// the business's current site offers as research read it, the score reason and the outreach line. Unknown is never
// read as missing.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  TRADE_MUST_HAVES,
  assessMustHaves,
  demoOffersOfBrief,
  mustHaveArguments,
  mustHavesOf,
  oldSiteReadOf
} from '../domain/trade-must-haves.mjs'
import { TRADES } from '../domain/trades.mjs'
import { scoreOpportunity } from '../domain/opportunity-score.mjs'
import tradeMustHaves from '../domain/scoring/trade-must-haves.mjs'

const SITE = 'https://pho-ba.example/'
const NOW = new Date('2026-11-12T00:00:00Z')

/** A website source row as research writes it (`executor.js mergeCollected`). */
const row = (status, { pages = [], menus = [], bookings = [] } = {}) => ({
  source: 'website',
  status,
  collected: { pages, menus, bookings, media: [], logos: [], posts: [] }
})
const page = (url, title = '', text = '') => ({ url, title, text })

test('the table names the five trades by the ids WO uses, each must-have met by known capabilities', () => {
  for (const trade of Object.keys(TRADE_MUST_HAVES)) assert.ok(TRADES.includes(trade), trade)
  assert.deepEqual(
    Object.fromEntries(Object.entries(TRADE_MUST_HAVES).map(([t, list]) => [t, list.map((m) => m.id)])),
    {
      food: ['menu', 'booking-or-ordering'],
      beauty: ['booking'],
      health: ['appointment-booking', 'contact-form'],
      fitness: ['class-schedule', 'booking'],
      hospitality: ['booking']
    }
  )
  assert.deepEqual(mustHavesOf('retail'), [])
  assert.deepEqual(mustHavesOf('unknown'), [])
  assert.deepEqual(mustHavesOf(null), [])
  assert.deepEqual(mustHavesOf('health', 'pharmacy'), [], 'a pharmacy takes no appointments')
  assert.deepEqual(
    mustHavesOf('fitness', 'coaching').map((m) => m.id),
    ['booking'],
    'a coach publishes no class timetable'
  )
})

test('a restaurant whose whole site was read with no menu and no booking: the menu is missing, booking known absent', () => {
  const read = oldSiteReadOf(row('complete', { pages: [page(SITE, 'Pho Ba', 'Fresh noodles since 1998.')] }))
  const a = assessMustHaves({ trade: 'food', website: SITE, read })
  assert.equal(a.read, 'complete')
  assert.deepEqual(a.offers.menu, { state: 'missing' })
  assert.deepEqual(a.offers.booking, { state: 'missing' })
  // Ordering links are not kept by the read: "booking or ordering" as a whole stays unknown.
  assert.deepEqual(a.offers.ordering, { state: 'unknown', reason: 'not-detectable' })
  assert.deepEqual(
    a.mustHaves.map((m) => [m.id, m.state, m.reason ?? null]),
    [
      ['menu', 'missing', null],
      ['booking-or-ordering', 'unknown', 'not-detectable']
    ]
  )
})

test('what the read found makes a capability present, with where: lists, page addresses, titles and text', () => {
  const read = oldSiteReadOf(
    row('complete', {
      pages: [
        page(SITE, 'Pho Ba', 'Order online for delivery.'),
        page(`${SITE}thuc-don`, 'Our food'),
        page(`${SITE}contact`, 'Contact')
      ],
      bookings: [{ url: 'https://www.opentable.com/r/pho-ba', sourceUrl: SITE }]
    })
  )
  const a = assessMustHaves({ trade: 'food', website: SITE, read })
  assert.deepEqual(a.offers.menu, { state: 'present', evidence: [`${SITE}thuc-don`] })
  assert.deepEqual(a.offers.booking, { state: 'present', evidence: ['https://www.opentable.com/r/pho-ba'] })
  assert.deepEqual(a.offers.ordering, { state: 'present', evidence: [SITE] })
  assert.ok(a.mustHaves.every((m) => m.state === 'present'))
})

test('a one-page site that shows its menu or a booking line in its text is never told it has none', () => {
  const read = oldSiteReadOf(
    row('complete', { pages: [page(SITE, 'Pho Ba', 'Our menu changes daily. Call for reservations.')] })
  )
  const a = assessMustHaves({ trade: 'food', website: SITE, read })
  assert.equal(a.offers.menu.state, 'present')
  assert.equal(a.offers.booking.state, 'present')
  const vi = oldSiteReadOf(
    row('complete', {
      pages: [
        page(
          SITE,
          'Ph\u1edf B\u00e0',
          'Th\u1ef1c \u0111\u01a1n h\u00f4m nay. \u0110\u1eb7t b\u00e0n qua \u0111i\u1ec7n tho\u1ea1i.'
        )
      ]
    })
  )
  const b = assessMustHaves({ trade: 'food', website: SITE, read: vi })
  assert.equal(b.offers.menu.state, 'present', 'the Vietnamese word for menu')
  assert.equal(b.offers.booking.state, 'present', 'the Vietnamese words for booking a table')
})

test('unknown is unknown: no read, a failed read, a partial read, an undetectable capability, forms', () => {
  const none = assessMustHaves({ trade: 'beauty', website: SITE, read: oldSiteReadOf(null) })
  assert.deepEqual(none.mustHaves, [
    { id: 'booking', anyOf: ['booking'], state: 'unknown', reason: 'no-read' }
  ])
  const failed = assessMustHaves({ trade: 'food', website: SITE, read: oldSiteReadOf(row('failed')) })
  assert.ok(failed.mustHaves.every((m) => m.state === 'unknown' && m.reason === 'read-failed'))
  const partial = assessMustHaves({
    trade: 'food',
    website: SITE,
    read: oldSiteReadOf(row('partial', { pages: [page(SITE, 'Pho Ba')] }))
  })
  assert.ok(partial.mustHaves.every((m) => m.state === 'unknown' && m.reason === 'read-incomplete'))
  // A salon's booking platform link is not kept by the read: a complete read without one proves nothing.
  const salon = assessMustHaves({
    trade: 'beauty',
    website: SITE,
    read: oldSiteReadOf(row('complete', { pages: [page(SITE, 'Lotus Nails', 'Nails and lashes.')] }))
  })
  assert.deepEqual(salon.offers.booking, { state: 'unknown', reason: 'not-detectable' })
  // Forms are not collected at all.
  const clinic = assessMustHaves({
    trade: 'health',
    website: SITE,
    read: oldSiteReadOf(row('complete', { pages: [page(SITE, 'Clinic', 'We see patients.')] }))
  })
  assert.deepEqual(clinic.offers.form, { state: 'unknown', reason: 'not-collected' })
  assert.ok(clinic.mustHaves.every((m) => m.state === 'unknown'))
  // A salon with its own booking page is present.
  const booked = assessMustHaves({
    trade: 'beauty',
    website: SITE,
    read: oldSiteReadOf(row('complete', { pages: [page(SITE), page(`${SITE}book-online`, 'Book')] }))
  })
  assert.equal(booked.mustHaves[0].state, 'present')
})

test('no assessment for a trade without must-haves or a place without a website of its own', () => {
  assert.equal(assessMustHaves({ trade: 'retail', website: SITE, read: oldSiteReadOf(null) }), null)
  assert.equal(assessMustHaves({ trade: 'food', website: null, read: oldSiteReadOf(null) }), null)
  assert.equal(assessMustHaves({ trade: 'health', subTrade: 'pharmacy', website: SITE }), null)
})

test('the demo offers what its brief knows: a verified booking link, the full menu section', () => {
  assert.deepEqual(demoOffersOfBrief(null), {
    menu: false,
    booking: false,
    ordering: false,
    schedule: false,
    form: false
  })
  const brief = {
    integrations: [
      { kind: 'booking', url: 'https://www.opentable.com/r/pho-ba', verified: true },
      { kind: 'map', url: 'https://osm.example', verified: true }
    ],
    sitemap: [{ slug: 'menu', sections: [{ kind: 'menu', copy: '\u2026' }] }],
    missing: []
  }
  assert.deepEqual(demoOffersOfBrief(brief), {
    menu: true,
    booking: true,
    ordering: false,
    schedule: false,
    form: false
  })
  // An unverified booking link, and the posted-dishes stand-in for a menu, are not claimed.
  const weaker = {
    integrations: [{ kind: 'booking', url: 'https://x.example', verified: false }],
    sitemap: [{ slug: 'menu', sections: [{ kind: 'dishes' }] }],
    missing: [{ field: 'menu', why: 'No menu was collected' }]
  }
  assert.deepEqual(demoOffersOfBrief(weaker), {
    menu: false,
    booking: false,
    ordering: false,
    schedule: false,
    form: false
  })
})

test('an outreach line only for a capability known missing that the demo really has', () => {
  const read = oldSiteReadOf(row('complete', { pages: [page(SITE, 'Pho Ba', 'Fresh noodles.')] }))
  const a = assessMustHaves({ trade: 'food', website: SITE, read })
  const both = { menu: true, booking: true, ordering: false, schedule: false, form: false }
  assert.deepEqual(mustHaveArguments(a, both), [
    {
      capability: 'menu',
      mustHave: 'menu',
      key: 'mustHave.missing.menu',
      text: 'Your site has no online menu; the demo does.'
    },
    {
      capability: 'booking',
      mustHave: 'booking-or-ordering',
      key: 'mustHave.missing.booking',
      text: 'Your site has no online booking; the demo does.'
    }
  ])
  // The demo without a booking link: no booking line.
  assert.deepEqual(
    mustHaveArguments(a, { ...both, booking: false }).map((x) => x.capability),
    ['menu']
  )
  // An unknown capability is never argued, even when the demo has it.
  const salon = assessMustHaves({
    trade: 'beauty',
    website: SITE,
    read: oldSiteReadOf(row('complete', { pages: [page(SITE, 'Lotus Nails', 'Nails.')] }))
  })
  assert.deepEqual(mustHaveArguments(salon, both), [])
  assert.deepEqual(mustHaveArguments(null, both), [])
  assert.deepEqual(mustHaveArguments(a, null), [])
})

test('score: a missing must-have is a reason worth its share of 15; without an assessment nothing changes', () => {
  const candidate = { website: SITE, phone: '+84 1', reviews: 10, rating: 4.5 }
  const siteCheck = {
    status: 'done',
    performance: 90,
    https: true,
    mobileFriendly: true,
    copyrightYear: 2026
  }
  const before = scoreOpportunity({ candidate, siteCheck, now: NOW })
  assert.ok(!before.reasons.some(([key]) => key.startsWith('trade.')))
  const read = oldSiteReadOf(row('complete', { pages: [page(SITE, 'Pho Ba', 'Fresh noodles.')] }))
  const mustHaves = assessMustHaves({ trade: 'food', website: SITE, read })
  const after = scoreOpportunity({ candidate, siteCheck, now: NOW, mustHaves })
  assert.deepEqual(
    after.reasons.find(([key]) => key.startsWith('trade.')),
    ['trade.missing', 8, { trade: 'food', missing: ['menu'], unknown: ['booking-or-ordering'] }]
  )
  assert.equal(after.score, before.score + 8)
  // Only unknowns: a reason with no points, never missing.
  const salon = assessMustHaves({ trade: 'beauty', website: SITE, read: oldSiteReadOf(null) })
  assert.deepEqual(tradeMustHaves.score({ candidate, siteCheck, mustHaves: salon }), {
    points: null,
    reason: 'trade.unknown',
    params: { trade: 'beauty', unknown: ['booking'] }
  })
  // Every must-have offered: no points.
  const full = assessMustHaves({
    trade: 'beauty',
    website: SITE,
    read: oldSiteReadOf(row('complete', { pages: [page(`${SITE}booking`, 'Book now')] }))
  })
  assert.deepEqual(tradeMustHaves.score({ candidate, siteCheck, mustHaves: full }), {
    points: 0,
    reason: 'trade.complete',
    params: { trade: 'beauty' }
  })
  // A site that is down already earns the most web points; no website is the no-website rule's.
  assert.equal(tradeMustHaves.score({ candidate, siteCheck: { status: 'down' }, mustHaves }), null)
  assert.equal(tradeMustHaves.score({ candidate: {}, siteCheck: null, mustHaves }), null)
})

test('score: a slow site that lacks every must-have reaches the 40 web points of a site that is down, not more', () => {
  const candidate = { website: SITE }
  const slow = { status: 'done', performance: 10, https: false }
  const all = { version: 'x', trade: 'food', mustHaves: [{ id: 'menu', state: 'missing' }] }
  const web = scoreOpportunity({ candidate, siteCheck: slow, now: NOW, mustHaves: all }).reasons.filter(
    ([key]) => key.startsWith('web.') || key.startsWith('trade.')
  )
  assert.equal(
    web.reduce((sum, [, points]) => sum + (points ?? 0), 0),
    40
  )
})
