import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreOpportunity } from '../domain/opportunity-score.mjs'

const NOW = new Date('2026-10-18T00:00:00Z')
// The last post as the collector stores it: a timestamp, turned into days only when scored.
const ago = (days) => new Date(NOW.getTime() - days * 86_400_000).toISOString()
// 812 reviews at 4.6★: 6·log10(813) + 2·1.6 = 17.46 + 3.2 = 20.66 → 21.
const popular = { name: 'Tamarel', rating: 4.6, reviews: 812, phone: '+84 900 000 510', socials: {} }
const points = (r, key) => r.reasons.find(([k]) => k === key)?.[1]
const keys = (r) => r.reasons.map(([k]) => k)
const score = (over, rest = {}) => scoreOpportunity({ candidate: { ...popular, ...over }, now: NOW, ...rest })

test('no website and no social page: web 40 + demand 21 + marketing unknown + contact 10 = 71 → B', () => {
  const r = score({})
  assert.deepEqual([r.score, r.grade, r.pending], [71, 'B', false])
  assert.deepEqual(r.reasons, [
    ['web.none', 40],
    ['demand.reviews', 21, { reviews: 812, rating: 4.6 }],
    ['marketing.unknown', null],
    ['contact.reachable', 10]
  ])
})

test('Facebook page only: web.socialOnly 40; with a recent post marketing 20 → 91 A', () => {
  const r = score(
    { socials: { facebook: 'https://facebook.com/tamarel' } },
    { social: { lastPostAt: ago(12) } }
  )
  assert.deepEqual(
    [r.score, r.grade, points(r, 'web.socialOnly'), r.reasons[2]],
    [91, 'A', 40, ['marketing.lastPost', 20, { days: 12 }]]
  )
})

test('website down: web.down 40', () => {
  const r = score({ website: 'https://tamarel.example/' }, { siteCheck: { status: 'down' } })
  assert.deepEqual([r.score, r.grade, points(r, 'web.down')], [71, 'B', 40])
})

test('slow or dated website (32/100, no HTTPS, not mobile-friendly, © 2016): web.slow 25 with the signals', () => {
  const check = { status: 'done', performance: 32, https: false, mobileFriendly: false, copyrightYear: 2016 }
  const r = score({ website: 'http://tamarel.example/' }, { siteCheck: check })
  assert.deepEqual([r.score, r.grade], [56, 'B'])
  assert.deepEqual(r.reasons[0], [
    'web.slow',
    25,
    { performance: 32, https: false, mobileFriendly: false, copyrightYear: 2016 }
  ])
  // Each signal alone is enough; the threshold is a parameter.
  const only = (c, extra = {}) =>
    points(
      score(
        { website: 'https://x.vn/' },
        {
          siteCheck: {
            status: 'done',
            performance: 90,
            https: true,
            mobileFriendly: true,
            copyrightYear: 2026,
            ...c
          },
          ...extra
        }
      ),
      'web.slow'
    )
  assert.equal(only({ performance: 49 }), 25)
  assert.equal(only({ performance: 49 }, { slowSiteThreshold: 40 }), undefined)
  assert.equal(only({ performance: 70 }, { slowSiteThreshold: 75 }), 25)
  assert.equal(only({ https: false }), 25)
  assert.equal(only({ mobileFriendly: false }), 25)
  assert.equal(only({ copyrightYear: 2021 }), 25)
  assert.equal(only({ copyrightYear: 2022 }), undefined)
  assert.equal(only({ copyrightYear: null, performance: null }), undefined)
})

test('fine website: web.fine 0 → demand and contact only, 31 C', () => {
  const r = score(
    { website: 'https://tamarel.example/' },
    { siteCheck: { status: 'done', performance: 92, https: true, mobileFriendly: true, copyrightYear: 2026 } }
  )
  assert.deepEqual([r.score, r.grade, points(r, 'web.fine')], [31, 'C', 0])
})

test('website not checked yet: web.checking null, pending, score without the web part', () => {
  for (const siteCheck of [null, undefined, { status: 'queued' }]) {
    const r = score({ website: 'https://tamarel.example/' }, { siteCheck })
    assert.deepEqual([r.score, r.grade, r.pending, r.reasons[0]], [31, 'C', true, ['web.checking', null]])
  }
  const failed = score({ website: 'https://tamarel.example/' }, { siteCheck: { status: 'failed' } })
  assert.deepEqual([failed.pending, failed.reasons[0]], [false, ['web.unknown', 0]])
})

test('a chain is halved: 71 → 36 C with chain.penalty', () => {
  const r = score({ chain: true })
  assert.deepEqual([r.score, r.grade, points(r, 'chain.penalty')], [36, 'C', -35])
  assert.ok(keys(r).indexOf('chain.penalty') > keys(r).indexOf('contact.reachable'))
})

test('temporarily closed is halved too; both penalties compound', () => {
  const closed = score({ temporarilyClosed: true })
  assert.deepEqual([closed.score, points(closed, 'closed.penalty')], [36, -35])
  const both = score({ temporarilyClosed: true, chain: true })
  assert.deepEqual([both.score, both.grade], [18, 'C'])
})

