/**
 * Checks stop when they stop helping (#296, 02/11/2026): from the 4th counted check on, two checks in a row that found no
 * fewer faults than the one before each end the checking; a build that still improves keeps all 8.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checksPlateaued, faultsOf, PLATEAU_NEXT } from '../src/opportunities-build/client-demo.js'

const fail = (id, findings) => ({
  id,
  pass: false,
  detail: Array.from({ length: findings }, (_, i) => ({ i }))
})
const round = (...failed) => ({ failed })

test('a fault is each finding a failed check lists, one when it lists none', () => {
  assert.equal(faultsOf([fail('no-demo-words', 3), { id: 'looks-finished', pass: false, detail: 'text' }]), 4)
  assert.equal(faultsOf([fail('cta-real', 0)]), 1)
  assert.equal(faultsOf([]), 0)
})

test('an EmDash-like build flat from its third check stops at its fourth', () => {
  // Faults per counted check: 9, 1, 1, 1 → check 4 found no fewer than 3, and 3 no fewer than 2.
  const rounds = [round(fail('a', 9)), round(fail('a', 1)), round(fail('a', 1))]
  assert.equal(checksPlateaued(rounds.slice(0, 2), [fail('a', 1)]), false, 'never before the 4th check')
  assert.equal(checksPlateaued(rounds, [fail('a', 1)]), true)
})

test('a Joomla-like build that still improves keeps checking', () => {
  // 22, 12, 9, 7, 6 faults: every check found fewer.
  const rounds = [22, 12, 9, 7].map((n) => round(fail('look', n)))
  assert.equal(checksPlateaued(rounds, [fail('look', 6)]), false)
  // One flat check is not enough: 9, 7, 7 → the 7 before it was fewer than 9.
  assert.equal(
    checksPlateaued(
      [9, 7].map((n) => round(fail('look', n))),
      [fail('look', 7)]
    ),
    false
  )
  assert.equal(
    checksPlateaued(
      [12, 9, 7].map((n) => round(fail('look', n))),
      [fail('look', 7)]
    ),
    false
  )
})

test('moving a fault from one check to another is not progress', () => {
  const rounds = [round(fail('a', 2), fail('b', 2)), round(fail('a', 1), fail('b', 3)), round(fail('b', 4))]
  assert.equal(checksPlateaued(rounds, [fail('c', 4)]), true)
})

test('the agent is told no check remains and to end the turn, never to repair or check again', () => {
  assert.match(PLATEAU_NEXT, /No more checks will run/)
  assert.match(PLATEAU_NEXT, /call no check/)
  assert.match(PLATEAU_NEXT, /End the turn/)
})
