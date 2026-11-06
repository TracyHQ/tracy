// The repairs of one page in one round (spec #418, #424), all of them together: the fixer is asked for an order per fault
// (side by side), code checks each order (repair-orders.js), every valid order is written (one write at a time per place on
// the site, work-pool.js), the page is judged ONCE for all of them (batch-judge.js), and each repair is still kept or undone
// on its own, by its own apply id.
//
// One repair per place a round: a second fault on a slot or block already being repaired on this page waits for the next
// round (`deferred`), so no order is checked against words another repair is about to change. Past a hard limit
// (run-limits.js) no fixer is asked and no write starts: the fault is logged as unrepaired, reason `budget`.
import { judgePage } from './batch-judge.js'
import { askFixer } from './finisher-roles.js'
import { causeOf, logRecord } from './repair-log.js'
import { stepsOf, validOrder } from './repair-orders.js'
import { fixerSources } from './repair-facts.js'
import { readSite } from './repair-write.js'
import { BUDGET } from './run-limits.js'

/** Where a fault is, as far as the finder or the site check named it. */
const spotOf = (fault) => (fault.slot ? `slot ${fault.slot}` : fault.block ? `block ${fault.block}` : null)
/** Where a valid order writes. */
const targetOf = (order, valid) =>
  order.kind === 'style-block' ? `block ${valid.block}` : `slot ${valid.slot}`

/** A fault left unrepaired: by a hard limit, or by the last round. */
export const unrepaired = (run, fault, reason) =>
  logRecord(fault, { ...causeOf(run.firstCheck, fault), outcome: 'unrepaired', reason })

/** The fixer's order for one fault, checked by code: `{ repair }` to write, or `{ record }` that says why not. */
async function proposed(run, fault, site) {
  const stopped = run.budget.stopped()
  if (stopped) return { record: unrepaired(run, fault, `${BUDGET}: ${stopped}`) }
  const number = run.nextNumber()
  const cause = causeOf(run.firstCheck, fault)
  const asked = run.budget.spend(
    await run.budget.timed('fix', () =>
      askFixer(
        run.doors.fixer,
        fault,
        site.current.get(run.lineOf(fault.slot)?.key),
        fixerSources(run.orderFacts, fault)
      )
    )
  )
  await run.replies.keep({
    name: `fixer-r${number}`,
    role: 'fixer',
    page: fault.page,
    repair: number,
    door: run.doors.fixer,
    sent: asked.sent,
    images: [],
    call: asked
  })
  if (asked.problem)
    return {
      record: logRecord(fault, { ...cause, outcome: 'failed', reason: `the fixer: ${asked.problem}` })
    }
  const order = asked.answer
  const valid = await validOrder(order, {
    ...run.orderFacts,
    site,
    door: run.door,
    siteKey: run.siteKey,
    fault,
    kitSlots: run.kitSlots,
    pageSlots: run.pageSlots,
    keyOf: (slot) => run.lineOf(slot)?.key ?? null,
    currentOf: (key) => site.current.get(key)
  })
  // A repair is logged on the slot it is about, the one the finder named or the one the order was tied to.
  const onSlot = { ...fault, slot: fault.slot ?? (valid.ok ? valid.slot : null) }
  const known = { ...(fault.slot ? cause : causeOf(run.firstCheck, onSlot)), order }
  if (!valid.ok) return { record: logRecord(onSlot, { ...known, outcome: 'dropped', reason: valid.reason }) }
  if ((fault.tried ?? []).includes(JSON.stringify(order)))
    return {
      record: logRecord(onSlot, {
        ...known,
        outcome: 'dropped',
        reason: 'the same order was written and undone in the round before'
      })
    }
  const steps = stepsOf(order.kind)
  const repair = { run, fault, order, valid, site, number, steps, onSlot, known }
  return { repair: { ...repair, ...steps.judgeBy(repair) } }
}

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
  const orders = await Promise.all(active.map((fault) => proposed(run, fault, site)))
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
