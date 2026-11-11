// When each page of step 9b goes (#448). Every page with faults to send is ready with the first site check; pages start
// in the order their first fault was named, `turnsAtOnce` at a time, each run by `run` (one page's turns, repair-page.js).
// A page ready past the time new work stops is not sent (`time-limit`). A page whose run throws is logged with its error
// in `result.errors` and the other pages go on: one page's failure never stops the pass.
import { faultsToSend, unavailablePage } from './repair-faults.js'

/**
 * Runs every page with faults to send, at most `turnsAtOnce` at once.
 * @returns {Promise<{ skipped: object[], started: number }>} the faults not sent with why, and how many pages ran
 */
export async function schedulePages(pass, { firstCheck, brief = null, result, run }) {
  const { pages, skipped } = faultsToSend({
    firstCheck,
    brief,
    altSlots: pass.altSlots,
    contentMap: pass.contentMap
  })
  const running = new Set()
  let started = 0
  // Recover failed pages first, one at a time: a shared menu repair can restore all of them.
  const ordered = [
    ...pages.filter((p) => p.faults.some(unavailablePage)),
    ...pages.filter((p) => !p.faults.some(unavailablePage))
  ]
  for (const p of ordered) {
    const exclusive = p.faults.some(unavailablePage)
    if (exclusive) await Promise.all(running)
    while (running.size >= pass.clock.limits.turnsAtOnce) await Promise.race(running)
    started += 1
    if (pass.undoUnverified) {
      result.notSent.push({ page: p.page, round: 1, faults: p.faults.length, reason: 'undo-unverified' })
      continue
    }
    if (pass.clock.stopped()) {
      result.notSent.push({ page: p.page, round: 1, faults: p.faults.length, reason: 'time-limit' })
      continue
    }
    const task = run(p)
      .catch((error) => {
        const reason = String(error?.message ?? error)
        result.errors.push({ page: p.page, error: reason })
        pass.log(`step 9b: ${p.page} failed, the other pages go on: ${reason}`)
      })
      .finally(() => running.delete(task))
    running.add(task)
    if (exclusive) await task
  }
  await Promise.all(running)
  return { skipped, started }
}
