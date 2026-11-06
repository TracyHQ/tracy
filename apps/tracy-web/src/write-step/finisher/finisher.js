// The finisher of the write step (spec #418): after the write, it looks at the written site, finds customer-visible faults of
// the closed list, repairs them through the write step's own door, proves each repair, and undoes one that does not help.
// This is the ONE entry point: the step 9 bench's `finish` (on a site already written) calls it today, and the live step 9
// path calls it after the write (#424). It reaches the site only through the site door, the screenshots only through
// `capture`, the site check only through `siteCheck`, and files only through `saveFile`, so tests give fakes for all four.
//
// Order: refuse unless every door can do its role; shoot every page of the kit; ask the finder per page; for each fault
// ask the fixer for one order, let code check it (repair-orders.js) and write it with its own apply id; re-shoot the page
// and ask the checker on the before and after crops; keep, or revert by apply id; run the site check a final time on the
// report with the kept repairs in it; write the repair log. Rounds, limits and per-page parallel repairs come with #424.
import { shootPages } from '../../lib/page-shots.js'
import { kitSlotIds } from '../kit-slot-ids.js'
import { doorsRefusal } from './finisher-doors.js'
import { askChecker, askFinder, askFixer, verdictOf } from './finisher-roles.js'
import { heldFaults } from './fault-kinds.js'
import { causingStepOf, logRecord, REPAIR_LOG_FILE, repairLog } from './repair-log.js'
import { readSite, revertRepair, writeRepair } from './repair-write.js'
import { validOrder } from './repair-orders.js'
import { cropsOf } from './repair-crops.js'

const kitPages = (kit) =>
  (kit?.pages ?? []).map((p) => p?.path).filter((p) => typeof p === 'string' && p.startsWith('/'))

/**
 * @param {{ door: { apply: Function }, siteKey: string, kit: object, report: object, firstCheck: object | null,
 *   doors: Record<'finder' | 'fixer' | 'checker', object>, capture: Function,
 *   siteCheck: (report: object) => Promise<object>, saveFile: (name: string, data: string | Buffer) => Promise<void>,
 *   now?: () => number }} input `kit` is the template kit's document; `report` the write report of the run
 * @returns {Promise<{ ok: false, code: string, reason: string } | { ok: true, report: object, log: object, finalCheck: object }>}
 *   `report` is the write report with the kept repairs' words as ordered, and the final check is the one to keep
 */
export async function runFinisher(input) {
  const {
    door,
    siteKey,
    kit,
    report,
    firstCheck,
    doors,
    capture,
    siteCheck,
    saveFile,
    now = Date.now
  } = input
  const refused = doorsRefusal(doors)
  if (refused) return { ok: false, ...refused }
  const started = now()
  let costUsd = 0
  const spend = (call) => {
    costUsd += call.costUsd ?? 0
    return call
  }
  const { shots, unshot } = await shootPages({ capture, pages: kitPages(kit) })
  const pages = [...new Set(shots.map((s) => s.page))]
  const found = await Promise.all(
    pages.map(async (page) => {
      const shown = shots.filter((s) => s.page === page)
      const call = spend(await askFinder(doors.finder, page, shown))
      return {
        page,
        ...(call.problem
          ? { faults: [], loggedOnly: [], problem: call.problem }
          : heldFaults(call.answer, shown))
      }
    })
  )
  // A page the finder could not look at is named, never counted as clean.
  const records = found.flatMap((f) => [
    ...(f.problem
      ? [logRecord({ page: f.page, kind: null }, { outcome: 'failed', reason: `the finder: ${f.problem}` })]
      : []),
    ...f.loggedOnly.map((fault) => logRecord(fault, { reason: 'the kind is outside the fault list' }))
  ])
  const kitSlots = kitSlotIds(kit)
  const lines = new Map(report.slots.filter((l) => l.status === 'written' && l.key).map((l) => [l.slot, l]))
  const kept = new Map()
  let n = 0
  for (const fault of found.flatMap((f) => f.faults)) {
    n += 1
    const base = { causingStep: causingStepOf(firstCheck, fault.slot) }
    const site = await readSite(door, siteKey)
    const asked = spend(await askFixer(doors.fixer, fault, site.current.get(lines.get(fault.slot)?.key)))
    if (asked.problem) {
      records.push(logRecord(fault, { ...base, outcome: 'failed', reason: `the fixer: ${asked.problem}` }))
      continue
    }
    const order = asked.answer
    const valid = validOrder(order, {
      fault,
      kitSlots,
      keyOf: (slot) => lines.get(slot)?.key ?? null,
      currentOf: (key) => site.current.get(key)
    })
    if (!valid.ok) {
      records.push(logRecord(fault, { ...base, order, outcome: 'dropped', reason: valid.reason }))
      continue
    }
    const wrote = await writeRepair({
      door,
      siteKey,
      revision: site.revision,
      changes: valid.changes,
      repair: n
    })
    if (!wrote.ok) {
      records.push(
        logRecord(fault, {
          ...base,
          order,
          outcome: 'failed',
          reason: `the site refused it: ${wrote.reason}`
        })
      )
      continue
    }
    const after = await shootPages({ capture, pages: [fault.page] })
    const crops = await cropsOf({ fault, before: shots, after: after.shots, name: `r${n}`, saveFile })
    const judged = spend(await askChecker(doors.checker, fault, crops.beforeShots, crops.afterShots))
    const { verdict, reason } = judged.problem
      ? { verdict: 'not better', reason: `the checker: ${judged.problem}` }
      : verdictOf(judged.answer)
    const record = { ...base, order, applyId: wrote.applyId, crops: crops.files }
    if (verdict === 'better' && crops.afterShots.length) {
      kept.set(valid.slot, { ordered: order.text, applyId: wrote.applyId })
      records.push(logRecord(fault, { ...record, outcome: 'kept', reason }))
      continue
    }
    const why = crops.afterShots.length ? reason : 'the repaired page could not be shot again'
    const undone = await revertRepair({ door, siteKey, applyId: wrote.applyId })
    records.push(
      logRecord(fault, {
        ...record,
        outcome: undone.ok ? 'undone' : 'failed',
        reason: undone.ok ? why : `${why}; the revert failed: ${undone.reason}`
      })
    )
  }
  const repaired = {
    ...report,
    slots: report.slots.map((l) =>
      kept.has(l.slot) ? { ...l, ordered: kept.get(l.slot).ordered, repairedBy: kept.get(l.slot).applyId } : l
    )
  }
  const finalCheck = await siteCheck(repaired)
  const log = repairLog({ site: siteKey, records, unshot, costUsd, ms: now() - started, finalCheck })
  await saveFile(REPAIR_LOG_FILE, `${JSON.stringify(log, null, 2)}\n`)
  return { ok: true, report: repaired, log, finalCheck }
}
