/**
 * The tab's flow: Find → candidates → pick several → My opportunities → one opportunity → its brief.
 * A pure reducer, so every step can be checked without a page.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  candidateKey,
  checkProgress,
  initialFlow,
  flowReducer,
  searchAnswer,
  selectedCandidates,
  uncheckedWebsites
} from '../src/client/flow.ts'

const pho = { key: 'osm:node/1', provider: 'osm', providerId: 'node/1', name: 'Pho Hoa', branch: 'Hoi An' }
const pho2 = { key: 'osm:node/2', provider: 'osm', providerId: 'node/2', name: 'Pho Hoa', branch: 'Da Nang' }

test('the tab opens on My opportunities with nothing found yet', () => {
  assert.deepEqual(initialFlow().view, { name: 'list' })
  assert.equal(initialFlow().search.phase, 'idle')
})

test('a search runs, lands and can be picked from; two branches of one name stay apart', () => {
  let s = flowReducer(initialFlow(), { type: 'open', view: { name: 'find' } })
  s = flowReducer(s, { type: 'search-start' })
  assert.equal(s.search.phase, 'searching')
  s = flowReducer(s, { type: 'search-done', candidates: [pho, pho2] })
  assert.equal(s.search.phase, 'done')
  s = flowReducer(s, { type: 'toggle', key: candidateKey(pho2) })
  assert.deepEqual(selectedCandidates(s), [pho2])
  s = flowReducer(s, { type: 'toggle', key: candidateKey(pho) })
  s = flowReducer(s, { type: 'toggle', key: candidateKey(pho2) })
  assert.deepEqual(selectedCandidates(s), [pho])
})

test('a new search drops the old picks; a failed one keeps its error code', () => {
  let s = flowReducer(initialFlow(), { type: 'search-done', candidates: [pho] })
  s = flowReducer(s, { type: 'toggle', key: candidateKey(pho) })
  s = flowReducer(s, { type: 'search-start' })
  assert.deepEqual(selectedCandidates(s), [])
  s = flowReducer(s, { type: 'search-failed', code: 'FEATURE_OFF' })
  assert.deepEqual(s.search, { phase: 'failed', code: 'FEATURE_OFF', candidates: [] })
})

test('Clear drops every pick and keeps the results', () => {
  let s = flowReducer(initialFlow(), { type: 'search-done', candidates: [pho, pho2] })
  s = flowReducer(s, { type: 'toggle', key: candidateKey(pho) })
  s = flowReducer(s, { type: 'toggle', key: candidateKey(pho2) })
  s = flowReducer(s, { type: 'clear-selection' })
  assert.deepEqual(selectedCandidates(s), [])
  assert.equal(s.search.candidates.length, 2)
})

test('a toggle for a candidate that is not listed does nothing', () => {
  const s = flowReducer(initialFlow(), { type: 'toggle', key: 'osm:node/9' })
  assert.deepEqual(s.selected, [])
})

test('opening an opportunity and then its revision, and going back', () => {
  let s = flowReducer(initialFlow(), { type: 'open', view: { name: 'detail', id: 'op1' } })
  s = flowReducer(s, { type: 'open', view: { name: 'revision', id: 'op1', revisionId: 'r1' } })
  assert.deepEqual(s.view, { name: 'revision', id: 'op1', revisionId: 'r1' })
  s = flowReducer(s, { type: 'back' })
  assert.deepEqual(s.view, { name: 'detail', id: 'op1' })
  s = flowReducer(s, { type: 'back' })
  assert.deepEqual(s.view, { name: 'list' })
  s = flowReducer(s, { type: 'back' })
  assert.deepEqual(s.view, { name: 'list' })
})

test('after the picks are sent, the selection clears and the list is shown', () => {
  let s = flowReducer(initialFlow(), { type: 'search-done', candidates: [pho] })
  s = flowReducer(s, { type: 'toggle', key: candidateKey(pho) })
  s = flowReducer(s, { type: 'sent' })
  assert.deepEqual(s.selected, [])
  assert.deepEqual(s.view, { name: 'list' })
})

// The search door's answer: `{center, provider, fallbackFrom?, pages?, hiddenChains, candidates}`.
test('a search answer names its map provider and whether it fell back to OpenStreetMap', () => {
  const osm = searchAnswer({
    provider: 'osm',
    fallbackFrom: { provider: 'google-maps', code: 'APIFY_TIMEOUT' },
    candidates: [pho]
  })
  assert.deepEqual([osm.provider, osm.fellBack], ['osm', true])
  assert.deepEqual(searchAnswer({ provider: 'bing', candidates: 'x' }).candidates, [])
  assert.equal(searchAnswer({ provider: 'bing' }).provider, null)
  let s = flowReducer(initialFlow(), { type: 'search-done', ...osm })
  assert.deepEqual([s.search.provider, s.search.fellBack], ['osm', true])
  s = flowReducer(s, { type: 'search-start' })
  assert.equal(s.search.provider, undefined)
})

const score = { score: 60, grade: 'B', pending: false, reasons: [] }
const gp = (over = {}) => ({
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

test('a Google Places answer becomes rows with a key, its chain count, pages and centre', () => {
  const answer = searchAnswer({
    center: { lat: 15.88, lon: 108.33 },
    provider: 'google-places',
    pages: 2,
    hiddenChains: 3,
    candidates: [gp({ siteCheck: { status: 'done', emails: ['hi@bep.vn', 'b@bep.vn'] } }), { name: 'no id' }]
  })
  assert.equal(answer.provider, 'google-places')
  assert.equal(answer.fellBack, false)
  assert.equal(answer.hiddenChains, 3)
  assert.equal(answer.pages, 2)
  assert.deepEqual(answer.center, { lat: 15.88, lon: 108.33 })
  assert.equal(answer.candidates.length, 1)
  assert.equal(answer.candidates[0].key, 'google-places:ChIJ1')
  // The first email the site check found is lifted onto the row for the Contact cell.
  assert.equal(answer.candidates[0].email, 'hi@bep.vn')
})

test('a row the server sent without a score or kind still gets one, so every cell can draw', () => {
  const [row] = searchAnswer({
    provider: 'osm',
    candidates: [{ provider: 'osm', providerId: 'n/1', name: 'X' }]
  }).candidates
  assert.equal(row.kind, null)
  assert.equal(row.status, 'new')
  assert.equal(row.chain, false)
  assert.equal(typeof row.score.score, 'number')
  assert.equal(row.score.reasons[0][0], 'web.none')
})

test('results open sorted by opportunity, highest first, Table view, Type column hidden', () => {
  const r = initialFlow().results
  assert.deepEqual([r.sort, r.dir, r.kind, r.view], ['score', -1, null, 'table'])
  assert.deepEqual([...r.hidden], ['type'])
  assert.deepEqual([...initialFlow(['type', 'status']).results.hidden], ['type', 'status'])
})

test('pressing the sorted column flips the order; another column sorts highest first', () => {
  let s = flowReducer(initialFlow(), { type: 'results-sort', key: 'score' })
  assert.equal(s.results.dir, 1)
  s = flowReducer(s, { type: 'results-sort', key: 'google' })
  assert.deepEqual([s.results.sort, s.results.dir], ['google', -1])
})

test('kind tab, view and columns switch independently', () => {
  let s = flowReducer(initialFlow(), { type: 'results-kind', kind: 'cafes' })
  s = flowReducer(s, { type: 'results-view', view: 'grid' })
  s = flowReducer(s, { type: 'results-column', column: 'type' })
  s = flowReducer(s, { type: 'results-column', column: 'social' })
  assert.deepEqual([s.results.kind, s.results.view], ['cafes', 'grid'])
  assert.deepEqual([...s.results.hidden], ['social'])
  s = flowReducer(s, { type: 'results-kind', kind: null })
  assert.equal(s.results.kind, null)
})

test('site checks merge into the rows by website and re-score them', () => {
  const slow = gp({
    providerId: 'slow',
    website: 'https://slow.vn',
    reviews: 1000,
    rating: 4.5,
    phone: '+84 1',
    siteCheck: { status: 'queued' },
    score: { score: 33, grade: 'C', pending: true, reasons: [['web.checking', null]] }
  })
  const none = gp({ providerId: 'none', score })
  let s = flowReducer(initialFlow(), {
    type: 'search-done',
    candidates: [slow, none],
    provider: 'google-places'
  })
  s = flowReducer(s, {
    type: 'checks-merged',
    checks: {
      'https://slow.vn': {
        status: 'done',
        performance: 20,
        https: true,
        mobileFriendly: true,
        emails: ['owner@slow.vn']
      },
      'https://elsewhere.vn': { status: 'queued' }
    }
  })
  const [merged, untouched] = s.search.candidates
  assert.equal(merged.siteCheck.performance, 20)
  assert.equal(merged.email, 'owner@slow.vn')
  // Slow site 25 + demand 6·log10(1001)+3 = 21 + contact 10 = 56.
  assert.deepEqual([merged.score.score, merged.score.grade, merged.score.pending], [56, 'B', false])
  assert.equal(merged.score.reasons[0][0], 'web.slow')
  assert.equal(untouched, s.search.candidates[1])
  assert.equal(untouched.score, score)
  assert.deepEqual(Object.keys(s.results.checks).sort(), ['https://elsewhere.vn', 'https://slow.vn'])
})

test('social pages found on the website reach the row; a network the row already has is kept', () => {
  const row = gp({
    providerId: 'fb',
    website: 'https://pho.vn',
    socials: { facebook: 'https://facebook.com/from-places' },
    social: {
      instagram: { url: 'https://instagram.com/pho', status: 'done', lastPostAt: '2026-10-10T00:00:00Z' }
    },
    siteCheck: { status: 'queued' }
  })
  let s = flowReducer(initialFlow(), { type: 'search-done', candidates: [row] })
  s = flowReducer(s, {
    type: 'checks-merged',
    checks: {
      'https://pho.vn': {
        status: 'done',
        socials: { facebook: 'https://facebook.com/from-site', instagram: 'https://instagram.com/pho', x: 7 }
      }
    }
  })
  const [merged] = s.search.candidates
  assert.deepEqual(merged.socials, {
    facebook: 'https://facebook.com/from-places',
    instagram: 'https://instagram.com/pho'
  })
  assert.equal(merged.social.instagram.lastPostAt, '2026-10-10T00:00:00Z', 'stats untouched')
  const marketing = merged.score.reasons.find(([k]) => k === 'marketing.lastPost')
  assert.ok(marketing, 'the last post is scored from lastPostAt')
})

test('checks that change nothing keep the same state object', () => {
  const row = gp({ website: 'https://a.vn', siteCheck: { status: 'queued' } })
  const s = flowReducer(initialFlow(), { type: 'search-done', candidates: [row] })
  const same = flowReducer(s, { type: 'checks-merged', checks: { 'https://a.vn': { status: 'queued' } } })
  assert.equal(same.search.candidates[0], s.search.candidates[0])
})

test('check progress counts finished checks among rows that have a website', () => {
  const rows = [
    gp({ providerId: '1', website: 'https://a.vn', siteCheck: { status: 'done' } }),
    gp({ providerId: '2', website: 'https://b.vn', siteCheck: { status: 'queued' } }),
    gp({ providerId: '3', website: 'https://c.vn', siteCheck: { status: 'down' } }),
    gp({ providerId: '4', website: 'https://d.vn' }),
    gp({ providerId: '5' })
  ]
  const s = flowReducer(initialFlow(), { type: 'search-done', candidates: rows })
  assert.deepEqual(checkProgress(s), { done: 2, total: 4 })
  assert.equal(checkProgress(initialFlow()), null)
  // Polled in the order given (score order); a site shared by two branches is asked once.
  assert.deepEqual(
    uncheckedWebsites([
      ...rows,
      gp({ providerId: '6', website: 'https://b.vn', siteCheck: { status: 'not_queued' } })
    ]),
    ['https://b.vn', 'https://d.vn']
  )
})
