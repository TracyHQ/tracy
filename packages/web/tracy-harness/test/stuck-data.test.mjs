import assert from 'node:assert/strict'
import { test } from 'node:test'
import { en } from '../src/i18n/ns/beta.ts'
import {
  buildStuckView,
  readStuckFilters,
  STUCK_DEFAULTS,
  stuckOperation,
  stuckReason,
  stuckSplit
} from '../src/beta/stuck-data.ts'

// English through the dictionary, the way `useT()` reads it without a provider.
const t = (key, params = {}) => {
  const plural = typeof params.count === 'number' ? `${key}_${params.count === 1 ? 'one' : 'other'}` : key
  const text = en[plural] ?? en[key] ?? key
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m))
}

const now = '2026-10-22T10:00:00Z'
const row = (overrides = {}) => ({
  siteKey: 'one',
  email: 'one@example.test',
  operation: 'import',
  platform: 'joomla',
  step: 'signing_in',
  reason: 'invalid_credential',
  firstAt: '2026-09-01T00:00:00Z',
  lastAt: now,
  times: 3,
  open: true,
  closed: null,
  totalFailures: 3,
  episodeCount: 1,
  historyAvailable: true,
  plans: [],
  source: null,
  ...overrides
})
const body = (sites, history = { episodes: [], activity: [] }) => ({
  readAt: now,
  count: sites.filter((r) => r.open).length,
  open: sites.filter((r) => r.open),
  handledToday: [],
  sites,
  writable: true,
  history
})

test('S01 import stages are never called new-site builds; raw reasons get plain labels', () => {
  assert.equal(stuckOperation(t, row()), 'Import existing site')
  assert.equal(stuckReason(t, 'invalid_credential'), 'Sign-in details rejected')
  assert.equal(stuckReason(t, 'new_internal_code'), 'Other reported problem')
})

test('S01 importing stages count as imports instead of failed builds', () => {
  const rows = ['signing_in', 'reading_content', 'installing'].map((step) => ({ step, operation: 'import' }))
  rows.push({ step: 'build', operation: 'build' })
  assert.equal(stuckSplit(t, rows), '1 new site · 3 imports')
})

test('date controls never hide current cases, including cases older than 30 days', () => {
  const view = buildStuckView(body([row()]), { ...STUCK_DEFAULTS, days: '1' })
  assert.equal(view.open.length, 1)
  assert.equal(view.waitingOverDay, 1)
  assert.equal(view.repeat.length, 1)
  assert.equal(view.history.active, 0)
})

test('all categorical filters apply together; empty production history has no activity', () => {
  const sites = [row(), row({ siteKey: 'two', platform: 'wordpress', operation: 'build' })]
  const view = buildStuckView(body(sites), {
    ...STUCK_DEFAULTS,
    cms: 'joomla',
    operation: 'import',
    reason: 'invalid_credential'
  })
  assert.equal(view.open.length, 1)
  assert.equal(view.history.active, 0)
  assert.equal(
    buildStuckView(body(sites), { ...STUCK_DEFAULTS, cms: 'wordpress', operation: 'import' }).open.length,
    0
  )
})

test('history rate uses distinct active sites; recovery excludes manual closes and deletions', () => {
  const episode = row({
    firstAt: '2026-10-21T00:00Z',
    lastAt: '2026-10-21T00:00Z',
    closed: { how: 'built', at: '2026-10-21T02:00Z', by: null }
  })
  const history = {
    episodes: [episode, { ...episode, closed: { how: 'handled', at: '2026-10-21T20:00Z', by: 'support' } }],
    activity: [
      { ...row(), at: '2026-10-21T00:00Z', kind: 'failed' },
      { ...row(), at: '2026-10-21T00:01Z', kind: 'failed' },
      { ...row({ siteKey: 'two' }), at: '2026-10-21T00:00Z', kind: 'started' }
    ]
  }
  const view = buildStuckView(body([row()], history), { ...STUCK_DEFAULTS, days: '7' })
  assert.equal(view.history.failed, 1)
  assert.equal(view.history.active, 2)
  assert.equal(view.history.rate, 50)
  assert.equal(view.history.recovered, 1)
  assert.equal(view.history.medianHours, 2)
})

test('URL filters keep unavailable selected values and validate dates without silently widening', () => {
  const filters = readStuckFilters(
    new URLSearchParams('days=custom&start=2026-10-22&end=&reason=legacy_error&cms=joomla')
  )
  assert.equal(filters.end, '')
  assert.equal(filters.reason, 'legacy_error')
  assert.equal(buildStuckView(body([row()]), filters).range.error, 'invalid-dates')
})

test('calendar dates from URLs reject nonexistent days instead of normalizing them', () => {
  for (const [start, end] of [
    ['2026-09-31', '2026-10-01'],
    ['2026-02-29', '2026-03-01'],
    ['2026-10-20', '2026-10-32']
  ]) {
    const view = buildStuckView(body([row()]), { ...STUCK_DEFAULTS, days: 'custom', start, end })
    assert.equal(view.range.error, 'invalid-dates')
  }
})

test('failure-rate denominator keeps reused-address site setups separate', () => {
  const activity = [
    {
      siteKey: 'same',
      lifetimeKey: 'same:first',
      at: '2026-10-20T00:00Z',
      kind: 'failed',
      platform: 'joomla',
      operation: 'build',
      step: 'build',
      reason: 'SITE_BUILD_FAILED'
    },
    {
      siteKey: 'same',
      lifetimeKey: 'same:second',
      at: '2026-10-21T00:00Z',
      kind: 'ready',
      platform: 'joomla',
      operation: 'build',
      step: 'build',
      reason: null
    },
    {
      siteKey: 'other',
      lifetimeKey: 'other:first',
      at: '2026-10-21T00:00Z',
      kind: 'ready',
      platform: 'joomla',
      operation: 'build',
      step: 'build',
      reason: null
    }
  ]
  const view = buildStuckView(body([], { activity, episodes: [] }), { ...STUCK_DEFAULTS, days: '30' })
  assert.equal(view.history.active, 3)
  assert.equal(view.history.failed, 1)
  assert.ok(Math.abs(view.history.rate - 33.3333333333) < 1e-9)
})

test('rolling 24h keeps both exact edges and splits history into 24 hourly buckets', () => {
  const end = Date.parse(now)
  const start = end - 86400000
  const activity = [start - 1, start, end - 1, end].map((at, index) => ({
    ...row({ siteKey: `edge-${index}` }),
    at: new Date(at).toISOString(),
    kind: 'failed'
  }))
  const view = buildStuckView(body([], { episodes: [], activity }), { ...STUCK_DEFAULTS, days: '24h' })
  assert.equal(view.range.end - view.range.start, 86400000)
  assert.equal(view.history.failed, 2)
  assert.equal(view.history.daily.length, 24)
  assert.equal(view.history.daily[0].day, new Date(start).toISOString())
  assert.equal(view.history.daily[0].failed, 1)
  assert.equal(view.history.daily[23].failed, 1)
  assert.equal(view.range.partial, false)
  assert.equal(readStuckFilters(new URLSearchParams('days=24h')).days, '24h')
})

test('all-time empty recorded history has no invented buckets or previous period', () => {
  const view = buildStuckView(body([], { episodes: [], activity: [] }), { ...STUCK_DEFAULTS, days: 'all' })
  assert.deepEqual(view.history.daily, [])
  assert.deepEqual(view.history.previousDaily, [])
  assert.equal(view.history.previous, null)
  assert.equal(view.history.active, 0)
})
