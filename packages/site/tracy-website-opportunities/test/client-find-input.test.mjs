/**
 * The Find box: one text field takes a place ("Hoi An") or a link to a business's website or
 * social page; the radius applies only to a place or to the person's location. Several links pasted
 * there go to the link rows of links mode, one per row.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  MAX_RADIUS_M,
  RADII_M,
  activeFilterCount,
  applyResultFilters,
  classifyInput,
  depthFor,
  filtersOnKey,
  nextCuisines,
  searchBody
} from '../src/client/find-input.ts'
import { rowsOf, spreadPaste } from '@tracy/wo-views/link-rows-model'

test('a social or website link is a link, named by its platform', () => {
  assert.deepEqual(classifyInput('https://www.facebook.com/phohoa'), {
    kind: 'link',
    url: 'https://www.facebook.com/phohoa',
    source: 'facebook'
  })
  assert.equal(classifyInput('instagram.com/phohoa').source, 'instagram')
  assert.equal(classifyInput('instagram.com/phohoa').url, 'https://instagram.com/phohoa')
  assert.equal(classifyInput('https://m.tiktok.com/@pho').source, 'tiktok')
  assert.equal(classifyInput('https://youtu.be/abc').source, 'youtube')
  assert.equal(classifyInput('https://www.youtube.com/@pho').source, 'youtube')
  assert.equal(classifyInput('phohoa.vn').source, 'website')
  assert.equal(classifyInput(' https://phohoa.vn/menu ').url, 'https://phohoa.vn/menu')
})

test('words are a place; blanks are nothing', () => {
  assert.deepEqual(classifyInput('Hoi An'), { kind: 'place', query: 'Hoi An' })
  assert.deepEqual(classifyInput('District 1, Ho Chi Minh City'), {
    kind: 'place',
    query: 'District 1, Ho Chi Minh City'
  })
  assert.deepEqual(classifyInput('   '), { kind: 'empty' })
})

test('a link that is not http(s) is not a link', () => {
  assert.equal(classifyInput('ftp://phohoa.vn').kind, 'place')
  assert.equal(classifyInput('javascript:alert(1)').kind, 'place')
})

test('the search body carries a place or a point, with a radius the server accepts', () => {
  assert.deepEqual(searchBody({ kind: 'place', query: 'Hoi An' }, 3000), {
    query: 'Hoi An',
    radiusM: 3000,
    depth: 'quick'
  })
  assert.deepEqual(searchBody({ kind: 'point', lat: 15.88, lon: 108.33 }, 1000), {
    lat: 15.88,
    lon: 108.33,
    radiusM: 1000,
    depth: 'quick'
  })
  // Anything over the server's cap is clamped, never sent as is.
  assert.equal(searchBody({ kind: 'place', query: 'x' }, 80_000).radiusM, 50_000)
  assert.ok(RADII_M.every((r) => r <= MAX_RADIUS_M))
})

test("radii go from 500 m to Google's 50 km; depth is Quick up to 3 km, Standard above", () => {
  assert.deepEqual(RADII_M, [500, 1000, 2000, 3000, 5000, 10000, 20000, 30000, 50000])
  assert.equal(MAX_RADIUS_M, 50_000)
  assert.equal(depthFor(500), 'quick')
  assert.equal(depthFor(3000), 'quick')
  assert.equal(depthFor(5000), 'standard')
  assert.equal(depthFor(50_000), 'standard')
})

test('the search body carries only the Google-side options; Auto depth follows the radius', () => {
  const area = { kind: 'place', query: 'Hoi An' }
  assert.deepEqual(
    searchBody(area, 10_000, {
      depth: 'auto',
      kinds: ['cafes'],
      cuisines: ['vietnamese'],
      minRating: 4,
      priceLevels: [1, 2],
      openNow: true,
      includeChains: true
    }),
    {
      query: 'Hoi An',
      radiusM: 10_000,
      depth: 'standard',
      kinds: ['cafes'],
      cuisines: ['vietnamese'],
      minRating: 4,
      priceLevels: [1, 2],
      openNow: true,
      includeChains: true
    }
  )
  // An explicit depth wins over the radius; empty lists and off switches are not sent.
  assert.deepEqual(
    searchBody(area, 10_000, { depth: 'quick', kinds: [], cuisines: [], priceLevels: [], openNow: false }),
    {
      query: 'Hoi An',
      radiusM: 10_000,
      depth: 'quick'
    }
  )
})

const row = (over) => ({
  key: `google-places:${over.providerId ?? 'x'}`,
  provider: 'google-places',
  providerId: 'x',
  name: 'Place',
  kind: 'restaurants',
  chain: false,
  chainSuspect: false,
  status: 'new',
  score: { score: 60, grade: 'B', pending: false, reasons: [] },
  ...over
})

test('result filters: by grade, website state, reviews range and contact channels', () => {
  const none = row({
    providerId: 'none',
    score: { score: 90, grade: 'A', pending: false, reasons: [] },
    reviews: 500,
    phone: '+84 1'
  })
  const social = row({ providerId: 'social', socials: { facebook: 'https://fb.com/a' }, reviews: 40 })
  const slow = row({
    providerId: 'slow',
    website: 'https://slow.vn',
    siteCheck: { status: 'done', performance: 30, cms: 'Wix', copyrightYear: 2016 },
    email: 'a@slow.vn',
    reviews: 2000
  })
  const fine = row({
    providerId: 'fine',
    website: 'https://fine.vn',
    siteCheck: { status: 'done', performance: 90, https: true, mobileFriendly: true }
  })
  const down = row({ providerId: 'down', website: 'https://down.vn', siteCheck: { status: 'down' } })
  const rows = [none, social, slow, fine, down]
  const keys = (filters) => applyResultFilters(rows, filters).map((r) => r.providerId)

  assert.deepEqual(keys({}), ['none', 'social', 'slow', 'fine', 'down'])
  assert.deepEqual(keys({ grades: ['A'] }), ['none'])
  assert.deepEqual(keys({ website: ['none', 'social'] }), ['none', 'social'])
  assert.deepEqual(keys({ website: ['down'] }), ['down'])
  assert.deepEqual(keys({ website: ['slow'] }), ['slow'])
  assert.deepEqual(keys({ website: ['fine'] }), ['fine'])
  assert.deepEqual(keys({ reviewsMin: 100 }), ['none', 'slow'])
  assert.deepEqual(keys({ reviewsMin: 100, reviewsMax: 1000 }), ['none'])
  assert.deepEqual(keys({ has: ['phone'] }), ['none'])
  assert.deepEqual(keys({ has: ['email'] }), ['slow'])
  assert.deepEqual(keys({ has: ['facebook'] }), ['social'])
  assert.deepEqual(keys({ cms: ['Wix'] }), ['slow'])
  assert.deepEqual(keys({ copyrightBefore: 2020 }), ['slow'])
})

test('a site still being checked passes the website filter until its check lands', () => {
  const checking = row({ providerId: 'c', website: 'https://c.vn', siteCheck: { status: 'queued' } })
  assert.equal(applyResultFilters([checking], { website: ['none'] }).length, 1)
  assert.equal(applyResultFilters([checking], { cms: ['Wix'] }).length, 1)
})

test('"Other" CMS matches any detected CMS outside the named list', () => {
  const next = row({
    providerId: 'n',
    website: 'https://n.vn',
    siteCheck: { status: 'done', cms: 'Next.js' }
  })
  const wp = row({
    providerId: 'w',
    website: 'https://w.vn',
    siteCheck: { status: 'done', cms: 'WordPress' }
  })
  assert.deepEqual(
    applyResultFilters([next, wp], { cms: ['Other'] }).map((r) => r.providerId),
    ['n']
  )
})

test('researched places are shown by default; hiding research stays opt-in and closed places stay hidden', () => {
  const researched = row({ providerId: 'r', status: 'researched' })
  const demo = row({ providerId: 'd', status: 'demo' })
  const closed = row({ providerId: 'cl', temporarilyClosed: true })
  const seen = row({ providerId: 's', status: 'seen' })
  const all = [researched, demo, closed, seen]
  assert.deepEqual(
    applyResultFilters(all, {}).map((r) => r.providerId),
    ['r', 'd', 's']
  )
  assert.deepEqual(
    applyResultFilters(all, { hideResearched: true }).map((r) => r.providerId),
    ['s']
  )
  assert.equal(applyResultFilters(all, { hideResearched: false, hideClosed: false }).length, 4)
})

test('social filters apply only to rows that carry social stats; others pass', () => {
  const noStats = row({ providerId: 'a', social: null })
  const now = Date.parse('2026-10-18T00:00:00Z')
  const active = row({
    providerId: 'b',
    social: { facebook: { url: 'u', followers: 5000, lastPostAt: '2026-10-15T00:00:00Z' } }
  })
  const quiet = row({
    providerId: 'c',
    social: { instagram: { url: 'u', followers: 100, lastPostAt: '2026-04-01T00:00:00Z' } }
  })
  const ids = (f) => applyResultFilters([noStats, active, quiet], f, now).map((r) => r.providerId)
  assert.deepEqual(ids({ socialActiveDays: 30 }), ['a', 'b'])
  assert.deepEqual(ids({ followersMin: 1000 }), ['a', 'b'])
})

test('the summary counts the advanced options that differ from their defaults', () => {
  assert.equal(activeFilterCount({}, {}), 0)
  assert.equal(
    activeFilterCount({ depth: 'auto', includeChains: false }, { hideResearched: false, hideClosed: true }),
    0
  )
  assert.equal(
    activeFilterCount({ cuisines: ['thai'], minRating: 4 }, { grades: ['A'], hideClosed: false }),
    4
  )
})

test('the "filters on" summary takes the plural form of the interface language', () => {
  assert.equal(filtersOnKey(1, 'en'), 'find.summary.filters.one')
  assert.equal(filtersOnKey(3, 'en'), 'find.summary.filters.other')
  // French counts 0 and 1 as singular; Vietnamese and Chinese have one form.
  assert.equal(filtersOnKey(1, 'fr'), 'find.summary.filters.one')
  assert.equal(filtersOnKey(1, 'vi'), 'find.summary.filters.other')
  assert.equal(filtersOnKey(1, 'zh'), 'find.summary.filters.other')
})

test('Escape on the closed cuisine box keeps the picked cuisines; picking and removing still change them', () => {
  assert.deepEqual(nextCuisines(['thai', 'vietnamese'], [], 'escape-key'), ['thai', 'vietnamese'])
  assert.deepEqual(nextCuisines(['thai'], ['thai', 'vietnamese'], 'item-press'), ['thai', 'vietnamese'])
  assert.deepEqual(nextCuisines(['thai', 'vietnamese'], ['vietnamese'], 'chip-remove-press'), ['vietnamese'])
})

test('nearbyPlace: the hint names the city the server placed the person in, never a fixed one', async () => {
  const { nearbyPlace } = await import('../src/client/find-input.ts')
  assert.equal(nearbyPlace('Hanoi, Hanoi, VN'), 'Hanoi')
  assert.equal(nearbyPlace('  Brooklyn , New York, US'), 'Brooklyn')
  // A bare coordinate label (no city known) is no place to suggest.
  assert.equal(nearbyPlace('21.03, 105.85'), null)
  assert.equal(nearbyPlace(''), null)
  assert.equal(nearbyPlace(null), null)
})

test('direct place searches carry intent and exact ID, while area searches retain their existing body', () => {
  assert.deepEqual(
    searchBody(
      { kind: 'text', query: 'Green Mesa, Al Fahidi', placeId: 'ChIJgreen', sessionToken: 'session-1' },
      3000
    ),
    {
      query: 'Green Mesa, Al Fahidi',
      intent: 'place',
      placeId: 'ChIJgreen',
      sessionToken: 'session-1',
      radiusM: 3000,
      depth: 'quick'
    }
  )
})

test('several links pasted into the search field spread into the link rows; the words become the name', () => {
  const pasted =
    'Harbour Sport Club https://share.google/hscFakeLink01\nhttps://www.instagram.com/harbour.sportclub'
  assert.deepEqual(spreadPaste(rowsOf(), 0, pasted), {
    rows: ['https://share.google/hscFakeLink01', 'https://www.instagram.com/harbour.sportclub', ''],
    name: 'Harbour Sport Club'
  })
  assert.equal(spreadPaste(rowsOf(), 0, 'https://share.google/hscFakeLink01'), null)
})
