import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readSignalCustomers } from '../src/lib/ops-signal-customers.js'
import { signalQuery } from '../src/lib/ops-signal-query.js'

const NOW = Date.parse('2026-10-22T03:00:00Z')
const at = (day) => new Date(`2026-10-${day}T12:00:00+07:00`)
const person = (id, medium = 'email') => ({
  account_id: id,
  email: `${id}@customer.test`,
  occurred_at: at('21'),
  data: { source: { medium, source: 'joomlart', campaign: 'launch', content: 'invite' } }
})
const event = (kind, site, account, data = {}) => ({
  kind,
  site_key: site,
  account_id: account,
  data,
  site_demo: false,
  occurred_at: at('20')
})
const query = (search) => signalQuery(new URLSearchParams(search), NOW)

function database(cohort, sites, { edits = [], turns = [], active = [] } = {}) {
  const responses = [cohort, sites, edits, turns, active, []]
  const calls = []
  return {
    calls,
    pool: {
      query: async (sql, values) => {
        calls.push({ sql, values })
        assert.ok(responses.length > 0, 'no unplanned read query')
        return { rows: responses.shift() }
      }
    }
  }
}

test('customers: source filters precede lifetime reads; matching CMS/state share a site', async () => {
  const db = database(
    [person('a'), person('b'), person('c', 'blog')],
    [
      event('site.create', 'a-joomla', 'a', { platform: 'joomla' }),
      event('site.result', 'a-joomla', null, { outcome: 'done' }),
      event('site.import', 'a-wordpress', 'a', { platform: 'wordpress' }),
      event('site.stuck', 'a-wordpress', null),
      event('site.import', 'b-joomla', 'b', { platform: 'joomla' }),
      event('site.stuck', 'b-joomla', null)
    ],
    {
      edits: [{ account_id: 'b', kind: 'site.edit', action: 'content.update', ok: true, n: 4 }],
      turns: [
        {
          email: 'b@customer.test',
          requests: 9,
          last_at: at('22'),
          tokens: '1200',
          measured_turns: 2,
          partial_turns: 1
        }
      ],
      active: [{ account_id: 'b', days: ['2026-09-01', '2026-10-22'] }]
    }
  )
  const result = await readSignalCustomers(
    db.pool,
    query('days=7&medium=email&source=joomlart&campaign=launch&content=invite&cms=joomla&status=stuck'),
    NOW
  )
  assert.deepEqual(
    db.calls[0].values.map((date) => date.toISOString()),
    ['2026-10-15T17:00:00.000Z', '2026-10-22T17:00:00.000Z']
  )
  assert.deepEqual(db.calls[1].values[0], ['a', 'b'], 'blog customer is excluded before site reads')
  assert.deepEqual(db.calls[2].values[0], ['b'], 'a has Joomla and stuck on different sites')
  assert.deepEqual(db.calls[3].values[0], ['b@customer.test'])
  assert.equal(result.total, 1)
  assert.equal(result.rows[0].email, 'b@customer.test')
  assert.equal(result.rows[0].requests, 9)
  assert.equal(result.rows[0].edits.done, 4)
  assert.equal(result.rows[0].tokens, 1200)
  assert.deepEqual(result.rows[0].tokenCoverage, { measuredTurns: 2, partialTurns: 1 })
  assert.deepEqual(
    result.rows[0].activeDays,
    ['2026-09-01', '2026-10-22'],
    'activity is not narrowed to the cohort period'
  )
})

test('customers: site selection retains every lifetime site and missing tokens remain unmeasured', async () => {
  const db = database(
    [person('a')],
    [
      event('site.create', 'a-joomla', 'a', { platform: 'joomla' }),
      event('site.result', 'a-joomla', null, { outcome: 'done' }),
      event('site.import', 'a-wordpress', 'a', { platform: 'wordpress' }),
      event('site.stuck', 'a-wordpress', null)
    ]
  )
  const result = await readSignalCustomers(db.pool, query('cms=joomla&status=built'), NOW)
  assert.equal(result.rows[0].sites.length, 2)
  assert.equal(result.rows[0].sites[1].platform, 'wordpress')
  assert.equal(result.rows[0].tokens, null)
  assert.deepEqual(result.rows[0].tokenCoverage, { measuredTurns: 0, partialTurns: 0 })
})

test('customers: site filters run before the 200-row cap, and total counts every match', async () => {
  const cohort = Array.from({ length: 205 }, (_, index) => person(`customer-${index}`))
  const db = database(cohort, [event('site.create', 'only-match', 'customer-204', { platform: 'wordpress' })])
  const result = await readSignalCustomers(db.pool, query('cms=wordpress'), NOW)
  assert.equal(result.total, 1)
  assert.equal(result.rows[0].email, 'customer-204@customer.test')
  const all = await readSignalCustomers(database(cohort, []).pool, query('status=no-site'), NOW)
  assert.equal(all.total, 205)
  assert.equal(all.rows.length, 200)
  assert.equal(all.limit, 200)
})

test('S-B2: only explicit successful undos count completed; failed and unknown remain separate', async () => {
  const db = database([person('a')], [], {
    edits: [
      { account_id: 'a', kind: 'site.undo', ok: true, n: 2 },
      { account_id: 'a', kind: 'site.undo', ok: false, n: 3 },
      { account_id: 'a', kind: 'site.undo', ok: null, n: 7 }
    ]
  })
  const result = await readSignalCustomers(db.pool, query('days=7'), NOW)
  assert.equal(result.rows[0].edits.undone, 2)
  assert.equal(result.rows[0].edits.undoFailed, 3)
  assert.equal(result.rows[0].edits.undoUnknown, 7)
  const empty = await readSignalCustomers(database([person('b')], []).pool, query('days=7'), NOW)
  assert.equal(empty.rows[0].edits.undoFailed, 0)
  assert.equal(empty.rows[0].edits.undoUnknown, 0)
})

test('audit 2: missing edit outcomes do not claim completed changes', async () => {
  const db = database([person('a')], [], {
    edits: [
      { account_id: 'a', kind: 'site.edit', ok: true, n: 2 },
      { account_id: 'a', kind: 'site.edit', ok: false, n: 3 },
      { account_id: 'a', kind: 'site.edit', ok: null, n: 7 }
    ]
  })
  const result = await readSignalCustomers(db.pool, query('days=7'), NOW)
  assert.equal(result.rows[0].edits.done, 2)
  assert.equal(result.rows[0].edits.failed, 3)
  assert.equal(result.rows[0].edits.editUnknown, 7)
})
