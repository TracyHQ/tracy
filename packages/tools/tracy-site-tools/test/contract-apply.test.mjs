/**
 * A sealed Joomla site's contract apply, from the model's call to what reaches the component (D9):
 * Tracy makes the ids, the relay carries only what the component reads, and the ids a conversation
 * already saw answered are never sent again. Fixture: the four Business entities the suite touches
 * (`module-428`, `-435`, `-441`, `-442`), both languages, from the stand's inspect of 24/09.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { createCallMemory } from '../src/host/call-memory.mjs'
import { runSiteCall } from '../src/host/site-call.mjs'
import { narrowInspect, planCall } from '../src/host/site.mjs'

/** @param {string} name */
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))
const CONTRACT = fixture('contract/four-entities.json').answer

function site() {
  /** @type {Array<Record<string, any>>} */
  const sent = []
  const memory = createCallMemory()
  const send = async (/** @type {string} */ _action, /** @type {Record<string, any>} */ params) => {
    sent.push(structuredClone(params))
    return params.operation === 'inspect'
      ? CONTRACT
      : { ok: true, applied: Object.keys(params.changes ?? {}).length }
  }
  /** @param {unknown} args */
  const call = (args) => {
    const plan = planCall(args)
    assert.ok(plan.ok)
    return /** @type {Promise<any>} */ (
      runSiteCall({
        plan,
        send,
        memory,
        sessionId: 'session-j',
        label: 'j-1ibzqi',
        actorKey: 'ana@example.com',
        facts: { platform: 'joomla', sealed: true },
        sleep: async () => {}
      })
    )
  }
  return { sent, memory, call }
}

test('an apply after an inspect: one contract- apply_id and a request_id made by Tracy, and the answer says so', async () => {
  const { sent, call } = site()
  const read = await call({
    action: 'content.contract',
    params: { operation: 'inspect', entity: 'module-441', slots: 'text' }
  })
  const slot = read.slots[0]
  assert.equal(typeof slot.max, 'number', 'the narrowed slot says its limit')
  const applied = await call({
    action: 'content.contract',
    params: {
      operation: 'apply',
      expected_revision: CONTRACT.revision,
      changes: { [slot.key]: 'Built for the way you work' }
    }
  })
  assert.equal(applied.ok, true)
  const body = sent.at(-1)
  assert.deepEqual(Object.keys(body).sort(), [
    'apply_id',
    'changes',
    'expected_revision',
    'operation',
    'request_id'
  ])
  assert.match(body.apply_id, /^contract-[0-9a-z]+-[0-9a-f]{6}$/)
  assert.match(body.request_id, /^r-[0-9a-f]{16}$/)
  assert.equal(applied.applyId, body.apply_id)
  assert.match(applied.normalized.join(' '), /Tracy made it/)
})

test('🔒 no apply reaches the component with an id it refuses: the historical id shapes end corrected or refused with the way on', async () => {
  // j-1ibzqi 23/09: 16 refused calls in 11 id spellings (1.1 M tokens). The spelling fixes are P12's
  // (CC-5/6); what must hold now is that none of them is relayed with a bad id.
  const shapes = fixture('refusal-corpus.json').filter((/** @type {any} */ e) => e.class.startsWith('CC-IDS'))
  assert.ok(shapes.length >= 15)
  for (const e of shapes) {
    const { sent, call } = site()
    const answer = await call(e.args)
    const applies = sent.filter((p) => p.operation === 'apply')
    for (const p of applies) {
      assert.match(p.apply_id, /^contract-/, e.src)
      assert.match(p.request_id, /^[a-zA-Z0-9._:-]{1,100}$/, e.src)
    }
    if (applies.length === 0) {
      assert.equal(answer.ok, false, e.src)
      assert.match(answer.next, /apply_id|changes/, e.src)
    }
  }
})

test('🔒 an id this conversation saw answered is never sent again; one whose answer never came is', async () => {
  const { sent, memory, call } = site()
  const change = {
    operation: 'apply',
    expected_revision: CONTRACT.revision,
    changes: { 'module-441.1': 'Hi' }
  }
  await call({ action: 'content.contract', params: { ...change, apply_id: 'contract-hero' } })
  assert.equal(sent.at(-1).apply_id, 'contract-hero')
  await call({ action: 'content.contract', params: { ...change, apply_id: 'contract-hero' } })
  assert.notEqual(sent.at(-1).apply_id, 'contract-hero', 'answered once: a new id')
  memory.rememberWrite('session-j', 'j-1ibzqi', { applyId: 'contract-lost', ok: false, unknown: true })
  await call({ action: 'content.contract', params: { ...change, apply_id: 'contract-lost' } })
  assert.equal(
    sent.at(-1).apply_id,
    'contract-lost',
    'outcome unknown: the same id, so the component replays'
  )
})

test('the contract fixture narrows the way the component’s slots read: a text slot says max, a picture its sample', () => {
  const images = narrowInspect(CONTRACT, { operation: 'inspect', slots: 'image' })
  assert.ok(images.slots.length > 0)
  assert.ok(images.slots.every((/** @type {any} */ s) => 'sample' in s && !('max' in s)))
  const text = narrowInspect(CONTRACT, { operation: 'inspect', entity: 'module-428' })
  assert.ok(text.slots.every((/** @type {any} */ s) => s.type === 'image' || Number.isInteger(s.max)))
})
