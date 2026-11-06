// The finisher of the write step (spec #418): after the write, it looks at the written site, finds customer-visible faults of
// the closed list, repairs them through the write step's own door, proves each repair, and undoes one that does not help.
// This is the ONE entry point: the step 9 bench's `finish` (on a site already written) calls it today, and the live step 9
// path calls it after the write (#424). It reaches the site only through the site door, the screenshots only through
// `capture`, the site check only through `siteCheck`, and files only through `saveFile`, so tests give fakes for all four.
//
// Order: refuse unless every door can do its role; shoot every page the written site keeps (the write report's kept pages
// at their addresses now, the list the site check opens: lib/site-kept-paths.js), never a kit page the site dropped; ask the finder per page; for each fault
// ask the fixer for one order, let code check it (repair-orders.js), and write, judge and keep or undo it the way its order
// kind says (repair-steps.js: the checker on crops of the block, or the live page for a change no screenshot shows); run the
// site check a final time on the report with the kept repairs in it; write the repair log, which says whether the final
// check gained a blocking failure the first did not have. Rounds, limits and per-page parallel repairs come with #424.
import { shootPages } from '../../lib/page-shots.js'
import { keptPageList } from '../../lib/site-kept-paths.js'
import { kitSlotIds } from '../kit-slot-ids.js'
import { doorsRefusal } from './finisher-doors.js'
import { askFixer } from './finisher-roles.js'
import { findFaults, slotsByPage } from './finder-stage.js'
import { mergedFaults } from './fault-sources.js'
import { causeOf, logRecord, REPAIR_LOG_FILE, repairLog } from './repair-log.js'
import { readSite } from './repair-write.js'
import { stepsOf, validOrder } from './repair-orders.js'
import { fixerSources, orderFacts } from './repair-facts.js'
import { demoBlockShots } from './demo-block-shots.js'
import { keepShotFiles, replyKeeper } from './model-replies.js'

/** Stage 2: one fault through the fixer, code's check, the write, the checker, and the keep or the undo. */
async function repairFault(run, fault, repairNumber, firstShots) {
  const { door, siteKey, doors, lineOf } = run
  const cause = causeOf(run.firstCheck, fault)
  const site = await readSite(door, siteKey)
  const asked = run.spend(
    await askFixer(
      doors.fixer,
      fault,
      site.current.get(lineOf(fault.slot)?.key),
      fixerSources(run.orderFacts, fault)
    )
  )
  const about = { page: fault.page, repair: repairNumber }
  await run.replies.keep({
    name: `fixer-r${repairNumber}`,
    role: 'fixer',
    ...about,
    door: doors.fixer,
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
    door,
    siteKey,
    fault,
    kitSlots: run.kitSlots,
    pageSlots: run.pageSlots,
    keyOf: (slot) => lineOf(slot)?.key ?? null,
    currentOf: (key) => site.current.get(key)
  })
  // A repair is logged on the slot it is about, the one the finder named or the one the order was tied to.
  const onSlot = { ...fault, slot: fault.slot ?? (valid.ok ? valid.slot : null) }
  const known = { ...(fault.slot ? cause : causeOf(run.firstCheck, onSlot)), order }
  if (!valid.ok) return { record: logRecord(onSlot, { ...known, outcome: 'dropped', reason: valid.reason }) }
  // Each order kind is written, judged and undone its own way (repair-steps.js), named by its row of the order table.
  const steps = stepsOf(order.kind)
  const repair = { run, fault, order, valid, site, firstShots, repairNumber }
  const wrote = await steps.write(repair)
  if (!wrote.ok)
    return {
      record: logRecord(onSlot, {
        ...known,
        outcome: 'failed',
        reason: `the site refused it: ${wrote.reason}`
      })
    }
  const { verdict, reason, crops, checkedBy, proven } = await steps.judge(repair)
  const shown = {
    ...known,
    ...steps.shown(repair),
    applyId: wrote.applyId,
    checkedBy,
    ...(crops ? { crops: crops.files } : {})
  }
  if (verdict === 'better' && proven) {
    const kept = steps.kept({ ...repair, wrote })
    return { record: logRecord(onSlot, { ...shown, outcome: 'kept', reason }), ...(kept ? { kept } : {}) }
  }
  const why = proven ? reason : 'the repaired page could not be shot again'
  const undone = await steps.undo({ ...repair, wrote })
  return {
    record: logRecord(onSlot, {
      ...shown,
      outcome: undone.ok ? 'undone' : 'failed',
      reason: undone.ok ? why : `${why}; the revert failed: ${undone.reason}`
    })
  }
}

