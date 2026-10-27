/**
 * The poll loop behind every "still working" view. A search's website checks are queued by the
 * first site-checks call, so that call must not wait a whole period: measured on dev 19/10/2026, a
 * reload within ~3 s of a search left nothing queued.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { pollRefused, startPoll } from '../src/client/poll.ts'

function fakeTimers() {
  const pending = new Map()
  let next = 1
  return {
    hidden: false,
    pending,
    set(fn, ms) {
      const id = next++
      pending.set(id, { fn, ms })
      return id
    },
    clear(id) {
      pending.delete(id)
    },
    isHidden() {
      return this.hidden
    },
    /** Fire every timer due now, as the browser would after `ms`. */
    async fire() {
      const due = [...pending.entries()]
      pending.clear()
      for (const [, t] of due) await t.fn()
    }
  }
}

const flush = () => new Promise((r) => setImmediate(r))

test('a leading poll reads at once, then every period', async () => {
  const timers = fakeTimers()
  let reads = 0
  const stop = startPoll(async () => void reads++, 3000, { leading: true, timers })
  await flush()
  assert.equal(reads, 1, 'the first read does not wait for the period')
  assert.equal([...timers.pending.values()][0]?.ms, 3000, 'the next one is a period later')
  await timers.fire()
  await flush()
  assert.equal(reads, 2)
  stop()
  assert.equal(timers.pending.size, 0, 'stop clears the next read')
})

test('a plain poll waits one period before its first read', async () => {
  const timers = fakeTimers()
  let reads = 0
  const stop = startPoll(async () => void reads++, 3000, { timers })
  await flush()
  assert.equal(reads, 0)
  await timers.fire()
  await flush()
  assert.equal(reads, 1)
  stop()
})

test('a hidden page skips the read but keeps the loop going; a failed read does not stop it', async () => {
  const timers = fakeTimers()
  timers.hidden = true
  let reads = 0
  const stop = startPoll(
    async () => {
      reads++
      throw new Error('offline')
    },
    3000,
    { leading: true, timers }
  )
  await flush()
  assert.equal(reads, 0)
  assert.equal(timers.pending.size, 1)
  timers.hidden = false
  await timers.fire()
  await flush()
  assert.equal(reads, 1)
  assert.equal(timers.pending.size, 1, 'still polling after a failed read')
  stop()
})

test('a poll stops on a refusal that asking again cannot change, and keeps going through a passing failure', () => {
  for (const code of ['RATE_LIMITED', 'FEATURE_OFF', 'CHECKS_UNAVAILABLE', 'SOCIAL_STATS_UNAVAILABLE'])
    assert.equal(pollRefused(code), true, code)
  for (const code of ['NETWORK', 'HTTP_500', 'HTTP_502']) assert.equal(pollRefused(code), false, code)
})
