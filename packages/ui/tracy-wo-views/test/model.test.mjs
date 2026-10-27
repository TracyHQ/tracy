#!/usr/bin/env node
/**
 * The pure half of `@tracy/wo-views` — `src/model.ts`.
 *
 *   node --test packages/ui/tracy-wo-views/test/model.test.mjs
 *
 * Sorting, the kind tabs, the score tooltip lines and the website cell's summary are decided here,
 * so the table, the grid and the map agree. Node strips the types on import; nothing here needs a build.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  cuisineLabel,
  ageInDays,
  daysSince,
  filterByKind,
  formatAgo,
  formatUntil,
  perMonthText,
  freshestPostAt,
  kindCounts,
  providerLabel,
  socialView,
  reasonShownAsWhy,
  reasonText,
  sortRows,
  websiteSummary
} from '../src/model.ts'
import { createTranslate, en } from '../src/strings.ts'
import { COLUMN_IDS, KINDS, SORT_KEYS } from '../src/types.ts'

/** A minimal valid PlaceRow; `over` replaces fields. */
function row(name, over = {}) {
  return {
    key: `google-places:${name}`,
    provider: 'google-places',
    providerId: name,
    name,
    kind: 'restaurants',
    chain: false,
    chainSuspect: false,
    status: 'new',
    score: { score: 50, grade: 'B', pending: false, reasons: [] },
    ...over
  }
}
const scored = (name, score) => row(name, { score: { score, grade: 'B', pending: false, reasons: [] } })
const names = (rows) => rows.map((r) => r.name)

test('sortRows by score: high first with dir -1, low first with dir 1, input untouched', () => {
  const rows = [scored('b', 40), scored('a', 91), scored('c', 64)]
  assert.deepEqual(names(sortRows(rows, 'score', -1)), ['a', 'c', 'b'])
  assert.deepEqual(names(sortRows(rows, 'score', 1)), ['b', 'c', 'a'])
  assert.deepEqual(names(rows), ['b', 'a', 'c'])
})

const done = (performance) => ({ status: 'done', performance })

test('sortRows by website: a checked score ranks above down, social-only and no website; unchecked go last', () => {
  const rows = [
    row('none'),
    row('checking', { website: 'https://c.vn', siteCheck: { status: 'queued' } }),
    row('fast', { website: 'https://f.vn', siteCheck: done(88) }),
    row('social', { socials: { facebook: 'https://facebook.com/s' } }),
    row('down', { website: 'https://d.vn', siteCheck: { status: 'down' } }),
    row('slow', { website: 'https://s.vn', siteCheck: done(28) }),
    row('blocked', { website: 'https://b.vn', siteCheck: { status: 'blocked' } })
  ]
  assert.deepEqual(names(sortRows(rows, 'web', -1)), [
    'fast',
    'slow',
    'down',
    'social',
    'none',
    'checking',
    'blocked'
  ])
  assert.deepEqual(names(sortRows(rows, 'web', 1)), [
    'none',
    'social',
    'down',
    'slow',
    'fast',
    'checking',
    'blocked'
  ])
})

test('sortRows by google: more reviews first with dir -1; the rating breaks a tie; no reviews last', () => {
  const rows = [
    row('few', { reviews: 312, rating: 4.3 }),
    row('none'),
    row('many', { reviews: 9870, rating: 4.4 }),
    row('tieLow', { reviews: 1000, rating: 4.1 }),
    row('tieHigh', { reviews: 1000, rating: 4.8 })
  ]
  assert.deepEqual(names(sortRows(rows, 'google', -1)), ['many', 'tieHigh', 'tieLow', 'few', 'none'])
  assert.deepEqual(names(sortRows(rows, 'google', 1)), ['few', 'tieLow', 'tieHigh', 'many', 'none'])
})

