// The finder's stage of the finisher (spec #418, finisher.js): every page that was shot goes to the finder with the template
// demo's shot of each block it shows, and its answer is held to the fault list (fault-kinds.js). And the kit slots each
// site page shows, which tie an order to the page its fault was seen on.
import { kitSlotIds } from '../kit-slot-ids.js'
import { heldFaults, loggedOnlyReason } from './fault-kinds.js'
import { askFinder } from './finisher-roles.js'
import { keepShotFiles, pageSlug } from './model-replies.js'
import { logRecord } from './repair-log.js'
import { BUDGET } from './run-limits.js'
import { eachLimited } from './work-pool.js'

/**
 * The kit slots each site page shows: the slots of the blocks its kit page lists at any width, and its h1. A site page is
 * its kit page by the id the write report kept, else by the same path; a page that is no kit page shows no kit slot.
 */
export function slotsByPage(kit, sitePages) {
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

/**
 * Stage 1: the finder on every page that was shot, a few pages at once. A page it could not look at is named, never counted
 * as clean; past a hard limit (run-limits.js) a page it was not asked about is named too. `round` names its reply files.
 */
export async function findFaults(run, firstShots, round = 1) {
  const pages = [...new Set(firstShots.shots.map((s) => s.page))]
  const found = await eachLimited(pages, run.budget.limits.pages, async (page) => {
    const stopped = run.budget.stopped()
    if (stopped)
      return {
        faults: [],
        loggedOnly: [],
        page,
        skipped: `${BUDGET}: ${stopped}, so the finder was not asked`
      }
    const shown = firstShots.shots.filter((s) => s.page === page)
    // The template demo's shot of each block the page shows, for the lost-design kind (demo-block-shots.js).
    const demo = await run.demoShots(page)
    const demoTiles = demo.map((d) => ({
      page: `demo ${d.block}`,
      viewport: d.viewport,
      index: 0,
      image: d.image
    }))
    const demoFile = await keepShotFiles(run.saveFile, demoTiles)
    const call = run.budget.spend(
      await run.budget.timed('find', () => askFinder(run.doors.finder, page, shown, demo))
    )
    await run.replies.keep({
      name: `finder-${pageSlug(page)}${round > 1 ? `-round${round}` : ''}`,
      role: 'finder',
      page,
      door: run.doors.finder,
      sent: call.sent,
      images: [...shown.map(run.shotFile), ...demoTiles.map(demoFile)],
      call
    })
    return call.problem
      ? { faults: [], loggedOnly: [], problem: `the finder: ${call.problem}`, page }
      : heldFaults(call.answer, shown)
  })
  const records = found.flatMap((f) => [
    ...(f.problem ? [logRecord({ page: f.page, kind: null }, { outcome: 'failed', reason: f.problem })] : []),
    ...(f.skipped
      ? [logRecord({ page: f.page, kind: null }, { outcome: 'unrepaired', reason: f.skipped })]
      : []),
    ...f.loggedOnly.map((fault) => logRecord(fault, { reason: loggedOnlyReason(fault.kind) }))
  ])
  return { faults: found.flatMap((f) => f.faults), records }
}
