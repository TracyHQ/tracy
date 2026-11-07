// When each page of step 9b goes (#448). A page is ready once the finder answered it (its faults come one page at a
// time through the feed, write-step-nine.js) or the finder ended; with no finder, every page is ready with the first site
// check. Ready pages start in the order their first fault was named, `turnsAtOnce` at a time, each run by `run` (one
// page's turns, repair-page.js); a page ready past the time new work stops is not sent (`time-limit`). Faults are held to
// the kind tables as they arrive (repair-faults.js), so a page's turn carries its check faults and its finder faults once.
import { faultsToSend, pageOf } from './repair-faults.js'

/**
 * The finder's answers as they come: `answer(page, faults)` for each page it looked at, `end(faults)` with every fault it
 * found once it ends (or was stopped).
 */
export function pageFeed() {
  const answered = new Map()
  let all = null
  let wake = []
  const ping = () => {
    const woken = wake
    wake = []
    for (const resolve of woken) resolve()
  }
  return {
    answer(page, faults) {
      answered.set(pageOf(page), Array.isArray(faults) ? faults : [])
      ping()
    },
    end(faults) {
      all = Array.isArray(faults) ? faults : [...answered.values()].flat()
      ping()
    },
    ended: () => all !== null,
    ready: (page) => all !== null || answered.has(pageOf(page)),
    faults: () => all ?? [...answered.values()].flat(),
    changed: () => new Promise((resolve) => wake.push(resolve))
  }
}

/**
 * Runs every page with faults to send, as they become ready, at most `turnsAtOnce` at once.
 * @returns {Promise<{ skipped: object[], started: number }>} the faults not sent with why, and how many pages ran
 */
export async function schedulePages(
  pass,
  { firstCheck, found = [], brief = null, feed = null, result, run }
) {
  const started = new Set()
  const running = new Set()
  let failed = null
  let skipped = []
  for (;;) {
    const sorted = faultsToSend({ firstCheck, found: feed ? feed.faults() : found, brief })
    skipped = sorted.skipped
    const waiting = sorted.pages.filter((p) => !started.has(p.page))
    for (const p of waiting) {
      if (running.size >= pass.clock.limits.turnsAtOnce || failed) break
      if (feed && !feed.ready(p.page)) continue
      started.add(p.page)
      if (pass.clock.stopped()) {
        result.notSent.push({ page: p.page, round: 1, faults: p.faults.length, reason: 'time-limit' })
        continue
      }
      const task = run(p)
        .catch((error) => {
          failed ??= error
        })
        .finally(() => running.delete(task))
      running.add(task)
    }
    const left = sorted.pages.some((p) => !started.has(p.page))
    if (!running.size && (failed || (!left && (!feed || feed.ended())))) break
    await Promise.race([...running, ...(feed && !feed.ended() ? [feed.changed()] : [])])
  }
  if (failed) throw failed
  return { skipped, started: started.size }
}
