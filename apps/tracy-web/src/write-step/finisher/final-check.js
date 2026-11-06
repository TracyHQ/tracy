// The finisher's last stage (spec #418, #424): the site check runs a final time on the write report with the kept repairs'
// words in it. A kept repair is blamed for a blocking failure the first check did not have only when the failure falls on
// what the repair changed: its slot, or its block. A new failure that names no slot or block is logged (`unblamed`), and no
// repair is undone for it. A blamed repair is undone, its record replaced by one that says why, and the check runs once
// more, so the build keeps the check of the site as it is delivered; that second check is compared with the first again,
// and any blocking failure it still gains is logged (`leftAfterUndo`). The checks run in the slice of time kept for them,
// even past a limit on repairs: a check that does not end by the run's deadline gives no final check, and the log says so.
import { undoHeld } from './page-repairs.js'
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

/** Whether a new blocking failure falls on what a kept repair changed: its slot, or its block. */
const blames = (k, f) => {
  const block = f.block ?? blockOf(f.slot)
  if (f.slot && k.record.slot === f.slot) return true
  return block != null && k.repair.valid.block != null && k.repair.valid.block === block
}

/** The site check bounded by the run's deadline: the check, or null and why it gave none. */
async function boundedCheck(run, siteCheck, report) {
  try {
    return {
      check: await run.budget.timed('finalCheck', () =>
        run.budget.site(() => siteCheck(report), { whole: true })
      )
    }
  } catch (error) {
    return {
      check: null,
      missing: `the final site check did not end in time: ${String(error?.message ?? error)}`
    }
  }
}

/**
 * @param {object} run the finisher's run (finisher.js)
 * @param {{ report: object, kept: object[], firstCheck: object | null, siteCheck: (report: object) => Promise<object> }} input
 * @returns {Promise<{ report: object, check: object | null, undone: number, replaced: Map<object, object>,
 *   unblamed: object[], leftAfterUndo: object[], missing: string | null }>} `replaced`: each blamed repair's record and
 *   the record that takes its place
 */
export async function finalCheck(run, { report, kept, firstCheck, siteCheck }) {
  const replaced = new Map()
  const first = await boundedCheck(run, siteCheck, repairedReport(report, kept))
  const none = { undone: 0, replaced, unblamed: [], leftAfterUndo: [] }
  if (!first.check)
    return { ...none, report: repairedReport(report, kept), check: null, missing: first.missing }
  const gained = newBlockingFailures(firstCheck, first.check)
  const unblamed = gained.filter((f) => !kept.some((k) => blames(k, f)))
  const blamed = kept.filter((k) => gained.some((f) => blames(k, f)))
  if (!blamed.length)
    return { ...none, report: repairedReport(report, kept), check: first.check, unblamed, missing: null }
  let undone = 0
  for (const k of blamed) {
    const failure = gained.find((f) => blames(k, f))
    const why = `the final site check gained a blocking failure here (${failure.group}${failure.slot ? ` on ${failure.slot}` : ''})`
    const done = await undoHeld(run, k.repair)
    if (done.ok) undone += 1
    replaced.set(k.record, {
      ...k.record,
      ...(done.ok
        ? { outcome: 'undone', reason: why }
        : { outcome: 'failed', reason: `${why}; the revert failed: ${done.reason}` })
    })
  }
  // A repair whose undo failed is still on the site, so its words stay in the report.
  const left = kept.filter((k) => replaced.get(k.record)?.outcome !== 'undone')
  const repaired = repairedReport(report, left)
  const again = await boundedCheck(run, siteCheck, repaired)
  if (!again.check)
    return {
      report: repaired,
      check: first.check,
      undone,
      replaced,
      unblamed,
      leftAfterUndo: [],
      missing: again.missing
    }
  return {
    report: repaired,
    check: again.check,
    undone,
    replaced,
    unblamed,
    leftAfterUndo: newBlockingFailures(firstCheck, again.check),
    missing: null
  }
}
