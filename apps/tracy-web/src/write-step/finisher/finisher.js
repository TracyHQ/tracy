// The finisher of the write step (spec #418): after the write, it looks at the written site, finds customer-visible faults of
// the closed list, repairs them through the write step's own door, proves each repair, and undoes one that does not help.
// This is the ONE entry point: the step 9 bench's `finish` (on a site already written) and the live step 9 path
// (write-step-nine.js, after the write) both call it. It reaches the site only through the site door, the screenshots
// only through `capture`, the site check only through `siteCheck`, and files only through `saveFile`, so tests give fakes.
//
// Order: refuse unless every door can do its role; shoot every page the written site keeps (the write report's kept pages
// at their addresses now, the list the site check opens: lib/site-kept-paths.js), never a kit page the site dropped; ask the
// finder per page, a few pages at once, while the first site check may still be running beside it; merge its failures in;
// then repair page by page, pages side by side (page-repairs.js: every order of a page written, the page judged once, each
// repair kept or undone on its own), at most two rounds (rounds.js); run the site check a final time and undo a kept repair
// it blames for a new blocking failure (final-check.js); write the repair log with the time and cost of every stage. Past a
// hard limit of time or cost (run-limits.js) no new work starts, what is left is logged as unrepaired, and the run still ends
// with its final check and its log: the site is delivered, nothing hidden, no notice to the customer.
import { shootPages } from '../../lib/page-shots.js'
import { keptPageList } from '../../lib/site-kept-paths.js'
import { kitSlotIds } from '../kit-slot-ids.js'
import { doorsRefusal } from './finisher-doors.js'
import { findFaults, slotsByPage } from './finder-stage.js'
import { mergedFaults } from './fault-sources.js'
import { finalCheck } from './final-check.js'
import { REPAIR_LOG_FILE, repairLog } from './repair-log.js'
import { readSite } from './repair-write.js'
import { orderFacts } from './repair-facts.js'
import { demoBlockShots } from './demo-block-shots.js'
import { keepShotFiles, replyKeeper } from './model-replies.js'
import { runRounds } from './rounds.js'
import { finisherBudget } from './run-limits.js'
import { placeLocks } from './work-pool.js'

/** A page reader that reads each page once while nothing is written yet (the merge reads a page per failure). */
const readOnce = (pageHtml) => {
  if (!pageHtml) return null
  const read = new Map()
  return (page) => {
    if (!read.has(page)) read.set(page, pageHtml(page))
    return read.get(page)
  }
}

/**
 * @param {{ door: { apply: Function }, siteKey: string, kit: object, report: object, firstCheck: object | null,
 *   doors: Record<'finder' | 'fixer' | 'checker', object>, capture: Function,
 *   siteCheck: (report: object) => Promise<object>, saveFile: (name: string, data: string | Buffer) => Promise<void>,
 *   pageHtml?: (page: string) => Promise<string | null>, demoImages?: { open: (id: string) => Promise<any> } | null,
 *   now?: () => number, contentMap?: object | null, facts?: { brief?: object, copy?: object, pictures?: object },
 *   limits?: Partial<import('./run-limits.js').FINISHER_LIMITS> | null, timer?: Function }} input `kit` is the template
 *   kit's document; `report` the write report of the run;
 *   `facts` the brief, the site copy file and step 8's site pictures, the only sources a repair's new words come from;
 *   `firstCheck` may be a promise of a site check still running beside the finder; `pageHtml` reads a page as the site
 *   serves it now, to confirm an invisible site check failure and to judge a repair code can judge; `demoImages` opens the
 *   kit's images, the template demo's block shots; `limits` overrides the time, cost, pages at once and rounds
 *   (run-limits.js); `timer` fires at the hard time limit, so a model call still open then is let go (a test gives a fake one)
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
    facts = null,
    limits = null,
    timer = undefined
  } = input
  const refused = doorsRefusal(doors)
  if (refused) return { ok: false, ...refused }
  const budget = finisherBudget({ now, limits, timer })
  let sitePages
  try {
    sitePages = keptPageList({ pages: (await readSite(door, siteKey)).pages }, report)
  } catch (error) {
    budget.close()
    return { ok: false, code: 'SITE_UNREADABLE', reason: String(error?.message ?? error) }
  }
  const writtenLines = new Map(
    report.slots.filter((l) => l.status === 'written' && l.key).map((l) => [l.slot, l])
  )
  let numbers = 0
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
    budget,
    locks: placeLocks(),
    nextNumber: () => ++numbers
  }
  const firstShots = await budget.timed('shoot', () =>
    shootPages({ capture, pages: sitePages.map((p) => p.path) })
  )
  // The tiles the finder is shown, kept as files its reply files name (model-replies.js).
  run.shotFile = await keepShotFiles(saveFile, firstShots.shots)
  const { faults: found, records } = await findFaults(run, firstShots)
  // The first site check may still be running beside the finder (a promise); its failures join the finder's faults here.
  const first = await firstCheck
  run.firstCheck = first
  const merged = await mergedFaults({ found, firstCheck: first, pageHtml: readOnce(pageHtml) })
  const { records: repairRecords, kept, rounds } = await runRounds(run, merged.faults, firstShots)
  records.push(...repairRecords, ...merged.records)
  // The final check runs whatever the limits: the build needs it. The hard limit's timer is let go first.
  budget.close()
  const final = await finalCheck(run, { report, kept, firstCheck: first, siteCheck })
  const log = repairLog({
    site: siteKey,
    records,
    unshot: firstShots.unshot,
    replies: run.replies.files,
    budget: budget.summary(),
    rounds,
    undoneByFinalCheck: final.undone,
    firstCheck: first,
    finalCheck: final.check,
    merge: merged.merge
  })
  await saveFile(REPAIR_LOG_FILE, `${JSON.stringify(log, null, 2)}\n`)
  return { ok: true, report: final.report, log, finalCheck: final.check, firstCheck: first }
}
