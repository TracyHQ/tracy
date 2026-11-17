// The stop card of the build chat (#575): a stopped step, a limit stop and a start refused for its limit all end the
// chat with one card that says why and offers Try again and Start over, read from the session's own tool results and,
// when the chat missed the stop, from the engine door. Invented answers only.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BUILD_TOOL, buildToolFoldOf, buildToolResultOf, stopCardOf } from '../src/build-chat/index.mjs'

let seq = 0
const call = (turn, callId, action) => ({
  type: 'tool/call',
  seq: ++seq,
  data: { turn, name: BUILD_TOOL, callId, arguments: JSON.stringify({ action }) }
})
const result = (turn, callId, value) => ({
  type: 'tool/result',
  seq: ++seq,
  surfaceOp: 'append',
  data: { turn, message: { source: { callId }, content: [{ type: 'text', text: JSON.stringify(value) }] } }
})
const foldOf = (...events) => events.reduce(buildToolFoldOf, undefined)

const AT = '2026-11-17T15:00:00.000Z'
const BEFORE = Date.parse(AT) - 60_000
const AFTER = Date.parse(AT) + 60_000

test('a start refused for its limit is a stop the owner may retry once its time came', () => {
  const paused = { paused: true, say: 'Paused.', retryAt: AT, rerun: true, again: { action: 'research' } }
  assert.deepEqual(buildToolResultOf(JSON.stringify(paused)), {
    kind: 'stopped',
    rerun: true,
    paused: true,
    retryAt: AT
  })
  const fold = foldOf(call(1, 'a', 'research'), result(1, 'a', paused))
  assert.equal(fold.stop.step, 'research')
  assert.equal(fold.stop.paused, true)
  assert.equal(fold.stop.retryAt, AT)
  assert.deepEqual(stopCardOf({ stop: fold.stop, now: BEFORE }), {
    step: 'research',
    limit: true,
    retryAt: AT,
    retry: 'waiting'
  })
  assert.equal(stopCardOf({ stop: fold.stop, now: AFTER }).retry, 'offered')
  // Paused twice in a row is no failed retry: the count of retries is left alone.
  const twice = [call(2, 'b', 'research'), result(2, 'b', paused)].reduce(buildToolFoldOf, fold)
  assert.equal(twice.stop.retries, 0)
})

test('a stopped answer carries its reason and its time; a fault offers Try again, one that may not rerun offers none', () => {
  const limit = { stopped: true, say: 'x', step: 'research', rerun: true, retryAt: AT, reason: 'try-later' }
  assert.deepEqual(buildToolResultOf(JSON.stringify(limit)), {
    kind: 'stopped',
    step: 'research',
    rerun: true,
    reason: 'try-later',
    retryAt: AT
  })
  const fault = foldOf(
    call(1, 'a', 'plan'),
    result(1, 'a', { stopped: true, say: 'x', step: 'compose', rerun: true })
  )
  assert.deepEqual(stopCardOf({ stop: fault.stop, now: AFTER }), {
    step: 'compose',
    limit: false,
    retryAt: null,
    retry: 'offered'
  })
  const forGood = foldOf(call(1, 'b', 'plan'), result(1, 'b', { stopped: true, say: 'x' }))
  assert.equal(stopCardOf({ stop: forGood.stop }).retry, 'none', 'noRerun: Start over only')
})

test('no card while the step runs again, for a stop the owner continues from by talking, or with nothing stopped', () => {
  const fault = foldOf(
    call(1, 'a', 'plan'),
    result(1, 'a', { stopped: true, say: 'x', step: 'compose', rerun: true })
  )
  assert.equal(stopCardOf({ stop: fault.stop, engine: { step: 'compose', state: 'running' } }), null)
  for (const reason of ['cancelled', 'revise-failed', 'stale', 'details-asked']) {
    const fold = foldOf(call(1, reason, 'plan'), result(1, reason, { stopped: true, say: 'x', reason }))
    assert.equal(stopCardOf({ stop: fold.stop }), null, reason)
    assert.equal(
      stopCardOf({ engine: { step: 'research', state: 'stopped', say: 'x', reason } }),
      null,
      reason
    )
  }
  assert.equal(stopCardOf({ stop: null, engine: { step: 'compose', state: 'done' } }), null)
  assert.equal(stopCardOf({}), null)
})

test('a stop the chat never heard (the step ended while the chat was closed) comes from the engine door', () => {
  const engine = {
    step: 'research',
    state: 'stopped',
    say: 'x',
    reason: 'try-later',
    retryAt: AT,
    rerun: true
  }
  assert.deepEqual(stopCardOf({ stop: null, engine, now: BEFORE }), {
    step: 'research',
    limit: true,
    retryAt: AT,
    retry: 'waiting'
  })
  assert.equal(stopCardOf({ engine: { step: 'brand', state: 'stopped', say: 'x' } }).retry, 'none')
})

test('after two retries of the same step that stopped again, only Start over stays', () => {
  const stop = { stopped: true, say: 'x', step: 'compose', rerun: true }
  const fold = foldOf(
    call(1, 'a', 'plan'),
    result(1, 'a', stop),
    call(2, 'b', 'plan'),
    result(2, 'b', stop),
    call(3, 'c', 'plan'),
    result(3, 'c', stop)
  )
  assert.equal(stopCardOf({ stop: fold.stop }).retry, 'none')
})
