// The trade must-haves as the Details and Outreach doors answer them (`src/must-haves-view.js`): the card's own
// website source row, its trade, the score reason and the outreach lines the demo's brief allows.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mustHavesView } from '../src/must-haves-view.js'

const SITE = 'https://pho-ba.example/'
const websiteRow = (status, pages) => ({
  source: 'website',
  ref: SITE,
  status,
  collected: { pages, menus: [], bookings: [] }
})
const restaurant = { candidate: { name: 'Pho Ba', kind: 'restaurant', website: SITE } }

test('a restaurant read in full with no menu and no booking: the reason, and the lines its demo backs', () => {
  const view = mustHavesView({
    opportunity: restaurant,
    profile: {},
    sources: [
      { source: 'facebook', status: 'complete' },
      websiteRow('complete', [{ url: SITE, title: 'Pho Ba', text: 'Noodles.' }])
    ],
    demoOffers: { menu: false, booking: true, ordering: false, schedule: false, form: false }
  })
  assert.equal(view.trade, 'food')
  assert.equal(view.read, 'complete')
  assert.deepEqual(view.scoreReason, [
    'trade.missing',
    8,
    { trade: 'food', missing: ['menu'], unknown: ['booking-or-ordering'] }
  ])
  assert.deepEqual(
    view.arguments.map((a) => a.text),
    ['Your site has no online booking; the demo does.'],
    'no menu line: the demo has no menu either'
  )
})

test('no demo: the assessment without lines; no website of its own, or a trade without must-haves: none', () => {
  const view = mustHavesView({
    opportunity: restaurant,
    profile: {},
    sources: [websiteRow('complete', [{ url: SITE, title: 'Pho Ba', text: 'Noodles.' }])]
  })
  assert.deepEqual(view.arguments, [])
  assert.equal(view.demo, null)
  assert.equal(
    mustHavesView({
      opportunity: {
        candidate: { kind: 'restaurant', website: 'https://www.tripadvisor.com/Restaurant_Review-x' }
      },
      profile: {},
      sources: []
    }),
    null
  )
  assert.equal(
    mustHavesView({ opportunity: { candidate: { kind: 'restaurant' } }, profile: {}, sources: [] }),
    null
  )
  assert.equal(
    mustHavesView({
      opportunity: { candidate: { trade: 'retail', website: SITE } },
      profile: {},
      sources: [websiteRow('complete', [{ url: SITE, title: 'Shop', text: '' }])]
    }),
    null
  )
})

test('a salon that research never read: every must-have unknown, a reason with no points, no line', () => {
  const view = mustHavesView({
    opportunity: { candidate: { trade: 'beauty', website: SITE } },
    profile: {},
    sources: [],
    demoOffers: { menu: false, booking: true, ordering: false, schedule: false, form: false }
  })
  assert.equal(view.read, 'none')
  assert.deepEqual(view.scoreReason, ['trade.unknown', null, { trade: 'beauty', unknown: ['booking'] }])
  assert.deepEqual(view.arguments, [])
})
