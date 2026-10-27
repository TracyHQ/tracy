import assert from 'node:assert/strict'
import { test } from 'node:test'
import { signalQuery } from '../src/lib/ops-signal-query.js'
import { aggregateSignals } from '../src/lib/ops-signal-summary.js'

const NOW = Date.parse('2026-10-22T03:00:00Z')
const query = (search = '') => signalQuery(new URLSearchParams(search), NOW)
const event = (kind, day, data = {}, site = null, id = 1) => ({
  id,
  kind,
  data,
  site_key: site,
  demo: false,
  occurred_at: new Date(`${day}T12:00:00+07:00`)
})

test('summary: every attribution filter narrows KPI, daily, source and latest consistently', () => {
  const rows = [
    event('account.first_sign_in', '2026-10-22', {
      email: 'a@test',
      source: { medium: 'email', source: 'ja', campaign: 'one', content: 'hero' }
    }),
    event('account.first_sign_in', '2026-10-22', {
      email: 'b@test',
      source: { medium: 'email', source: 'other', campaign: 'two', content: 'footer' }
    })
  ]
  for (const filter of ['source=ja', 'campaign=one', 'content=hero']) {
    const result = aggregateSignals(rows, query(filter), NOW)
    assert.equal(result.totals.newUsers, 1, filter)
    assert.equal(result.byDay[0].newUsers, 1, filter)
    assert.equal(result.totals.bySource.email, 1, filter)
    assert.equal(result.latestTotal, 1, filter)
  }
})

test('summary: historical owner attribution and same-site status scope site metrics and user cohorts', () => {
  const rows = [
    event('account.first_sign_in', '2026-10-01', {
      email: 'old@test',
      source: { medium: 'email', campaign: 'launch' }
    }),
    event('account.first_sign_in', '2026-10-22', {
      email: 'new@test',
      source: { medium: 'email', campaign: 'launch' }
    }),
    event('site.create', '2026-10-22', { email: 'old@test', platform: 'wordpress' }, 'old-wp'),
    event('site.stuck', '2026-10-22', {}, 'old-wp'),
    event('site.create', '2026-10-22', { email: 'new@test', platform: 'wordpress' }, 'new-wp'),
    event('site.result', '2026-10-22', { outcome: 'done' }, 'new-wp'),
    event('site.create', '2026-10-22', { email: 'new@test', platform: 'joomla' }, 'new-j'),
    event('site.stuck', '2026-10-22', {}, 'new-j')
  ]
  const scoped = aggregateSignals(rows, query('days=7&campaign=launch&cms=wordpress&status=stuck'), NOW)
  assert.equal(scoped.totals.newUsers, 0)
  assert.equal(scoped.latestTotal, 0)
  assert.equal(scoped.totals.newSites, 1)
  assert.equal(scoped.totals.stuck, 1)
  assert.equal(scoped.totals.failureEvents, 1)
  const noSite = aggregateSignals(rows, query('status=no-site'), NOW)
  assert.equal(noSite.totals.newUsers, 0)
  assert.equal(noSite.totals.newSites, 0)
  assert.equal(noSite.totals.stuck, 0)
  assert.equal(noSite.totals.waitlist, 0)
})

test('summary: options include preceding-period and selected zero-result attribution values', () => {
  const result = aggregateSignals(
    [event('account.first_sign_in', '2026-10-10', { source: { campaign: 'before' } })],
    query('days=7&campaign=missing'),
    NOW
  )
  assert.deepEqual(result.filterOptions.campaign, ['before', 'missing'])
})

