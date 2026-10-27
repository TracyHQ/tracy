/**
 * The grid puts what a customer can build today in front of what is only being prepared.
 *
 * Pinned as a RULE over the function rather than as one grid's expected order: the order the host
 * sends has changed before (brands, then templates, then the 152) and will again, and the promise
 * this file makes is about what a customer reaches first, not about any one arrangement.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isReady, readyFirst } from '../src/client/ready-first.mjs'

const soon = (id) => ({ id, platforms: [] })
const ready = (id, platforms = ['joomla']) => ({ id, platforms })

test('a row names no platform: it cannot be built, and it goes behind', () => {
  assert.equal(isReady(soon('agentic')), false)
  assert.equal(isReady(ready('tracy-business')), true)
})

test('a row that names no platforms FIELD is left alone, not pushed back', () => {
  // `undefined` is a surface that did not speak about this row, which is not the same answer as
  // "nowhere" — treating the two alike would bury every card served by an older door.
  assert.equal(isReady({ id: 'unknown' }), true)
  assert.deepEqual(
    readyFirst([soon('a'), { id: 'unknown' }]).map((d) => d.id),
    ['unknown', 'a']
  )
})

test('buildable rows come first, and Coming soon rows keep their own order behind them', () => {
  const list = [soon('agentic'), ready('tracy-saas'), soon('airbnb'), ready('tracy-business'), soon('ant')]
  assert.deepEqual(
    readyFirst(list).map((d) => d.id),
    ['tracy-saas', 'tracy-business', 'agentic', 'airbnb', 'ant']
  )
})

test('brands stay pinned in front of both, in the order they arrived', () => {
  // They are the customer's own rows, not something to build from, and the fit score every other
  // row carries is measured against them.
  const list = [
    { id: 'brand:mine.com', platforms: [] },
    { id: 'brand:reference.com', platforms: [] },
    soon('agentic'),
    ready('tracy-business')
  ]
  assert.deepEqual(
    readyFirst(list).map((d) => d.id),
    ['brand:mine.com', 'brand:reference.com', 'tracy-business', 'agentic']
  )
})

test('the partition is stable, so a sort applied before it survives', () => {
  const byFit = [ready('closest'), soon('closer'), ready('far')]
  assert.deepEqual(
    readyFirst(byFit).map((d) => d.id),
    ['closest', 'far', 'closer']
  )
})

test('nothing to order is not an error', () => {
  assert.deepEqual(readyFirst([]), [])
  assert.deepEqual(readyFirst(undefined), [])
})
