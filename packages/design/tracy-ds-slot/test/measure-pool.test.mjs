import assert from 'node:assert/strict'
import { test } from 'node:test'
import { concurrencyOf, inPool } from '../src/measure-pool.mjs'

const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms))

test('results come back in the order of the items, whatever order they finished in', async () => {
  const items = [50, 5, 30, 1, 20, 10]
  const finished = []
  const out = await inPool(items, 3, async (ms, i) => {
    await sleep(ms)
    finished.push(i)
    return `item-${i}`
  })
  assert.deepEqual(out, ['item-0', 'item-1', 'item-2', 'item-3', 'item-4', 'item-5'])
  // they did finish out of order: the order above is the pool's, not the clock's
  assert.notDeepEqual(finished, [0, 1, 2, 3, 4, 5])
})

test('never more than `size` items at once, and each slot runs one item at a time', async () => {
  let running = 0
  let most = 0
  const busy = new Set()
  await inPool(
    Array.from({ length: 12 }, (_, i) => i),
    4,
    async (_, i, slot) => {
      assert.ok(slot >= 0 && slot < 4)
      assert.ok(!busy.has(slot), `slot ${slot} given a second item while busy`)
      busy.add(slot)
      running++
      most = Math.max(most, running)
      await sleep(5 + (i % 3) * 5)
      running--
      busy.delete(slot)
    }
  )
  assert.equal(most, 4)
})

test('size 1 is a serial run in item order', async () => {
  const seen = []
  await inPool(['a', 'b', 'c'], 1, async (x) => {
    seen.push(x)
    await sleep(1)
  })
  assert.deepEqual(seen, ['a', 'b', 'c'])
})

test('one failed item fails the run: nothing new starts, running items finish first', async () => {
  const started = []
  let stillRunning = 0
  const run = inPool([0, 1, 2, 3, 4, 5, 6, 7], 2, async (_, i) => {
    started.push(i)
    stillRunning++
    try {
      if (i === 1) {
        await sleep(5)
        throw new Error('page 1 failed')
      }
      await sleep(20)
      return i
    } finally {
      stillRunning--
    }
  })
  await assert.rejects(run, /page 1 failed/)
  assert.equal(stillRunning, 0, 'the pool returned while an item was still running')
  assert.ok(started.length < 8, `every item was started after the failure: ${started}`)
})

test('an empty list and a size larger than the list', async () => {
  assert.deepEqual(await inPool([], 4, async () => 1), [])
  assert.deepEqual(await inPool([1, 2], 9, async (x) => x * 2), [2, 4])
})

test('--concurrency: a positive integer or the fallback', () => {
  assert.equal(concurrencyOf(null, 3), 3)
  assert.equal(concurrencyOf('2', 3), 2)
  assert.throws(() => concurrencyOf('0', 3), /positive integer/)
  assert.throws(() => concurrencyOf('two', 3), /positive integer/)
})
