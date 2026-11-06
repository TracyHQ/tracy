// The finisher of the write step (spec #418): after the write, it looks at the written site, finds customer-visible faults of
// the closed list, repairs them through the write step's own door, proves each repair, and undoes one that does not help.
// This is the ONE entry point: the step 9 bench's `finish` (on a site already written) calls it today, and the live step 9
// path calls it after the write (#424). It reaches the site only through the site door, the screenshots only through
// `capture`, the site check only through `siteCheck`, and files only through `saveFile`, so tests give fakes for all four.
//
// Order: refuse unless every door can do its role; shoot every page the written site keeps (the write report's kept pages
// at their addresses now, the list the site check opens: lib/site-kept-paths.js), never a kit page the site dropped; ask the finder per page; for each fault
// ask the fixer for one order, let code check it (repair-orders.js) and write it with its own apply id; re-shoot the page
// and ask the checker on the before and after crops of the block (repair-crops.js); keep, or revert by apply id; run the
// site check a final time on the report with the kept repairs in it; write the repair log, which says whether the final
// check gained a blocking failure the first did not have. Rounds, limits and per-page parallel repairs come with #424.
import { shootPages } from '../../lib/page-shots.js'
import { keptPageList } from '../../lib/site-kept-paths.js'
import { kitSlotIds } from '../kit-slot-ids.js'
import { doorsRefusal } from './finisher-doors.js'
import { askChecker, askFinder, askFixer, verdictOf } from './finisher-roles.js'
import { heldFaults } from './fault-kinds.js'
import { causeOf, logRecord, REPAIR_LOG_FILE, repairLog } from './repair-log.js'
import { readSite, revertRepair, writeRepair } from './repair-write.js'
import { validOrder } from './repair-orders.js'
import { cropsOf } from './repair-crops.js'
import { takeOffStyleRule, writeStyleRule } from './style-write.js'
import { orderFacts } from './repair-facts.js'
import { keepShotFiles, pageSlug, replyKeeper } from './model-replies.js'

/**
 * The kit slots each site page shows: the slots of the blocks its kit page lists at any width, and its h1. A site page is
 * its kit page by the id the write report kept, else by the same path; a page that is no kit page shows no kit slot.
 */
function slotsByPage(kit, sitePages) {
  const blocks = new Map((kit?.blocks ?? []).map((b) => [b?.id, b]))
  const kitPages = kit?.pages ?? []
  const byPage = new Map()
  for (const { path, id } of sitePages) {
    const page = kitPages.find((p) => (id ? p?.id === id : p?.path === path))
    if (!page) continue
    const ids = new Set(Object.values(page?.blocks ?? {}).flat())
    const shown = { blocks: [...ids].map((b) => blocks.get(b)).filter(Boolean), pages: [{ h1: page?.h1 }] }
    byPage.set(path, kitSlotIds(shown))
  }
  return (page) => byPage.get(page) ?? new Set()
}

/** Stage 1: the finder on every page that was shot. A page it could not look at is named, never counted as clean. */
async function findFaults(run, firstShots) {
  const pages = [...new Set(firstShots.shots.map((s) => s.page))]
  const found = await Promise.all(
    pages.map(async (page) => {
      const shown = firstShots.shots.filter((s) => s.page === page)
      const call = run.spend(await askFinder(run.doors.finder, page, shown))
      await run.replies.keep({
        name: `finder-${pageSlug(page)}`,
        role: 'finder',
        page,
        door: run.doors.finder,
        sent: call.sent,
        images: shown.map(run.shotFile),
        call
      })
      return call.problem
        ? { faults: [], loggedOnly: [], problem: `the finder: ${call.problem}`, page }
        : heldFaults(call.answer, shown, run.faultKinds)
    })
  )
  const records = found.flatMap((f) => [
    ...(f.problem ? [logRecord({ page: f.page, kind: null }, { outcome: 'failed', reason: f.problem })] : []),
    ...f.loggedOnly.map((fault) => logRecord(fault, { reason: 'the kind is outside the fault list' }))
  ])
  return { faults: found.flatMap((f) => f.faults), records }
}

