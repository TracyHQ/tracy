import assert from 'node:assert/strict'
import { test } from 'node:test'
import { matchesCustomerSites, matchesSignalSource, signalQuery } from '../src/lib/ops-signal-query.js'
import { aggregateSignals, readSignalSummary } from '../src/lib/ops-signal-summary.js'

const NOW = Date.parse('2026-10-22T03:00:00Z')
const query = (search = '') => signalQuery(new URLSearchParams(search), NOW)
const event = (kind, day, data = {}, site = null, id = 1) => ({
  id,
  kind,
  data,
  site_key: site,
  occurred_at: new Date(`${day}T12:00:00+07:00`)
})

test('signalQuery: presets retain legacy defaults and Vietnam midnight boundaries', () => {
  const week = query('days=7')
  assert.equal(week.start.toISOString(), '2026-10-15T17:00:00.000Z')
  assert.equal(week.end.toISOString(), '2026-10-22T17:00:00.000Z')
  assert.equal(week.previousStart.toISOString(), '2026-10-08T17:00:00.000Z')
  assert.deepEqual(week.range, {
    start: '2026-10-16',
    end: '2026-10-22',
    previousStart: '2026-10-09',
    previousEnd: '2026-10-15',
    timeZone: 'Asia/Ho_Chi_Minh',
    partialEnd: true
  })
  for (const days of ['', 'abc', '3', '30.5', '365']) assert.equal(query(`days=${days}`).days, 14)
  assert.equal(query('days=30').days, 30)
})

test('signalQuery: custom dates are inclusive, with an equal preceding period and real calendar dates', () => {
  const custom = query('start=2026-10-01&end=2026-10-03&compare=0')
  assert.equal(custom.days, 3)
  assert.equal(custom.range.previousStart, '2026-09-28')
  assert.equal(custom.range.previousEnd, '2026-09-30')
  assert.equal(custom.range.partialEnd, false)
  assert.equal(custom.end.toISOString(), '2026-10-03T17:00:00.000Z')
  assert.equal(custom.compare, false)
  assert.equal(query('start=2024-02-29&end=2024-02-29').days, 1)
  for (const search of [
    'start=2026-02-29&end=2026-03-01',
    'start=2026-10-02',
    'start=2026-10-03&end=2026-10-02',
    'start=2026-10-22&end=2026-10-23',
    'start=2024-01-01&end=2026-10-22',
    'compare=maybe',
    'medium=unknown',
    'cms=drupal',
    'status=ready',
    'source=UPPER',
    'campaign=bad%20value',
    `content=${'x'.repeat(65)}`
  ])
    assert.throws(() => query(search), { message: 'INVALID_SIGNAL_FILTER' }, search)
  assert.deepEqual(query('cms=all&source=&medium=email&status=no-site').filters, {
    medium: 'email',
    status: 'no-site'
  })
})

test('source matching uses explicit none and other buckets and never reads a site source', () => {
  assert.equal(matchesSignalSource(null, { medium: 'none', source: 'none' }), true)
  assert.equal(matchesSignalSource({ medium: 'unknown' }, { medium: 'other' }), true)
  assert.equal(matchesSignalSource({ medium: 'email', campaign: 'one' }, { campaign: 'two' }), false)
})

test('customer site filters require CMS and state on one site and preserve no-site semantics', () => {
  const sites = [
    { platform: 'joomla', state: 'built' },
    { platform: 'wordpress', state: 'stuck' }
  ]
  assert.equal(matchesCustomerSites(sites, { cms: 'joomla', status: 'stuck' }), false)
  assert.equal(matchesCustomerSites(sites, { cms: 'wordpress', status: 'stuck' }), true)
  assert.equal(matchesCustomerSites([], { status: 'no-site' }), true)
  assert.equal(matchesCustomerSites([], { cms: 'joomla', status: 'no-site' }), false)
  assert.equal(matchesCustomerSites(sites, { status: 'no-site' }), false)
})

