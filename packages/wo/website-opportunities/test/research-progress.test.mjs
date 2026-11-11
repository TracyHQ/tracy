// The Research sub steps of the Progress card (#537), read from the place job serving a card's request and its
// preparing snapshot: table-driven cases over fixtures of `wo_place_job` and `wo_place_snapshot_source` rows.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { researchItemsOf } from '../src/research-progress.js'
import { stepProgressOf } from '../src/step-progress.js'

const T = (minute) => new Date(Date.UTC(2026, 10, 1, 10, minute)).toISOString()
const SNAPSHOT_AT = T(10)

// A fictional place: Google facts and Instagram carried over from an older research (attempted before the snapshot),
// a website and Tripadvisor tried in this run, a listing kept by the card itself (never in the snapshot).
const carried = [
  { source: 'google-places', status: 'complete', attempted_at: T(1), collected_at: T(1) },
  { source: 'instagram', status: 'complete', attempted_at: T(2), collected_at: T(2) }
]
const source = (name, extra = {}) => ({ source: name, status: 'pending', attempted_at: null, ...extra })

const CASES = [
  {
    name: 'no place job, or one not claimed yet: nothing recorded, no items',
    run: null,
    want: []
  },
  {
    name: 'a claimed job without a snapshot time is not read',
    run: {
      job: { state: 'running', stage: 'discovery', progress: {} },
      snapshotCreatedAt: null,
      sources: carried
    },
    want: []
  },
  {
    name: 'discovery, Google Maps being read: carried sources wait, the profile waits',
    run: {
      job: {
        state: 'running',
        stage: 'discovery',
        progress: { collecting: 'google-maps' },
        updated_at: T(11)
      },
      snapshotCreatedAt: SNAPSHOT_AT,
      sources: [...carried, source('google-maps', { status: 'failed', attempted_at: T(3) })]
    },
    want: [
      ['instagram', 'Instagram', 'waiting', null],
      ['google-places', 'Google Places', 'waiting', null],
      ['google-maps', 'Google Maps', 'running', null],
      ['profile', 'Writing the business facts', 'waiting', null]
    ]
  },
  {
    name: 'collection: tried sources done or failed with their time, the current one running',
    run: {
      job: { state: 'running', stage: 'collection', progress: { collecting: 'website' }, updated_at: T(13) },
      snapshotCreatedAt: SNAPSHOT_AT,
      sources: [
        ...carried,
        source('google-maps', { status: 'failed', reason: 'HTTP_429', attempted_at: T(11) }),
        source('tripadvisor', { status: 'complete', attempted_at: T(12), collected_at: T(12) }),
        source('website', { ref: 'https://court-club.example/' }),
        source('facebook-search', { status: 'skipped', attempted_at: T(12) })
      ]
    },
    want: [
      ['website', 'Website', 'running', null],
      ['instagram', 'Instagram', 'waiting', null],
      ['facebook-search', 'Facebook search', 'done', T(12)],
      ['google-places', 'Google Places', 'waiting', null],
      ['google-maps', 'Google Maps', 'failed', T(11)],
      ['tripadvisor', 'TripAdvisor', 'done', T(12)],
      ['profile', 'Writing the business facts', 'waiting', null]
    ]
  },
  {
    name: 'a page by page source still reading (partial with a cursor) stays running',
    run: {
      job: { state: 'running', stage: 'collection', progress: { collecting: 'website' }, updated_at: T(13) },
      snapshotCreatedAt: SNAPSHOT_AT,
      sources: [source('website', { status: 'partial', cursor: { queue: ['/menu'] }, attempted_at: T(12) })]
    },
    want: [
      ['website', 'Website', 'running', null],
      ['profile', 'Writing the business facts', 'waiting', null]
    ]
  },
  {
    name: 'writing the business facts: every source settled, carried ones kept, the stale collecting key ignored',
    run: {
      job: {
        state: 'running',
        stage: 'profile',
        progress: { collecting: null, reading: 'business' },
        updated_at: T(14)
      },
      snapshotCreatedAt: SNAPSHOT_AT,
      sources: [...carried, source('website', { status: 'complete', attempted_at: T(12) })]
    },
    want: [
      ['website', 'Website', 'done', T(12)],
      ['instagram', 'Instagram', 'done', T(2)],
      ['google-places', 'Google Places', 'done', T(1)],
      ['profile', 'Writing the business facts', 'running', T(14)]
    ]
  },
  {
    name: 'the media stage keeps the last collecting key: it is not read as running',
    run: {
      job: { state: 'running', stage: 'media', progress: { collecting: 'website' }, updated_at: T(13) },
      snapshotCreatedAt: SNAPSHOT_AT,
      sources: [source('website', { status: 'complete', attempted_at: T(12) })]
    },
    want: [
      ['website', 'Website', 'done', T(12)],
      ['profile', 'Writing the business facts', 'waiting', null]
    ]
  },
  {
    name: 'the job failed while collecting: the source it was on failed',
    run: {
      job: { state: 'failed', stage: 'collection', progress: { collecting: 'tiktok' }, updated_at: T(15) },
      snapshotCreatedAt: SNAPSHOT_AT,
      sources: [source('tiktok', { attempted_at: T(3) })]
    },
    want: [
      ['tiktok', 'TikTok', 'failed', T(15)],
      ['profile', 'Writing the business facts', 'waiting', null]
    ]
  },
  {
    name: 'the job failed writing the business facts',
    run: {
      job: { state: 'failed', stage: 'profile', progress: { reading: 'business' }, updated_at: T(16) },
      snapshotCreatedAt: SNAPSHOT_AT,
      sources: [source('website', { status: 'complete', attempted_at: T(12) })]
    },
    want: [
      ['website', 'Website', 'done', T(12)],
      ['profile', 'Writing the business facts', 'failed', T(16)]
    ]
  },
  {
    name: 'rows the Sources card does not list (an internal part) are left out',
    run: {
      job: { state: 'running', stage: 'brand', progress: {}, updated_at: T(17) },
      snapshotCreatedAt: SNAPSHOT_AT,
      sources: [source('logo', { status: 'complete', attempted_at: T(12) })]
    },
    want: [['profile', 'Writing the business facts', 'done', null]]
  }
]

for (const c of CASES)
  test(`researchItemsOf: ${c.name}`, () => {
    const got = researchItemsOf(c.run).map((i) => [i.key, i.label, i.state, i.at])
    assert.deepEqual(got, c.want)
  })

test('stepProgressOf: a running research reads its place job', () => {
  const run = CASES[3].run
  const got = stepProgressOf({ research: { state: 'running' }, researchRun: run })
  assert.equal(got.step, 'research')
  assert.deepEqual(got.items, researchItemsOf(run))
  assert.ok(got.items.length > 1)
})

test('stepProgressOf: a finished research shows no research items', () => {
  assert.deepEqual(stepProgressOf({ research: { state: 'done' }, researchRun: CASES[3].run }), {
    step: null,
    items: []
  })
})
