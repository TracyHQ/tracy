// One call to the site agent may take at most `callMs` (repair-limits.js), never all the time left: a turn records read
// that never answered used to take the whole repair window, so no other page was sent and no turn could be undone.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { REPAIR_LIMITS, repairClock } from '../src/write-step/repair-pass/repair-limits.js'

/** A clock on a fake timer: each `within` deadline is recorded and fires at once, as a call that never answers. */
function fakeClock(at, limits = null) {
  const deadlines = []
  let t = at
  const clock = repairClock({
    now: () => t,
    sleep: async () => {},
    limits,
    timer: (fire, ms) => {
      deadlines.push(ms)
      queueMicrotask(fire)
      return () => {}
    }
  })
  return { clock, deadlines, advance: (ms) => (t += ms) }
}
const never = () => new Promise(() => {})

test('a call that never answers is cut at callMs, two minutes, not at the end of the repair window', async () => {
  const { clock, deadlines } = fakeClock(0)
  await assert.rejects(
    clock.bounded('the site turn records', never),
    /the site turn records did not answer in the time left/
  )
  assert.deepEqual(deadlines, [REPAIR_LIMITS.callMs])
  assert.ok(REPAIR_LIMITS.returnByMs > REPAIR_LIMITS.callMs)
})

test('near the return, a call gets only the time left, and an explicit limit is kept', async () => {
  const { clock, deadlines, advance } = fakeClock(0)
  advance(REPAIR_LIMITS.returnByMs - 30_000)
  await assert.rejects(clock.bounded('the turn undo door', never))
  assert.deepEqual(deadlines, [30_000])
  const fresh = fakeClock(0)
  await assert.rejects(fresh.clock.bounded('the session cancel', never, 5_000))
  assert.deepEqual(fresh.deadlines, [5_000])
  // A call that answers in time gives its value.
  const real = repairClock({ now: () => 0, sleep: async () => {}, limits: { callMs: 60_000 } })
  assert.equal(await real.bounded('a quick read', async () => 'records'), 'records')
})
