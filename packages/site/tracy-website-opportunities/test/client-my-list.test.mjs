/**
 * My opportunities' list, without the screen (`src/client/my-list.ts`): what one page answer holds,
 * the query each filter sends, which rows the poll asks about, how polled and newly added rows join
 * the rows on screen without moving them, the jobs a bulk press acts on, the old-server fallback, and
 * a saved opportunity as the row the shared table draws.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  bulkFilter,
  chunk,
  createLatest,
  legacyView,
  listParams,
  mergePolled,
  movingIds,
  pageAnswer,
  prependNew,
  selectionJobs,
  startingSubTab,
  toPlaceRow
} from '../src/client/my-list.ts'

const row = (id, over = {}) => ({
  id,
  name: `Place ${id}`,
  job: null,
  latestRevision: null,
  sites: [],
  ...over
})
const job = (state, id = `j-${state}`) => ({ id, state })

test('pageAnswer: a new server answers counts and a cursor; an old one only the rows', () => {
  const answer = pageAnswer({
    opportunities: [row('a'), { name: 'no id' }, row('b')],
    counts: { all: 3, new: 2, attention: 1 },
    nextCursor: 'abc',
    total: 3
  })
  assert.deepEqual(
    answer.rows.map((r) => r.id),
    ['a', 'b']
  )
  assert.equal(answer.paged, true)
  assert.equal(answer.counts.all, 3)
  assert.equal(answer.nextCursor, 'abc')
  assert.equal(answer.total, 3)

  const old = pageAnswer({ opportunities: [row('a')] })
  assert.equal(old.paged, false)
  assert.equal(old.counts, null)
  assert.equal(old.nextCursor, null)
  assert.equal(old.total, null)
})

test('pageAnswer: an answer that is not a list is no page at all', () => {
  assert.equal(pageAnswer(null), null)
  assert.equal(pageAnswer({ opportunities: 'x' }), null)
})

test('listParams: a step, Attention, the search and the cursor, in the door’s vocabulary', () => {
  assert.equal(listParams({ filter: 'all', q: '', limit: 50 }), 'limit=50')
  assert.equal(listParams({ filter: 'researched', q: '', limit: 50 }), 'stage=researched&limit=50')
  assert.equal(
    listParams({ filter: 'attention', q: ' pho ', limit: 50, cursor: 'c1' }),
    'attention=1&q=pho&cursor=c1&limit=50'
  )
})

test('bulkFilter: "Select all matching" sends the filter the list shows', () => {
  assert.deepEqual(bulkFilter('all', ''), {})
  assert.deepEqual(bulkFilter('brief', 'pho'), { stage: 'brief', q: 'pho' })
  assert.deepEqual(bulkFilter('attention', ''), { attention: true })
})

test('movingIds: research waiting or running, and demo sites still being built; nothing settled', () => {
  const rows = [
    row('queued', { job: job('queued') }),
    row('running', { job: job('running') }),
    row('paused', { job: job('paused') }),
    row('done', { job: job('completed') }),
    row('building', { job: job('completed'), latestBuild: { id: 'b1', state: 'requesting', done: false } }),
    row('built', { job: job('completed'), latestBuild: { id: 'b2', state: 'requesting', done: true } }),
    row('broken', { job: job('completed'), latestBuild: { id: 'b3', state: 'failed', done: false } })
  ]
  assert.deepEqual(movingIds(rows), ['queued', 'running', 'building'])
})

test('chunk: the poll asks at most 100 ids a call', () => {
  const ids = Array.from({ length: 230 }, (_, i) => `id${i}`)
  assert.deepEqual(
    chunk(ids, 100).map((c) => c.length),
    [100, 100, 30]
  )
  assert.deepEqual(chunk([], 100), [])
})

test('mergePolled: polled rows replace theirs in place; rows outside the filter now stay where they are', () => {
  const rows = [row('a', { job: job('running') }), row('b'), row('c', { job: job('queued') })]
  const next = mergePolled(rows, [row('c', { job: job('running'), stage: 'researching' }), row('zz')])
  assert.deepEqual(
    next.map((r) => r.id),
    ['a', 'b', 'c']
  )
  assert.equal(next[2].job.state, 'running')
  assert.equal(next[1], rows[1])
  assert.equal(mergePolled(rows, []), rows)
})

test('prependNew: rows added elsewhere (newest first) go on top; rows already shown are refreshed, not repeated', () => {
  const rows = [row('b'), row('a')]
  const next = prependNew(rows, [row('d'), row('c'), row('b', { name: 'renamed' })])
  assert.deepEqual(
    next.map((r) => r.id),
    ['d', 'c', 'b', 'a']
  )
  assert.equal(next[2].name, 'renamed')
})

test('legacyView: an old server sends every row; the screen filters, searches and counts them itself', () => {
  const rows = [
    row('n1'),
    row('r1', { job: job('running'), name: 'Pho Hoa' }),
    row('p1', { job: job('paused') }),
    row('d1', { job: job('completed'), latestRevision: { id: 'r', n: 1 } })
  ]
  const all = legacyView(rows, 'all', '')
  assert.equal(all.rows.length, 4)
  assert.deepEqual(all.counts, { all: 4, research: 2, demo: 1, outreach: 0, cancelled: 0, attention: 1 })
  assert.deepEqual(
    legacyView(rows, 'research', '').rows.map((r) => r.id),
    ['n1', 'r1']
  )
  assert.deepEqual(
    legacyView(rows, 'attention', '').rows.map((r) => r.id),
    ['p1']
  )
  assert.deepEqual(
    legacyView(rows, 'all', 'pho').rows.map((r) => r.id),
    ['r1']
  )
})

test('selectionJobs: the jobs a bulk Resume and Cancel act on, from the picked rows', () => {
  const rows = [
    row('a', { job: job('running', 'ja') }),
    row('b', { job: job('paused', 'jb') }),
    row('c', { job: job('failed', 'jc') }),
    row('d', { job: job('cancelled', 'jd') }),
    row('e', { job: job('completed', 'je') }),
    row('f')
  ]
  const picked = new Set(['a', 'b', 'c', 'd', 'e', 'f'])
  assert.deepEqual(selectionJobs(rows, picked), { resume: ['jb', 'jc', 'jd'], cancel: ['ja', 'jb'] })
  assert.deepEqual(selectionJobs(rows, new Set(['e'])), { resume: [], cancel: [] })
})

test('createLatest: only the newest question’s answer is used; a late one is dropped', () => {
  const latest = createLatest()
  const first = latest.next()
  const second = latest.next()
  assert.equal(latest.isCurrent(first), false)
  assert.equal(latest.isCurrent(second), true)
})

test('startingSubTab: the address wins; otherwise My opportunities when the account has any', () => {
  assert.equal(startingSubTab('find', 12), 'find')
  assert.equal(startingSubTab(null, 12), 'mine')
  assert.equal(startingSubTab(null, 0), 'find')
  assert.equal(startingSubTab(null, null), null)
})

test('toPlaceRow: the saved candidate drawn by the shared table, keyed by the opportunity', () => {
  const place = toPlaceRow(
    row('o1', {
      name: 'Pho Hoa',
      branch: 'District 1',
      job: job('completed'),
      candidate: {
        provider: 'google-places',
        providerId: 'g1',
        name: 'Pho Hoa',
        website: 'https://pho.example',
        rating: 4.5,
        reviews: 120,
        kind: 'restaurants',
        category: 'Vietnamese Restaurant',
        distanceM: 400,
        priceLevel: 2,
        openNow: true,
        chain: false,
        lat: 10.7,
        lon: 106.7
      }
    })
  )
  assert.equal(place.key, 'o1')
  assert.equal(place.name, 'Pho Hoa')
  assert.equal(place.branch, 'District 1')
  assert.equal(place.website, 'https://pho.example')
  assert.equal(place.rating, 4.5)
  assert.equal(place.kind, 'restaurants')
  assert.equal(place.lat, 10.7)
  // "Open now" was true when it was searched, days ago: not a fact about now.
  assert.equal(place.openNow, null)
  assert.equal(place.status, 'researched')
})

test('toPlaceRow: an opportunity added from a link has no candidate and still draws', () => {
  const place = toPlaceRow(row('o2', { name: 'From a link', candidate: null }))
  assert.equal(place.key, 'o2')
  assert.equal(place.name, 'From a link')
  assert.equal(place.kind, null)
  assert.equal(place.website, null)
  assert.equal(place.status, 'new')
})

test('stagePin: on the map a row reads its step number; Attention stands out, research in progress is dark', async () => {
  const { stagePin } = await import('../src/client/my-list.ts')
  assert.deepEqual(stagePin(row('a')), { label: '1', tone: 'C' })
  assert.deepEqual(stagePin(row('b', { job: job('running') })), { label: '1', tone: 'B' })
  assert.deepEqual(stagePin(row('c', { job: job('failed') })), { label: '!', tone: 'A' })
  assert.deepEqual(stagePin(row('d', { job: job('completed'), latestRevision: { id: 'r', n: 1 } })), {
    label: '2',
    tone: 'C'
  })
  assert.deepEqual(stagePin(row('e', { job: job('cancelled') })), { label: '–', tone: 'C' })
})

test('toPlaceRow: the server’s score and the cached check and stats it rests on are drawn as sent', () => {
  const score = { score: 72, grade: 'A', pending: false, reasons: [['web.slow', 20, { score: 31 }]] }
  const place = toPlaceRow(
    row('o3', {
      candidate: {
        provider: 'osm',
        providerId: 'n1',
        name: 'Pho',
        website: 'https://pho.example',
        socials: {}
      },
      socials: { facebook: 'https://facebook.com/pho' },
      score,
      siteCheck: { status: 'done', performance: 31 },
      social: { facebook: { status: 'done', followers: 1200, lastPostAt: '2026-10-01T00:00:00Z' } }
    })
  )
  assert.deepEqual(place.score, score)
  assert.equal(place.siteCheck.performance, 31)
  assert.equal(place.socials.facebook, 'https://facebook.com/pho')
  assert.equal(place.social.facebook.followers, 1200)
  assert.equal(place.social.facebook.status, 'ok')
})

test('toPlaceRow: an older server sends no score; it is computed from the saved candidate, as Find does', () => {
  const place = toPlaceRow(
    row('o4', {
      candidate: { provider: 'osm', providerId: 'n2', name: 'Bun', rating: 4.5, reviews: 300, socials: {} }
    })
  )
  assert.ok(['A', 'B', 'C'].includes(place.score.grade))
  assert.ok(place.score.reasons.length > 0)
})

test('a manual handoff keeps polling its exact QA even after provisioning and its build action finished', () => {
  const rows = [
    row('qa', { latestBuild: { id: 'b', state: 'done', done: true, qa: 'pending' } }),
    row('repair', { latestBuild: { id: 'c', state: 'done', done: true, qa: 'retry' } }),
    row('ready', { latestBuild: { id: 'd', state: 'done', done: true, qa: 'passed' } })
  ]
  assert.deepEqual(movingIds(rows), ['qa', 'repair'])
})
