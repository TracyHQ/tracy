// The limits of step 9b, the repair pass through Tracy's site agent (#448): the one place their numbers live.
//   - `stopNewWorkMs`: from the start of the pass, no new page turn and no resend round starts after it.
//   - `returnByMs`: the pass hands the site over by then, whatever the agent or the site check does; `undoReserveMs` of it is
//     kept for undoing turns after the last site check.
//   - `noTurnMs`: a prompt that opened no turn by then is resent once; a resend that opened none by then is dropped.
//   - `pollMs`: how often the turn records are read while a turn is awaited.
//   - `itemsPerTurn`: the most faults one page turn carries (the comment requests door takes 20 a minute per site).
//   - `finderMs`: the finder's whole look at the kept pages, run beside the first site check, before the pass starts.
export const REPAIR_LIMITS = Object.freeze({
  stopNewWorkMs: 10 * 60_000,
  returnByMs: 12 * 60_000,
  undoReserveMs: 30_000,
  noTurnMs: 60_000,
  pollMs: 5_000,
  itemsPerTurn: 12,
  finderMs: 5 * 60_000
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
    }
  }
}
