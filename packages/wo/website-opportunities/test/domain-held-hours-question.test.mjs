// The opening hours the brief holds until the owner confirms them, asked in the build chat as the Profile card asks
// them (#575 walk, second round), and the answer read into the step chain's `hoursPick`. Invented briefs only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-held-hours-question.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { questionProblems } from '../domain/build-contract-questions.mjs'
import { heldHoursPickOf, heldHoursQuestionOf } from '../domain/held-hours-question.mjs'

const unconfirmed = {
  missing: [{ field: 'hours', why: 'Held.' }],
  facts: [{ field: 'hours', reasons: ['implausible-all-week-hours'] }]
}
const disagree = { missing: [{ field: 'hours', why: 'Held.', conflicting: true }], facts: [] }
const problemsOf = (q) => {
  const found = []
  questionProblems(q, (at, message) => found.push(`${at}: ${message}`))
  return found
}

test('hours one source alone gives are asked with Keep first and recommended', () => {
  const q = heldHoursQuestionOf(unconfirmed)
  assert.deepEqual(problemsOf(q), [])
  assert.equal(q.topic, 'held-hours')
  assert.equal(q.code, 'held_hours_unconfirmed')
  assert.deepEqual(
    q.choices.map((c) => [c.id, c.code, c.recommended === true]),
    [
      ['keep', 'held_hours_keep', true],
      ['edit', 'held_hours_edit', false],
      ['leave', 'held_hours_leave', false]
    ]
  )
})

test('hours the sources disagree on are asked without Keep', () => {
  const q = heldHoursQuestionOf(disagree)
  assert.deepEqual(problemsOf(q), [])
  assert.equal(q.code, 'held_hours_disagree')
  assert.deepEqual(
    q.choices.map((c) => c.id),
    ['edit', 'leave']
  )
})

test('a brief holding no hours asks nothing', () => {
  assert.equal(heldHoursQuestionOf({ missing: [], facts: [] }), null)
  assert.equal(heldHoursQuestionOf(null), null)
})

test('the answer becomes the step chain hours pick; typed hours come from the answer reading only', () => {
  assert.deepEqual(heldHoursPickOf({ choice: 'keep' }, null), { choice: 'keep' })
  assert.deepEqual(heldHoursPickOf({ choice: 'leave' }, null), { choice: 'leave' })
  // Edit chosen with nothing typed: no pick yet.
  assert.equal(heldHoursPickOf({ choice: 'edit' }, null), null)
  const reading = { facts: [{ kind: 'contact.hours', value: 'Mo-Fr 09:00-18:00' }] }
  assert.deepEqual(heldHoursPickOf({ text: 'weekdays nine to six' }, reading), {
    choice: 'edit',
    hours: ['Mo-Fr 09:00-18:00']
  })
  // A reading that says leave them off is the leave pick; hours no line of which can be read are no pick.
  assert.deepEqual(heldHoursPickOf({ text: 'skip them' }, { choice: 'leave' }), { choice: 'leave' })
  assert.equal(heldHoursPickOf({ text: 'x' }, { facts: [{ kind: 'contact.hours', value: 'often' }] }), null)
})