test('sortRows by social: total followers over every network; no stats last', () => {
  const rows = [
    row('unknown'),
    row('one', { social: { facebook: { followers: 8200, url: 'https://facebook.com/one' } } }),
    row('three', {
      social: {
        facebook: { followers: 41000, url: 'https://facebook.com/3' },
        instagram: { followers: 12000, url: 'https://instagram.com/3' },
        youtube: { followers: null, url: 'https://youtube.com/3' }
      }
    }),
    row('empty', { social: {} })
  ]
  assert.deepEqual(names(sortRows(rows, 'social', -1)), ['three', 'one', 'unknown', 'empty'])
  assert.deepEqual(names(sortRows(rows, 'social', 1)), ['one', 'three', 'unknown', 'empty'])
})

test('daysSince: whole days from a timestamp to now; a missing or bad timestamp is null, not 0', () => {
  const now = Date.parse('2026-10-18T00:00:00Z')
  assert.equal(daysSince('2026-10-08T06:00:00Z', now), 9)
  assert.equal(daysSince('2026-10-18T00:00:00Z', now), 0)
  assert.equal(daysSince('2026-10-19T00:00:00Z', now), 0, 'a clock ahead is today, not negative')
  assert.equal(daysSince(null, now), null)
  assert.equal(daysSince(undefined, now), null)
  assert.equal(daysSince('soon', now), null)
})

test('freshestPostAt: the latest post over every network; null when none reported one', () => {
  const r = row('x', {
    social: {
      facebook: { url: 'https://facebook.com/x', lastPostAt: '2026-09-01T00:00:00Z' },
      instagram: { url: 'https://instagram.com/x', lastPostAt: '2026-10-10T00:00:00Z' },
      youtube: { url: 'https://youtube.com/x', lastPostAt: null, status: 'not_found' }
    }
  })
  assert.equal(freshestPostAt(r), '2026-10-10T00:00:00Z')
  assert.equal(freshestPostAt(row('y')), null)
  assert.equal(freshestPostAt(row('z', { social: { facebook: { url: 'u', followers: 10 } } })), null)
})

const kinded = (name, kind) => row(name, { kind })

test('filterByKind: null keeps every row; a kind keeps only its rows, in order', () => {
  const rows = [kinded('a', 'bars'), kinded('b', 'cafes'), kinded('c', 'bars'), kinded('d', null)]
  assert.deepEqual(names(filterByKind(rows, null)), ['a', 'b', 'c', 'd'])
  assert.deepEqual(names(filterByKind(rows, 'bars')), ['a', 'c'])
  assert.deepEqual(names(filterByKind(rows, 'nightlife')), [])
})

test('kindCounts: tab order of the kinds, kinds with no rows and rows with no kind left out', () => {
  const rows = [
    kinded('a', 'nightlife'),
    kinded('b', 'cafes'),
    kinded('c', 'restaurants'),
    kinded('d', 'cafes'),
    kinded('e', null)
  ]
  assert.deepEqual(kindCounts(rows), [
    { kind: 'restaurants', count: 1 },
    { kind: 'cafes', count: 2 },
    { kind: 'nightlife', count: 1 }
  ])
  assert.deepEqual(kindCounts([]), [])
})

const t = createTranslate()

test('reasonText: one line per reason key of opportunity-score.mjs, with signed points', () => {
  const cases = [
    [['web.none', 40], 'No website +40'],
    [['web.socialOnly', 40], 'Only a social page +40'],
    [['web.down', 40], 'Site down +40'],
    [
      ['web.slow', 25, { performance: 28, https: true, mobileFriendly: false, copyrightYear: 2014 }],
      'Slow or outdated site +25'
    ],
    [['web.fine', 0], 'Site is fine 0'],
    [['web.checking', null], 'Website checking…'],
    [['web.unknown', 0], 'Website could not be checked 0'],
    [['demand.reviews', 21, { reviews: 1234, rating: 4.6 }], '1,234 reviews · ★4.6 +21'],
    [['marketing.lastPost', 20, { days: 2 }], 'Last post 2 days ago +20'],
    [['marketing.lastPost', 0, { days: 40 }], 'Last post 40 days ago 0'],
    [['marketing.lastPost', 0, { days: 240 }], 'Last post 8 months ago 0'],
    [['marketing.lastPost', 20, { days: 14 / 24 }], 'Last post 14 hours ago +20'],
    // Social stats are not collected in this round: never "checking…" forever.
    [['marketing.unknown', null], 'Social pages not collected'],
    [['contact.reachable', 10], 'Phone, chat or email found +10'],
    [['contact.none', 0], 'No phone, chat or email 0'],
    [['chain.penalty', -45], 'Chain, so halved -45'],
    [['closed.penalty', -31], 'Temporarily closed, so halved -31']
  ]
  for (const [reason, line] of cases) assert.equal(reasonText(t, reason), line, reason[0])
})

