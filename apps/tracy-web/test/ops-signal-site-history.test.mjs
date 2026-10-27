import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, beforeEach, test } from 'node:test'
import { createOpsSignal } from '../src/lib/ops-signal.js'
import { readSignalCustomers } from '../src/lib/ops-signal-customers.js'
import { signalQuery } from '../src/lib/ops-signal-query.js'
import { aggregateSignals } from '../src/lib/ops-signal-summary.js'
import { openTurn } from '../src/sites/turns.js'
import { fileDb, scratchPool } from './_db.mjs'

const NOW = Date.parse('2026-10-22T03:00:00Z')
const query = (search = '') => signalQuery(new URLSearchParams(search), NOW)
const at = (day) => new Date(`2026-10-${day}T01:00:00Z`)
const signup = (email) => ({
  kind: 'account.first_sign_in',
  account_id: email,
  email,
  occurred_at: at('21'),
  data: { email }
})
const event = (kind, day, email, data = {}) => ({
  kind,
  site_key: 'reused.test',
  account_id: email,
  data: { ...data, email },
  occurred_at: at(day),
  demo: false
})

test('S-B3 customers keep separate owners, platforms and states after a site key is reused', async () => {
  const responses = [
    [signup('old@test'), signup('new@test')],
    [
      event('site.create', '18', 'old@test', { platform: 'joomla' }),
      event('site.delete', '19', 'old@test'),
      event('site.import', '20', 'new@test', { platform: 'wordpress' })
    ],
    [],
    [],
    [],
    []
  ]
  const result = await readSignalCustomers({ query: async () => ({ rows: responses.shift() }) }, query())
  assert.equal(result.rows.find((p) => p.email === 'old@test').sites[0].state, 'deleted')
  const sites = result.rows.find((p) => p.email === 'new@test').sites
  assert.equal(sites.length, 1)
  assert.equal(sites[0].platform, 'wordpress')
  assert.equal(sites[0].state, 'pending')
})

test('S-B3 filtered growth attributes each reused site incarnation to its own first-sign-in owner', () => {
  const result = aggregateSignals(
    [
      signup('old@test'),
      signup('new@test'),
      event('site.create', '18', 'old@test', { platform: 'joomla' }),
      event('site.delete', '19', 'old@test'),
      event('site.import', '20', 'new@test', { platform: 'wordpress' })
    ],
    query('days=7&cms=wordpress&status=pending'),
    NOW
  )
  assert.equal(result.totals.newUsers, 1)
  assert.equal(result.totals.imported, 1)
  assert.equal(result.totals.created, 0)
})

test('S-B3 failure counts distinguish immutable incarnations even when event delivery timestamps coincide', () => {
  const rows = ['18', '20'].flatMap((day) => [
    { ...event('site.create', '21', 'new@test', { platform: 'wordpress' }), site_instance: at(day) },
    { ...event('site.stuck', '21', null), site_instance: at(day) }
  ])
  const result = aggregateSignals(rows, query('cms=wordpress'), NOW)
  assert.equal(result.totals.stuck, 2)
  assert.equal(result.totals.failureEvents, 2)
})

test('S-B3 orphan failure snapshots still distinguish incarnations without a recoverable start', () => {
  const result = aggregateSignals(
    ['18', '20'].map((day) => ({
      ...event('site.stuck', '21', null),
      site_instance: at(day)
    })),
    query(),
    NOW
  )
  assert.equal(result.totals.stuck, 2)
})

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const pgOnly = { skip: !process.env.TEST_DATABASE_URL }
const quiet = { warn() {} }

async function customer(pool) {
  const { rows } = await pool.query(
    "insert into account(email) values ('history@customer.test') returning id"
  )
  await pool.query(
    "insert into ops_signal(kind,account_id,data,occurred_at) values ('account.first_sign_in',$1,$2,$3)",
    [rows[0].id, { email: 'history@customer.test' }, at('21')]
  )
  return rows[0].id
}
async function site(pool, demo, day = '18') {
  await pool.query(
    "insert into site(site_key,label,host,platform,demo,created_at) values ('reused.test','reused','local','wordpress',$1,$2)",
    [demo, at(day)]
  )
}
const recorder = (pool) =>
  createOpsSignal({ pool, config: { environment: 'dev' }, now: () => NOW, log: quiet })

