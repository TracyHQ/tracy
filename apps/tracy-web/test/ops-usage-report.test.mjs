import assert from 'node:assert/strict'
import { test } from 'node:test'
import { usagePopulation } from '../src/lib/ops-usage-data.js'
import { usageQuery } from '../src/lib/ops-usage-query.js'
import { summarizeUsage } from '../src/ops/usage.js'

const now = Date.parse('2026-10-22T12:00:00Z')
const at = (day, hour = '00') => new Date(`2026-10-${day}T${hour}:00:00Z`)
const query = (params = '') => usageQuery(new URLSearchParams(params), now)
const staff = ['staff@tracy.test']
const event = (patch = {}) => ({
  id: 1,
  kind: 'site.create',
  site_key: 'a',
  site_instance: at(18),
  site_demo: false,
  occurred_at: at(18),
  data: { email: 'customer@example.test', platform: 'joomla', wizard_id: 'w' },
  ...patch
})
const turn = (patch = {}) => ({
  turn_id: 'a:1',
  site_key: 'a',
  site_instance: at(18),
  site_demo: false,
  session_id: 'a',
  turn: 1,
  actor: 'customer@example.test',
  opened_at: at(19),
  closed_at: at(19, '01'),
  state: 'closed',
  end_reason: 'completed',
  files: 0,
  platform: 'joomla',
  ...patch
})
const raw = (patch = {}) => ({
  turns: [],
  writes: [],
  operations: [],
  events: [event()],
  briefs: [],
  ...patch
})

