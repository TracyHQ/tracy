/**
 * A build now dresses a NEW site (tasks/todo-build-new-site.md): the answers name it, the job says
 * which site it is dressing, and the answers ride browser storage across the sign-in window. What is
 * pinned here is the arithmetic only — the label a name becomes, the job's two site fields, and the
 * carry — because those are the parts that decide whether a customer's site is created twice, named
 * something unusable, or built into the wrong webroot.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { createJob, readJob } from '../src/host/build.mjs'
import { carryKey, labelOf, readCarry, writeCarry } from '../src/client/carry.mjs'

test('labelOf: the business name becomes a fleet label — lower case, no spaces, no punctuation', () => {
  assert.equal(labelOf({ name: 'Cô Ba Bakery' }), 'co-ba-bakery')
  assert.equal(labelOf({ name: '  Claude   Studio  ' }), 'claude-studio')
  assert.equal(labelOf({ name: 'A&B  Ltd.' }), 'a-b-ltd')
  assert.equal(labelOf({ name: 'Tiệm hoa Mai Vàng' }), 'tiem-hoa-mai-vang')
  // A label a fleet can refuse is worse than one we shortened ourselves.
  assert.ok(labelOf({ name: 'x'.repeat(80) }).length <= 32)
  assert.match(labelOf({ name: 'x'.repeat(80) }), /^[a-z0-9-]+$/)
})

test('labelOf: nothing usable in the name still yields a label, never an empty string', () => {
  assert.match(labelOf({}), /^site-[a-z0-9]+$/)
  assert.match(labelOf({ name: '   ' }), /^site-[a-z0-9]+$/)
  assert.match(labelOf({ name: '???' }), /^site-[a-z0-9]+$/)
  // Two calls with nothing to go on must not collide.
  assert.notEqual(labelOf({}), labelOf({}))
})

test('the job says which site it dresses, apart from the lane it was started from', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tracy-build-target-'))
  try {
    const job = createJob(root, {
      id: 'airbnb',
      platform: 'wordpress',
      stages: ['check', 'theme', 'style', 'copy', 'seed', 'shot'],
      answers: { name: 'Cô Ba Bakery' },
      targetSiteKey: 'cobabakery.tracy.ai'
    })
    assert.equal(job.targetSiteKey, 'cobabakery.tracy.ai')
    assert.equal(readJob(root)?.targetSiteKey, 'cobabakery.tracy.ai')
    // A build of the lane's own site (the old shape) leaves the field out rather than guessing.
    const own = createJob(root, { id: 'airbnb', platform: 'wordpress', stages: ['check'] })
    assert.equal('targetSiteKey' in own, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the carry: answers survive the sign-in window, and are cleared once the site exists', () => {
  const store = new Map()
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k)
  }
  const carry = { id: 'airbnb', platform: 'wordpress', answers: { name: 'Cô Ba Bakery', tone: 'warm' } }
  writeCarry(carry, storage)
  assert.deepEqual(readCarry(storage), carry)
  // Read again: still there — a reload must not consume it.
  assert.deepEqual(readCarry(storage), carry)
  writeCarry(null, storage)
  assert.equal(readCarry(storage), null)
  assert.equal(store.has(carryKey), false)

  // Junk in the slot is not a carry: a half-written value must never reach the form.
  storage.setItem(carryKey, '{oops')
  assert.equal(readCarry(storage), null)
  storage.setItem(carryKey, JSON.stringify({ id: 'airbnb' }))
  assert.equal(readCarry(storage), null)
  // A storage that throws (private window, blocked site data) is a null carry, not a crash.
  const dead = {
    getItem: () => {
      throw new Error('denied')
    },
    setItem: () => {
      throw new Error('denied')
    },
    removeItem: () => {
      throw new Error('denied')
    }
  }
  assert.equal(readCarry(dead), null)
  assert.doesNotThrow(() => writeCarry(carry, dead))
})
