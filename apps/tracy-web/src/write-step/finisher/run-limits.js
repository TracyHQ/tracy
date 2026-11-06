// The finisher's limits (spec #418, #424): a site's finisher aims at about 5 minutes and 1 US dollar, and never runs past
// 8 minutes or spends past 1.5 US dollars on calls it starts. The limits are hard because every piece of work is bounded:
//   - time: one deadline for the whole run (`hardMs`). New work stops `finalCheckMs` before it, the slice kept for the final
//     site check; a model call still open at that point is let go; every site or host call (a write, an undo, a read, the
//     shots, a page read) is let go after `siteCallMs` or at the deadline, whichever comes first; the final check is let go
//     at the deadline. So the finisher answers by the deadline, whatever a host or a model does.
//   - cost: a model call reserves its estimated cost before it starts (the dearest call of its stage so far, else the stage's
//     `callUsd`), and is not started when what was spent plus what is reserved would pass `hardUsd`; at most `calls` model
//     calls are open at once. A call let go is counted at its estimate. So the run passes `hardUsd` only by what the calls
//     already open cost over their estimates.
// Past a limit the run still ends cleanly: a written repair is kept or undone, every fault left is logged as unrepaired with
// the reason `budget`, the final check runs in its slice, and the site is delivered with nothing hidden and no notice to the
// customer. Time is read from the clock the finisher is given, and each bound is a `timer`, so a test drives both with fakes.
// The time spent in each stage (`timings`) is the sum of its calls, so with pages in parallel the stages add up to more.

/** The limits of a run; a caller may give any of them. `pages` is how many pages run at once. */
export const FINISHER_LIMITS = Object.freeze({
  targetMs: 5 * 60_000,
  hardMs: 8 * 60_000,
  finalCheckMs: 2 * 60_000,
  siteCallMs: 60_000,
  targetUsd: 1,
  hardUsd: 1.5,
  callUsd: Object.freeze({ find: 0.05, fix: 0.02, judge: 0.05 }),
  calls: 8,
  pages: 4,
  rounds: 2
})

/** The stages a run's time is kept by. */
export const STAGES = Object.freeze(['find', 'fix', 'write', 'shoot', 'judge', 'finalCheck'])

/** The reason every fault left unrepaired by a limit starts with. */
export const BUDGET = 'budget'

/** The logged reason of work a limit stopped. */
export const budgetReason = (why) => `${BUDGET}: ${why}`

/** A real timer that never keeps the process alive: `(fire, ms) => cancel`. */
const realTimer = (fire, ms) => {
  const handle = setTimeout(fire, ms)
  handle.unref?.()
  return () => clearTimeout(handle)
}

const seconds = (ms) => `${ms / 1000} s`

/** What a call that may not start, or was let go, answers in place of the model. */
const budgetAnswer = (why) => ({ problem: budgetReason(why), budget: true, costUsd: null, sent: [] })

/**
 * @param {{ now: () => number, limits?: Partial<typeof FINISHER_LIMITS> | null,
 *   timer?: (fire: () => void, ms: number) => () => void }} input
 */
export function finisherBudget({ now, limits = null, timer = realTimer }) {
  const set = { ...FINISHER_LIMITS, ...limits, callUsd: { ...FINISHER_LIMITS.callUsd, ...limits?.callUsd } }
  const started = now()
  const workEnd = started + set.hardMs - set.finalCheckMs
  const hardEnd = started + set.hardMs
  const timings = Object.fromEntries(STAGES.map((s) => [s, 0]))
  const dearest = {}
  let costUsd = 0
  let reserved = 0
  let open = 0
  const waiting = []
  let stoppedBy = null
  const timeOut = `the time limit for repairs of ${seconds(set.hardMs - set.finalCheckMs)} was reached (${seconds(set.hardMs)} hard, ${seconds(set.finalCheckMs)} kept for the final site check)`
  const costOut = `the hard cost limit of ${set.hardUsd} USD was reached`
  const check = () => {
    if (stoppedBy) return stoppedBy
    if (now() >= workEnd) stoppedBy = timeOut
    else if (costUsd >= set.hardUsd) stoppedBy = costOut
    return stoppedBy
  }
  /** `work` raced against `ms`: `{ value }`, or `{ late: true }` once the time is up (the work is let go). */
  const within = async (work, ms, abort) => {
    if (ms <= 0) return { late: true }
    let cancel = () => {}
    const late = new Promise((resolve) => {
      cancel = timer(() => {
        abort?.abort()
        resolve({ late: true })
      }, ms)
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
  const timed = async (stage, work) => {
    const from = now()
    try {
      return await work()
    } finally {
      timings[stage] += now() - from
    }
  }
  const slot = async () => {
    while (open >= set.calls) await new Promise((resolve) => waiting.push(resolve))
    open += 1
  }
  const free = () => {
    open -= 1
    waiting.shift()?.()
  }
  return {
    limits: set,
    /** Null while new work may start; once a limit is reached, why it may not (it stays reached). */
    stopped: check,
    /**
     * One model call of a stage: not started past a limit or when its estimate does not fit the cost left, let go when new
     * work stops, counted at its reported cost (at its estimate when let go). Answers the call's answer, or a budget answer.
     */
    async ask(stage, call) {
      await slot()
      try {
        if (check()) return budgetAnswer(stoppedBy)
        const estimate = dearest[stage] ?? set.callUsd[stage] ?? 0
        // A call whose estimate does not fit is not started; others that fit (a cheaper stage) still may.
        if (costUsd + reserved + estimate > set.hardUsd)
          return budgetAnswer(
            `${stage} call estimated at ${estimate} USD does not fit in what is left of the hard cost limit of ${set.hardUsd} USD`
          )
        reserved += estimate
        const answered = await timed(stage, () => within(call, workEnd - now())).finally(() => {
          reserved -= estimate
        })
        if (answered.late) {
          costUsd += estimate
          stoppedBy ??= timeOut
          return budgetAnswer(`${stoppedBy} while the call was open`)
        }
        const cost = Number(answered.value?.costUsd) || 0
        costUsd += cost
        dearest[stage] = Math.max(dearest[stage] ?? 0, cost)
        return answered.value
      } finally {
        free()
      }
    },
    /**
     * One site or host call, let go after `siteCallMs` or at the run's deadline: its answer, or a thrown error that says it
     * did not answer in time. `whole` bounds it by the deadline only (the shots of every page, the final site check).
     * `abort` (an AbortController) is aborted when it is let go.
     */
    async site(call, { whole = false, abort = null } = {}) {
      const left = hardEnd - now()
      const ms = whole ? left : Math.min(set.siteCallMs, left)
      const answered = await within(call, ms, abort)
      if (!answered.late) return answered.value
      throw new Error(
        ms <= 0
          ? `no time was left before the hard limit of ${seconds(set.hardMs)}`
          : `the call did not answer within ${seconds(ms)}`
      )
    },
    /** How long until new work stops, for a wait that must end by then (the first site check). */
    workLeft: () => workEnd - now(),
    within,
    timed,
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
          finalCheckMs: set.finalCheckMs,
          targetUsd: set.targetUsd,
          hardUsd: set.hardUsd
        },
        overTarget: { time: ms > set.targetMs, cost: costUsd > set.targetUsd },
        stoppedBy
      }
    }
  }
}
