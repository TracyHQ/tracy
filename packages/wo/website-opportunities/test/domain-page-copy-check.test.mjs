// The copy check of the page writer (ticket #594): it measures the declared limit and type of each field, never demo
// length, and has no floor, so a short value is never sent back to be padded.
import assert from 'node:assert/strict'
import test from 'node:test'
import { charCount, checkPageCopy, fieldValueProblems } from '../domain/page-copy-check.mjs'

const heading = { name: 'heading', type: 'text', kind: 'editorial.heading', limit: 30 }
const codes = (field, value) => fieldValueProblems(field, value).map((p) => p.code)

test('a value within the declared limit passes, however short: there is no floor', () => {
  assert.deepEqual(codes(heading, 'Courts'), [])
  assert.deepEqual(codes(heading, 'x'.repeat(30)), [])
  assert.deepEqual(codes({ ...heading, demo: 'A much longer demo heading of the template' }, 'Hi'), [])
})

test('over the declared limit fails, counted in characters the customer reads', () => {
  assert.deepEqual(codes(heading, 'x'.repeat(31)), ['over_limit'])
  assert.equal(charCount('Café \u{1F3BE}'), 6)
  assert.deepEqual(codes({ ...heading, limit: 6 }, 'Café \u{1F3BE}'), [])
})

test('the type is checked: a text field holds a non-empty plain string', () => {
  assert.deepEqual(codes(heading, 12), ['wrong_type'])
  assert.deepEqual(codes(heading, ['a']), ['wrong_type'])
  assert.deepEqual(codes(heading, undefined), ['missing'])
  assert.deepEqual(codes(heading, '   '), ['empty'])
  assert.deepEqual(codes(heading, ' Courts'), ['edge_space'])
  assert.deepEqual(codes(heading, '<b>Courts</b>'), ['markup'])
  assert.deepEqual(codes(heading, `Courts ${String.fromCharCode(0x2014)} open`), ['dash'])
  assert.deepEqual(codes({ name: 'price', type: 'number' }, 12), ['not_a_copy_field'])
})

test('a page check lists only the failing slots', () => {
  const slots = [
    { key: 'p-b1/heading', field: heading },
    { key: 'p-b1/sub', field: { ...heading, name: 'sub', limit: 5 } }
  ]
  const result = checkPageCopy(slots, { 'p-b1/heading': 'Fine', 'p-b1/sub': 'Too long' })
  assert.equal(result.ok, false)
  assert.deepEqual(
    result.failing.map((f) => f.key),
    ['p-b1/sub']
  )
})
