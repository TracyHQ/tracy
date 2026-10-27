/**
 * What a running chat turn waits on, shared by the plugins that wait (`src/chat-wait`, #1403 item 10).
 *
 *   node --test packages/core/tracy-core/test/chat-wait.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { beginWait, waitOf, whileWaiting } from '../src/chat-wait/index.mjs'

test('a wait is read with its whole seconds, and gone once ended; ending twice is nothing', () => {
  const end = beginWait('session-a', 'lease', 1_000)
  assert.deepEqual(waitOf('session-a', 13_900), { kind: 'lease', seconds: 12 })
  assert.equal(waitOf('session-b', 13_900), null, 'one conversation tells nothing of another')
  end()
  end()
  assert.equal(waitOf('session-a'), null)
})

test('a newer wait of the conversation is the one shown; ending the older leaves it', () => {
  const older = beginWait('session-a', 'previous', 0)
  const newer = beginWait('session-a', 'check', 5_000)
  older()
  assert.equal(waitOf('session-a', 6_000)?.kind, 'check')
  newer()
  assert.equal(waitOf('session-a'), null)
})

test('whileWaiting marks the wait for as long as the promise runs, a rejection included; no session marks nothing', async () => {
  let release
  const running = whileWaiting('session-c', 'previous', new Promise((r) => (release = r)))
  assert.equal(waitOf('session-c')?.kind, 'previous')
  release('done')
  assert.equal(await running, 'done')
  assert.equal(waitOf('session-c'), null)
  await assert.rejects(whileWaiting('session-c', 'check', Promise.reject(new Error('x'))))
  assert.equal(waitOf('session-c'), null)
  assert.equal(await whileWaiting(null, 'check', Promise.resolve(1)), 1)
})

test('one record per process, whichever copy of the module asks (each plugin bundles its own)', async () => {
  const copy = await import(`../src/chat-wait/index.mjs?copy=${Date.now()}`)
  const end = copy.beginWait('session-d', 'lease', 0)
  assert.equal(waitOf('session-d', 2_000)?.kind, 'lease')
  end()
})