test('an unknown Google rating or count is never shown as 0 reviews or ★0.0', () => {
  const line = (params) => reasonText(t, ['demand.reviews', 2, params])
  assert.equal(line({}), 'Google rating not known +2')
  // A score made before unknown values were left out: 0 and 0 mean nobody measured.
  assert.equal(line({ reviews: 0, rating: 0 }), 'Google rating not known +2')
  assert.equal(line({ reviews: 4 }), '4 reviews +2')
  assert.equal(line({ rating: 5 }), 'Rated ★5.0 +2')
  assert.equal(line({ reviews: 4, rating: 5 }), '4 reviews · ★5.0 +2')
  assert.equal(reasonShownAsWhy(['demand.reviews', 2, { reviews: 0, rating: 0 }]), false)
  assert.equal(reasonShownAsWhy(['demand.reviews', 2, { reviews: 4, rating: 5 }]), true)
  assert.equal(reasonShownAsWhy(['web.none', 40]), true)
})

test('reasonText formats numbers for the locale it is given', () => {
  assert.equal(
    reasonText(t, ['demand.reviews', 21, { reviews: 1234, rating: 4.6 }], 'de'),
    '1.234 reviews · ★4,6 +21'
  )
})

const NOW = new Date('2026-10-19T00:00:00Z')
const site = (siteCheck) => row('x', { website: 'https://www.banhmisuong.blogspot.com/menu', siteCheck })

test('websiteSummary: no website, and a social page standing in for one', () => {
  assert.deepEqual(websiteSummary(row('x'), NOW), { kind: 'none', notes: [] })
  assert.deepEqual(
    websiteSummary(row('x', { socials: { facebook: null, instagram: 'https://instagram.com/x' } }), NOW),
    {
      kind: 'social',
      notes: [],
      network: 'instagram'
    }
  )
})

test('websiteSummary: each check status before a result', () => {
  const host = 'banhmisuong.blogspot.com'
  assert.deepEqual(websiteSummary(site(null), NOW), { kind: 'checking', notes: [], host })
  assert.deepEqual(websiteSummary(site({ status: 'queued' }), NOW), { kind: 'checking', notes: [], host })
  assert.deepEqual(websiteSummary(site({ status: 'down' }), NOW), { kind: 'down', notes: [], host })
  assert.deepEqual(websiteSummary(site({ status: 'blocked' }), NOW), { kind: 'blocked', notes: [], host })
  assert.deepEqual(websiteSummary(site({ status: 'failed' }), NOW), { kind: 'unknown', notes: [], host })
  assert.deepEqual(websiteSummary(site({ status: 'not_queued' }), NOW), { kind: 'unknown', notes: [], host })
})

test('websiteSummary: a done check gives the score, what is wrong, a stale copyright and the CMS', () => {
  assert.deepEqual(
    websiteSummary(
      site({
        status: 'done',
        performance: 28,
        mobileFriendly: false,
        https: true,
        copyrightYear: 2014,
        cms: 'Blogger'
      }),
      NOW
    ),
    {
      kind: 'score',
      score: 28,
      notes: ['notMobileFriendly', 'copyright'],
      host: 'banhmisuong.blogspot.com',
      cms: 'Blogger',
      copyrightYear: 2014
    }
  )
  assert.deepEqual(
    websiteSummary(site({ status: 'done', performance: 46, https: false, copyrightYear: 2024 }), NOW).notes,
    ['noHttps']
  )
  assert.deepEqual(websiteSummary(site({ status: 'done', performance: 78, cms: 'Next.js' }), NOW).notes, [
    'fine'
  ])
  assert.deepEqual(websiteSummary(site({ status: 'done', performance: 31 }), NOW).notes, [])
  assert.equal(websiteSummary(site({ status: 'done', performance: null }), NOW).kind, 'noScore')
})

