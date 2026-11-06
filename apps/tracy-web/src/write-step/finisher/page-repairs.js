// The repairs of one page in one round (spec #418, #424), all of them together: the fixer is asked for an order per fault
// (side by side), code checks each order (repair-orders.js), every valid order is written (one write at a time per place on
// the site, work-pool.js), the page is judged ONCE for all of them (batch-judge.js), and each repair is still kept or undone
// on its own, by its own apply id.
//
// One repair per place a round: a second fault on a slot or block already being repaired on this page waits for the next
// round (`deferred`). Pages run side by side and some places are shared (a header or footer slot on every page): a place
// another page's repair holds is not written again (`run.claimed`), and a words repair checks inside the lock that the slot
// still holds the words its order was checked against (repair-steps.js). Judging that throws proves nothing: every repair
// it was judging is undone and logged. Past a limit (run-limits.js) no fixer is asked and no write starts: the fault is
// logged as unrepaired, reason `budget`.
import { judgePage } from './batch-judge.js'
import { orderForFault } from './fixer-order.js'
import { logRecord, unrepairedRecord } from './repair-log.js'
import { readSite } from './repair-write.js'
import { budgetReason } from './run-limits.js'

/** Where a fault is, as far as the finder or the site check named it. */
const spotOf = (fault) => (fault.slot ? `slot ${fault.slot}` : fault.block ? `block ${fault.block}` : null)

/** Writes one valid repair inside its place's lock, unless another page's repair holds its target. */
async function writeHeld(run, page, r) {
  const target = r.steps.target(r)
  return run.locks.hold(r.steps.place(r), async () => {
    const holder = run.claimed.get(target)
    if (holder && holder.page !== page)
      return {
        ok: false,
        skipped: `repair ${holder.number} from ${holder.page ?? 'the site'} holds ${target} already`
      }
    const wrote = await r.steps.write(r)
    if (wrote.ok) run.claimed.set(target, { page, number: r.number })
    return wrote
  })
}

/** Takes a written repair back in its place's lock, and lets go of its target. */
export async function undoHeld(run, r) {
  const undone = await run.locks.hold(r.steps.place(r), () => r.steps.undo(r))
  const target = r.steps.target(r)
  if (undone.ok && run.claimed.get(target)?.number === r.number) run.claimed.delete(target)
  return undone
}

/** The written repair kept or undone on its verdict. */
async function keepOrUndo(run, r, verdict) {
  const { reason, crops, checkedBy, proven } = verdict
  const fields = {
    ...r.logFields,
    ...r.steps.logFields(r),
    applyId: r.wrote.applyId,
    checkedBy,
    ...(crops ? { crops: crops.files } : {})
  }
  if (verdict.verdict === 'better' && proven) {
    const record = logRecord(r.onSlot, { ...fields, outcome: 'kept', reason })
    return { record, kept: { record, repair: r, line: r.steps.kept(r) } }
  }
  const why = proven ? reason : (verdict.unproven ?? 'the repaired page could not be shot again')
  const undone = await undoHeld(run, r)
  return {
    record: logRecord(r.onSlot, {
      ...fields,
      outcome: undone.ok ? 'undone' : 'failed',
      reason: undone.ok ? why : `${why}; the revert failed: ${undone.reason}`
    })
  }
}

/** Every repair of the page judged, or, when judging throws, none proven. */
async function verdictsOf(run, page, written, shots, round) {
  try {
    return await judgePage(run, page, written, shots, round)
  } catch (error) {
    const unproven = `the repair could not be judged (${String(error?.message ?? error).slice(0, 160)}), so it is not proven`
    return new Map(
      written.map((r) => [r.number, { verdict: 'not better', proven: false, unproven, checkedBy: null }])
    )
  }
}

/**
 * @param {object} run the finisher's run (finisher.js)
 * @param {string | null} page
 * @param {object[]} faults the page's faults this round
 * @param {object} shots the page's shots the faults were found on
 * @param {number} round
 * @returns {Promise<{ records: object[], kept: object[], deferred: object[], rejected: object[] }>} `rejected`: the faults
 *   whose repair was written and undone, each with the order tried, for the next round
 */
export async function repairPage(run, page, faults, shots, round) {
  const records = []
  const kept = []
  const deferred = []
  const rejected = []
  const taken = new Set()
  const active = []
  for (const fault of faults) {
    const spot = spotOf(fault)
    if (spot && taken.has(spot)) deferred.push(fault)
    else {
      if (spot) taken.add(spot)
      active.push(fault)
    }
  }
  if (!active.length) return { records, kept, deferred, rejected }
  const stopped = run.budget.stopped()
  if (stopped) {
    for (const fault of [...active, ...deferred])
      records.push(unrepairedRecord(run.firstCheck, fault, budgetReason(stopped)))
    return { records, kept, deferred: [], rejected }
  }
  let site
  try {
    site = await readSite(run.door, run.siteKey)
  } catch (error) {
    const reason = String(error?.message ?? error)
    for (const fault of active) records.push(logRecord(fault, { outcome: 'failed', reason }))
    return { records, kept, deferred, rejected }
  }
  // The page as served now, read once for the menus of all its faults; unread, the menus list no CSS targets.
  const html = run.pageHtml && page ? await run.pageHtml(page).catch(() => null) : null
  const orders = await Promise.all(active.map((fault) => orderForFault(run, fault, site, html)))
  const writing = []
  const targets = new Set()
  for (const [index, o] of orders.entries()) {
    if (o.record) records.push(o.record)
    else if (targets.has(o.repair.steps.target(o.repair))) deferred.push(active[index])
    else {
      targets.add(o.repair.steps.target(o.repair))
      writing.push(o.repair)
    }
  }
  const written = []
  for (const r of writing) {
    const stopped = run.budget.stopped()
    if (stopped) {
      records.push(unrepairedRecord(run.firstCheck, r.onSlot, budgetReason(stopped)))
      continue
    }
    const wrote = await run.budget.timed('write', () => writeHeld(run, page, r))
    if (wrote.ok) written.push({ ...r, wrote })
    else
      records.push(
        logRecord(r.onSlot, {
          ...r.logFields,
          outcome: wrote.skipped || wrote.stale ? 'dropped' : 'failed',
          reason: wrote.skipped ?? (wrote.stale ? wrote.reason : `the site refused it: ${wrote.reason}`)
        })
      )
  }
  if (!written.length) return { records, kept, deferred, rejected }
  const verdicts = await verdictsOf(run, page, written, shots, round)
  for (const r of written) {
    const outcome = await keepOrUndo(run, r, verdicts.get(r.number))
    records.push(outcome.record)
    if (outcome.kept) kept.push(outcome.kept)
    if (outcome.record.outcome === 'undone')
      rejected.push({ ...r.fault, tried: [...(r.fault.tried ?? []), JSON.stringify(r.order)] })
  }
  return { records, kept, deferred, rejected }
}
