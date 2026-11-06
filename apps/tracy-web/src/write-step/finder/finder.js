// The finder (#448): a fault source of step 9b beside the step 11 site check, for faults no script measures. It shoots every
// page the written site keeps (the write report's kept pages, lib/site-kept-paths.js) at 1440 and 390 px through the
// site's host (lib/page-shots.js), and asks the finder door (finder-door.js) about each page with the template demo's shot
// of each block it shows (finder-ask.js), a few pages at once. A page it could not shoot or ask about is named in
// `problems`, never counted as clean. It writes nothing to the site; with `saveFile` each tile and each reply is kept.
import { shootPages } from '../../lib/page-shots.js'
import { keptPageList } from '../../lib/site-kept-paths.js'
import { askFinder, demoBlockShots } from './finder-ask.js'
import { heldFaults } from './finder-kinds.js'

const PAGES_AT_ONCE = 4

const slug = (page) =>
  String(page ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'home'

/** Runs `work` on every item, at most `limit` at once, answers in the items' order. */
async function eachLimited(items, limit, work) {
  const results = Array.from({ length: items.length })
  let next = 0
  const lane = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await work(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane))
  return results
}

/**
 * @param {{ door: { ok: boolean, ask: Function, code?: string, reason?: string }, capture: Function, kit?: object | null,
 *   demoImages?: { open: (id: string) => Promise<any> } | null, saveFile?: ((name: string, data: any) => Promise<void>) | null }} input
 *   `capture` asks the site's host to stream the pages (lib/page-shots.js); `demoImages` opens the kit's images
 * @returns {{ find: (report: object) => Promise<{ faults: object[], problem: string | null, problems: object[],
 *   costUsd: number | null }> }}
 */
export function siteFinder({ door, capture, kit = null, demoImages = null, saveFile = null }) {
  return {
    async find(report) {
      if (!door?.ok)
        return { faults: [], problem: `${door?.code}: ${door?.reason}`, problems: [], costUsd: null }
      const sitePages = keptPageList(null, report)
      const pages = sitePages.map((p) => p.path)
      const shot = await shootPages({ capture, pages })
      const demo = demoBlockShots({ kit, sitePages, images: demoImages })
      const problems = shot.unshot.map((u) => ({
        page: u.page,
        viewport: u.viewport,
        problem: `not shot: ${u.why}`
      }))
      let costUsd = 0
      const found = await eachLimited(pages, PAGES_AT_ONCE, async (page) => {
        const tiles = shot.shots.filter((s) => s.page === page)
        if (!tiles.length) return []
        const call = await askFinder(door, page, tiles, await demo(page))
        costUsd += Number(call.costUsd) || 0
        if (saveFile)
          await saveFile(
            `finder/${slug(page)}.json`,
            `${JSON.stringify({ page, text: call.text ?? null, problem: call.problem ?? null, costUsd: call.costUsd ?? null }, null, 2)}\n`
          )
        if (call.problem) {
          problems.push({ page, problem: `the finder: ${call.problem}` })
          return []
        }
        return heldFaults(call.answer, tiles)
      })
      return {
        faults: found.flat(),
        problem: problems.length ? `${problems.length} page views not looked at` : null,
        problems,
        costUsd
      }
    }
  }
}
