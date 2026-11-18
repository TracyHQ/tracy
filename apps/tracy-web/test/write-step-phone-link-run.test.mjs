// Exercise the real write-step hook with frozen files and a stateful cowork, without model calls or site writes.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readBackGroup } from '../src/site-check/read-back.js'
import { copy, fakeSite, runStep } from './_write-step-run.mjs'

const PHONE = '+44 20 7946 0123'
const TEL = '+442079460123'
const KEYS = ['module-2.1', 'module-5.1']
const capability = {
  version: 1,
  storage: 'html',
  scalar: false,
  match: 'whole-slot',
  supportedKeys: KEYS
}

async function runPhones({ answer, inspect, refuse, phone = PHONE, tel = TEL } = {}) {
  const c = copy()
  for (const slot of ['block-2.1', 'block-5.1'])
    Object.assign(
      c.slots.find((entry) => entry.slot === slot),
      { text: phone, factIds: ['f-phone'] }
    )
  const site = fakeSite({ refuse })
  const calls = []
  const anchors = new Map()
  let revision = 'initial'
  let phoneWrites = 0
  const reading = async () => {
    const base = await site.door.apply({ action: 'content.contract', params: { operation: 'inspect' } })
    return {
      ...base,
      revision,
      contractHash: 'a'.repeat(64),
      phoneLinks: capability,
      slots: base.slots.map((slot) => ({ ...slot, current: site.held[slot.key] ?? 'Demo text' }))
    }
  }
  const door = {
    async apply(call) {
      calls.push(structuredClone(call))
      if (call.action === 'content.contract' && call.params.operation === 'inspect') {
        const state = await reading()
        return inspect ? inspect(state, calls) : state
      }
      if (call.action === 'content.contract' && call.params.operation === 'phone.link') {
        const p = call.params
        assert.equal(
          p.expected_revision,
          revision,
          'the actual hook must advance the Claude Cowork plugin revision'
        )
        assert.equal(
          p.expected,
          site.held[p.key],
          'only text that really reached the Claude Cowork plugin may be linked'
        )
        assert.equal(p.contract_hash, 'a'.repeat(64))
        assert.equal(p.tel, tel)
        phoneWrites++
        const result = {
          ok: true,
          key: p.key,
          already: anchors.has(p.key),
          // Native content.batch also returns a revision; the hook must use afterRevision instead.
          revision: 'synthetic-batch-revision',
          afterRevision: anchors.has(p.key) ? revision : 'phone-' + phoneWrites,
          tel,
          readBack: { text: site.held[p.key], href: 'tel:' + tel }
        }
        if (answer) return answer(result, p)
        revision = result.afterRevision
        anchors.set(p.key, result.readBack)
        return result
      }
      const result = await site.door.apply(call)
      if (call.action === 'content.contract' && call.params.operation === 'apply' && result.ok)
        revision = 'after-text'
      return result
    }
  }
  const execute = (last) =>
    runStep(
      { copy: c, brief: { facts: [{ id: 'f-phone', field: 'phone', value: phone }] } },
      {},
      { door, last }
    )
  const run = await execute()
  return {
    ...run,
    calls,
    anchors,
    cowork: site,
    reading,
    rerun: async (last = run.report) => {
      calls.length = 0
      return execute(last)
    }
  }
}

test('runWriteStep links successful whole-phone writes through the real hook and serializes verified proofs', async () => {
  const { report, line, calls, anchors, reading } = await runPhones()
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  const operations = calls.filter((call) => call.action === 'content.contract')
  const phones = operations.filter((call) => call.params.operation === 'phone.link')
  assert.equal(phones.length, 2, JSON.stringify({ stage: report.phoneLinks, slots: report.slots }))
  assert.deepEqual(
    phones.map((call) => call.params.key),
    KEYS
  )
  assert.deepEqual(
    phones.map((call) => call.params.expected_revision),
    ['after-text', 'phone-1']
  )
  assert.equal(operations[operations.indexOf(phones[0]) - 1].params.operation, 'inspect')
  assert.ok(operations.indexOf(phones[0]) > operations.findIndex((call) => call.params.operation === 'apply'))
  assert.notEqual(phones[0].params.request_id, phones[1].params.request_id)
  for (const [i, key] of KEYS.entries()) {
    const proof = report.phoneLinks.results.find((entry) => entry.key === key)
    assert.equal(proof.status, 'written')
    assert.equal(proof.afterRevision, 'phone-' + (i + 1))
    assert.deepEqual(proof.readBack, anchors.get(key))
  }
  assert.equal(line('block-2.1').status, 'written')
  assert.equal(line('block-2.1').phoneLink.status, 'written')
  assert.equal(typeof report.timings.phoneLinks, 'number')
  assert.deepEqual(JSON.parse(JSON.stringify(report)).phoneLinks.results, report.phoneLinks.results)
  const qa = await readBackGroup.run({ report, read: reading })
  assert.equal(qa.lines['block-2.1'], 'match')
  assert.equal(qa.lines['block-5.1'], 'match')
})

