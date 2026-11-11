import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readBackGroup } from '../src/site-check/read-back.js'
import { runPhoneLinksStage, withPhoneLinks } from '../src/write-step/phone-link-stage.js'

const capability = {
  version: 1,
  storage: 'html',
  scalar: false,
  match: 'whole-slot',
  supportedKeys: ['module-111.0', 'module-111.1']
}
const expected = '+44 20 7946 0123'
const make = (change = {}) => {
  const reading = {
    ok: true,
    contract: 'example/j6/1.0.0',
    contractHash: 'a'.repeat(64),
    revision: 'r1',
    phoneLinks: capability,
    slots: [
      { key: 'module-111.0', current: expected },
      { key: 'module-111.1', current: expected }
    ]
  }
  const calls = []
  const input = {
    siteKey: 'phone-stage.example.test',
    contract: reading.contract,
    admitted: reading,
    brief: { facts: [{ field: 'phone', value: expected }] },
    written: ['module-111.0', 'module-111.1'],
    ordered: { 'module-111.0': expected, 'module-111.1': expected },
    door: {
      apply: async (call) => {
        calls.push(call)
        const p = call.params
        if (p.operation === 'inspect') return reading
        return {
          ok: true,
          key: p.key,
          afterRevision: calls.length === 2 ? 'r2' : 'r3',
          already: false,
          tel: p.tel,
          readBack: { text: p.expected, href: 'tel:' + p.tel }
        }
      }
    },
    ...change
  }
  return { input, reading, calls }
}

test('phone links use exact on-site facts and advertised keys, fresh inspect and sequential verified revisions', async () => {
  const { input, reading, calls } = make()
  const result = await runPhoneLinksStage(input)
  assert.equal(result.supported, true)
  assert.equal(result.results.size, 2)
  assert.equal(calls[0].params.operation, 'inspect')
  const writes = calls.slice(1).map((c) => c.params)
  assert.deepEqual(
    writes.map((p) => p.expected_revision),
    ['r1', 'r2']
  )
  assert.deepEqual(
    writes.map((p) => p.key),
    ['module-111.0', 'module-111.1']
  )
  for (const p of writes) {
    assert.equal(p.operation, 'phone.link')
    assert.equal(p.contract, reading.contract)
    assert.equal(p.contract_hash, reading.contractHash)
    assert.equal(p.tel, '+442079460123')
    assert.equal(p.expected, expected)
    assert.match(p.apply_id, /^contract-/)
    assert.ok(p.request_id)
  }
  assert.notEqual(writes[0].request_id, writes[1].request_id)
})

test('old coworks and absent on-site facts cause no optional inspect or write', async () => {
  for (const change of [
    { admitted: {} },
    { brief: { facts: [{ field: 'phone', value: expected, onSite: false }] } },
    { brief: { facts: [] } },
    { written: [] }
  ]) {
    const { input, calls } = make(change)
    const result = await runPhoneLinksStage(input)
    assert.equal(result.results.size, 0)
    assert.equal(calls.length, 0)
  }
})

test('whole numeric values only: prose, markup, unrelated phones and inferred country prefixes never write', async () => {
  for (const value of [
    'Call ' + expected,
    '<b>' + expected + '</b>',
    '+44 20 7946 0999',
    '020 7946 0123',
    '12345'
  ]) {
    const { input, calls } = make({ ordered: { 'module-111.0': value }, written: ['module-111.0'] })
    assert.equal((await runPhoneLinksStage(input)).results.size, 0)
    assert.equal(calls.length, 0)
  }
})

test('national facts keep their exact national dial target without an invented country code', async () => {
  const { input, reading, calls } = make({
    brief: { facts: [{ field: 'phone', value: '084 555 0110' }] },
    ordered: { 'module-111.0': '084 555 0110' },
    written: ['module-111.0']
  })
  reading.slots[0].current = '084 555 0110'
  const result = await runPhoneLinksStage(input)
  assert.equal(calls[1].params.tel, '0845550110')
  assert.equal(result.results.get('module-111.0').status, 'written')
})

test('stale or ambiguous slot reads refuse that exact key; scalar and unknown keys are never inferred', async () => {
  const { input, reading, calls } = make({
    written: ['module-111.0', 'contact-1.2'],
    ordered: { 'module-111.0': expected, 'contact-1.2': expected }
  })
  reading.slots.push({ key: 'module-111.0', current: expected })
  const result = await runPhoneLinksStage(input)
  assert.equal(calls.length, 1)
  assert.equal(result.results.get('module-111.0').status, 'failed')
  assert.equal(result.skipped[0].key, 'contact-1.2')
  const next = make({ written: ['module-111.0'] })
  next.reading.slots[0].current = '+44 20 7946 0999'
  assert.equal((await runPhoneLinksStage(next.input)).results.get('module-111.0').status, 'failed')
  assert.equal(next.calls.length, 1)
})

test('unverified contract metadata or changed capability remains unsupported', async () => {
  for (const change of [
    { ok: undefined },
    { error: 'writer_busy' },
    { contract: 'other' },
    { contractHash: 'missing' },
    { revision: '' },
    { phoneLinks: { ...capability, version: 2 } },
    { phoneLinks: { ...capability, scalar: true } },
    { phoneLinks: { ...capability, match: 'substring' } }
  ]) {
    const fixture = make({ admitted: { phoneLinks: capability } })
    Object.assign(fixture.reading, change)
    const result = await runPhoneLinksStage(fixture.input)
    assert.equal(result.supported, false)
    assert.equal(fixture.calls.length, 1)
  }
})

test('refused, lost or incomplete operation answers stop later phone writes and retain blocking evidence', async () => {
  for (const answer of [
    null,
    { ok: false, error: 'writer_busy' },
    {
      afterRevision: 'r2',
      tel: '+442079460123',
      already: false,
      readBack: { text: expected, href: 'tel:+442079460123' }
    },
    {
      ok: true,
      error: 'writer_busy',
      afterRevision: 'r2',
      tel: '+442079460123',
      already: false,
      readBack: { text: expected, href: 'tel:+442079460123' }
    },
    {
      ok: true,
      tel: '+442079460123',
      afterRevision: 'r2',
      already: false,
      readBack: { text: expected, href: 'tel:+442079460999' }
    }
  ]) {
    const fixture = make()
    const original = fixture.input.door.apply
    let writes = 0
    fixture.input.door.apply = (call) => {
      if (call.params.operation === 'inspect') return original(call)
      writes++
      return Promise.resolve(answer)
    }
    const result = await runPhoneLinksStage(fixture.input)
    assert.equal(result.results.get('module-111.0').status, 'failed')
    assert.equal(result.results.get('module-111.1').status, 'failed')
    assert.equal(writes, 1, 'no later write after an unverified operation')
    const lines = withPhoneLinks(
      [{ slot: 'block-111.0', key: 'module-111.0', status: 'written', ordered: expected }],
      result
    )
    assert.equal(lines[0].status, 'failed')
    assert.equal(lines[0].ordered, expected)
    const judged = await readBackGroup.run({
      report: { status: 'done', slots: lines },
      read: async () => fixture.reading
    })
    assert.ok(judged.failures.length > 0)
  }
})

test('cancellation prevents writes after optional inspection', async () => {
  const { input, calls } = make({ isCancelled: async () => true })
  const result = await runPhoneLinksStage(input)
  assert.equal(result.cancelled, true)
  assert.equal(calls.length, 1)
})
