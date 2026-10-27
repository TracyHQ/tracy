import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readStuckSites, stuckOperation, stuckReport } from '../src/lib/ops-stuck.js'

const NOW = Date.parse('2026-10-22T09:00:00Z')
const event = (site, kind, at, data = {}, instance = null) => ({
  site_key: site,
  kind,
  occurred_at: new Date(at),
  data,
  site_instance: instance ? new Date(instance) : null
})
const read = (rows) => readStuckSites({ query: async () => ({ rows }) }, NOW)

test('failure history preserves separate closed episodes, repeat counts and only recorded activity', async () => {
  const rows = [
    event('a', 'site.import', '2026-10-01T09:00Z', { platform: 'joomla' }),
    event('a', 'site.stuck', '2026-10-01T10:00Z', {
      step: 'installing',
      reason: 'unreachable',
      text: 'private words'
    }),
    event('a', 'site.stuck', '2026-10-01T11:00Z', { step: 'reading_content', reason: 'call_failed' }),
    event('a', 'site.result', '2026-10-01T12:00Z', { outcome: 'exported' }),
    event('a', 'site.result', '2026-10-01T13:00Z', { outcome: 'done' }),
    event('a', 'site.stuck', '2026-10-22T08:00Z', { step: 'installing' })
  ]
  const result = await read(rows)
  const report = stuckReport(result.sites, result.history, NOW)
  assert.equal(report.count, 1)
  assert.equal(report.open[0].operation, 'import')
  assert.equal(report.open[0].platform, 'joomla')
  assert.equal(report.open[0].times, 1, 'current case excludes the earlier recovered case')
  assert.equal(report.open[0].totalFailures, 3)
  assert.equal(report.open[0].episodeCount, 2)
  assert.deepEqual(
    result.history.activity.map((row) => row.kind),
    ['started', 'failed', 'failed', 'ready', 'failed']
  )
  assert.equal(result.history.episodes[0].closed.how, 'built')
  assert.equal(
    Date.parse(result.history.episodes[0].closed.at) - Date.parse(result.history.episodes[0].firstAt),
    3 * 3600000
  )
  assert.equal(result.history.episodes[1].closed, null)
  assert.equal(JSON.stringify(report).includes('private words'), false)
})

test('S02: old failures remain open, reopen today and close today without an age cutoff', async () => {
  const rows = [
    event('waiting', 'site.stuck', '2026-07-01T01:00Z'),
    event('reopened', 'site.stuck', '2026-07-01T01:00Z'),
    event('reopened', 'ops.handled', '2026-07-01T02:00Z', { by: 'staff@example.test' }),
    event('reopened', 'ops.reopened', '2026-10-22T08:00Z'),
    event('handled', 'site.stuck', '2026-07-01T01:00Z'),
    event('handled', 'ops.handled', '2026-10-21T17:00Z', { by: 'staff@example.test' })
  ]
  const result = await read(rows)
  const report = stuckReport(result.sites, result.history, NOW)
  assert.deepEqual(report.open.map((row) => row.siteKey).sort(), ['reopened', 'waiting'])
  assert.deepEqual(
    report.handledToday.map((row) => row.siteKey),
    ['handled']
  )
  assert.equal(report.handledToday[0].closed.how, 'handled', 'handling must not be called recovery')
  assert.equal(report.handledToday[0].closed.by, 'staff@example.test')
  assert.equal(result.history.episodes.find((row) => row.siteKey === 'reopened').closed, null)
})

test('a recreated site uses its new operation and case while retaining genuine older history', async () => {
  const first = '2026-10-01T00:00Z'
  const second = '2026-10-20T00:00Z'
  const rows = [
    event('reused', 'site.create', first, { platform: 'joomla' }, first),
    event('reused', 'site.stuck', '2026-10-01T01:00Z', { step: 'build' }, first),
    event('reused', 'site.delete', '2026-10-01T02:00Z', {}, first),
    event('reused', 'site.import', second, { platform: 'wordpress' }, second),
    event('reused', 'site.stuck', '2026-10-20T01:00Z', { step: 'reading_files' }, second)
  ]
  const { sites, history } = await read(rows)
  assert.equal(sites.length, 1)
  assert.equal(sites[0].platform, 'wordpress')
  assert.equal(sites[0].operation, 'import')
  assert.equal(sites[0].firstAt, '2026-10-20T01:00:00.000Z')
  assert.equal(sites[0].totalFailures, 1)
  assert.equal(history.episodes.length, 2)
  assert.equal(history.episodes[0].closed.how, 'deleted')
  assert.equal(history.episodes[1].closed, null)
  assert.equal(
    (await read(rows.slice(0, -1))).sites.length,
    0,
    'a new start never inherits an old blocked case'
  )
})

