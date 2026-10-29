// Every kind of item a brief holds routes to a v3 role or states why it is not shown, and a withheld fact becomes an owner
// question (#49). The seam: fictional research goes through `buildBrief`; the brief's items are then routed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildBrief, validateBrief } from '../domain/brief.mjs'
import { PLACE_CONTENT_ROLES_V3 } from '../domain/place-content-roles.mjs'
import {
  BRIEF_ITEM_ROUTES,
  itemKindsOfBrief,
  ownerQuestionsOf,
  routeTableErrors,
  routesOfBrief
} from '../domain/brief-item-routes.mjs'
import { checkBusinessReading, readingSourcesOf } from '../domain/business-reading.mjs'

const AT = '2026-10-28T09:00:00.000Z'
const here = (p) => new URL(p, import.meta.url)
const SCHEMA = JSON.parse(readFileSync(here('../domain/brief-schema.json'), 'utf8'))
const BRIEF_SOURCE = readFileSync(here('../domain/brief.mjs'), 'utf8')
const POSTS = JSON.parse(readFileSync(here('./fixtures/content-pool-posts.json'), 'utf8'))['larch-house']

const sha = (n) => String(n).padStart(64, '0')
const img = (id, n, category = 'food') => ({
  id,
  kind: 'image',
  category,
  sha256: sha(n),
  source: 'website',
  sourceUrl: `https://example.test/${id}.jpg`,
  width: 1600,
  height: 1000
})
const MEDIA = [
  img('p1', 1),
  img('p2', 2, 'space'),
  img('p3', 3),
  img('p4', 4, 'people'),
  img('p5', 5),
  { id: 'v1', kind: 'video', category: 'space', sha256: sha(9) }
]
const menuItem = (name, price) => ({
  name,
  price,
  currency: price ? 'USD' : null,
  section: 'Mains',
  source: { url: 'https://example.test/menu.pdf', kind: 'pdf' },
  collectedAt: AT,
  verified: Boolean(price)
})

// A fictional club: a bio with services and a coach, Google reviews, a rating, social counts, a menu with one unpriced line.
const BIO =
  'Lantern Hill Racquet Club runs a Tennis class and a Padel class. Head coach Mara Okonkwo leads them.'
const reading = {
  method: 'model',
  ...checkBusinessReading(
    {
      services: [{ name: 'Tennis class', quote: 'a Tennis class', ref: 'bio' }],
      team: [{ name: 'Mara Okonkwo', role: 'Head coach', quote: 'Head coach Mara Okonkwo', ref: 'bio' }]
    },
    readingSourcesOf({ bio: BIO })
  )
}
const GOOGLE = {
  placeId: 'place-lantern-1',
  amenities: {},
  reservable: true,
  summaries: {},
  attribution: 'Google',
  rating: 4.8,
  userRatingCount: 120,
  reviews: [{ author: 'Sam Rowe', text: 'Friendly staff and great courts.', rating: 5 }]
}
const input = (profile, extra = {}) => ({
  opportunity: {
    id: 'o1',
    name: 'Lantern Hill Racquet Club',
    candidate: { trade: 'fitness', lat: 25.1, lon: 55.2 }
  },
  profile: {
    name: 'Lantern Hill Racquet Club',
    address: '1 Example Lane, Harbourtown',
    phone: '+971 4 000 0101',
    bio: BIO,
    businessReading: reading,
    booking: [{ url: 'https://book.example.test/lh', source: 'website', verified: true }],
    socials: { instagram: 'https://www.instagram.com/lanternhill/' },
    ...profile
  },
  sources: [{ source: 'website', status: 'complete', coverage: { fetched: 3, total: 3 } }],
  media: MEDIA,
  posts: POSTS,
  googlePlace: GOOGLE,
  brand: null,
  madeAt: AT,
  ...extra
})
const FOOD = {
  opportunity: { id: 'o2', name: 'Larch House', candidate: { kind: 'restaurants' } },
  profile: {
    name: 'Larch House',
    hours: ['Mo-Su 09:00-17:00'],
    menus: [{ url: 'https://example.test/menu.pdf', source: 'website' }],
    menuItems: [menuItem('Larch soup', '9'), menuItem('Chef special', null)]
  },
  sources: [],
  media: MEDIA,
  posts: POSTS,
  brand: null,
  madeAt: AT
}

const BRIEFS = {
  club: buildBrief(input({})),
  clubNoPhone: buildBrief(input({ phone: null, address: null })),
  larch: buildBrief(FOOD),
  sparse: buildBrief({
    opportunity: { id: 'o3', name: 'Bare Cafe', candidate: {} },
    profile: { name: 'Bare Cafe' },
    madeAt: AT
  })
}

test('the fictional briefs are valid, so the routing is tested on real brief shapes', () => {
  for (const [name, b] of Object.entries(BRIEFS)) assert.deepEqual(validateBrief(b).errors, [], name)
})

test('no item of a fictional brief is without a role or a reason', () => {
  for (const [name, brief] of Object.entries(BRIEFS)) {
    const { routed, notShown, unrouted } = routesOfBrief(brief)
    assert.deepEqual(unrouted, [], `${name}: kinds with no role and no reason`)
    assert.ok(routed.length > 0, name)
    for (const r of routed)
      assert.ok(
        r.roles.every((x) => PLACE_CONTENT_ROLES_V3.includes(x)),
        r.kind
      )
    for (const n of notShown) assert.match(n.reason, /\S/, n.kind)
  }
  const kinds = new Set(Object.values(BRIEFS).flatMap((b) => [...itemKindsOfBrief(b).keys()]))
  for (const k of [
    'section.team',
    'section.menu',
    'content.event',
    'review',
    'rating',
    'menu-item',
    'service'
  ]) {
    assert.ok(kinds.has(k), `the fixtures hold ${k}`)
  }
})

