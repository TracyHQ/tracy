/**
 * The refill arithmetic, as a table of cases. Pure — no database — which is the point: how much a
 * fleet installs is decided here, and it has to be arguable without one.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { deficitOf, jobKeysFor } from '../src/inventory/policy.js'

const supply = (over = {}) => ({ ready: 0, preparing: 0, awaitingReview: 0, stock: 0, ...over })
const policy = (over = {}) => ({
  enabled: true,
  paused: false,
  lowWatermark: 1,
  targetReady: 3,
  maxStock: 5,
  maxConcurrentPrepares: 2,
  ...over
})

test('R=1, P=1, target=3 asks for ONE more — the example in the spec', () => {
  const out = deficitOf({
    supply: supply({ ready: 1, preparing: 1, stock: 2 }),
    policy: policy()
  })
  assert.equal(out.deficit, 1)
  assert.equal(out.bottleneck, null)
})

test('a pool at its stock ceiling asks for nothing and says which ceiling', () => {
  const out = deficitOf({
    supply: supply({ ready: 0, stock: 2 }),
    policy: policy({ targetReady: 3, maxStock: 2 })
  })
  assert.equal(out.deficit, 0)
  assert.equal(out.bottleneck, 'max-stock')
  assert.match(out.reason, /maxStock 2/)
})

test('a paused pool asks for nothing, whatever the numbers say', () => {
  const out = deficitOf({
    supply: supply({ ready: 0, stock: 0 }),
    policy: policy({ paused: true })
  })
  assert.deepEqual({ deficit: out.deficit, bottleneck: out.bottleneck }, { deficit: 0, bottleneck: 'paused' })
})

test('a pool that was never enabled asks for nothing — rollout is a flag, not a discovery', () => {
  const out = deficitOf({ supply: supply(), policy: policy({ enabled: false }) })
  assert.equal(out.deficit, 0)
  assert.equal(out.bottleneck, 'disabled')
})

test('stock waiting on a human is named as such, not installed around', () => {
  const out = deficitOf({
    supply: supply({ ready: 0, preparing: 0, awaitingReview: 3, stock: 3 }),
    policy: policy({ targetReady: 3, maxStock: 8, maxConcurrentPrepares: 4 })
  })
  assert.equal(out.deficit, 0)
  assert.equal(out.bottleneck, 'awaiting-review')
  assert.match(out.reason, /awaiting review/)
})

test('a full pool is at-target, not awaiting-review', () => {
  const out = deficitOf({
    supply: supply({ ready: 3, stock: 3 }),
    policy: policy({ targetReady: 3 })
  })
  assert.equal(out.deficit, 0)
  assert.equal(out.bottleneck, 'at-target')
})

test('refill waits for the watermark: ready above it is at-target even when below target', () => {
  // ready 2 < targetReady 3, but 2 > lowWatermark 1 — §4 rule 2 only opens the window at the mark.
  const out = deficitOf({
    supply: supply({ ready: 2, stock: 2 }),
    policy: policy({ lowWatermark: 1, targetReady: 3 })
  })
  assert.equal(out.deficit, 0)
  assert.equal(out.bottleneck, 'at-target')
})

test('a pool at its concurrency limit asks for nothing and names it', () => {
  const out = deficitOf({
    supply: supply({ ready: 0, preparing: 1, stock: 1 }),
    policy: policy({ maxConcurrentPrepares: 1 })
  })
  assert.equal(out.deficit, 0)
  assert.equal(out.bottleneck, 'concurrency')
})

test('a want larger than the room left is cut to the room, and says which cut it', () => {
  const byStock = deficitOf({
    supply: supply({ ready: 0, stock: 4 }),
    policy: policy({ targetReady: 3, maxStock: 5, maxConcurrentPrepares: 9 })
  })
  assert.equal(byStock.deficit, 1)
  assert.equal(byStock.bottleneck, 'max-stock')

  const byConcurrency = deficitOf({
    supply: supply({ ready: 0, stock: 0 }),
    policy: policy({ targetReady: 3, maxStock: 9, maxConcurrentPrepares: 2 })
  })
  assert.equal(byConcurrency.deficit, 2)
  assert.equal(byConcurrency.bottleneck, 'concurrency')
})

test('an empty pool at target 1 asks for exactly one — the pilot shape', () => {
  const out = deficitOf({
    supply: supply(),
    policy: policy({ lowWatermark: 0, targetReady: 1, maxStock: 1, maxConcurrentPrepares: 1 })
  })
  assert.equal(out.deficit, 1)
})

test('job keys are the lowest free slots, so two racers write the same names', () => {
  const key = 'prod:prod1:joomla:tracy-business/j6:1.0.0:abcdef012345'
  assert.deepEqual(jobKeysFor(key, 2), [`${key}:1`, `${key}:2`])
  // Both replicas see the same outbox and both compose the same two keys — the primary key then
  // keeps exactly one row per slot.
  assert.deepEqual(jobKeysFor(key, 2, [`${key}:1`]), jobKeysFor(key, 2, [`${key}:1`]))
  assert.deepEqual(jobKeysFor(key, 2, [`${key}:1`]), [`${key}:2`, `${key}:3`])
})

test('slots already taken are stepped over, holes reused', () => {
  const key = 'dev:h:wordpress:t/wp6:2.0.0:0123456789ab'
  assert.deepEqual(jobKeysFor(key, 2, [`${key}:1`, `${key}:3`]), [`${key}:2`, `${key}:4`])
})

test('keys of another pool do not reserve slots in this one', () => {
  const key = 'dev:h:wordpress:t/wp6:2.0.0:0123456789ab'
  assert.deepEqual(jobKeysFor(key, 1, ['other:pool:1', 'nonsense']), [`${key}:1`])
})

test('a zero deficit asks for no keys at all', () => {
  assert.deepEqual(jobKeysFor('p', 0, []), [])
})
