// Step 9b, the repair pass through Tracy's site agent (#448; ADR 0044 decision 30). After the write and the first site
// check (with the finder beside it), it does what a person does with the preview's comment popover: for each page with
// customer-visible faults, point at each element, say in one sentence what should change, and ask Tracy to edit, one turn
// per page (repair-page.js), each page in a session of its own opened for the site as the site owner. A page goes as soon
// as it has its faults (the finder's answer for it, with the first check's faults of that page), pages run side by side
// (repair-schedule.js), and each turn is judged by a site check of the pages it changed (repair-check.js): undone, the
// whole turn, when that check shows a new blocking failure on a page it changed. A turn still open at the time limit is
// cancelled and judged by what it wrote. Every turn of the pass's request ids is judged, a late or duplicate one too.
// Past `stopNewWorkMs` no new turn starts, and the pass returns by `returnByMs` (repair-limits.js).
//
// It reaches the agent only through `agent`, the site check only through `checkSite(pages)`, so tests give fakes. It throws
// on anything it cannot handle; the caller (write-step-nine.js) then takes back the turns in `ledger` and hands over the
// site as written. Repairs are Tracy turns, so the customer sees and can undo each one in Site changes.
import { checkWorker } from './repair-check.js'
import { blockingFailures } from './repair-faults.js'
import { itemsGate } from './repair-limits.js'
import { repairPage } from './repair-page.js'
import { schedulePages } from './repair-schedule.js'
import { cutShort, sweepTurns } from './repair-turns.js'

export { undoTurns } from './repair-judge.js'

/** Turns no page run judged (late or duplicate ones the sweep found): cut short when open, then judged together. */
async function judgeTheRest(pass, result, checks) {
  await sweepTurns(pass, result)
  const rest = pass.ledger.turns.filter((t) => !t.judged && !t.leftOpen && !pass.ledger.undone.has(t.turnId))
  for (const t of rest) {
    if (t.state !== 'open') continue
    // A late turn still running is waited for while there is time, then cut short.
    while (t.state === 'open' && pass.clock.waitLeft() > 0) {
      await pass.clock.sleep(Math.max(1, Math.min(pass.clock.limits.pollMs, pass.clock.waitLeft())))
      await sweepTurns(pass, result)
    }
    if (t.state === 'open') await cutShort(pass, t)
  }
  await Promise.all(rest.filter((t) => !t.leftOpen).map((t) => checks.judge(t)))
}

/**
 * @param {object} pass `{ agent, clock, checkSite, buildCommentTurn, urlOf, pageHtml?, refind?, log, ledger,
 *   nextRequestId, mark? }`; `ledger` is `{ turns, undone, records }`
 * @param {{ firstCheck: object, found?: object[], feed?: object | null, brief?: Map<string, string[]> | null }} input
 *   `feed` the finder's answers page by page (repair-schedule.js `pageFeed`); without it, `found` is all it found
 * @returns {Promise<object>} the pass's result: `check` the site check of the site handed over, and what was sent, made,
 *   undone, resent, dropped, skipped and not sent
 */
export async function runRepairPass(pass, { firstCheck, found = [], feed = null, brief = null }) {
  const result = {
    status: 'done',
    skipped: [],
    sessions: [],
    turns: [],
    undone: [],
    resent: [],
    dropped: [],
    notSent: [],
    checks: 1
  }
  pass.result = result
  pass.rate ??= itemsGate(pass.clock)
  // Every slot the first check names places its record on a page (repair-judge.js `recordPagesOf`).
  pass.ledger.faults = blockingFailures(firstCheck)
  const state = { first: firstCheck, check: firstCheck }
  const checks = checkWorker(pass, state, result)
  const { skipped, started } = await schedulePages(pass, {
    firstCheck,
    found,
    feed,
    brief,
    result,
    run: (page) => repairPage(pass, page, result, checks, state)
  })
  result.skipped = skipped
  if (!started) return { ...result, status: 'nothing-to-send', check: firstCheck }
  await judgeTheRest(pass, result, checks)
  await checks.recheck()
  return { ...result, check: state.check }
}
