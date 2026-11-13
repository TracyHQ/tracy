// The form a revision compares a place by (#599, `revision-place-value.mjs`) agrees with the write step's own read
// back (`readSent`, whose `holds` is not exported), case by case: a value the read back accepts after the write is a
// value Tracy left there, and a value it refuses is an edit made outside Tracy.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-place-value.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { placeHashOf, placeHolds, placeShapeOf } from 'website-opportunities/domain/revision-place-value.mjs'
import { readSent } from '../src/step-chain-draft-write-check.js'

const J = (o, ...rest) => JSON.stringify(o, ...rest)
/** [sent, held]: a record column as sent and as the site holds it. */
const CASES = [
  [J({ a: '1', b: 'x/y' }), J({ b: 'x/y', a: '1' })],
  [J({ a: '1', b: 'x/y' }), J({ a: '1', b: 'x/y' }).replace(/\//g, '\\/')],
  [J({ a: '1', b: 'x' }), J({ a: '1', b: 'x' }, null, 2)],
  [J({ a: '1' }), J({ a: '1', site_default: '0' })],
  [J({ a: '1', b: 'x' }), J({ a: '1' })],
  [J({ a: '1', b: 'x' }), J({ a: '1', b: 'y' })],
  [J({ a: 1 }), J({ a: '1' })],
  [J({ a: null }), J({ a: '' })],
  [J({ a: { b: ['1', '2'] } }), J({ a: { b: ['1', '2'], c: 1 } })],
  [J({ a: { b: ['1', '2'] } }), J({ a: { b: ['2', '1'] } })],
  [J({ a: ['1'] }), J({ a: ['1', '2'] })],
  [J({ a: J({ inner: 'v' }) }), J({ a: J({ inner: 'v', more: 1 }) })],
  [J({ a: J({ inner: 'v' }) }), J({ a: J({ inner: 'w' }) })],
  [J({ a: '1' }), J(['1'])],
  [J({ a: '1' }), 'not json'],
  [J([101, 102]), '[101,102]'],
  [J([101, 102]), '[ 101, 102 ]'],
  [J([101, 102]), '[102,101]'],
  ['<p>Words</p>', '<p>Words</p>'],
  ['<p>Words</p>', '<p>Words</p>\n'],
  ['<p>Words</p>', '<p>Other words</p>'],
  ['Plain text', 'Plain text'],
  ['Plain text', 'Plain  text'],
  ['', null],
  [null, ''],
  ['4000', 4000],
  ['{broken', '{broken'],
  ['{broken', '{broken '],
  ['[x', '[x']
]

test('a record column: the place form holds exactly what the read back accepts', () => {
  for (const [sent, held] of CASES) {
    let accepted = true
    try {
      readSent({ c: held }, { c: sent }, { key: 'op' })
    } catch (error) {
      assert.equal(error.code, 'read_back_mismatch')
      accepted = false
    }
    const place = 'record:module:1:c'
    const shape = placeShapeOf(place, sent)
    const same = placeHashOf(place, held, shape) === placeHashOf(place, sent, shape)
    assert.equal(same, accepted, `${J(sent)} held as ${J(held)}`)
    assert.equal(placeHolds(place, sent, held), accepted, `${J(sent)} held as ${J(held)}`)
  }
})

test('a slot is compared exactly and an identity field as text, as their read backs do', () => {
  assert.equal(placeHolds('slot:a', 'x', 'x'), true)
  assert.equal(placeHolds('slot:a', 'x', 'x '), false)
  assert.equal(placeHolds('slot:a', null, undefined), true)
  assert.equal(placeHolds('slot:a', null, ''), false)
  assert.equal(placeHolds('slot:a', J({ a: 1 }), J({ a: 1, b: 2 })), false)
  assert.equal(placeHolds('identity:sitename', 'Name', 'Name'), true)
  assert.equal(placeHolds('identity:sitename', null, ''), true)
  assert.equal(placeHolds('identity:sitename', J({ a: 1 }), J({ a: 1, b: 2 })), false)
})
