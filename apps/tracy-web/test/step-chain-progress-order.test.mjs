import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createStepChainEngine } from '../src/sites/brief-engines/step-chain.js'

const gate = () => {
  let open
  const promise = new Promise((resolve) => {
    open = resolve
  })
  return { promise, open }
}

test('a late brand progress write cannot erase the running parallel planner', { timeout: 5000 }, async () => {
  const firstWrite = gate()
  const firstSeen = gate()
  const brandStarted = gate()
  const plannerStarted = gate()
  const finish = gate()
  let stored
  const answer = async () => ({ value: {}, usd: 0 })
  const engine = createStepChainEngine({
    applyFor: () => async () => ({}),
    steps: {
      kit: answer,
      brand: async () => {
        brandStarted.open()
        await finish.promise
        return answer()
      },
      plan: async () => {
        plannerStarted.open()
        await finish.promise
        return answer()
      },
      copy: answer,
      pictures: answer,
      write: answer
    }
  })
  const prepared = engine.prepare({
    signal: new AbortController().signal,
    progress: async (snapshot) => {
      if (snapshot.running?.length === 1 && snapshot.running[0] === 'brand') {
        firstSeen.open()
        await firstWrite.promise
      }
      stored = structuredClone(snapshot)
    }
  })
  try {
    await firstSeen.promise
    // Let another progress write finish while the first one is still held.
    await new Promise((resolve) => setImmediate(resolve))
    firstWrite.open()
    await Promise.all([brandStarted.promise, plannerStarted.promise])
    assert.deepEqual(stored.running, ['brand', 'plan'])
  } finally {
    firstWrite.open()
    finish.open()
    await prepared
  }
})
