import assert from 'node:assert/strict'
import { test } from 'node:test'
import { statisticQuery } from '../src/lib/app-statistic.js'
import { signalQuery } from '../src/lib/ops-signal-query.js'
import { aggregateSignals } from '../src/lib/ops-signal-summary.js'
import { stuckQuery } from '../src/lib/ops-stuck.js'
import { usageQuery } from '../src/lib/ops-usage-query.js'
import { summarizeUsage } from '../src/ops/usage.js'

const NOW = Date.parse('2026-10-22T03:37:12.000Z')
const query = (days) => signalQuery(new URLSearchParams({ days }), NOW)
const event = (at) => ({ kind: 'account.first_sign_in', data: {}, occurred_at: new Date(at) })

test('24h is exactly rolling 24 hours with 24 hourly buckets and half-open edges', () => {
  const q = query('24h')
  assert.equal(q.start.getTime(), NOW - 86_400_000)
  assert.equal(q.end.getTime(), NOW)
  assert.equal(q.range.bucket, 'hour')
  const result = aggregateSignals(
    [event(NOW - 86_400_001), event(NOW - 86_400_000), event(NOW - 1), event(NOW)],
    q,
    NOW
  )
  assert.equal(result.totals.newUsers, 2)
  assert.equal(result.previous.newUsers, 1)
  assert.equal(result.byDay.length, 24)
  assert.equal(result.byDay.at(-1).day, new Date(NOW - 86_400_000).toISOString())
  assert.equal(result.byDay.at(-1).newUsers, 1)
  assert.equal(result.byDay[0].newUsers, 1)
})

test('all time starts at first event, keeps Vietnam day buckets and has no comparison', () => {
  const first = '2020-01-01T17:00:00.000Z'
  const result = aggregateSignals([event(first), event(NOW - 1), event(NOW)], query('all'), NOW)
  assert.equal(result.totals.newUsers, 2)
  assert.equal(result.range.start, '2020-01-02')
  assert.equal(result.range.startAt, first)
  assert.equal(result.compare, false)
  assert.equal(result.previous, null)
  assert.equal(result.deltas, null)
  assert.deepEqual(result.previousByDay, [])
})

test('all time empty data returns zero totals and no invented history buckets', () => {
  const result = aggregateSignals([], query('all'), NOW)
  assert.equal(result.totals.newUsers, 0)
  assert.deepEqual(result.byDay, [])
  assert.equal(result.range.startAt, null)
  assert.equal(result.previous, null)
})

test('usage uses exact hourly edges and all time empty has no buckets', () => {
  const q = usageQuery(new URLSearchParams('days=24h'), NOW)
  assert.equal(q.observedEnd.getTime(), NOW)
  assert.equal(q.previousEnd.getTime(), NOW - 86_400_000)
  const raw = { turns: [], writes: [], operations: [], events: [], briefs: [] }
  assert.equal(summarizeUsage(raw, q, [], NOW).daily.length, 24)
  const all = usageQuery(new URLSearchParams('days=all'), NOW)
  assert.equal(all.compare, false)
  assert.deepEqual(summarizeUsage(raw, all, [], NOW).daily, [])
})

test('desktop validates both presets and retains custom range precedence', () => {
  assert.equal(statisticQuery({ days: '24h' }, NOW).days, '24h')
  assert.equal(statisticQuery({ days: 'all' }, NOW).days, 'all')
  assert.equal(
    statisticQuery({ days: '24h', start: '2026-10-01', end: '2026-10-02' }, NOW).start,
    '2026-10-01'
  )
  assert.throws(() => statisticQuery({ days: '25h' }, NOW))
})

test('usage request edges enter one rolling hour only, and all time includes old requests', () => {
  const raw = {
    writes: [],
    operations: [],
    events: [],
    briefs: [],
    turns: [NOW - 86_400_001, NOW - 86_400_000, NOW - 1, NOW].map((at, index) => ({
      turn_id: String(index),
      actor: 'customer@example.test',
      site_key: 'a',
      site_demo: false,
      platform: 'joomla',
      opened_at: new Date(at),
      state: 'closed',
      files: 0
    }))
  }
  const hourly = summarizeUsage(raw, usageQuery(new URLSearchParams('days=24h'), NOW), [], NOW)
  assert.equal(hourly.turns.all.turns, 2)
  assert.equal(hourly.daily[0].requests, 1)
  assert.equal(hourly.daily.at(-1).requests, 1)
  const q = usageQuery(new URLSearchParams('days=all'), NOW)
  const all = summarizeUsage(raw, q, [], NOW)
  assert.equal(all.turns.all.turns, 3)
  assert.equal(q.range.startAt, new Date(NOW - 86_400_001).toISOString())
})

test('stuck accepts its existing one-day and month presets plus exact 24h/all, validates unknown periods', () => {
  const read = (search = '') => stuckQuery(new URLSearchParams(search), NOW)
  assert.equal(read().days, 30)
  assert.equal(read('days=1').days, 1)
  assert.equal(read('days=1').start.toISOString(), '2026-10-21T17:00:00.000Z')
  assert.equal(read('days=24h').end.getTime() - read('days=24h').start.getTime(), 86_400_000)
  assert.equal(read('days=all').compare, false)
  assert.throws(() => read('days=14'), { message: 'INVALID_SIGNAL_FILTER' })
  assert.throws(() => read('days=25h'), { message: 'INVALID_SIGNAL_FILTER' })
  assert.equal(read('start=2026-10-01&end=2026-10-02').days, 2)
})