test('demand curve: none, a few, many reviews, capped at 30; rounding is to the nearest point', () => {
  const demand = (reviews, rating) =>
    points(score({ reviews, rating, website: undefined, phone: undefined }), 'demand.reviews')
  assert.equal(demand(undefined, undefined), 2) // 6·log10(2) = 1.8 → 2
  assert.equal(demand(0, 0), 2)
  assert.equal(demand(9, 3), 6) // 6·log10(10) = 6
  assert.equal(demand(99, 5), 16) // 12 + 4
  assert.equal(demand(999, 5), 22) // 18 + 4
  assert.equal(demand(99_999, 5), 30) // 30 + 4, capped
  assert.equal(demand(50, 2.5), 10) // 6·log10(51) = 10.25 → 10, rating below 3 adds nothing
})

test('demand names only what Google said: an unknown count or rating is left out, never 0', () => {
  const params = (input) =>
    score({ website: undefined, phone: undefined, ...input }).reasons.find(
      (r) => r[0] === 'demand.reviews'
    )[2]
  assert.deepEqual(params({ reviews: undefined, rating: undefined }), {})
  assert.deepEqual(params({ reviews: 4, rating: undefined }), { reviews: 4 })
  assert.deepEqual(params({ reviews: 4, rating: 5 }), { reviews: 4, rating: 5 })
})

test('marketing tiers by last post, contact from any channel, grade bands', () => {
  const marketing = (days) =>
    points(score({ website: undefined }, { social: { lastPostAt: ago(days) } }), 'marketing.lastPost')
  assert.deepEqual([marketing(30), marketing(31), marketing(90), marketing(91)], [20, 10, 10, 0])
  const contact = (over) =>
    points(score({ phone: undefined, ...over }), 'contact.reachable') ??
    points(score({ phone: undefined, ...over }), 'contact.none')
  assert.equal(contact({}), 0)
  assert.equal(contact({ phone: '+84 1' }), 10)
  assert.equal(contact({ contacts: { zalo: 'https://zalo.me/1' } }), 10)
  assert.equal(contact({ email: 'hi@x.vn' }), 10)
  assert.equal(contact({ emails: ['hi@x.vn'] }), 10)
  assert.equal(contact({ contacts: {} }), 0)
  // 75 is an A, 74 a B, 50 a B, 49 a C.
  const at = (reviews, rating, days) =>
    score(
      { reviews, rating, socials: { instagram: 'https://instagram.com/x' } },
      { social: { lastPostAt: ago(days) } }
    )
  assert.deepEqual([at(812, 4.6, 12).score, at(812, 4.6, 12).grade], [91, 'A'])
  assert.equal(
    scoreOpportunity({
      candidate: { reviews: 9, rating: 3, website: 'https://x.vn/' },
      siteCheck: { status: 'down' },
      social: { lastPostAt: ago(31) },
      now: NOW
    }).score,
    56
  )
  assert.equal(
    scoreOpportunity({
      candidate: { reviews: 9, rating: 3, website: 'https://x.vn/' },
      siteCheck: { status: 'down' },
      social: { lastPostAt: ago(31) },
      now: NOW
    }).grade,
    'B'
  )
  assert.equal(
    scoreOpportunity({
      candidate: { reviews: 9, rating: 3, website: 'https://x.vn/', phone: '1' },
      siteCheck: { status: 'down' },
      social: { lastPostAt: ago(12) },
      now: NOW
    }).grade,
    'A'
  )
})

test('marketing reads days from lastPostAt against `now`: tiers on whole days, the age to the hour; no timestamp is unknown', () => {
  const r = score(
    {},
    { social: { lastPostAt: '2026-10-08T06:00:00Z', followers: null, coverage: 'partial' } }
  )
  assert.deepEqual(r.reasons[2], ['marketing.lastPost', 20, { days: 9.75 }])
  const hours = score({}, { social: { lastPostAt: '2026-10-17T10:00:00Z' } })
  assert.deepEqual(hours.reasons[2], ['marketing.lastPost', 20, { days: 14 / 24 }], '14 hours, not 0 days')
  assert.equal(
    points(score({}, { social: { lastPostAt: ago(30.9) } }), 'marketing.lastPost'),
    20,
    'day 30 is still active'
  )
  const later = scoreOpportunity({
    candidate: popular,
    social: { lastPostAt: '2026-10-08T06:00:00Z' },
    now: new Date('2027-01-08T00:00:00Z')
  })
  assert.deepEqual(later.reasons[2], ['marketing.lastPost', 0, { days: 91.75 }])
  for (const social of [{ lastPostAt: null }, { lastPostAt: 'not a date' }, { posts: 0 }, null])
    assert.deepEqual(score({}, { social }).reasons[2], ['marketing.unknown', null])
})

test('deterministic and pure: same input, same output; status is accepted but does not change the score', () => {
  const a = score({}, { status: 'new' })
  const b = score({}, { status: 'researched' })
  assert.deepEqual(a, b)
  const input = {
    candidate: { ...popular },
    siteCheck: { status: 'done', performance: 10 },
    social: { lastPostAt: ago(5) },
    now: NOW
  }
  const copy = structuredClone(input)
  scoreOpportunity(input)
  assert.deepEqual(input, copy)
})