test('U02: staff-only first request cannot activate a customer site', () => {
  const data = raw({ turns: [turn({ actor: staff[0] })] })
  const result = summarizeUsage(data, query(), staff, now)
  assert.equal(result.turns.all.turns, 0)
  assert.equal(result.funnel.byPlatform.all.firstRequestWithin24h.a, 0)
  assert.equal(summarizeUsage(data, query('audience=staff'), staff, now).funnel.byPlatform.all.created, 0)
})
test('U04: standalone restore and row undo remain counted without new chat requests', () => {
  const data = raw({
    operations: [
      {
        site_key: 'a',
        created_at: at(20),
        action: 'reset',
        actor_email: 'customer@example.test',
        status: 'succeeded'
      }
    ],
    writes: [
      {
        site_key: 'a',
        at: at(20),
        action: 'apply.revert',
        actor: 'customer@example.test',
        outcome: 'ok',
        session_id: null
      }
    ]
  })
  assert.deepEqual(summarizeUsage(data, query(), staff, now).siteUndos, { restores: 1, rowReverts: 1 })
  assert.deepEqual(summarizeUsage(data, query('cms=wordpress'), staff, now).siteUndos, {
    restores: 0,
    rowReverts: 0
  })
})
test('S-B4: immutable demo classification survives deletion and hostname reuse', () => {
  const data = raw({
    events: [
      event({ site_demo: true }),
      event({ id: 2, site_instance: at(20), site_demo: false, occurred_at: at(20) })
    ],
    turns: [turn({ site_demo: true }), turn({ turn_id: 'b:1', site_instance: at(20), opened_at: at(21) })]
  })
  const result = summarizeUsage(data, query(), staff, now)
  assert.equal(result.turns.all.turns, 1)
  assert.equal(result.funnel.byPlatform.all.created, 1)
  assert.equal(summarizeUsage(data, query('demo=only'), staff, now).turns.all.turns, 1)
  assert.equal(summarizeUsage(data, query('demo=include'), staff, now).turns.all.turns, 2)
})
test('S-B4: historical unknown classification is disclosed and excluded by default', () => {
  const data = raw({ events: [], turns: [turn({ site_demo: null })] })
  const result = summarizeUsage(data, query(), staff, now)
  assert.equal(result.turns.all.turns, 0)
  assert.equal(result.limitations.unknownRequestClassification, 1)
  assert.equal(summarizeUsage(data, query('demo=include'), staff, now).turns.all.turns, 1)
})
test('one date, audience and CMS cohort feeds totals, daily, customers and funnel', () => {
  const data = raw({
    turns: [
      turn(),
      turn({ turn_id: 'a:2', opened_at: at(21), actor: staff[0] }),
      turn({ turn_id: 'a:3', opened_at: at(21), platform: 'wordpress' })
    ]
  })
  const result = summarizeUsage(data, query('start=2026-10-18&end=2026-10-20&cms=joomla'), staff, now)
  assert.equal(result.turns.all.turns, 1)
  assert.equal(
    result.daily.reduce((n, row) => n + row.requests, 0),
    1
  )
  assert.equal(
    result.customers.reduce((n, row) => n + row.requests, 0),
    1
  )
  assert.equal(result.funnel.byPlatform.all.created, 1)
  assert.equal(result.customers[0].lastRequestAt, at(19).toISOString())
})
test('wizard opening scope stays dates and audience even with a CMS filter', () => {
  const data = raw({
    events: [
      event({
        kind: 'wizard.opened',
        site_key: null,
        site_demo: null,
        site_instance: null,
        occurred_at: at(17),
        data: { wizard_id: 'w', email: 'customer@example.test' }
      }),
      event()
    ]
  })
  const result = summarizeUsage(data, query('cms=wordpress'), staff, now)
  assert.equal(result.funnel.wizard.opened, 1)
  assert.equal(result.funnel.wizard.reachedCreate, 1)
  assert.equal(result.funnel.byPlatform.all.created, 0)
  assert.equal(result.limitations.wizardFilterScope, 'dates-and-audience')
})
test('date filters reject impossible or future dates and compare equal elapsed time', () => {
  assert.throws(() => query('start=2026-02-30&end=2026-03-01'))
  assert.throws(() => query('from=2026-10-23&to=2026-10-24'))
  assert.throws(() => query('cms=drupal'))
  assert.throws(() => query('audience=guests'))
  assert.throws(() => query('demo=unknown'))
  const parsed = query('days=7')
  assert.equal(parsed.observedEnd - parsed.start, parsed.previousEnd - parsed.previousStart)
  assert.equal(query('from=2026-10-18&to=2026-10-19').days, 2)
})
test('raw selection never returns future requests or writes to aggregate calculations', () => {
  const result = usagePopulation(
    raw({ turns: [turn({ opened_at: new Date(now + 1) })] }),
    query(),
    staff,
    now
  )
  assert.equal(result.turns.length, 0)
})
test('Site changes undo stays with its incarnation when hostname and commit hash are reused', () => {
  const data = raw({
    events: [event(), event({ id: 2, site_instance: at(20), occurred_at: at(20) })],
    turns: [
      turn({ head_sha: 'same', actor: 'old@example.test' }),
      turn({
        turn_id: 'b:1',
        actor: 'new@example.test',
        head_sha: 'same',
        site_instance: at(20),
        opened_at: at(21),
        closed_at: at(21, '01')
      })
    ],
    writes: [
      { turn_id: 'a:1', outcome: 'ok', action: 'content.update', at: at(19) },
      { turn_id: 'b:1', outcome: 'ok', action: 'content.update', at: at(21) }
    ],
    operations: [
      {
        site_key: 'a',
        action: 'undo',
        target_sha: 'same',
        created_at: at(19, '02'),
        actor_email: 'old@example.test',
        status: 'succeeded'
      }
    ]
  })
  const result = summarizeUsage(data, query(), staff, now)
  assert.equal(result.customers.find((row) => row.email === 'old@example.test').undone, 1)
  assert.equal(result.customers.find((row) => row.email === 'new@example.test').undone, 0)
})
test('a form opening cannot convert through a creation before it or by a different person', () => {
  const opening = event({
    kind: 'wizard.opened',
    site_key: null,
    site_instance: null,
    site_demo: null,
    occurred_at: at(20),
    data: { wizard_id: 'w', email: 'customer@example.test' }
  })
  const before = event()
  const someoneElse = event({
    occurred_at: at(21),
    data: { wizard_id: 'w', email: 'other@example.test', platform: 'joomla' }
  })
  assert.equal(
    summarizeUsage(raw({ events: [before, opening, someoneElse] }), query(), staff, now).funnel.wizard
      .reachedCreate,
    0
  )
})
