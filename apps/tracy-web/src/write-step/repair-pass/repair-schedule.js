// When each page of step 9b goes (#448). Every page with faults to send is ready with the first site check; pages start
// in the order their first fault was named, `turnsAtOnce` at a time, each run by `run` (one page's turns, repair-page.js).
// A page ready past the time new work stops is not sent (`time-limit`). A page whose run throws is logged with its error
// in `result.errors` and the other pages go on: one page's failure never stops the pass.
import { faultsToSend, unavailablePage } from './repair-faults.js'

/**
 * A kind of fault (a template picture, a template link…) whose turns changed nothing on this many pages, turn and retry
 * alike, is not sent to the pages after them in this pass; it stays a fault of the check, as an unsent one does. On the
 * local stand (JA Boxing, run6, run11, run12, 12–15/11/2026) every 9b turn on template pictures and links ended with no
 * change, and the same shared picture was sent again page after page: run12 spent 9 turns, 10.9 minutes, on them and
 * changed nothing. A page with a kind not yet tried still gets its turns.
 */
export const NO_CHANGE_PAGES = 2

const kindOf = (fault) => String(fault?.kind ?? fault?.group ?? '')

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
  // Per kind of fault, the pages whose turns all ended with no change.
  const unchanged = new Map()
  const settle = ({ page, faults }) => {
    const turns = result.turns.filter((t) => t.page === page)
    if (!turns.length || !turns.every((t) => t.verdict === 'no-change')) return
    for (const kind of new Set(faults.map(kindOf))) unchanged.set(kind, (unchanged.get(kind) ?? 0) + 1)
  }
  const spentKind = (fault) =>
    !unavailablePage(fault) && (unchanged.get(kindOf(fault)) ?? 0) >= NO_CHANGE_PAGES
  // Recover failed pages first, one at a time: a shared menu repair can restore all of them.
  const ordered = [
    ...pages.filter((p) => p.faults.some(unavailablePage)),
    ...pages.filter((p) => !p.faults.some(unavailablePage))
  ]
  for (const ready of ordered) {
    const exclusive = ready.faults.some(unavailablePage)
    if (exclusive) await Promise.all(running)
    while (running.size >= pass.clock.limits.turnsAtOnce) await Promise.race(running)
    const spent = ready.faults.filter(spentKind)
    for (const fault of spent)
      result.skipped.push({
        fault,
        code: 'kind-unchanged',
        reason: `turns on ${NO_CHANGE_PAGES} pages changed nothing for this kind of fault (${kindOf(fault)})`
      })
    if (spent.length === ready.faults.length) continue
    const p = spent.length ? { ...ready, faults: ready.faults.filter((f) => !spent.includes(f)) } : ready
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
      .finally(() => {
        running.delete(task)
        settle(p)
      })
    running.add(task)
    if (exclusive) await task
  }
  await Promise.all(running)
  return { skipped, started }
}
