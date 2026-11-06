// The finisher of the write step (spec #418): after the write, it looks at the written site, finds customer-visible faults of
// the closed list, repairs them through the write step's own door, proves each repair, and undoes one that does not help.
// This is the ONE entry point: the step 9 bench's `finish` (on a site already written) and the live step 9 path
// (write-step-nine.js, after the write) both call it. It reaches the site only through the site door, the screenshots
// only through `capture`, the site check only through `siteCheck`, and files only through `saveFile`, so tests give fakes.
//
// Order: refuse unless every door can do its role; shoot every page the written site keeps (the write report's kept pages
// at their addresses now, the list the site check opens: lib/site-kept-paths.js), never a kit page the site dropped. Each
// page then runs on its own as soon as its shots are in (page-pipeline.js), a few pages at once: the finder looks at it while
// the first site check may still be running beside it, the check's failures on that page join its faults, and the page is
// repaired (page-repairs.js: every order of a page written, the page judged once, each repair kept or undone on its own) in
// at most two rounds (rounds.js). Then the site check runs a final time and a kept repair it blames for a new blocking
// failure is undone (final-check.js), and the repair log is written with the time and cost of every stage. Every site and
// model call is bounded (run-limits.js): past a limit no new work starts, what is left is logged as unrepaired, and the run
// still ends with its final check, in the slice of time kept for it, and its log: the site is delivered, nothing hidden, no
// notice to the customer.
import { shootPages } from '../../lib/page-shots.js'
import { keptPageList } from '../../lib/site-kept-paths.js'
import { kitSlotIds } from '../kit-slot-ids.js'
import { doorsRefusal } from './finisher-doors.js'
import { blocksByPage, slotsByPage } from './finder-stage.js'
import { finalCheck } from './final-check.js'
import { failureOwner, finishPage } from './page-pipeline.js'
import { REPAIR_LOG_FILE, repairLog } from './repair-log.js'
import { readSite } from './repair-write.js'
import { orderFacts } from './repair-facts.js'
import { demoBlockShots } from './demo-block-shots.js'
import { replyKeeper } from './model-replies.js'
import { finisherBudget } from './run-limits.js'
import { eachLimited, placeLocks } from './work-pool.js'

/** A page reader that reads each page once while nothing is written yet (the merge reads a page per failure). */
const readOnce = (pageHtml) => {
  if (!pageHtml) return null
  const read = new Map()
  return (page) => {
    if (!read.has(page)) read.set(page, pageHtml(page))
    return read.get(page)
  }
}

/** The site door with every call bounded by the run's limits (run-limits.js `site`). */
const boundedDoor = (door, budget) => ({ ...door, apply: (call) => budget.site(() => door.apply(call)) })

/** Every page shot in one stream, each page's part handed over the moment it is in. */
function pageStream(capture, pages, budget) {
  const ready = new Map()
  const tell = new Map()
  for (const page of pages) ready.set(page, new Promise((resolve) => tell.set(page, resolve)))
  const controller = new AbortController()
  const whole = budget
    .timed('shoot', () =>
      budget.site(
        () =>
          shootPages({
            capture,
            pages,
            signal: controller.signal,
            onPage: (page, part) => tell.get(page)?.(part)
          }),
        { whole: true, abort: controller }
      )
    )
    .catch((error) => ({ failed: String(error?.message ?? error) }))
    .then((shot) => {
      // A page the stream never handed over (the shots were let go) is unshot, with why.
      for (const page of pages)
        tell.get(page)({
          shots: [],
          boxes: [],
          unshot: ['desktop', 'phone'].map((viewport) => ({ page, viewport, why: shot.failed ?? 'not shot' }))
        })
    })
  return { of: (page) => ready.get(page), done: whole }
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
 *   (run-limits.js); `timer` bounds every site and model call (run-limits.js; a test gives a fake one)
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
  const siteDoor = boundedDoor(door, budget)
  let sitePages
  try {
    sitePages = keptPageList({ pages: (await readSite(siteDoor, siteKey)).pages }, report)
  } catch (error) {
    return { ok: false, code: 'SITE_UNREADABLE', reason: String(error?.message ?? error) }
  }
  const writtenLines = new Map(
    report.slots.filter((l) => l.status === 'written' && l.key).map((l) => [l.slot, l])
  )
  const boundedRead = pageHtml ? (page) => budget.site(() => pageHtml(page)) : null
  let numbers = 0
  const run = {
    door: siteDoor,
    siteKey,
    doors,
    capture,
    saveFile,
    firstCheck: null,
    // The first site check, may be still running beside the finders: awaited by each page before it merges, never past
    // the time new work may start (a check that does not end by then merges nothing).
    firstReady: budget
      .within(() => firstCheck, budget.workLeft())
      .then((done) => (done.late ? null : (done.value ?? null)))
      .catch(() => null)
      .then((first) => {
        run.firstCheck = first
        return first
      }),
    pageHtml: boundedRead,
    readOnce: readOnce(boundedRead),
    demoShots: demoBlockShots({ kit, sitePages, images: demoImages }),
    kit,
    kitSlots: kitSlotIds(kit),
    pageSlots: slotsByPage(kit, sitePages),
    // The kit blocks each page shows, for the repair menu of a fault (repair-menu.js).
    blocksOn: blocksByPage(kit, sitePages),
    contentMap,
    lineOf: (slot) => writtenLines.get(slot),
    orderFacts: orderFacts({ kit, report, contentMap, facts, sitePages }),
    replies: replyKeeper(saveFile),
    budget,
    locks: placeLocks(),
    // The place each written repair holds, so a page does not write over another page's repair (page-repairs.js).
    claimed: new Map(),
    nextNumber: () => ++numbers
  }
  const pages = sitePages.map((p) => p.path)
  const stream = pageStream(capture, pages, budget)
  const owner = (f) => failureOwner(run, pages, f)
  const pageResults = await eachLimited(pages, budget.limits.pages, (page) =>
    finishPage(run, page, { shots: stream.of(page), owns: (f) => owner(f) === page })
  )
  pageResults.push(await finishPage(run, null, { shots: null, owns: (f) => owner(f) === null }))
  await stream.done
  const first = await run.firstReady
  const records = [...pageResults.flatMap((p) => p.records), ...pageResults.flatMap((p) => p.mergeRecords)]
  const kept = pageResults.flatMap((p) => p.kept)
  const final = await finalCheck(run, { report, kept, firstCheck: first, siteCheck })
  const log = repairLog({
    site: siteKey,
    records: records.map((r) => final.replaced.get(r) ?? r),
    unshot: pageResults.flatMap((p) => p.unshot),
    replies: run.replies.files,
    budget: budget.summary(),
    rounds: Math.max(0, ...pageResults.map((p) => p.rounds)),
    final,
    firstCheck: first,
    merge: mergeTotals(pageResults.map((p) => p.merge))
  })
  await saveFile(REPAIR_LOG_FILE, `${JSON.stringify(log, null, 2)}\n`)
  return { ok: true, report: final.report, log, finalCheck: final.check, firstCheck: first }
}

/** The merge counts of every page, added up. */
const mergeTotals = (merges) => {
  const total = {}
  for (const merge of merges) for (const [k, v] of Object.entries(merge)) total[k] = (total[k] ?? 0) + v
  return total
}
