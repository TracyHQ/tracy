// The finisher's rounds (spec #418, #424): at most two, a third never starts. Round one repairs every fault found, pages side
// by side (a few at once, run-limits.js). Round two goes back only to the pages where a repair was undone or a fault waited
// for another repair of the same place: each is shot again whole and the finder looks again, so a fault round one made shows
// too; a fault whose repair was undone is retried with the order tried before (`tried`), which the fixer may not give again.
// What is still left after the last round, or when a hard limit stops the run, is logged as unrepaired with its reason.
import { shootPages } from '../../lib/page-shots.js'
import { findFaults } from './finder-stage.js'
import { keepShotFiles } from './model-replies.js'
import { repairPage, unrepaired } from './page-repairs.js'
import { BUDGET } from './run-limits.js'
import { eachLimited } from './work-pool.js'

const byPage = (faults) => {
  const pages = new Map()
  for (const fault of faults) pages.set(fault.page, [...(pages.get(fault.page) ?? []), fault])
  return pages
}
const sameFault = (a, b) =>
  a.kind === b.kind && (a.slot ?? a.block ?? null) === (b.slot ?? b.block ?? null) && (a.slot || a.block)
const recordKey = (r) => JSON.stringify([r.page, r.faultKind, r.seen, r.outcome])

/**
 * The faults of round two on its pages: what the finder sees now, each retried fault in place of the one it found at the
 * same place, and every retried fault it did not name again.
 */
function nextFaults(found, carried) {
  const left = [...carried]
  const faults = found.map((fault) => {
    const at = left.findIndex((c) => c.page === fault.page && sameFault(c, fault))
    if (at < 0) return fault
    const [was] = left.splice(at, 1)
    return { ...fault, ...(was.tried ? { tried: was.tried } : {}) }
  })
  return [...faults, ...left]
}

/**
 * @param {object} run the finisher's run (finisher.js)
 * @param {object[]} faults round one's faults, found and merged
 * @param {object} firstShots the shots they were found on
 * @returns {Promise<{ records: object[], kept: object[], rounds: number }>}
 */
export async function runRounds(run, faults, firstShots) {
  const records = []
  const kept = []
  const { pages: atOnce, rounds: last } = run.budget.limits
  let pages = byPage(faults)
  let shots = firstShots
  let round = 0
  while (pages.size) {
    round += 1
    const done = await eachLimited([...pages.keys()], atOnce, (page) =>
      repairPage(run, page, pages.get(page), shots, round)
    )
    const waiting = done.flatMap((d) => d.deferred)
    const carried = [...done.flatMap((d) => d.undone), ...waiting]
    for (const d of done) {
      records.push(...d.records)
      kept.push(...d.kept)
    }
    const stopped = run.budget.stopped()
    if (round >= last || stopped || !carried.length) {
      const why = stopped
        ? `${BUDGET}: ${stopped}`
        : 'another repair of the same place took the round, and no round is left'
      records.push(...waiting.map((f) => unrepaired(run, f, why)))
      break
    }
    // Round two: the pages that still need work, shot again whole, the finder asked again.
    const again = [...new Set(carried.map((f) => f.page))]
    shots = await run.budget.timed('shoot', () => shootPages({ capture: run.capture, pages: again }))
    const firstFiles = run.shotFile
    const roundFiles = await keepShotFiles(run.saveFile, shots.shots, `round${round + 1}-`)
    run.shotFile = (shot) => roundFiles(shot) ?? firstFiles(shot)
    const seen = await findFaults(run, shots, round + 1)
    const logged = new Set(records.map(recordKey))
    records.push(...seen.records.filter((r) => !logged.has(recordKey(r))))
    pages = byPage(nextFaults(seen.faults, carried))
  }
  return { records, kept, rounds: round }
}
