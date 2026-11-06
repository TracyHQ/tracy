// The repairs of one page in one round (spec #418, #424), all of them together: the fixer is asked for an order per fault
// (side by side), code checks each order (repair-orders.js), every valid order is written (one write at a time per place on
// the site, work-pool.js), the page is judged ONCE for all of them (batch-judge.js), and each repair is still kept or undone
// on its own, by its own apply id.
//
// One repair per place a round: a second fault on a slot or block already being repaired on this page waits for the next
// round (`deferred`), so no order is checked against words another repair is about to change. Past a hard limit
// (run-limits.js) no fixer is asked and no write starts: the fault is logged as unrepaired, reason `budget`.
import { judgePage } from './batch-judge.js'
import { proposed, unrepaired } from './fixer-order.js'
import { logRecord } from './repair-log.js'
import { readSite } from './repair-write.js'
import { BUDGET } from './run-limits.js'

export { unrepaired }

/** Where a fault is, as far as the finder or the site check named it. */
const spotOf = (fault) => (fault.slot ? `slot ${fault.slot}` : fault.block ? `block ${fault.block}` : null)
/** Where a valid order writes. */
const targetOf = (order, valid) =>
  order.kind === 'style-block' ? `block ${valid.block}` : `slot ${valid.slot}`

/** The written repair kept or undone on its verdict. */
async function settled(run, r, verdict) {
  const { steps } = r
  const { reason, crops, checkedBy, proven } = verdict
  const shown = {
    ...r.known,
    ...steps.shown(r),
    applyId: r.wrote.applyId,
    checkedBy,
    ...(crops ? { crops: crops.files } : {})
  }
  if (verdict.verdict === 'better' && proven) {
    const record = logRecord(r.onSlot, { ...shown, outcome: 'kept', reason })
    return { record, kept: { record, repair: r, line: steps.kept(r) } }
  }
  const why = proven ? reason : 'the repaired page could not be shot again'
  const undone = await run.locks.hold(steps.place(r), () => steps.undo(r))
  return {
    record: logRecord(r.onSlot, {
      ...shown,
      outcome: undone.ok ? 'undone' : 'failed',
      reason: undone.ok ? why : `${why}; the revert failed: ${undone.reason}`
    })
  }
}

/**
 * @param {object} run the finisher's run (finisher.js)
 * @param {string} page
 * @param {object[]} faults the page's faults this round
 * @param {object} shots the page's shots the faults were found on
 * @param {number} round
 * @returns {Promise<{ records: object[], kept: object[], deferred: object[], undone: object[] }>} `undone`: the faults whose
 *   repair was undone, each with the order tried, for the next round
 */
export async function repairPage(run, page, faults, shots, round) {
  const records = []
  const kept = []
  const deferred = []
  const undone = []
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
  if (!active.length) return { records, kept, deferred, undone }
  const site = await readSite(run.door, run.siteKey)
  // The page as served now, read once for the menus of all its faults; unread, the menus list no CSS targets.
  const html = run.pageHtml && page ? await run.pageHtml(page).catch(() => null) : null
  const orders = await Promise.all(active.map((fault) => proposed(run, fault, site, html)))
  const writing = []
  const targets = new Set()
  for (const [index, o] of orders.entries()) {
    if (o.record) records.push(o.record)
    else if (targets.has(targetOf(o.repair.order, o.repair.valid))) deferred.push(active[index])
    else {
      targets.add(targetOf(o.repair.order, o.repair.valid))
      writing.push(o.repair)
    }
  }
  const written = []
  for (const r of writing) {
    const stopped = run.budget.stopped()
    if (stopped) {
      records.push(unrepaired(run, r.onSlot, `${BUDGET}: ${stopped}`))
      continue
    }
    const wrote = await run.budget.timed('write', () =>
      run.locks.hold(r.steps.place(r), () => r.steps.write(r))
    )
    if (wrote.ok) written.push({ ...r, wrote })
    else
      records.push(
        logRecord(r.onSlot, { ...r.known, outcome: 'failed', reason: `the site refused it: ${wrote.reason}` })
      )
  }
  if (!written.length) return { records, kept, deferred, undone }
  const verdicts = await judgePage(run, page, written, shots, round)
  for (const r of written) {
    const done = await settled(run, r, verdicts.get(r.number))
    records.push(done.record)
    if (done.kept) kept.push(done.kept)
    if (done.record.outcome === 'undone')
      undone.push({ ...r.fault, tried: [...(r.fault.tried ?? []), JSON.stringify(r.order)] })
  }
  return { records, kept, deferred, undone }
}