test('summary: unfiltered totals retain legacy counts and failure units differ', () => {
  const rows = [
    event('account.first_sign_in', '2026-10-22', { source: { medium: 'email', campaign: 'one' } }),
    event('account.first_sign_in', '2026-10-21', { source: { medium: 'email', campaign: 'two' } }),
    event('account.first_sign_in', '2026-10-21', { source: { medium: 'blog', campaign: 'one' } }),
    event('account.first_sign_in', '2026-10-15', { source: { medium: 'email' } }),
    event('site.create', '2026-10-22', { platform: 'joomla' }, 'a'),
    event('site.import', '2026-10-22', { platform: 'wordpress' }, 'b'),
    event('site.stuck', '2026-10-22', {}, 'a'),
    event('site.stuck', '2026-10-22', {}, 'a'),
    event('site.stuck', '2026-10-21', {}, 'a'),
    event('site.stuck', '2026-10-15', {}, 'old'),
    event('beta.waitlist', '2026-10-22'),
    event('discord.linked', '2026-10-22'),
    event('account.first_sign_in', '2026-10-23', {}),
    event('site.import', '2026-09-01')
  ]
  const result = aggregateSignals(rows, query('days=7'), NOW)
  assert.equal(result.totals.newUsers, 3)
  assert.equal(result.latestTotal, 3)
  assert.equal(result.totals.newSites, 2, 'site totals are period-only')
  assert.equal(result.totals.waitlist, 1)
  assert.equal(result.totals.discordLinked, 1)
  assert.equal(result.totals.stuck, 1)
  assert.equal(result.totals.failureEvents, 3)
  assert.equal(result.byDay[0].failureEvents, 2)
  assert.equal(result.byDay[0].stuck, 2, 'legacy daily field remains a failure event count')
  assert.equal(result.byDay[1].newUsers, 2)
  assert.equal(result.byDay[1].bySource.blog, 1)
  assert.equal(result.previousByDay[0].day, '2026-10-15')
  assert.equal(result.previousByDay[0].newUsers, 1)
  assert.equal(result.previousByDay[0].stuck, 1)
  assert.deepEqual(result.deltas.newUsers, { absolute: 2, percent: 200 })
  assert.deepEqual(result.deltas.newSites, { absolute: 2, percent: null })
  assert.deepEqual(result.filterOptions.campaign, ['none', 'one', 'two'])
  assert.equal(result.byDay.length, 7)
  assert.equal(result.previousByDay.length, 7)
  assert.equal(result.byDay[2].newUsers, 0, 'missing days are zero-filled')
})

test('summary: complete latest total, filtered before 50 cap, descending timestamps with ID tie-break', () => {
  const rows = Array.from({ length: 80 }, (_, id) =>
    event(
      'account.first_sign_in',
      '2026-10-22',
      {
        email: `${id}@test.example`,
        source: { campaign: id < 60 ? 'selected' : 'other' }
      },
      null,
      id
    )
  )
  const result = aggregateSignals(rows, query('campaign=selected&compare=false'), NOW)
  assert.equal(result.totals.newUsers, 60)
  assert.equal(result.latestTotal, 60)
  assert.equal(result.latest.length, 50)
  assert.equal(result.latestLimit, 50)
  assert.equal(result.latest[0].email, '59@test.example')
  assert.equal(result.latest.at(-1).email, '10@test.example')
  assert.equal(result.compare, false)
  assert.equal(result.previousByDay.length, 14, 'legacy comparison data stays available when hidden')
})

test('summary query binds both range ends and includes real previous daily data', async () => {
  const range = query('start=2026-10-21&end=2026-10-22')
  let values
  const result = await readSignalSummary(
    {
      query: async (_sql, params) => {
        values = params
        return { rows: [event('site.import', '2026-10-19')] }
      }
    },
    range,
    NOW
  )
  assert.equal(values[0].toISOString(), '2026-10-18T17:00:00.000Z')
  assert.equal(values[1].toISOString(), '2026-10-22T17:00:00.000Z')
  assert.equal(result.previous.imported, 1)
  assert.equal(result.previousByDay[1].imported, 1)
})
