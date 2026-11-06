// The finisher's limits (spec #418, #424): a site's finisher aims at about 5 minutes and 1 US dollar, and stops starting new
// work at 8 minutes or 1.5 US dollars. Past the hard limit the run still ends cleanly: a repair already written is kept or
// undone, every fault left is logged as unrepaired with the reason `budget`, the final site check still runs, and the site is
// delivered with nothing hidden and no notice to the customer. The time is read from the clock the finisher is given, so a
// test drives it with a fake one; the cost is what the model doors report for each call.
//
// It also keeps, per stage, the time spent in it (`timings`): the sum of every call of that stage, so with pages in parallel
// the stages can add up to more than the run took.

/** The limits of a run; a caller may give any of them. `pages` is how many pages are repaired at once. */
export const FINISHER_LIMITS = Object.freeze({
  targetMs: 5 * 60_000,
  hardMs: 8 * 60_000,
  targetUsd: 1,
  hardUsd: 1.5,
  pages: 4,
  rounds: 2
})

/** The stages a run's time is kept by. */
export const STAGES = Object.freeze(['find', 'fix', 'write', 'shoot', 'judge', 'finalCheck'])

/** The reason every fault left unrepaired by a hard limit is logged with. */
export const BUDGET = 'budget'

/** A real timer that never keeps the process alive: `(fire, ms) => cancel`. */
const realTimer = (fire, ms) => {
  const handle = setTimeout(fire, ms)
  handle.unref?.()
  return () => clearTimeout(handle)
}

/**
 * @param {{ now: () => number, limits?: Partial<typeof FINISHER_LIMITS> | null,
 *   timer?: (fire: () => void, ms: number) => () => void }} input `timer` fires once the hard time limit is reached, so a
 *   model call still open then is let go (`bounded`); a test gives a fake one
 */
export function finisherBudget({ now, limits = null, timer = realTimer }) {
  const set = { ...FINISHER_LIMITS, ...limits }
  const started = now()
  let reachHard
  const hard = new Promise((resolve) => {
    reachHard = resolve
  })
  const cancelTimer = timer(() => reachHard(), set.hardMs)
  const timings = Object.fromEntries(STAGES.map((s) => [s, 0]))
  let costUsd = 0
  let stoppedBy = null
  const check = () => {
    if (stoppedBy) return stoppedBy
    if (now() - started >= set.hardMs) stoppedBy = `the hard time limit of ${set.hardMs / 1000} s was reached`
    else if (costUsd >= set.hardUsd) stoppedBy = `the hard cost limit of ${set.hardUsd} USD was reached`
    return stoppedBy
  }
  return {
    limits: set,
    /** A model call's reported cost joins the run's; the call is handed back. */
    spend(call) {
      costUsd += Number(call?.costUsd) || 0
      return call
    },
    /** Null while new work may start; once a hard limit is reached, why it may not (it stays reached). */
    stopped: check,
    /**
     * A model call that may not outlast the hard time limit: one still open when the limit is reached is let go, and
     * `{ problem, budget: true }` is answered in its place (what the late call costs is not known to the run).
     */
    bounded(call) {
      const late = hard.then(() => {
        stoppedBy ??= `the hard time limit of ${set.hardMs / 1000} s was reached`
        return {
          problem: `${BUDGET}: ${stoppedBy} while the call was open`,
          budget: true,
          costUsd: null,
          sent: []
        }
      })
      return Promise.race([call(), late])
    },
    /** Lets the timer go: the run is over. */
    close: () => cancelTimer(),
    /** Runs one piece of a stage and adds its time to that stage. */
    async timed(stage, work) {
      const from = now()
      try {
        return await work()
      } finally {
        timings[stage] += now() - from
      }
    },
    /** What the repair log keeps of the run's time and cost. */
    summary() {
      const ms = now() - started
      return {
        ms,
        costUsd,
        timings: { ...timings },
        limits: {
          targetMs: set.targetMs,
          hardMs: set.hardMs,
          targetUsd: set.targetUsd,
          hardUsd: set.hardUsd
        },
        overTarget: { time: ms > set.targetMs, cost: costUsd > set.targetUsd },
        stoppedBy
      }
    }
  }
}