test('websiteSummary: a done check without a PageSpeed score still says it was checked, with its CMS and ©', () => {
  assert.deepEqual(
    websiteSummary(
      site({ status: 'done', performance: null, cms: 'WordPress', copyrightYear: 2015, https: false }),
      NOW
    ),
    {
      kind: 'noScore',
      notes: ['noHttps', 'copyright'],
      host: 'banhmisuong.blogspot.com',
      cms: 'WordPress',
      copyrightYear: 2015
    }
  )
  // No score and nothing wrong: no "Fine" either, since speed was never measured.
  assert.deepEqual(websiteSummary(site({ status: 'done', cms: 'Wix' }), NOW).notes, [])
})

test('clusterPins: near places share a group when zoomed out and split when zoomed in; no coordinates, no pin', async () => {
  const { clusterPins } = await import('../src/map-clusters.ts')
  const rows = [
    row('a', { lat: 15.8771, lon: 108.3261 }),
    row('b', { lat: 15.8772, lon: 108.3262 }),
    row('far', { lat: 15.95, lon: 108.45 }),
    row('lost', { lat: null, lon: null })
  ]
  const out = clusterPins(rows, 12)
    .map((g) => names(g.rows).join('+'))
    .sort()
  assert.deepEqual(out, ['a+b', 'far'])
  assert.deepEqual(
    clusterPins(rows, 16)
      .map((g) => names(g.rows).join('+'))
      .sort(),
    ['a', 'b', 'far']
  )
  const [ab] = clusterPins(rows.slice(0, 2), 12)
  assert.ok(Math.abs(ab.lat - 15.87715) < 1e-9 && Math.abs(ab.lon - 108.32615) < 1e-9)
})

test('pinIcon: a grade pin is a teardrop anchored at its tip, a group a circle anchored at its centre; colours come in', async () => {
  const { pinIcon } = await import('../src/map-pins.ts')
  const palette = { fill: 'oklch(0.6 0.15 40)', ink: '#fff', stroke: 'rgb(1 2 3)' }
  const pin = pinIcon({ shape: 'pin', text: 'A', ...palette })
  assert.match(pin.url, /^data:image\/svg\+xml;charset=utf-8,/)
  const svg = decodeURIComponent(pin.url.slice(pin.url.indexOf(',') + 1))
  assert.match(svg, /fill="oklch\(0\.6 0\.15 40\)"/)
  assert.match(svg, />A<\/text>/)
  assert.equal(pin.anchor.x, pin.width / 2)
  assert.equal(pin.anchor.y, pin.height)
  const group = pinIcon({ shape: 'cluster', text: '12', ...palette })
  assert.equal(group.width, group.height)
  assert.deepEqual(group.anchor, { x: group.width / 2, y: group.height / 2 })
  // Text is escaped, never markup.
  assert.doesNotMatch(decodeURIComponent(pinIcon({ shape: 'pin', text: '<b>', ...palette }).url), /<b>/)
})

test('pinPalette: A in the primary colour, B dark grey, C light grey, a group in the foreground; a selected pin is outlined', async () => {
  const { pinPalette } = await import('../src/map-pins.ts')
  const tokens = {
    primary: 'P',
    primaryForeground: 'PF',
    mutedForeground: 'MF',
    background: 'BG',
    muted: 'MUTED',
    border: 'BORDER',
    foreground: 'FG'
  }
  assert.deepEqual(pinPalette(tokens, 'A', false), { fill: 'P', ink: 'PF', stroke: 'BG' })
  assert.deepEqual(pinPalette(tokens, 'B', false), { fill: 'MF', ink: 'BG', stroke: 'BG' })
  assert.deepEqual(pinPalette(tokens, 'C', false), { fill: 'MUTED', ink: 'MF', stroke: 'MF' })
  assert.deepEqual(pinPalette(tokens, 'A', true).stroke, 'FG')
  assert.deepEqual(pinPalette(tokens, null, false), { fill: 'FG', ink: 'BG', stroke: 'BG' })
})

