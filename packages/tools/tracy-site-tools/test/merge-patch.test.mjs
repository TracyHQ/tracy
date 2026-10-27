/**
 * RFC 7386 merge-patch (`merge-patch.mjs`), with the RFC's own examples and the `openText` hook.
 *
 *   node --test packages/tools/tracy-site-tools/test/merge-patch.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { KeysLost, mergePatch, patchKeys } from '../src/host/merge-patch.mjs'

test('RFC 7386 appendix A: set, replace, remove, merge nested, lists replace whole', () => {
  const cases = [
    [{ a: 'b' }, { a: 'c' }, { a: 'c' }],
    [{ a: 'b' }, { b: 'c' }, { a: 'b', b: 'c' }],
    [{ a: 'b' }, { a: null }, {}],
    [{ a: 'b', b: 'c' }, { a: null }, { b: 'c' }],
    [{ a: ['b'] }, { a: 'c' }, { a: 'c' }],
    [{ a: 'c' }, { a: ['b'] }, { a: ['b'] }],
    [{ a: { b: 'c' } }, { a: { b: 'd', c: null } }, { a: { b: 'd' } }],
    [{ a: [{ b: 'c' }] }, { a: [1] }, { a: [1] }],
    [{ e: null }, { a: 1 }, { e: null, a: 1 }],
    [{}, { a: { bb: { ccc: null } } }, { a: { bb: {} } }]
  ]
  for (const [target, patch, want] of cases) assert.deepEqual(mergePatch(target, patch), want)
  assert.deepEqual(mergePatch(['a'], { b: 1 }), { b: 1 })
  assert.equal(mergePatch({ a: 1 }, 'x'), 'x')
})

test('the target is never changed, and __proto__ is an ordinary key', () => {
  const target = { a: { b: 1 } }
  mergePatch(target, { a: { b: 2 } })
  assert.deepEqual(target, { a: { b: 1 } })
  const out = /** @type {any} */ (mergePatch({}, JSON.parse('{"__proto__":{"x":1}}')))
  assert.equal(Object.hasOwn(out, '__proto__'), true)
  assert.equal(/** @type {any} */ ({}).x, undefined)
})

test('openText: a JSON text under a key is merged as an object and written back as text', () => {
  const stored = { cfg: JSON.stringify({ a: 1, b: { c: 2 } }), note: 'words' }
  const open = (/** @type {string} */ text) => (text.startsWith('{') ? JSON.parse(text) : null)
  const out = /** @type {any} */ (mergePatch(stored, { cfg: { b: { c: 3 } } }, { openText: open }))
  assert.deepEqual(JSON.parse(out.cfg), { a: 1, b: { c: 3 } })
  assert.equal(out.note, 'words')
  assert.deepEqual(patchKeys({ a: 1, b: null }), { keys: ['a', 'b'], removed: 1 })
})

test('openText: a string sent for a stored JSON text that drops one of its keys throws KeysLost', () => {
  const open = (/** @type {string} */ text) => (text.startsWith('{') ? JSON.parse(text) : null)
  const stored = { cfg: JSON.stringify({ ':type': 'mood:hero', hero: { h: ['Old'] } }) }
  const retyped = JSON.stringify({ type: 'mood:hero', hero: { h: ['New'] } })
  assert.throws(
    () => mergePatch(stored, { cfg: retyped }, { openText: open }),
    (error) => error instanceof KeysLost && error.path === 'cfg' && error.lost.join() === ':type'
  )
  const kept = JSON.stringify({ ':type': 'mood:hero', hero: { h: ['New'] } })
  assert.deepEqual(mergePatch(stored, { cfg: kept }, { openText: open }), { cfg: kept })
  assert.deepEqual(mergePatch(stored, { cfg: retyped }), { cfg: retyped }, 'no openText: RFC 7386 as is')
})
