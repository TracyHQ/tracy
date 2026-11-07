// The finder (#448): a fault source of step 9b beside the step 11 site check, for faults no script measures. It shoots every
// page the written site keeps (the write report's kept pages, lib/site-kept-paths.js; on a second look, only the pages it
// is given) at 1440 and 390 px through the site's host (lib/page-shots.js), and asks the finder door (finder-door.js) about
// each page with the template demo's shot of each block it shows (finder-ask.js). A page it could not
// shoot or ask about is named in `problems`, never counted as clean. It writes nothing to the site; with `saveFile` each
// tile and each reply is kept.
//
// Pages go through a pipeline: each is shot on its own (`SHOTS_AT_ONCE` at a time; the host queues past its browser
// slots) and asked about as soon as its shots exist (`ASKS_AT_ONCE` at a time). Given a `signal`, an abort (the step's
// time limit) ends the look at once: every fault found before it is kept, and each page not looked at is named.
//
// The call is kept small (finder-sheets.js): a page's tiles go in as a few stitched sheets per width, the demo's block
// shots shrunk the same way. Given `onPage`, each page is handed on the moment its look ends, so step 9b's repair pass can
// start on it while the finder still looks at the others.
import { shootPages } from '../../lib/page-shots.js'
import { keptPageList } from '../../lib/site-kept-paths.js'
import { askFinder, demoBlockShots } from './finder-ask.js'
import { heldFaults } from './finder-kinds.js'
import { pageSheets, shrunkDemoShots } from './finder-sheets.js'

/** Pages shot at once (the host queues what its browser slots cannot take), and pages asked about at once. */
export const SHOTS_AT_ONCE = 4
export const ASKS_AT_ONCE = 4
const TIME_RAN_OUT = "not looked at: the finder's time ran out"

const slug = (page) =>
  String(page ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'home'

/** A counting gate: `run(work)` waits for one of `limit` slots. */
function gate(limit) {
  let active = 0
  const waiting = []
  return async (work) => {
    if (active >= limit) await new Promise((resolve) => waiting.push(resolve))
    else active += 1
    try {
      return await work()
    } finally {
      const next = waiting.shift()
      if (next) next()
      else active -= 1
    }
  }
}

/** Settles with `{ stopped: true }` once `signal` aborts; never when there is no signal. */
const stoppedBy = (signal) =>
  new Promise((resolve) => {
    if (!signal) return
    if (signal.aborted) resolve({ stopped: true })
    else signal.addEventListener('abort', () => resolve({ stopped: true }), { once: true })
  })

/** The problem line: views that could not be shot, and pages the finder never got to. */
function problemLine(problems) {
  const views = problems.filter((p) => p.viewport).length
  const pages = new Set(problems.filter((p) => !p.viewport).map((p) => p.page)).size
  const parts = [
    ...(views ? [`${views} page views not looked at`] : []),
    ...(pages ? [`${pages} pages not looked at`] : [])
  ]
  return parts.length ? parts.join('; ') : null
}

/** Hands a page on without ever stopping the look: a handler that throws or rejects is its own problem. */
function handOn(onPage, page, faults) {
  if (!onPage) return
  try {
    Promise.resolve(onPage(page, faults)).catch(() => {})
  } catch {
    // The handler's failure is not the finder's: the page's faults are still in the result.
  }
}

/**
 * @param {{ door: { ok: boolean, ask: Function, code?: string, reason?: string }, capture: Function, kit?: object | null,
 *   demoImages?: { open: (id: string) => Promise<any> } | null, saveFile?: ((name: string, data: any) => Promise<void>) | null }} input
 *   `capture` asks the site's host to stream the pages (lib/page-shots.js); `demoImages` opens the kit's images
 * @returns {{ find: (report: object, options?: { pages?: string[] | null, signal?: AbortSignal | null,
 *   onPage?: ((page: string, faults: object[]) => void) | null }) => Promise<{ faults: object[], problem: string | null, problems: object[],
 *   costUsd: number | null }> }}
 */
export function siteFinder({ door, capture, kit = null, demoImages = null, saveFile = null }) {
  return {
    async find(report, { pages: only = null, signal = null, onPage = null } = {}) {
      if (!door?.ok)
        return { faults: [], problem: `${door?.code}: ${door?.reason}`, problems: [], costUsd: null }
      // A second look (step 9b's resend round) names the pages it looks at again; the first looks at every kept page.
      const sitePages = keptPageList(null, report).filter((p) => !only || only.includes(p.path))
      const pages = sitePages.map((p) => p.path)
      const demo = demoBlockShots({ kit, sitePages, images: demoImages })
      const problems = []
      const costs = []
      const stopped = stoppedBy(signal)
      const shootGate = gate(SHOTS_AT_ONCE)
      const askGate = gate(ASKS_AT_ONCE)
      // A pipeline: each page is shot on its own, a few at once, and asked about as soon as its shots exist.
      const lookAt = async (page) => {
        if (signal?.aborted) return null
        const shot = await shootGate(() =>
          signal?.aborted ? null : shootPages({ capture, pages: [page], ...(signal ? { signal } : {}) })
        )
        if (!shot || signal?.aborted) return null
        for (const u of shot.unshot)
          problems.push({ page: u.page, viewport: u.viewport, problem: `not shot: ${u.why}` })
        const tiles = shot.shots.filter((s) => s.page === page)
        if (!tiles.length) return []
        const sheets = await pageSheets(tiles).catch(() => null)
        if (!sheets?.length) {
          problems.push({ page, problem: 'not looked at: its tiles could not be stitched into sheets' })
          return []
        }
        const call = await askGate(async () =>
          signal?.aborted
            ? { stopped: true }
            : Promise.race([
                demo(page)
                  .then(shrunkDemoShots)
                  .then((d) => askFinder(door, page, sheets, d)),
                stopped
              ])
        )
        if (call.stopped) return null
        if (typeof call.costUsd === 'number' && Number.isFinite(call.costUsd)) costs.push(call.costUsd)
        if (saveFile)
          await saveFile(
            `finder/${slug(page)}.json`,
            `${JSON.stringify({ page, text: call.text ?? null, problem: call.problem ?? null, costUsd: call.costUsd ?? null }, null, 2)}\n`
          )
        if (call.problem) {
          problems.push({ page, problem: `the finder: ${call.problem}` })
          return []
        }
        return heldFaults(call.answer, sheets)
      }
      // A page whose look ended (found faults, none, or a problem named) is handed on; one cut off by the time limit is not.
      const lookAndHandOn = async (page) => {
        const faults = await lookAt(page)
        if (faults !== null && !signal?.aborted) handOn(onPage, page, faults)
        return faults
      }
      // Stopped at its time limit, every page still at work is named, and what was found before is kept.
      const looks = pages.map((page) => Promise.race([lookAndHandOn(page), stopped.then(() => null)]))
      const found = await Promise.all(looks)
      found.forEach((faults, i) => {
        if (faults === null) problems.push({ page: pages[i], problem: TIME_RAN_OUT })
      })
      return {
        faults: found.filter(Boolean).flat(),
        problem: problemLine(problems),
        problems,
        costUsd: costs.length ? Math.round(costs.reduce((a, b) => a + b, 0) * 1e8) / 1e8 : null
      }
    }
  }
}
