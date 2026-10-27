import test from 'node:test'
import assert from 'node:assert/strict'
import { createSeatPlanBroker } from '../src/seat-plan/broker.js'
import { createVault } from '../src/seat-plan/vault.js'

function setup() {
  const kek = Buffer.alloc(32, 7).toString('base64'),
    vault = createVault(kek)
  const rows = ['claude', 'codex', 'codex', 'qwen'].map((provider, i) => {
    const row = {
      id: `connection-${i}`,
      account_id: i === 3 ? 'other' : 'viewer',
      provider,
      version: 1,
      subject_label: `account-${i}`,
      created_at: new Date(),
      cooldown_until: null
    }
    row.secret = vault.seal(
      { account: row.account_id, id: row.id, provider },
      { accessToken: `fixture-${i}` }
    )
    return row
  })
  let pin = {
    owner_account_id: 'viewer',
    site_key: 'site.test',
    session_id: 'session-test',
    connection_id: rows[0].id,
    provider: 'claude',
    model: 'old',
    version: 1
  }
  const llm = { connect: true, providers: ['claude', 'codex', 'qwen'] }
  const query = async (sql, args = []) => {
    if (sql.includes('select s.site_key'))
      return { rows: args[1] === 'site.test' ? [{ site_key: 'site.test' }] : [] }
    if (sql.includes('select * from seat_plan_connection where account_id'))
      return { rows: rows.filter((r) => r.account_id === args[0]) }
    if (sql.includes('select * from seat_plan_connection where id'))
      return { rows: rows.filter((r) => r.id === args[0] && r.account_id === args[1]) }
    if (sql.includes('select * from seat_plan_pin')) return { rows: [pin] }
    if (sql.includes('set connection_id=null')) {
      assert.equal(args[1], pin.owner_account_id)
      pin = { ...pin, connection_id: null, provider: null, model: null }
      return { rows: [pin] }
    }
    if (sql.includes('update seat_plan_pin')) {
      assert.equal(args[4], pin.owner_account_id)
      pin = { ...pin, connection_id: args[0], provider: args[1], model: args[2], version: pin.version + 1 }
      return { rows: [pin] }
    }
    if (sql.includes('pg_advisory_')) return { rows: [] }
    throw new Error(`Unexpected fixture query: ${sql}`)
  }
  const wire = Object.fromEntries(
    llm.providers.map((id) => [
      id,
      {
        defaults: () => ({}),
        listModels: async (blob) => [{ id: `${id}-${blob.accessToken}`, name: id }]
      }
    ])
  )
  const pool = { query, connect: async () => ({ query, release() {} }) }
  return {
    rows,
    llm,
    broker: createSeatPlanBroker({ pool, kek, policy: async () => ({ llm }), providers: wire }),
    pin: () => pin
  }
}

test('catalog covers each connected provider and separates accounts of the same provider', async () => {
  const { broker } = setup()
  const catalog = await broker.catalog('viewer', 'site.test')
  assert.equal(catalog.groups.length, 3)
  assert.equal(new Set(catalog.groups.map((g) => g.id)).size, 3)
  assert.deepEqual(
    catalog.groups.map((g) => g.connectionId),
    ['connection-0', 'connection-1', 'connection-2']
  )
  assert.ok(catalog.groups.every((g) => !g.models.some((m) => m.id.startsWith('qwen'))))
})
test('disconnected and operator-disabled accounts disappear without a cached credential leak', async () => {
  const { broker, rows, llm } = setup()
  await broker.catalog('viewer', 'site.test')
  rows[0].secret = null
  llm.providers = ['claude', 'qwen']
  assert.deepEqual((await broker.catalog('viewer', 'site.test')).groups, [])
  await assert.rejects(broker.catalog('viewer', 'ungranted.test'), (e) => e.code === 'noAccess')
})
test('selection persists the exact account and model; another account cannot choose it', async () => {
  const { broker, pin } = setup()
  const group = (await broker.catalog('viewer', 'site.test')).groups[2]
  await broker.selectModel('viewer', 'site.test', {
    sessionId: 'session-test',
    provider: group.id,
    model: group.models[0].id
  })
  assert.equal(pin().connection_id, 'connection-2')
  assert.equal(pin().model, group.models[0].id)
  await assert.rejects(
    broker.selectModel('other', 'site.test', {
      sessionId: 'session-test',
      provider: group.id,
      model: group.models[0].id
    }),
    (e) => e.code === 'unavailable'
  )
})

test('ownership is checked before dsh changes a selection, and Tracy AI clears the account pin', async () => {
  const { broker, pin } = setup()
  await assert.rejects(broker.catalog('other', 'site.test', 'session-test'), (e) => e.code === 'notOwner')
  await broker.selectDefault('viewer', 'site.test', 'session-test')
  assert.equal(pin().connection_id, null)
  assert.equal(pin().provider, null)
})