test(
  'S-B3 event and turn recording snapshot immutable incarnation identity before key reuse',
  pgOnly,
  async () => {
    const { pool } = db
    await site(pool, true)
    await recorder(pool).record('site.create', { siteKey: 'reused.test', data: { platform: 'wordpress' } })
    await openTurn(pool, {
      turnId: 'history:1',
      siteKey: 'reused.test',
      actor: 'history@customer.test',
      title: 'Hello',
      source: 'panel'
    })
    await pool.query("delete from site where site_key='reused.test'")
    await site(pool, false, '20')
    await recorder(pool).record('site.import', { siteKey: 'reused.test', data: { platform: 'wordpress' } })
    const { rows } = await pool.query('select site_instance,site_demo from ops_signal order by id')
    assert.equal(rows[0].site_instance.toISOString(), at('18').toISOString())
    assert.equal(rows[0].site_demo, true)
    assert.equal(rows[1].site_instance.toISOString(), at('20').toISOString())
    assert.equal(rows[1].site_demo, false)
    const turn = (await pool.query('select site_instance,site_demo from site_turn')).rows[0]
    assert.equal(turn.site_instance.toISOString(), at('18').toISOString())
    assert.equal(turn.site_demo, true)
  }
)

test(
  'S-B4 deleted demo history stays excluded while non-demo replacement activity remains counted',
  pgOnly,
  async () => {
    const { pool } = db
    const accountId = await customer(pool)
    await site(pool, true)
    const record = (kind, data = {}) =>
      recorder(pool).record(kind, { accountId, siteKey: 'reused.test', data })
    await record('site.create', { platform: 'wordpress' })
    await record('site.edit', { action: 'content.update', ok: true })
    await openTurn(pool, {
      turnId: 'history:1',
      siteKey: 'reused.test',
      actor: 'history@customer.test',
      title: 'Demo',
      source: 'panel'
    })
    await pool.query("delete from site where site_key='reused.test'")
    const deleted = await recorder(pool).record('site.delete', {
      accountId,
      siteKey: 'reused.test',
      siteInstance: at('18'),
      siteDemo: true
    })
    assert.equal(
      deleted.site_demo,
      true,
      'deletion preserves the classification after the registry row is gone'
    )
    await site(pool, false, '20')
    await record('site.import', { platform: 'joomla' })
    await record('site.edit', { action: 'content.update', ok: true })
    await openTurn(pool, {
      turnId: 'history:2',
      siteKey: 'reused.test',
      actor: 'history@customer.test',
      title: 'Customer',
      source: 'panel'
    })
    await pool.query("delete from site where site_key='reused.test'")
    const result = await readSignalCustomers(pool, query(), NOW)
    assert.equal(result.rows[0].sites.length, 1)
    assert.equal(result.rows[0].sites[0].kind, 'imported')
    assert.equal(result.rows[0].edits.done, 1)
    assert.equal(result.rows[0].requests, 1)
  }
)

test(
  'S-B4 missing historical demo classification is unknown rather than verified customer usage',
  pgOnly,
  async () => {
    const { pool } = db
    const accountId = await customer(pool)
    await recorder(pool).record('site.create', {
      accountId,
      siteKey: 'missing.test',
      data: { platform: 'wordpress' }
    })
    await recorder(pool).record('site.edit', { accountId, siteKey: 'missing.test', data: { ok: true } })
    await openTurn(pool, {
      turnId: 'missing:1',
      siteKey: 'missing.test',
      actor: 'history@customer.test',
      title: 'Unknown history',
      source: 'panel'
    })
    const result = await readSignalCustomers(pool, query(), NOW)
    assert.equal(result.rows[0].sites.length, 0)
    assert.equal(result.rows[0].edits.done, 0)
    assert.equal(result.rows[0].requests, 0)
    assert.equal(
      (await readSignalCustomers(pool, query('status=no-site'), NOW)).total,
      0,
      'unknown history cannot establish that a customer has no site'
    )
  }
)

test(
  'S-B4 migration classifies only the surviving incarnation and preserves unknown older history',
  pgOnly,
  async (t) => {
    const { pool, close } = await scratchPool()
    t.after(close)
    await pool.query(`create table site(site_key text, created_at timestamptz, demo boolean);
    create table ops_signal(site_key text, occurred_at timestamptz);
    create table site_turn(site_key text, opened_at timestamptz);
    insert into site values ('reused.test','2026-10-20Z',false);
    insert into ops_signal values ('reused.test','2026-10-18Z'),('reused.test','2026-10-21Z'),('deleted.test','2026-10-21Z');
    insert into site_turn values ('reused.test','2026-10-18Z'),('reused.test','2026-10-21Z'),('deleted.test','2026-10-21Z');`)
    const migration = await readFile(
      new URL('../src/db/migrations/154-ops-site-history.sql', import.meta.url),
      'utf8'
    )
    await pool.query(migration)
    for (const [table, time] of [
      ['ops_signal', 'occurred_at'],
      ['site_turn', 'opened_at']
    ]) {
      const { rows } = await pool.query(
        `select site_instance,site_demo from ${table} order by ${time},site_key desc`
      )
      assert.equal(rows[0].site_instance, null)
      assert.equal(rows[0].site_demo, null)
      assert.equal(rows[1].site_instance.toISOString(), '2026-10-20T00:00:00.000Z')
      assert.equal(rows[1].site_demo, false)
      assert.equal(rows[2].site_instance, null)
      assert.equal(rows[2].site_demo, null)
    }
  }
)
