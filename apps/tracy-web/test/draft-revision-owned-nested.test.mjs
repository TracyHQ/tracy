// The keys of a JSON column a revision writes (#599, `ownedColumnOf`), nested: an object Tracy no longer sends goes
// with only Tracy's keys in it (the owner's beside them stay); a list whose row holds a key Tracy never owned stops the
// revision (`overOwner`, `site_changed_outside` at the column) rather than lose the owner's key; a list without one is
// written whole. Invented values only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-owned-nested.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ownedColumnOf, shapeUnion } from '../src/step-chain-draft-owned-keys.js'
import { shapeOf } from '../src/step-chain-draft-place-value.js'

const J = JSON.stringify
/** A revision's call: the shape owned is what the previous build wrote joined with what is sent. */
const revise = (now, sent, previous) => {
  const before = shapeOf(J(previous))
  const out = ownedColumnOf(J(now), J(sent), shapeUnion(before, shapeOf(J(sent))), before)
  return out.overOwner ? 'over_owner' : JSON.parse(out.value)
}

test('an object taken out whole keeps the owner key beside Tracy keys', () => {
  const now = { g: { x: 'fern', own: 'owner words' }, a: '1' }
  assert.deepEqual(revise(now, { a: '1' }, { g: { x: 'fern' }, a: '1' }), {
    g: { own: 'owner words' },
    a: '1'
  })
  assert.deepEqual(revise({ g: { x: 'fern' }, a: '1' }, { a: '1' }, { g: { x: 'fern' }, a: '1' }), { a: '1' })
  const deep = { g: { h: { y: 'moss', own: 'o' } }, a: '1' }
  assert.deepEqual(revise(deep, { a: '1' }, { g: { h: { y: 'moss' } }, a: '1' }), {
    g: { h: { own: 'o' } },
    a: '1'
  })
})

test('a list whose row holds an owner key stops instead of losing it', () => {
  const previous = { rows: [{ t: 'a' }, { t: 'b' }] }
  assert.equal(
    revise({ rows: [{ t: 'a', own: 'o' }, { t: 'b' }] }, { rows: [{ t: 'a2' }, { t: 'b' }] }, previous),
    'over_owner'
  )
  const two = { rows: [{ t: 'a', t2: 'x' }] }
  assert.equal(revise({ rows: [{ t: 'a', t2: 'x', own: 'o' }] }, { rows: [{ t: 'a' }] }, two), 'over_owner')
})

test('a list without owner keys is written whole, as before', () => {
  const previous = { rows: [{ t: 'a' }, { t: 'b' }] }
  assert.deepEqual(revise(previous, { rows: [{ t: 'a2' }, { t: 'b' }] }, previous), {
    rows: [{ t: 'a2' }, { t: 'b' }]
  })
  assert.deepEqual(revise(previous, { rows: [{ t: 'a' }] }, previous), { rows: [{ t: 'a' }] })
  const two = { rows: [{ t: 'a', t2: 'x' }] }
  assert.deepEqual(revise(two, { rows: [{ t: 'a' }] }, two), { rows: [{ t: 'a' }] })
})

test('a restore (no guard) puts an object back over the owner key beside it, keeping that key', () => {
  const out = ownedColumnOf(J({ own: 'o' }), J({ g: { x: 'fern' } }), { g: { x: 0 } })
  assert.deepEqual(JSON.parse(out.value), { g: { x: 'fern' }, own: 'o' })
})