test('summary: all six dimensions filter every linked current and preceding metric consistently', () => {
  const rows = []
  for (const day of ['2026-10-10', '2026-10-22']) {
    for (const selected of [true, false]) {
      const email = `${day}-${selected}@test`
      const site = `${day}-${selected}`
      rows.push(
        event('account.first_sign_in', day, {
          email,
          source: {
            medium: selected ? 'email' : 'blog',
            source: selected ? 'ja' : 'other',
            campaign: selected ? 'launch' : 'other',
            content: selected ? 'invite' : 'other'
          }
        }),
        event('site.create', day, { email, platform: selected ? 'wordpress' : 'joomla' }, site),
        event('site.stuck', day, {}, site),
        event('site.stuck', day, {}, site),
        event(selected ? 'site.stuck' : 'site.result', day, { outcome: 'done' }, site),
        event('beta.waitlist', day),
        event('discord.linked', day)
      )
    }
  }
  for (const filter of [
    'medium=email',
    'source=ja',
    'campaign=launch',
    'content=invite',
    'cms=wordpress',
    'status=stuck',
    'medium=email&source=ja&campaign=launch&content=invite&cms=wordpress&status=stuck'
  ]) {
    const result = aggregateSignals(rows, query(`days=7&${filter}`), NOW)
    for (const period of [result.totals, result.previous]) {
      assert.equal(period.newUsers, 1, filter)
      assert.equal(period.newSites, 1, filter)
      assert.equal(period.stuck, 1, filter)
      assert.equal(period.failureEvents, 3, filter)
      assert.equal(period.bySource.email, 1, filter)
      assert.equal(period.waitlist, 2, 'unrelated events retain period-only semantics')
      assert.equal(period.discordLinked, 2)
    }
    assert.equal(result.latestTotal, 1, filter)
    assert.equal(result.byDay[0].newUsers, 1, filter)
    assert.equal(result.byDay[0].failureEvents, 3, filter)
    assert.equal(result.previousByDay[5].failureEvents, 3, filter)
    assert.deepEqual(result.deltas.newUsers, { absolute: 0, percent: 0 }, filter)
  }
})

test('summary: direct attribution is measured from sign-ins, never guessed for an unlinked site', () => {
  const rows = [
    event('account.first_sign_in', '2026-10-22', { email: 'direct@test' }),
    event('site.import', '2026-10-22', { email: 'direct@test', platform: 'wordpress' }, 'known'),
    event('site.import', '2026-10-22', { email: 'unlinked@test', platform: 'wordpress' }, 'unlinked')
  ]
  assert.equal(aggregateSignals(rows, query(), NOW).totals.newSites, 2)
  const result = aggregateSignals(rows, query('medium=none&source=none&campaign=none&content=none'), NOW)
  assert.equal(result.totals.newUsers, 1)
  assert.equal(result.totals.newSites, 1)
})

test('summary: CMS cohort excludes demo sites and status uses latest lifetime state even on historic failures', () => {
  const rows = [
    event('account.first_sign_in', '2026-10-22', { email: 'a@test' }),
    { ...event('site.create', '2026-10-22', { email: 'a@test', platform: 'wordpress' }, 'demo'), demo: true },
    event('site.create', '2026-10-10', { email: 'a@test', platform: 'joomla' }, 'real'),
    event('site.stuck', '2026-10-10', {}, 'real'),
    event('site.result', '2026-10-22', { outcome: 'done' }, 'real')
  ]
  assert.equal(aggregateSignals(rows, query('cms=wordpress'), NOW).totals.newUsers, 0)
  assert.equal(aggregateSignals(rows, query('days=7&cms=joomla&status=built'), NOW).totals.newUsers, 1)
  assert.equal(aggregateSignals(rows, query('days=7&cms=joomla&status=built'), NOW).previous.stuck, 1)
  assert.equal(aggregateSignals(rows, query('days=7&cms=joomla&status=stuck'), NOW).previous.stuck, 0)
})

test('summary: missing site identity is not a measured pending state or a no-site customer', () => {
  const rows = [
    event('site.create', '2026-10-22', { platform: 'joomla' }),
    event('site.stuck', '2026-10-22', { platform: 'joomla' }, 'unlinked')
  ]
  assert.equal(aggregateSignals(rows, query(), NOW).totals.created, 1)
  assert.equal(aggregateSignals(rows, query(), NOW).totals.stuck, 1)
  for (const filter of ['status=pending', 'status=no-site', 'cms=joomla']) {
    const result = aggregateSignals(rows, query(filter), NOW)
    assert.equal(result.totals.newSites, 0, filter)
    assert.equal(result.totals.stuck, 0, filter)
  }
})