const SRC = fileURLToPath(new URL('../src/', import.meta.url))
const sources = () =>
  readdirSync(SRC, { recursive: true })
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => [f, readFileSync(join(SRC, f), 'utf8')])
const KEY_PREFIX = '(?:results|cell|score|kind|columns|advanced)\\.'

test('en holds every literal key the sources pass to t', () => {
  const missing = []
  let seen = 0
  for (const [file, text] of sources()) {
    for (const m of text.matchAll(new RegExp(`'(${KEY_PREFIX}[\\w.-]+)'`, 'g'))) {
      seen++
      if (!(m[1] in en)) missing.push(`${file}: ${m[1]}`)
    }
  }
  assert.ok(seen > 50, `only ${seen} keys found; the scan is broken`)
  assert.deepEqual(missing, [])
})

// Every `${…}` key family the sources build, with the values it is built from.
const FAMILIES = {
  'kind.': KINDS,
  'columns.': COLUMN_IDS,
  'results.sort.': SORT_KEYS,
  'results.view.': ['table', 'grid', 'map'],
  'results.provider.': ['google-places', 'google-maps', 'osm'],
  'cell.reviews.': ['google', 'tripadvisor'],
  'cell.status.': ['new', 'seen', 'researched', 'demo'],
  'cell.website.note.': ['notMobileFriendly', 'noHttps', 'copyright', 'fine'],
  'cell.demo.left.': ['day.one', 'day.other', 'hour.one', 'hour.other'],
  'cell.demo.deletesIn.': ['one', 'other'],
  'score.reason.': [
    'web.none',
    'web.socialOnly',
    'web.down',
    'web.slow',
    'web.fine',
    'web.checking',
    'web.unknown',
    'demand.reviews',
    'marketing.lastPost',
    'marketing.unknown',
    'contact.reachable',
    'contact.none',
    'chain.penalty',
    'closed.penalty'
  ]
}

test('en holds every key of every built key family, and no family goes unlisted', () => {
  const built = new Set()
  for (const [, text] of sources()) {
    for (const m of text.matchAll(new RegExp('`(' + KEY_PREFIX + '[\\w.-]*)\\$\\{', 'g'))) built.add(m[1])
  }
  assert.deepEqual(
    [...built].filter((p) => !(p in FAMILIES)),
    []
  )
  assert.ok(built.size >= 6, `only ${built.size} key families found; the scan is broken`)
  const missing = [...built].flatMap((p) => FAMILIES[p].map((v) => p + v)).filter((k) => !(k in en))
  assert.deepEqual(missing, [])
})

test('cuisineLabel: the dictionary name, else the id made readable (never the raw key)', () => {
  const t = createTranslate({ 'cuisine.vietnamese': 'Vietnamese' })
  assert.equal(cuisineLabel(t, 'vietnamese'), 'Vietnamese')
  assert.equal(cuisineLabel(t, 'asian_fusion'), 'Asian fusion')
  assert.equal(cuisineLabel(createTranslate(en), 'hamburger'), 'Hamburger')
})

const FB = 'https://facebook.com/bep'
const IG = 'https://instagram.com/bep'
const TT = 'https://tiktok.com/@bep'
const AT = Date.parse('2026-10-19T00:00:00Z')

test('socialView: pages with numbers become lines; the others stay links; the button is offered for what is missing or stale', () => {
  const v = socialView(
    row('a', {
      socials: { facebook: FB, instagram: IG, tiktok: TT },
      social: {
        facebook: {
          url: FB,
          status: 'ok',
          followers: 8200,
          lastPostAt: '2026-10-07T00:00:00Z',
          postsPerMonth: 3,
          coverage: 'partial',
          provider: 'facebook/scraper3',
          fetchedAt: '2026-10-18T00:00:00Z'
        },
        instagram: { url: IG, status: 'not_queued' }
      }
    }),
    AT
  )
  assert.deepEqual(v.lines, [
    {
      network: 'facebook',
      url: FB,
      followers: 8200,
      days: 12,
      perMonth: 3,
      partial: true,
      stale: false,
      provider: 'facebook/scraper3',
      fetchedAt: '2026-10-18T00:00:00Z'
    }
  ])
  assert.deepEqual(
    v.links.map((l) => l.network),
    ['instagram', 'tiktok']
  )
  assert.deepEqual([v.pending, v.canFetch, v.verdict], [false, true, null])
})