/** Stage 2: one fault through the fixer, code's check, the write, the checker, and the keep or the undo. */
async function repairFault(run, fault, repairNumber, firstShots) {
  const { door, siteKey, doors, lineOf } = run
  const cause = causeOf(run.firstCheck, fault)
  const site = await readSite(door, siteKey)
  const asked = run.spend(await askFixer(doors.fixer, fault, site.current.get(lineOf(fault.slot)?.key)))
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
    faultKinds: run.faultKinds,
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
  // A style order writes one rule keyed by its block in the head block (style-write.js); every other order, slot words.
  const wrote = valid.style
    ? await writeStyleRule({
        door,
        siteKey,
        kit: run.kit,
        block: valid.block,
        line: valid.line,
        repair: repairNumber
      })
    : await (valid.write ?? writeRepair)({
        door,
        siteKey,
        revision: site.revision,
        changes: valid.changes,
        repair: repairNumber
      })
  if (!wrote.ok)
    return {
      record: logRecord(onSlot, {
        ...known,
        outcome: 'failed',
        reason: `the site refused it: ${wrote.reason}`
      })
    }
  const afterShots = await shootPages({ capture: run.capture, pages: [fault.page] })
  const crops = await cropsOf({
    fault,
    before: firstShots,
    after: afterShots,
    // A style leaves the words as they are, so the block is found by the words its fault's slot holds.
    wordsBefore: valid.style ? (site.current.get(lineOf(fault.slot)?.key) ?? '') : valid.current,
    wordsAfter: valid.style ? (site.current.get(lineOf(fault.slot)?.key) ?? '') : valid.after,
    name: `r${repairNumber}`,
    saveFile: run.saveFile
  })
  const judged = run.spend(await askChecker(doors.checker, fault, crops.beforeShots, crops.afterShots))
  await run.replies.keep({
    name: `checker-r${repairNumber}`,
    role: 'checker',
    ...about,
    door: doors.checker,
    sent: judged.sent,
    images: [...crops.files.before, ...crops.files.after],
    call: judged
  })
  const { verdict, reason } = judged.problem
    ? { verdict: 'not better', reason: `the checker: ${judged.problem}` }
    : verdictOf(judged.answer)
  const shown = {
    ...known,
    ...(valid.style ? { block: valid.block } : {}),
    applyId: wrote.applyId,
    crops: crops.files
  }
  if (verdict === 'better' && crops.afterShots.length)
    return {
      record: logRecord(onSlot, { ...shown, outcome: 'kept', reason }),
      // A kept style changes no words of the report.
      ...(valid.style ? {} : { kept: { slot: valid.slot, ordered: valid.after, applyId: wrote.applyId } })
    }
  const why = crops.afterShots.length ? reason : 'the repaired page could not be shot again'
  const undone = valid.style
    ? await takeOffStyleRule({
        door,
        siteKey,
        kit: run.kit,
        block: valid.block,
        before: wrote.before,
        repair: repairNumber
      })
    : await revertRepair({ door, siteKey, applyId: wrote.applyId, also: wrote.also })
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
 *   now?: () => number, contentMap?: object | null, facts?: { brief?: object, copy?: object, pictures?: object },
 *   faultKinds?: Record<string, object> }} input `kit` is the template kit's document; `report` the write report of the run;
 *   `facts` the brief, the site copy file and step 8's site pictures, the only sources a repair's new words come from
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
    now = Date.now,
    contentMap = null,
    facts = null,
    faultKinds
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
    firstCheck,
    kit,
    kitSlots: kitSlotIds(kit),
    pageSlots: slotsByPage(kit, sitePages),
    lineOf: (slot) => writtenLines.get(slot),
    faultKinds,
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
  const { faults, records } = await findFaults(run, firstShots)
  const keptBySlot = new Map()
  for (const [index, fault] of faults.entries()) {
    const outcome = await repairFault(run, fault, index + 1, firstShots)
    records.push(outcome.record)
    if (outcome.kept) keptBySlot.set(outcome.kept.slot, outcome.kept)
  }
  const repaired = repairedReport(report, keptBySlot)
  const finalCheck = await siteCheck(repaired)
  const log = repairLog({
    site: siteKey,
    records,
    unshot: firstShots.unshot,
    replies: run.replies.files,
    costUsd,
    ms: now() - started,
    firstCheck,
    finalCheck
  })
  await saveFile(REPAIR_LOG_FILE, `${JSON.stringify(log, null, 2)}\n`)
  return { ok: true, report: repaired, log, finalCheck }
}
