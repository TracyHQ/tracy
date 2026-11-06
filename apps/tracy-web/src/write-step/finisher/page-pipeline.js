// One page through the finisher (spec #418, story 29): as soon as the page's own shots are in, the finder looks at them, the
// first site check's failures on that page join its faults, and the page is repaired and judged, while other pages are still
// being shot or found. The first site check runs beside the finders; a page waits for it only to merge, and never past the
// time new work may start (run-limits.js). A site check failure is the page's when it names the page, or, naming none, when
// the page shows its slot; the failures no page owns go through the same steps on their own once every page is done.
import { mergedFaults } from './fault-sources.js'
import { findFaults } from './finder-stage.js'
import { keepShotFiles } from './model-replies.js'
import { samePage } from './page-paths.js'
import { repairRounds } from './rounds.js'

const NO_SHOTS = Object.freeze({ shots: [], boxes: [], unshot: [] })

const byPage = (faults) => {
  const pages = new Map()
  for (const fault of faults) pages.set(fault.page ?? null, [...(pages.get(fault.page ?? null) ?? []), fault])
  return pages
}

/** The site page a site check failure belongs to, or null when no page owns it. */
export function failureOwner(run, pages, f) {
  if (f.page) return pages.find((p) => samePage(p, f.page)) ?? null
  return f.slot ? (pages.find((p) => run.pageSlots(p).has(f.slot)) ?? null) : null
}

/** The first check with only the failures `owns` keeps; groups and their statuses as they were. */
const checkOf = (check, owns) =>
  check && {
    ...check,
    groups: (check.groups ?? []).map((g) => ({
      ...g,
      failures: (g.failures ?? []).filter((f) => owns({ ...f, group: f.group ?? g.name }))
    }))
  }

/**
 * @param {object} run the finisher's run (finisher.js)
 * @param {string | null} page a site page, or null for the failures no page owns
 * @param {{ shots: Promise<object> | null, owns: (failure: object) => boolean }} input `shots`: the page's shots once in
 * @returns {Promise<{ records: object[], mergeRecords: object[], kept: object[], rounds: number, merge: object,
 *   unshot: object[] }>} `mergeRecords`: what the merge logged without a repair, kept after every repair record
 */
export async function finishPage(run, page, { shots: shooting, owns }) {
  const shots = shooting ? await shooting : NO_SHOTS
  const shotFile = await keepShotFiles(run.saveFile, shots.shots)
  const found = page ? await findFaults(run, shots, shotFile) : { faults: [], records: [] }
  const first = await run.firstReady
  const merged = await mergedFaults({
    found: found.faults,
    firstCheck: checkOf(first, owns),
    pageHtml: run.readOnce,
    brief: run.orderFacts.brief
  })
  // The failures no page owns are repaired page by page as they name them (one group for those that name none).
  const groups = page ? [[page, merged.faults]] : [...byPage(merged.faults)]
  const repaired = { records: [], kept: [], rounds: 0 }
  for (const [at, faults] of groups) {
    const done = await repairRounds(run, at, faults, shots)
    repaired.records.push(...done.records)
    repaired.kept.push(...done.kept)
    repaired.rounds = Math.max(repaired.rounds, done.rounds)
  }
  return {
    records: [...found.records, ...repaired.records],
    mergeRecords: merged.records,
    kept: repaired.kept,
    rounds: repaired.rounds,
    merge: merged.merge,
    unshot: shots.unshot
  }
}