test('socialView: queued pages spin and offer no button; all not found reads "none"; a failure reads "failed" and may retry', () => {
  const queued = socialView(
    row('q', { socials: { facebook: FB }, social: { facebook: { url: FB, status: 'queued' } } }),
    AT
  )
  assert.deepEqual([queued.pending, queued.canFetch, queued.verdict], [true, false, null])
  const none = socialView(
    row('n', { socials: { facebook: FB }, social: { facebook: { url: FB, status: 'not_found' } } }),
    AT
  )
  assert.deepEqual([none.pending, none.canFetch, none.verdict], [false, false, 'notFound'])
  const failed = socialView(
    row('f', { socials: { facebook: FB }, social: { facebook: { url: FB, status: 'error' } } }),
    AT
  )
  assert.deepEqual([failed.canFetch, failed.verdict], [true, 'failed'])
  const fresh = socialView(
    row('o', { socials: { facebook: FB }, social: { facebook: { url: FB, status: 'ok', followers: 1 } } }),
    AT
  )
  assert.equal(fresh.canFetch, false, 'nothing left to get')
  const stale = socialView(
    row('s', {
      socials: { facebook: FB },
      social: { facebook: { url: FB, status: 'ok', followers: 1, stale: true } }
    }),
    AT
  )
  assert.deepEqual([stale.canFetch, stale.lines[0].stale], [true, true])
})

test('socialView: a page deferred by the daily budget does not spin, offers no button and says until when (dev round L1)', () => {
  const until = '2026-10-20T00:00:00.000Z'
  const v = socialView(
    row('d', {
      socials: { facebook: FB, instagram: IG },
      social: {
        facebook: { url: FB, status: 'queued', deferredUntil: until },
        instagram: { url: IG, status: 'queued', deferredUntil: '2026-10-21T00:00:00.000Z' }
      }
    }),
    AT
  )
  assert.deepEqual(
    [v.pending, v.canFetch, v.verdict, v.deferredUntil],
    [false, false, null, until],
    'the earliest date'
  )
  const kept = socialView(
    row('k', {
      socials: { facebook: FB },
      social: { facebook: { url: FB, status: 'queued', followers: 9, stale: true, deferredUntil: until } }
    }),
    AT
  )
  assert.deepEqual(
    [kept.lines.length, kept.canFetch, kept.deferredUntil],
    [1, false, until],
    'old numbers stay, no button'
  )
  const past = socialView(
    row('p', {
      socials: { facebook: FB },
      social: { facebook: { url: FB, status: 'queued', deferredUntil: '2026-10-18T00:00:00Z' } }
    }),
    AT
  )
  assert.deepEqual([past.pending, past.deferredUntil], [true, null], 'a date already past is plainly queued')
  const mixed = socialView(
    row('m', {
      socials: { facebook: FB, instagram: IG },
      social: {
        facebook: { url: FB, status: 'queued', deferredUntil: until },
        instagram: { url: IG, status: 'queued' }
      }
    }),
    AT
  )
  assert.equal(mixed.pending, true, 'another page is still being fetched')
  assert.equal(socialView(row('n', { socials: { facebook: FB } }), AT).deferredUntil, null)
})

test('formatUntil: a time ahead in hours under a day, then in days', () => {
  assert.equal(formatUntil('2026-10-19T05:00:00Z', AT), 'in 5 hours')
  assert.equal(formatUntil('2026-10-19T00:20:00Z', AT), 'in 20 minutes')
  assert.equal(formatUntil('2026-10-20T00:00:00Z', AT), 'tomorrow')
  assert.equal(formatUntil('2026-10-22T00:00:00Z', AT), 'in 3 days')
  assert.equal(formatUntil('2026-10-19T05:00:00Z', AT, 'vi'), 'sau 5 giờ nữa')
  assert.equal(formatUntil('garbage', AT), null)
})

