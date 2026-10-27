/**
 * The page-wide plans store (`src/client/plans-store.ts` `createPlansStore`): every chip follows the
 * newest plans the page knows, and a slow read that started before a newer one was published never
 * puts the older state back.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPlansStore } from '../src/client/plans-store.ts'

const plan = (connected) => ({
  vendors: [{ id: 'claude', name: 'Claude', connected, account: '', indexes: connected ? [1] : [] }],
  served: new Set(['claude'])
})

/** A read that answers only when the test says so. */
function slowRead() {
  /** @type {((value: unknown) => void)[]} */
  const pending = []
  const read = () => new Promise((resolve) => pending.push(resolve))
  return { read, answer: (value) => pending.shift()?.(value) }
}

test('a read started before a newer publish is dropped when it lands', async () => {
  const { read, answer } = slowRead()
  const store = createPlansStore(read)
  const reading = store.refresh()
  // The person disconnects in Settings › AI accounts, which publishes what it just read.
  store.publish(plan(false))
  answer(plan(true))
  await reading
  assert.equal(store.current().vendors[0].connected, false)
})

test('a read with nothing newer published is what every subscriber sees, and they are told', async () => {
  const { read, answer } = slowRead()
  const store = createPlansStore(read)
  let told = 0
  store.subscribe(() => {
    told += 1
  })
  // The first subscriber starts the first read.
  answer(plan(true))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(store.current().vendors[0].connected, true)
  assert.equal(told, 1)
})

test('a failed read keeps what was known, and nothing until the first good read', async () => {
  const store = createPlansStore(() => Promise.reject(new Error('unreachable')))
  await store.refresh()
  assert.equal(store.current(), undefined)
  store.publish(plan(true))
  await store.refresh()
  assert.equal(store.current().vendors[0].connected, true)
})