test('an empty support queue retains real empty history', () => {
  const history = { episodes: [], activity: [] }
  const report = stuckReport([], history, NOW)
  assert.deepEqual(report.history, history)
  assert.equal(report.count, 0)
})

test('a delayed failure from an older identified site instance cannot replace the current case', async () => {
  const fresh = '2026-10-20T00:00Z'
  const rows = [
    event('reused', 'site.import', fresh, { platform: 'wordpress' }, fresh),
    event('reused', 'site.stuck', '2026-10-20T01:00Z', { step: 'reading_content' }, fresh),
    event(
      'reused',
      'site.stuck',
      '2026-10-21T01:00Z',
      { step: 'build', platform: 'joomla' },
      '2026-10-01T00:00Z'
    )
  ]
  const { sites } = await read(rows)
  assert.equal(sites[0].operation, 'import')
  assert.equal(sites[0].platform, 'wordpress')
})

test('legacy import recovery keeps lifetime operation and platform when its start is missing', async () => {
  const { sites, history } = await read([
    event('legacy', 'site.stuck', '2026-10-20T01:00Z', { step: 'reading_content', platform: 'joomla' }),
    event('legacy', 'site.result', '2026-10-21T01:00Z', { step: 'build', outcome: 'done' })
  ])
  const ready = history.activity.find((row) => row.kind === 'ready')
  assert.equal(ready.operation, 'import')
  assert.equal(ready.platform, 'joomla')
  assert.equal(sites[0].operation, ready.operation)
  assert.equal(sites[0].platform, ready.platform)
  assert.equal(
    history.activity.filter(
      (row) => row.kind === 'ready' && row.operation === 'import' && row.platform === 'joomla'
    ).length,
    1
  )
})

test('a trustworthy start is authoritative over contradictory stage or operation hints', async () => {
  assert.equal(
    stuckOperation({ step: 'reading_content', operation: 'import' }, { kind: 'site.create' }),
    'build'
  )
  assert.equal(stuckOperation({ step: 'build', operation: 'build' }, { kind: 'site.import' }), 'import')
  const { sites, history } = await read([
    event('new', 'site.create', '2026-10-20T00:00Z', { platform: 'wordpress' }),
    event('new', 'site.stuck', '2026-10-20T01:00Z', { step: 'reading_content' }),
    event('new', 'site.result', '2026-10-21T01:00Z', { step: 'import', outcome: 'done' })
  ])
  assert.equal(sites[0].operation, 'build')
  assert.deepEqual(
    history.activity.map((row) => row.operation),
    ['build', 'build', 'build']
  )
})

test('a terminal build step alone does not prove whether a legacy site was created or imported', async () => {
  const { history } = await read([
    event('unknown', 'site.result', '2026-10-21T01:00Z', { step: 'build', outcome: 'done' })
  ])
  assert.equal(history.activity[0].operation, 'unknown')
  assert.equal(history.activity[0].platform, null)
})

test('history preserves distinct site setups under a reused address while the queue stays one row', async () => {
  const first = '2026-10-01T00:00Z'
  const second = '2026-10-20T00:00Z'
  const result = await read([
    event('a', 'site.create', first, { platform: 'joomla' }, first),
    event('a', 'site.stuck', '2026-10-01T01:00Z', { step: 'build' }, first),
    event('a', 'site.delete', '2026-10-01T02:00Z', {}, first),
    event('a', 'site.create', second, { platform: 'joomla' }, second),
    event('a', 'site.result', '2026-10-20T01:00Z', { outcome: 'done' }, second),
    event('b', 'site.create', second, { platform: 'joomla' }, second),
    event('b', 'site.result', '2026-10-20T01:00Z', { outcome: 'done' }, second)
  ])
  const active = new Set(result.history.activity.map((row) => row.lifetimeKey))
  const failed = new Set(
    result.history.activity.filter((row) => row.kind === 'failed').map((row) => row.lifetimeKey)
  )
  assert.equal(active.size, 3)
  assert.equal(failed.size, 1)
  assert.equal(failed.size / active.size, 1 / 3)
  assert.equal(result.history.episodes[0].lifetimeKey, result.history.activity[0].lifetimeKey)
  assert.equal(stuckReport(result.sites, result.history, NOW).count, 0)
})

test('independent audit: a failure without an actor keeps the customer recorded at setup', async () => {
  const instance = '2026-10-20T00:00Z'
  const { sites } = await read([
    event(
      'known-owner',
      'site.import',
      instance,
      { email: 'customer@example.test', platform: 'joomla' },
      instance
    ),
    event('known-owner', 'site.stuck', '2026-10-21T00:00Z', { step: 'reading_content' }, instance)
  ])
  assert.equal(sites[0].email, 'customer@example.test')
})
