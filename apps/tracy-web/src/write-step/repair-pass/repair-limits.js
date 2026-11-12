// The limits of step 9b, the repair pass through Tracy's site agent (#448): the one place their numbers live. One clock
// runs them for the whole of step 9 after the write: the first site check spends it too.
//   - `stopNewWorkMs`: from the end of the write, no new page turn and no resend round starts after it.
//   - `returnByMs`: the step hands the site over by then, whatever the agent or the site check does; `undoReserveMs` of it
//     is kept for undoing turns after the last site check, and `judgeReserveMs` more for that last check, so a turn still
//     open is waited for only until both are left.
//   - `noTurnMs`: a prompt that opened no turn by then is resent once; a resend that opened none by then is dropped.
//   - `pollMs`: how often the turn records are read while a turn is awaited.
//   - `itemsPerTurn`: the most faults one page turn carries.
//   - `itemsPerMinute`: the comment requests door's own budget, items a minute per site (sites/comments.js
//     MAX_REQUESTS_PER_MINUTE): a request waits while that many were asked in the last minute.
//   - `turnsAtOnce`: page turns in flight at once, each page in a session of its own.
//   - `cancelSettleMs`: after a turn still open at the limit is cancelled, how long its record is read until it ends.
//   - `judgeGatherMs`: how long the check after the turns waits for other turns ending at the same moment, to read them
//     in one check.
import { REPAIR_WINDOWS } from '../../lib/repair-windows.js'

export const REPAIR_LIMITS = Object.freeze({
  ...REPAIR_WINDOWS,
  undoReserveMs: 30_000,
  judgeReserveMs: 60_000,
  noTurnMs: 60_000,
  // A native question can leave a turn open with no person present to answer it.
  // The chain's two-hour preparation window must not become one repair turn's wait.
  turnMs: 10 * 60_000,
  pollMs: 5_000,
  itemsPerTurn: 12,
  itemsPerMinute: 20,
  // Native file moments belong to the whole site. Overlapping page turns cannot be undone independently.
  turnsAtOnce: 1,
  cancelSettleMs: 20_000,
  judgeGatherMs: 1_000
})

/** A real timer that never keeps the process alive: `(fire, ms) => cancel`. */
const realTimer = (fire, ms) => {
  const handle = setTimeout(fire, ms)
  handle.unref?.()
  return () => clearTimeout(handle)
}

/**
 * The pass's clock: when new work stops, how long is left, and `within`, which races work against a deadline.
 * @param {{ now: () => number, sleep: (ms: number) => Promise<void>, limits?: Partial<typeof REPAIR_LIMITS> | null,
 *   timer?: (fire: () => void, ms: number) => () => void }} input
 */
export function repairClock({ now, sleep, limits = null, timer = realTimer }) {
  const set = { ...REPAIR_LIMITS, ...limits }
  const started = now()
  const stopAt = started + set.stopNewWorkMs
  const returnAt = started + set.returnByMs
  return {
    limits: set,
    now,
    sleep,
    started,
    /** Whether new work may no longer start. */
    stopped: () => now() >= stopAt,
    /** Time left before new work stops. */
    workLeft: () => stopAt - now(),
    /** Time left before the pass must return, less the slice kept for undoing turns. */
    checkLeft: () => returnAt - set.undoReserveMs - now(),
    /** Time left before the pass must return. */
    returnLeft: () => returnAt - now(),
    /** Time left to wait for an open turn: the return, less the last check's and the undos' slices. */
    waitLeft: () => returnAt - set.undoReserveMs - set.judgeReserveMs - now(),
    elapsed: () => now() - started,
    /** `work()` raced against `ms`: `{ value }`, or `{ late: true }` once the time is up. */
    async within(work, ms) {
      if (ms <= 0) return { late: true }
      let cancel = () => {}
      const late = new Promise((resolve) => {
        cancel = timer(() => resolve({ late: true }), ms)
      })
      try {
        return await Promise.race([
          Promise.resolve()
            .then(work)
            .then((value) => ({ value })),
          late
        ])
      } finally {
        cancel()
      }
    },
    /** `work()` within `ms` (by default all the time left), or an error naming `what` once the time is up. */
    async bounded(what, work, ms = returnAt - now()) {
      const done = await this.within(work, ms)
      if (done.late) throw new Error(`${what} did not answer in the time left`)
      return done.value
    }
  }
}

const MINUTE = 60_000

/**
 * The comment requests door's budget, kept by the pass: `take(n)` waits while `itemsPerMinute` items were asked in the
 * last minute (the door refuses a request then), and answers false when the wait would pass the time new work stops.
 * Requests of pages running side by side share it.
 */
export function itemsGate(clock) {
  const asked = []
  let queue = Promise.resolve()
  const take = async (n) => {
    for (;;) {
      while (asked.length && asked[0].at <= clock.now() - MINUTE) asked.shift()
      const lately = asked.reduce((sum, a) => sum + a.n, 0)
      if (lately < clock.limits.itemsPerMinute) {
        asked.push({ at: clock.now(), n })
        return true
      }
      const wait = asked[0].at + MINUTE - clock.now()
      if (wait >= clock.workLeft()) return false
      await clock.sleep(Math.max(1, wait))
    }
  }
  return {
    // One request at a time through the gate, so two pages never both see room for themselves.
    take: (n) => {
      const turn = queue.then(() => take(n))
      queue = turn.catch(() => {})
      return turn
    }
  }
}