test('the table is well formed: a role of vocabulary 3 or a reason, never neither', () => {
  assert.deepEqual(routeTableErrors(), [])
  assert.ok(routeTableErrors({ 'section.x': {} }).length > 0)
  assert.ok(routeTableErrors({ 'section.x': { roles: ['not.a_role'] } }).length > 0)
  assert.ok(routeTableErrors({ 'section.x': { roles: ['offering.name'], notShown: 'why' } }).length > 0)
})

test('a kind with no row is reported as unrouted', () => {
  const brief = structuredClone(BRIEFS.club)
  brief.sitemap[0].sections.push({ kind: 'testimonials-wall', copy: 'x', assetIds: [] })
  assert.deepEqual(routesOfBrief(brief).unrouted, [{ kind: 'section.testimonials-wall', count: 1 }])
})

test('every kind the brief schema and the builder can produce has a row (a new kind fails here)', () => {
  const has = (k) =>
    assert.ok(Object.hasOwn(BRIEF_ITEM_ROUTES, k), `no role or reason for ${k}: add it to BRIEF_ITEM_ROUTES`)
  for (const k of SCHEMA.properties.content.properties.items.items.properties.kinds.items.enum)
    has(`content.${k}`)
  for (const k of SCHEMA.properties.integrations.items.properties.kind.enum) has(`integration.${k}`)
  const fields =
    SCHEMA.properties.facts.description.match(/field[^]*?$/) &&
    SCHEMA.properties.facts.items.properties.field.description
  for (const f of fields.replace(/\.$/, '').split(/, | or /)) has(f === 'menu' ? 'fact.menu' : `fact.${f}`)
  // Every section the builder writes: its literal `kind: '<x>', copy:` and the offers/events/posts loop.
  const literal = [...BRIEF_SOURCE.matchAll(/kind: '(\w+)',\s*copy/g)].map((m) => m[1])
  for (const k of new Set([...literal, 'offers', 'events', 'posts'])) has(`section.${k}`)
  for (const b of Object.values(BRIEFS)) for (const k of itemKindsOfBrief(b).keys()) has(k)
})

test('a price the owner did not publish yields an owner question', () => {
  const qs = ownerQuestionsOf(BRIEFS.larch)
  const prices = qs.find((q) => q.field === 'prices')
  assert.ok(prices, `questions: ${JSON.stringify(qs.map((q) => q.field))}`)
  assert.deepEqual(prices.items, ['Chef special'])
  assert.match(prices.question, /cost|price/i)
})

test('every missing or withheld fact of a brief has an owner question, none is a silent gap', () => {
  for (const [name, brief] of Object.entries(BRIEFS)) {
    const asked = new Set(ownerQuestionsOf(brief).map((q) => q.field))
    const parked = new Set(routesOfBrief(brief).notShown.map((n) => n.kind))
    for (const m of brief.missing)
      assert.ok(
        asked.has(m.field) || parked.has(`missing.${m.field}`),
        `${name}: ${m.field} is missing, not asked and not routed as not shown`
      )
  }
  const fields = ownerQuestionsOf(BRIEFS.clubNoPhone).map((q) => q.field)
  assert.ok(fields.includes('phone') && fields.includes('address'), fields.join())
  for (const q of ownerQuestionsOf(BRIEFS.sparse)) assert.match(q.question, /\?/)
})

test('a source that failed is a research problem: no owner question, routed as not shown with its reason', () => {
  const brief = structuredClone(BRIEFS.club)
  brief.missing.push(
    { field: 'source:map-service', why: 'failed: HTTP_429; nothing from this source is in the brief.' },
    { field: 'source:review-site', why: 'failed: HTTP_402; nothing from this source is in the brief.' }
  )
  const qs = ownerQuestionsOf(brief)
  assert.deepEqual(
    qs.filter((q) => /source:|HTTP|map-service|review-site/.test(q.id + q.question)),
    []
  )
  const parked = routesOfBrief(brief).notShown.find((n) => n.kind === 'missing.source:map-service')
  assert.ok(parked, 'the failed source is routed as not shown')
  assert.match(parked.reason, /HTTP_429/)
})

test('a missing field with no owner wording is never asked with its raw id, it is routed as not shown', () => {
  const brief = structuredClone(BRIEFS.club)
  brief.missing.push({ field: 'widget-count', why: 'No widget count was collected.' })
  const qs = ownerQuestionsOf(brief)
  assert.equal(
    qs.some((q) => q.field === 'widget-count' || /widget-count/.test(q.question)),
    false
  )
  const parked = routesOfBrief(brief).notShown.find((n) => n.kind === 'missing.widget-count')
  assert.equal(parked?.reason, 'No widget count was collected.')
})

test('a missing field with owner wording keeps its question', () => {
  const brief = structuredClone(BRIEFS.clubNoPhone)
  const phone = ownerQuestionsOf(brief).find((q) => q.id === 'owner.phone')
  assert.equal(phone?.question, 'What phone number should customers call? None was found.')
  assert.equal(
    routesOfBrief(brief).notShown.some((n) => n.kind === 'missing.phone'),
    false
  )
})
