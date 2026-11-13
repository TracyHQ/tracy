// The read back's column comparison (#597), exported for the revision run (#599): `canonicalOf` reads a JSON text
// column as its value, `columnHolds` says whether what the site holds keeps everything that was sent.
import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalOf, columnHolds } from '../src/step-chain-draft-write-check.js'

test('canonicalOf: JSON text is its value, anything else is itself', () => {
  const cases = [
    ['{"a":1}', { a: 1 }],
    ['  [1, "b"]', [1, 'b']],
    ['{"url":"images\\/a.jpg"}', { url: 'images/a.jpg' }],
    ['{not json', '{not json'],
    ['Fresh stems', 'Fresh stems'],
    [7, 7],
    [null, null]
  ]
  for (const [value, want] of cases) assert.deepEqual(canonicalOf(value), want, JSON.stringify(value))
})

test('columnHolds: the site may add keys and spacing, never change or drop what was sent', () => {
  const cases = [
    ['{"a":1}', '{ "a": 1, "b": 2 }', true],
    ['{"a":{"b":"x"}}', '{"a":{"b":"x","c":1}}', true],
    ['{"a":1}', '{"a":2}', false],
    ['{"a":1}', '{"b":1}', false],
    ['[1,2]', '[1,2,3]', false],
    ['[1,2]', '[1,2]', true],
    [1, '1', true],
    [null, '', true],
    ['{"a":"1"}', { a: 1 }, true],
    ['Fresh', 'Fresh ', false],
    ['{"a":1}', 'not json', false]
  ]
  for (const [sent, got, want] of cases)
    assert.equal(columnHolds(sent, got), want, `${JSON.stringify(sent)} in ${JSON.stringify(got)}`)
})
