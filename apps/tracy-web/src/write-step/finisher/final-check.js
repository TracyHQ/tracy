// The finisher's last stage (spec #418, #424): the site check runs a final time on the write report with the kept repairs'
// words in it. A kept repair that the final check blames for a blocking failure the first check did not have (on its slot,
// on its block, or on its page when the failure names no slot) is undone, its record says why, and the check runs once more
// so the build keeps the check of the site as it is delivered. It runs even past a hard limit: the build needs it.
import { newBlockingFailures } from './repair-log.js'

/** The write report with the kept repairs' words as ordered, which the final site check measures. */
export const repairedReport = (report, kept) => {
  const bySlot = new Map(kept.filter((k) => k.line).map((k) => [k.line.slot, k.line]))
  return {
    ...report,
    slots: report.slots.map((line) => {
      const repaired = bySlot.get(line.slot)
      return repaired ? { ...line, ordered: repaired.ordered, repairedBy: repaired.applyId } : line
    })
  }
}

const blockOf = (slot) => (slot ? String(slot).replace(/\.[^.]*$/, '') : null)

/** Whether a new blocking failure falls on what a kept repair changed. */
const blames = (k, f) =>
  f.slot
    ? k.record.slot === f.slot || (k.repair.valid.block != null && k.repair.valid.block === blockOf(f.slot))
    : Boolean(f.page) && k.record.page === f.page

/**
 * @param {object} run the finisher's run (finisher.js)
 * @param {{ report: object, kept: object[], firstCheck: object | null, siteCheck: (report: object) => Promise<object> }} input
 * @returns {Promise<{ report: object, check: object, undone: number }>}
 */
export async function finalCheck(run, { report, kept, firstCheck, siteCheck }) {
  const check = await run.budget.timed('finalCheck', () => siteCheck(repairedReport(report, kept)))
  const gained = newBlockingFailures(firstCheck, check)
  const blamed = kept.filter((k) => gained.some((f) => blames(k, f)))
  if (!blamed.length) return { report: repairedReport(report, kept), check, undone: 0 }
  let undone = 0
  for (const k of blamed) {
    const { steps } = k.repair
    const failure = gained.find((f) => blames(k, f))
    const why = `the final site check gained a blocking failure here (${failure.group}${failure.slot ? ` on ${failure.slot}` : ''})`
    const done = await run.locks.hold(steps.place(k.repair), () => steps.undo(k.repair))
    if (done.ok) undone += 1
    Object.assign(
      k.record,
      done.ok
        ? { outcome: 'undone', reason: why }
        : { outcome: 'failed', reason: `${why}; the revert failed: ${done.reason}` }
    )
  }
  // A repair whose undo failed is still on the site, so its words stay in the report.
  const left = kept.filter((k) => k.record.outcome !== 'undone')
  const repaired = repairedReport(report, left)
  const again = await run.budget.timed('finalCheck', () => siteCheck(repaired))
  return { report: repaired, check: again, undone }
}
