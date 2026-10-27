/**
 * Social stats on the Find results: which handles the tab asks for, how the answers reach the rows,
 * and when the poll has something left to wait for. Pure functions of `flow.ts`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { socialView } from '@tracy/wo-views/model'

import {
  flowReducer,
  initialFlow,
  mergeSocialStats,
  rowHandles,
  searchAnswer,
  socialAnswer,
  socialProgress,
  socialStatsOffered,
  socialToAsk
} from '../src/client/flow.ts'

const score = { score: 60, grade: 'B', pending: false, reasons: [] }
const gp = (over = {}) => ({
  key: `google-places:${over.providerId ?? 'ChIJ1'}`,
  provider: 'google-places',
  providerId: 'ChIJ1',
  name: 'Bep Hoa',
  kind: 'restaurants',
  chain: false,
  chainSuspect: false,
  status: 'new',
  score,
  ...over
})

const FB = 'https://facebook.com/bephoa'
const IG = 'https://instagram.com/bephoa'

test('stats reach the row by its page URL, in the views’ vocabulary, and the row is re-scored', () => {
  const row = gp({ socials: { facebook: FB, instagram: IG } })
  const other = gp({ providerId: '2' })
  const [merged, untouched] = mergeSocialStats([row, other], {
    [FB]: {
      status: 'done',
      followers: 8200,
      posts: 310,
      lastPostAt: '2026-10-10T00:00:00Z',
      postsPerMonth: 3,
      coverage: 'partial',
      fetchedAt: '2026-10-19T00:00:00Z',
      stale: false,
      provider: 'facebook/scraper3'
    },
    [IG]: { status: 'queued' }
  })
  assert.deepEqual(merged.social.facebook, {
    url: FB,
    status: 'ok',
    followers: 8200,
    posts: 310,
    lastPostAt: '2026-10-10T00:00:00Z',
    postsPerMonth: 3,
    coverage: 'partial',
    fetchedAt: '2026-10-19T00:00:00Z',
    stale: false,
    provider: 'facebook/scraper3'
  })
  assert.deepEqual(merged.social.instagram, { url: IG, status: 'queued' })
  assert.ok(
    merged.score.reasons.some(([k]) => k === 'marketing.lastPost'),
    'the last post is scored'
  )
  assert.equal(untouched, other)
})

test('failed and not_found keep their meaning; a missing number stays absent, never 0', () => {
  const row = gp({ socials: { facebook: FB, instagram: IG } })
  const [merged] = mergeSocialStats([row], {
    [FB]: { status: 'failed' },
    [IG]: { status: 'not_found', followers: 'x' }
  })
  assert.deepEqual(merged.social.facebook, { url: FB, status: 'error' })
  assert.deepEqual(merged.social.instagram, { url: IG, status: 'not_found' })
})

test('answers that change nothing keep the same rows', () => {
  const rows = [gp({ socials: { facebook: FB }, social: { facebook: { url: FB, status: 'queued' } } })]
  assert.equal(mergeSocialStats(rows, { [FB]: { status: 'queued' } }), rows)
  assert.equal(mergeSocialStats(rows, { 'https://elsewhere': { status: 'done' } }), rows)
})

test('the reducer merges social stats into the search candidates', () => {
  let s = flowReducer(initialFlow(), { type: 'search-done', candidates: [gp({ socials: { facebook: FB } })] })
  s = flowReducer(s, { type: 'social-merged', stats: { [FB]: { status: 'done', followers: 12 } } })
  assert.equal(s.search.candidates[0].social.facebook.followers, 12)
})

const TT = 'https://tiktok.com/@bephoa'
const YT = 'https://youtube.com/@bephoa'

test('the poll asks for pages nothing is known about and pages still queued, in the order given, each once', () => {
  const best = gp({
    providerId: 'a',
    socials: { facebook: FB, instagram: IG },
    social: { instagram: { url: IG, status: 'queued' } }
  })
  const next = gp({
    providerId: 'b',
    socials: { tiktok: TT, youtube: YT, facebook: FB },
    social: { tiktok: { url: TT, status: 'not_queued' }, youtube: { url: YT, status: 'ok', followers: 3 } }
  })
  assert.deepEqual(socialToAsk([best, next, gp({ providerId: 'c' })]), [
    { network: 'facebook', url: FB },
    { network: 'instagram', url: IG }
  ])
})

test('one row’s button asks for every page it links, at most four', () => {
  const row = gp({ socials: { facebook: FB, instagram: IG, tiktok: TT, youtube: YT, x: 'https://x.com/a' } })
  assert.deepEqual(
    rowHandles(row).map((h) => h.network),
    ['facebook', 'instagram', 'tiktok', 'youtube']
  )
  assert.deepEqual(rowHandles(gp()), [])
})

test('a page the server left out of its answer counts as not queued, so the poll does not ask forever', () => {
  const sent = [
    { network: 'facebook', url: FB },
    { network: 'instagram', url: IG }
  ]
  assert.deepEqual(
    socialAnswer(sent, { stats: { [FB]: { status: 'queued' }, 'https://other': { status: 'done' } } }),
    {
      [FB]: { status: 'queued' },
      [IG]: { status: 'not_queued' },
      'https://other': { status: 'done' }
    }
  )
  assert.deepEqual(socialAnswer(sent, null), {
    [FB]: { status: 'not_queued' },
    [IG]: { status: 'not_queued' }
  })
})

test('social progress counts settled pages among every linked page; null when no row links one', () => {
  const rows = [
    gp({
      providerId: 'a',
      socials: { facebook: FB, instagram: IG },
      social: { facebook: { url: FB, status: 'ok' }, instagram: { url: IG, status: 'queued' } }
    }),
    gp({ providerId: 'b', socials: { tiktok: TT }, social: { tiktok: { url: TT, status: 'not_found' } } }),
    gp({ providerId: 'c', socials: { youtube: YT } })
  ]
  const s = flowReducer(initialFlow(), { type: 'search-done', candidates: rows })
  assert.deepEqual(socialProgress(s), { done: 2, total: 4, queued: 1 })
  assert.equal(socialProgress(flowReducer(initialFlow(), { type: 'search-done', candidates: [gp()] })), null)
})

test('social stats are offered only when the server names a provider it can use', () => {
  assert.equal(
    socialStatsOffered({ socialStats: { providers: { rapidapi: true, youtube: false, apify: false } } }),
    true
  )
  assert.equal(
    socialStatsOffered({ socialStats: { providers: { rapidapi: false, youtube: false, apify: false } } }),
    false
  )
  assert.equal(socialStatsOffered({}), false, 'an older server says nothing')
  assert.equal(socialStatsOffered(null), false)
})

test('a refresh that is queued or failed keeps the numbers already shown', () => {
  const shown = {
    url: FB,
    status: 'ok',
    followers: 8200,
    lastPostAt: '2026-10-10T00:00:00Z',
    stale: true,
    provider: 'facebook/scraper3'
  }
  const rows = [gp({ socials: { facebook: FB }, social: { facebook: shown } })]
  const [queued] = mergeSocialStats(rows, { [FB]: { status: 'queued' } })
  assert.deepEqual(queued.social.facebook, { ...shown, status: 'queued' })
  const [failed] = mergeSocialStats([queued], { [FB]: { status: 'failed' } })
  assert.deepEqual(failed.social.facebook, { ...shown, status: 'error' })
  const [fresh] = mergeSocialStats([queued], { [FB]: { status: 'done', followers: 9000, stale: false } })
  assert.deepEqual(
    fresh.social.facebook,
    { url: FB, status: 'ok', followers: 9000, stale: false },
    'a new answer replaces the old one'
  )
})

test('stats that come with /search take the views’ vocabulary: a failed page can be asked again', () => {
  const body = {
    provider: 'google-places',
    candidates: [
      {
        providerId: 'ChIJ7',
        name: '9 Ferries',
        socials: { facebook: FB, instagram: IG },
        social: {
          facebook: { status: 'failed', error: 'provider_error' },
          instagram: {
            status: 'done',
            url: IG,
            followers: 601,
            posts: 0,
            postsPerMonth: 0,
            coverage: 'complete',
            provider: 'instagram/looter2'
          }
        }
      }
    ]
  }
  const s = flowReducer(initialFlow(), { type: 'search-done', ...searchAnswer(body) })
  const [row] = s.search.candidates
  assert.deepEqual(row.social.facebook, { url: FB, status: 'error' })
  assert.deepEqual(row.social.instagram, {
    url: IG,
    status: 'ok',
    followers: 601,
    posts: 0,
    postsPerMonth: 0,
    coverage: 'complete',
    provider: 'instagram/looter2'
  })
  const view = socialView(row, Date.parse('2026-10-19T00:00:00Z'))
  assert.deepEqual(
    [view.verdict, view.canFetch],
    [null, true],
    'numbers for one page; the failed one offers the button'
  )
  const lone = flowReducer(initialFlow(), {
    type: 'search-done',
    ...searchAnswer({
      ...body,
      candidates: [
        {
          ...body.candidates[0],
          socials: { facebook: FB },
          social: { facebook: body.candidates[0].social.facebook }
        }
      ]
    })
  }).search.candidates[0]
  assert.deepEqual(
    [socialView(lone, 0).verdict, socialView(lone, 0).canFetch],
    ['failed', true],
    '"Could not check" and the button'
  )
  assert.deepEqual(socialToAsk([lone]), [], 'a failure waits for the button, not the poll')
})

test('a page deferred by the daily budget keeps its date and is not asked again until then (dev round L1)', () => {
  const until = '2026-10-20T00:00:00.000Z'
  const row = gp({
    socials: { facebook: FB, instagram: IG },
    social: { facebook: { url: FB, status: 'ok', followers: 7, stale: true } }
  })
  const [merged] = mergeSocialStats([row], {
    [FB]: { status: 'queued', deferredUntil: until },
    [IG]: { status: 'queued', deferredUntil: until }
  })
  assert.deepEqual(
    merged.social.facebook,
    { url: FB, status: 'queued', followers: 7, stale: true, deferredUntil: until },
    'shown numbers stay'
  )
  assert.deepEqual(merged.social.instagram, { url: IG, status: 'queued', deferredUntil: until })
  const now = Date.parse('2026-10-19T08:00:00Z')
  assert.deepEqual(socialToAsk([merged], now), [], 'nothing to poll for today')
  assert.equal(socialView(merged, now).pending, false)
  assert.deepEqual(
    socialToAsk([merged], Date.parse(until) + 1).map((h) => h.network),
    ['facebook', 'instagram'],
    'asked again once the day turned'
  )
  const [again] = mergeSocialStats([merged], { [FB]: { status: 'queued' } })
  assert.equal(again.social.facebook.deferredUntil, undefined, 'a plain queued answer clears the date')
})
