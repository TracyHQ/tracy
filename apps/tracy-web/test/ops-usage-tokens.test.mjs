import assert from 'node:assert/strict'
import { test } from 'node:test'
import { usageQuery } from '../src/lib/ops-usage-query.js'
import { summarizeTokenUsage } from '../src/lib/ops-usage-tokens.js'
import { summarizeUsage } from '../src/ops/usage.js'

const now = Date.parse('2026-10-23T10:00:00Z')
const turn = (id, patch = {}) => ({
  turn_id: `turn-${id}`,
  site_key: 'site-a',
  site_instance: '2026-10-01T00:00:00Z',
  actor: 'customer@example.test',
  session_id: 's',
  turn: id,
  site_demo: false,
  platform: 'joomla',
  opened_at: '2026-10-22T12:00:00Z',
  files: 1,
  token_usage: { version: 1, totalTokens: id * 10, missing: 0 },
  ...patch
})
const raw = (turns) => ({ turns, writes: [], operations: [], events: [], briefs: [] })
const report = (turns, params = '') =>
  summarizeUsage(raw(turns), usageQuery(new URLSearchParams(params), now), ['staff@tracy.test'], now)

test('token totals distinguish unknown requests, no requests, genuine zero and partial measurement', () => {
  assert.deepEqual(summarizeTokenUsage([]), {
    total: null,
    measuredRequests: 0,
    requests: 0,
    partialRequests: 0,
    perRequest: { n: 0, median: null, p90: null }
  })
  const result = summarizeTokenUsage([
    turn(1, { token_usage: null }),
    turn(2, { token_usage: { totalTokens: 0 } }),
    turn(3, { token_usage: { totalTokens: 50, missing: 2 } })
  ])
  assert.equal(result.total, 50)
  assert.equal(result.requests, 3)
  assert.equal(result.measuredRequests, 2)
  assert.equal(result.partialRequests, 1)
  assert.equal(result.perRequest.median, null)
})

test('tokens per request uses the shared nearest-rank median minimum of 20 measured requests', () => {
  const turns = Array.from({ length: 20 }, (_, id) => turn(id + 1))
  assert.equal(summarizeTokenUsage(turns.slice(0, 19)).perRequest.median, null)
  assert.equal(summarizeTokenUsage(turns).perRequest.median, 100)
  assert.equal(summarizeTokenUsage(turns).perRequest.p90, null)
})

test('token KPI, daily/hourly chart, CMS and customer leaderboard share the selected cohort', () => {
  const turns = [
    turn(1),
    turn(2, { token_usage: null }),
    turn(3, { platform: 'wordpress' }),
    turn(4, { actor: 'staff@tracy.test' }),
    turn(5, { site_demo: true }),
    turn(6, { opened_at: '2026-10-01T12:00:00Z' })
  ]
  const result = report(turns, 'cms=joomla')
  assert.equal(result.turns.all.tokens.total, 10)
  assert.equal(result.turns.all.tokens.measuredRequests, 1)
  assert.equal(result.turns.all.tokens.requests, 2)
  assert.equal(result.turns.joomla.tokens.total, 10)
  assert.equal(result.turns.wordpress.tokens.total, null)
  assert.equal(
    result.daily.reduce((sum, day) => sum + (day.tokens ?? 0), 0),
    10
  )
  assert.equal(result.tokenCustomers[0].tokens, 10)
  assert.equal(result.tokenCustomers[0].requests, 2)
  assert.equal(result.tokenCustomers[0].sitesChanged, 1)
  assert.equal(result.tokenCustomers[0].tokensPerRequest.median, null)
  assert.equal(report(turns, 'audience=staff').tokenCustomers.length, 0)
  assert.equal(report(turns, 'demo=only').tokenCustomers.length, 0)
  const all = report(turns, 'audience=all&demo=include')
  assert.equal(all.turns.all.tokens.total, 130)
  assert.equal(all.tokenCustomers[0].tokens, 40)
  const hourly = report(turns, 'days=24h')
  assert.equal(hourly.daily.length, 24)
  assert.equal(hourly.daily.filter((row) => row.tokenCoverage.measuredRequests > 0).length, 1)
  assert.equal(
    hourly.daily.filter((row) => row.tokenCoverage.requests === 0).every((row) => row.tokens === null),
    true
  )
})

test('token previous period and custom periods use equal real table bounds', () => {
  const parsed = usageQuery(new URLSearchParams('start=2026-10-21&end=2026-10-22'), now)
  const turns = [turn(1), turn(2, { opened_at: '2026-10-20T12:00:00Z' })]
  const current = summarizeUsage(raw(turns), parsed, [], now)
  const previous = summarizeUsage(
    raw(turns),
    {
      ...parsed,
      start: parsed.previousStart,
      end: parsed.start,
      observedEnd: parsed.previousEnd
    },
    [],
    now
  )
  assert.equal(current.turns.all.tokens.total, 10)
  assert.equal(previous.turns.all.tokens.total, 20)
})