test('socialView: no page at all is "none" once the website check can no longer find one', () => {
  assert.equal(socialView(row('x'), AT).verdict, 'none')
  assert.equal(
    socialView(row('y', { website: 'https://y.vn', siteCheck: { status: 'queued' } }), AT).verdict,
    null
  )
})

test('providerLabel names the service behind a provider id', () => {
  assert.equal(providerLabel('facebook/scraper3'), 'RapidAPI')
  assert.equal(providerLabel('youtube/official'), 'YouTube Data API')
  assert.equal(providerLabel('instagram/apify'), 'Apify')
  assert.equal(providerLabel('rapidapi'), 'RapidAPI')
  assert.equal(providerLabel('somethingelse'), 'somethingelse')
  for (const bare of ['scraper3', 'looter2', 'stable', 'api23', 'yt-api'])
    assert.equal(providerLabel(bare), 'RapidAPI', bare)
  assert.equal(providerLabel('official'), 'YouTube Data API')
})

test('perMonthText formats the count for the locale: vi writes 0,7', () => {
  const t = createTranslate(en)
  assert.equal(perMonthText(t, { perMonth: 0.7, partial: false }, 'en'), '· 0.7/mo')
  assert.equal(perMonthText(t, { perMonth: 0.66, partial: true }, 'vi'), '· ≥0,7/mo')
  assert.equal(perMonthText(t, { perMonth: 1234, partial: false }, 'en'), '· 1,234/mo')
  assert.equal(perMonthText(t, { perMonth: null, partial: false }, 'en'), null)
})

test('formatAgo picks the unit by elapsed time and always says a number', () => {
  const h = 1 / 24
  assert.equal(formatAgo(14 * h, 'en', 'narrow'), '14h ago', '14 hours is not "today"')
  assert.equal(
    formatAgo(0, 'en', 'narrow'),
    'today',
    'a score saved with whole days reads today, not 0 minutes'
  )
  assert.equal(formatAgo(0, 'vi').toLowerCase(), 'hôm nay')
  assert.equal(formatAgo(10 / 1440, 'en', 'narrow'), '10m ago')
  assert.equal(formatAgo(1.6, 'en', 'narrow'), '1d ago')
  assert.equal(formatAgo(75, 'en', 'narrow'), '2mo ago')
  assert.equal(formatAgo(400, 'en', 'narrow'), '1y ago', 'not "last yr."')
  assert.equal(formatAgo(14 * h, 'vi'), '14 giờ trước', 'no capitalised "Hôm nay" mid-sentence')
  assert.equal(formatAgo(2, 'en'), '2 days ago')
})

test('ageInDays: fractional days from a timestamp to now; daysSince is its whole part', () => {
  const now = Date.parse('2026-10-19T02:00:00Z')
  assert.equal(ageInDays('2026-10-18T12:00:00Z', now), 14 / 24)
  assert.equal(ageInDays('2026-10-20T00:00:00Z', now), 0, 'a clock ahead is now, not negative')
  assert.equal(ageInDays(null, now), null)
  assert.equal(daysSince('2026-10-18T12:00:00Z', now), 0)
})

test('socialView: a row whose linked pages were all not found says so, apart from a row with no page', () => {
  const v = socialView(
    row('n', {
      socials: { facebook: FB, instagram: IG },
      social: { facebook: { url: FB, status: 'not_found' }, instagram: { url: IG, status: 'not_found' } }
    }),
    AT
  )
  assert.deepEqual([v.links.length, v.verdict, v.canFetch], [2, 'notFound', false])
  assert.equal(socialView(row('x'), AT).verdict, 'none')
})

test('socialView: posts 0 with followers is a line with 0/mo and no last post', () => {
  const v = socialView(
    row('ig', {
      socials: { instagram: IG },
      social: {
        instagram: { url: IG, status: 'ok', followers: 601, posts: 0, postsPerMonth: 0, coverage: 'complete' }
      }
    }),
    AT
  )
  assert.deepEqual([v.lines[0].followers, v.lines[0].days, v.lines[0].perMonth], [601, null, 0])
  assert.equal(perMonthText(createTranslate(en), v.lines[0], 'en'), '· 0/mo')
})