/** Stage 3: the write report with the kept repairs' words as ordered, which the final site check measures. */
const repairedReport = (report, keptBySlot) => ({
  ...report,
  slots: report.slots.map((line) => {
    const kept = keptBySlot.get(line.slot)
    return kept ? { ...line, ordered: kept.ordered, repairedBy: kept.applyId } : line
  })
})

/**
 * @param {{ door: { apply: Function }, siteKey: string, kit: object, report: object, firstCheck: object | null,
 *   doors: Record<'finder' | 'fixer' | 'checker', object>, capture: Function,
 *   siteCheck: (report: object) => Promise<object>, saveFile: (name: string, data: string | Buffer) => Promise<void>,
 *   pageHtml?: (page: string) => Promise<string | null>, demoImages?: { open: (id: string) => Promise<any> } | null,
 *   now?: () => number, contentMap?: object | null, facts?: { brief?: object, copy?: object, pictures?: object }
 *   }} input `kit` is the template kit's document; `report` the write report of the run;
 *   `facts` the brief, the site copy file and step 8's site pictures, the only sources a repair's new words come from;
 *   `firstCheck` may be a promise of a site check still running beside the finder; `pageHtml` reads a page as the site
 *   serves it now, to confirm an invisible site check failure; `demoImages` opens the kit's images, the template demo's block shots
 * @returns {Promise<{ ok: false, code: string, reason: string } | { ok: true, report: object, log: object, finalCheck: object,
 *   firstCheck: object | null }>}
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
    pageHtml = null,
    demoImages = null,
    now = Date.now,
    contentMap = null,
    facts = null
  } = input
  const refused = doorsRefusal(doors)
  if (refused) return { ok: false, ...refused }
  const started = now()
  let costUsd = 0
  let sitePages
  try {
    sitePages = keptPageList({ pages: (await readSite(door, siteKey)).pages }, report)
  } catch (error) {
    return { ok: false, code: 'SITE_UNREADABLE', reason: String(error?.message ?? error) }
  }
  const writtenLines = new Map(
    report.slots.filter((l) => l.status === 'written' && l.key).map((l) => [l.slot, l])
  )
  const run = {
    door,
    siteKey,
    doors,
    capture,
    saveFile,
    firstCheck: null,
    pageHtml,
    demoShots: demoBlockShots({ kit, sitePages, images: demoImages }),
    kit,
    kitSlots: kitSlotIds(kit),
    pageSlots: slotsByPage(kit, sitePages),
    lineOf: (slot) => writtenLines.get(slot),
    orderFacts: orderFacts({ kit, report, contentMap, facts, sitePages }),
    replies: replyKeeper(saveFile),
    shotFile: () => null,
    spend: (call) => {
      costUsd += call.costUsd ?? 0
      return call
    }
  }
  const firstShots = await shootPages({ capture, pages: sitePages.map((p) => p.path) })
  // The tiles the finder is shown, kept as files its reply files name (model-replies.js).
  run.shotFile = await keepShotFiles(saveFile, firstShots.shots)
  const { faults: found, records } = await findFaults(run, firstShots)
  // The first site check may still be running beside the finder (a promise); its failures join the finder's faults here.
  const first = await firstCheck
  run.firstCheck = first
  const { faults, records: mergeRecords, merge } = await mergedFaults({ found, firstCheck: first, pageHtml })
  const keptBySlot = new Map()
  for (const [index, fault] of faults.entries()) {
    const outcome = await repairFault(run, fault, index + 1, firstShots)
    records.push(outcome.record)
    if (outcome.kept) keptBySlot.set(outcome.kept.slot, outcome.kept)
  }
  records.push(...mergeRecords)
  const repaired = repairedReport(report, keptBySlot)
  const finalCheck = await siteCheck(repaired)
  const log = repairLog({
    site: siteKey,
    records,
    unshot: firstShots.unshot,
    replies: run.replies.files,
    costUsd,
    ms: now() - started,
    firstCheck: first,
    finalCheck,
    merge
  })
  await saveFile(REPAIR_LOG_FILE, `${JSON.stringify(log, null, 2)}\n`)
  return { ok: true, report: repaired, log, finalCheck, firstCheck: first }
}