test('runWriteStep never presents a phone whose text write was refused', async () => {
  const { line, calls } = await runPhones({ refuse: { 'module-5.1': { code: 'SLOT_TOO_LONG' } } })
  assert.deepEqual(
    calls.filter((call) => call.params.operation === 'phone.link').map((call) => call.params.key),
    ['module-2.1']
  )
  assert.notEqual(line('block-5.1').status, 'written')
})

for (const [name, answer] of [
  ['refusal', (result) => ({ ...result, ok: false, error: 'writer_busy' })],
  ['wrong anchor', (result) => ({ ...result, readBack: { text: PHONE, href: 'tel:+442079460999' } })],
  ['wrong key', (result) => ({ ...result, key: 'module-99.0' })],
  ['missing revision', (result) => ({ ...result, afterRevision: undefined })],
  ['missing success flag', ({ ok: _ok, ...result }) => result],
  ['error-bearing success', (result) => ({ ...result, error: 'PHONE_LINK_READBACK' })]
]) {
  test(`runWriteStep blocks QA after a phone-link ${name} while retaining successful text evidence`, async () => {
    const { report, line, calls, cowork, reading } = await runPhones({ answer })
    assert.equal(report.status, 'done', JSON.stringify(report.cause))
    assert.equal(calls.filter((call) => call.params.operation === 'phone.link').length, 1)
    for (const [i, key] of KEYS.entries()) {
      assert.equal(cowork.held[key], PHONE, 'the original text write succeeded')
      const entry = line(i === 0 ? 'block-2.1' : 'block-5.1')
      assert.equal(entry.ordered, PHONE)
      assert.equal(entry.status, 'failed')
      assert.equal(entry.phoneLink.status, 'failed')
      assert.match(entry.reason, /Phone link could not be verified/)
    }
    assert.ok(report.counts.failed >= 2)
    const qa = await readBackGroup.run({ report, read: reading })
    assert.equal(qa.lines['block-2.1'], 'failed')
    assert.equal(qa.lines['block-5.1'], 'failed')
    assert.ok(qa.failures.some((failure) => failure.slot === 'block-2.1'))
  })
}

test('runWriteStep preserves parenthesized national phone text and its national dial target', async () => {
  const { report, line, calls } = await runPhones({ phone: '(084) 555-0110', tel: '0845550110' })
  assert.equal(report.status, 'done')
  const writes = calls.filter((call) => call.params.operation === 'phone.link')
  assert.equal(writes.length, 2)
  assert.ok(writes.every((call) => call.params.tel === '0845550110'))
  assert.deepEqual(line('block-2.1').phoneLink.readBack, { text: '(084) 555-0110', href: 'tel:0845550110' })
})

test('runWriteStep revalidates held phone slots and idempotent presentation on a same-input rerun', async () => {
  const run = await runPhones()
  const firstRequests = run.calls
    .filter((call) => call.params.operation === 'phone.link')
    .map((call) => call.params.request_id)
  const { report, line } = await run.rerun()
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  assert.equal(
    run.calls.filter((call) => call.params.operation === 'apply').length,
    0,
    'held text is not rewritten'
  )
  const phones = run.calls.filter((call) => call.params.operation === 'phone.link')
  assert.equal(phones.length, 2, 'held successful keys still receive exact presentation verification')
  assert.ok(phones.every((call) => call.params.expected_revision === 'phone-2'))
  assert.ok(phones.every((call) => !firstRequests.includes(call.params.request_id)))
  for (const slot of ['block-2.1', 'block-5.1']) {
    assert.equal(line(slot).unchanged, true)
    assert.equal(line(slot).phoneLink.already, true)
    assert.equal(line(slot).phoneLink.status, 'written')
  }
})
