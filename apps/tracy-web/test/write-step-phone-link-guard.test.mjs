// The semantic phone door is permitted only for a verified cowork slot and the brief's exact phone.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lookGuard } from '../src/write-step/look-guard.js'

const PHONE = '(084) 555-0110'
const state = () => ({
  ok: true,
  contract: 'invented/j6/1.0.0',
  contractHash: 'a'.repeat(64),
  revision: 'r1',
  phoneLinks: {
    version: 1,
    storage: 'html',
    scalar: false,
    match: 'whole-slot',
    supportedKeys: ['module-1.0']
  },
  slots: [{ key: 'module-1.0', current: PHONE }]
})
const order = () => ({
  operation: 'phone.link',
  contract: 'invented/j6/1.0.0',
  contract_hash: 'a'.repeat(64),
  expected_revision: 'r1',
  key: 'module-1.0',
  expected: PHONE,
  tel: '0845550110',
  apply_id: 'contract-test-1',
  request_id: 'request-1'
})

async function setup(
  reading = state(),
  brief = { facts: [{ field: 'phone', value: PHONE }] },
  reply = (answer) => answer
) {
  const guard = lookGuard({ kit: {} })
  guard.know({ brief })
  const sent = []
  const door = guard.door({
    async apply(call) {
      sent.push(call)
      return call.params.operation === 'inspect'
        ? reading
        : reply({
            ok: true,
            key: call.params.key,
            already: false,
            afterRevision: 'r2',
            tel: call.params.tel,
            readBack: { text: call.params.expected, href: 'tel:' + call.params.tel }
          })
    }
  })
  const call = (params) => door.apply({ action: 'content.contract', params })
  await call({ operation: 'inspect' })
  return { call, sent, guard }
}

test('phone guard permits only the exact semantic shape and advances using the verified native revision', async () => {
  const { call, sent, guard } = await setup()
  assert.equal((await call(order())).ok, true)
  assert.equal(
    (
      await call({
        ...order(),
        expected_revision: 'r2',
        apply_id: 'contract-test-2',
        request_id: 'request-2'
      })
    ).ok,
    true
  )
  assert.equal(sent.length, 3)
  assert.deepEqual(guard.findings(), [])
})

test('phone guard refuses unadvertised slots, changed identity/text, inferred targets and generic write parameters', async () => {
  for (const change of [
    { key: 'article-28.0' },
    { contract: 'other' },
    { contract_hash: 'b'.repeat(64) },
    { expected_revision: 'stale' },
    { expected: 'Call ' + PHONE },
    { expected: '<b>' + PHONE + '</b>' },
    { expected: '0845550111' },
    { tel: '+668455550110' },
    { changes: { arbitrary: 'HTML' } },
    { fields: { content: '<a href="tel:0845550110">Call</a>' } },
    { apply_id: 'arbitrary' },
    { request_id: '' }
  ]) {
    const { call, sent, guard } = await setup()
    const answer = await call({ ...order(), ...change })
    assert.equal(answer.ok, false, JSON.stringify(change))
    assert.equal(answer.error, 'look_guard')
    assert.equal(sent.length, 1, 'invalid semantic writes never reach the Claude Cowork plugin')
    assert.ok(guard.refused().length)
  }
})

test('phone guard requires successful inspect, advertised HTML capability and a published brief fact', async () => {
  for (const change of [
    { ok: false },
    { ok: undefined },
    { error: 'inspect_failed' },
    { phoneLinks: undefined },
    { phoneLinks: { ...state().phoneLinks, scalar: true } },
    { phoneLinks: { ...state().phoneLinks, storage: 'scalar' } },
    { slots: [...state().slots, ...state().slots] }
  ]) {
    const { call, sent } = await setup({ ...state(), ...change })
    assert.equal((await call(order())).ok, false, JSON.stringify(change))
    assert.equal(sent.length, 1)
  }
  for (const brief of [{ facts: [] }, { facts: [{ field: 'phone', value: PHONE, onSite: false }] }]) {
    const { call, sent } = await setup(state(), brief)
    assert.equal((await call(order())).ok, false)
    assert.equal(sent.length, 1)
  }
})

test('another write invalidates a prior phone capability read until fresh inspect', async () => {
  const { call, sent } = await setup()
  await call({ operation: 'apply', changes: { 'module-1.0': PHONE } })
  assert.equal((await call(order())).ok, false)
  assert.equal(sent.length, 2)
  await call({ operation: 'inspect' })
  assert.equal((await call(order())).ok, true)
})

test('a reply for another slot cannot advance the semantic phone capability revision', async () => {
  const { call, sent } = await setup(state(), { facts: [{ field: 'phone', value: PHONE }] }, (answer) => ({
    ...answer,
    key: 'other-slot'
  }))
  await call(order())
  const second = await call({
    ...order(),
    expected_revision: 'r2',
    apply_id: 'contract-test-2',
    request_id: 'request-2'
  })
  assert.equal(second.ok, false)
  assert.equal(second.error, 'look_guard')
  assert.equal(sent.length, 2, 'a new inspect is required after the unverified first result')
})
