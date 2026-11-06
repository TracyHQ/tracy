// Step 9b, the repair pass through Tracy's site agent (#448; ADR 0044 decision 30). After the write and the first site
// check (with the finder beside it), it does what a person does with the preview's comment popover: for each page with
// customer-visible faults, point at each element, say in one sentence what should change, and ask Tracy to edit, one turn
// per page (repair-turns.js), in one session it opened for the site as the site owner. Then the site check runs again; a
// turn is undone (the whole turn, newest first) when that check shows a new blocking failure on a page it changed, read
// from what it wrote (repair-judge.js). Faults still there (the check's, and the finder's on a second look at their pages)
// get one resend round, judged the same way; then the pass ends. Every turn of the pass's request ids is judged, a late or
// duplicate one too; a turn is never judged while open, and one still open at the return is cancelled and taken back.
// Past `stopNewWorkMs` no new turn and no round starts, and the pass returns by `returnByMs` (repair-limits.js).
//
// It reaches the agent only through `agent`, the site check only through `checkSite`, so tests give fakes. It throws on
// anything it cannot handle; the caller (write-step-nine.js) then takes back the turns in `ledger` and hands over the site as
// written. Repairs are Tracy turns of the pass's session, so the customer sees and can undo each one in Site changes.
import { faultsToSend, stillSeen, stillThere } from './repair-faults.js'
import { recordPagesOf, turnsToUndo, undoTurns } from './repair-judge.js'
import { sendPageTurn, sweepTurns } from './repair-turns.js'

export { undoTurns } from './repair-judge.js'

/** The site check within the time left before the pass returns; a late check throws, as any 9b error. */
async function checkNow(pass) {
  const done = await pass.clock.within(() => pass.checkSite(), pass.clock.checkLeft())
  if (done.late) throw new Error('the site check after the repairs did not end in the time left')
  return done.value
}

/** One round: a turn per page while new work may start; faults past the per-turn cap are logged, never sent. */
async function sendRound(pass, pages, round, result) {
  const cap = pass.clock.limits.itemsPerTurn
  for (const { page, faults } of pages) {
    if (pass.clock.stopped()) {
      result.notSent.push({ page, round, faults: faults.length, reason: 'time-limit' })
      continue
    }
    if (faults.length > cap)
      result.notSent.push({
        page,
        round,
        faults: faults.length - cap,
        reason: 'item-cap',
        slots: faults.slice(cap).map((f) => f.slot ?? f.block ?? f.kind)
      })
    const turn = await sendPageTurn(pass, { page, faults: faults.slice(0, cap), round })
    if (turn.turnId) {
      pass.ledger.turns.push(turn)
      result.turns.push(turn)
    } else
      result.dropped.push({ page, round, reason: turn.dropped ?? turn.refused, requestIds: turn.requestIds })
  }
}

/** Waits for the open turns of the pass until only the last check's time is left; then cancels what is still open. */
async function settle(pass, result) {
  const { clock, ledger } = pass
  for (;;) {
    await sweepTurns(pass, result)
    if (!ledger.turns.some((t) => t.state === 'open') || clock.waitLeft() <= 0) break
    await clock.sleep(Math.max(1, Math.min(clock.limits.pollMs, clock.waitLeft())))
  }
  const open = ledger.turns.filter((t) => t.state === 'open')
  if (!open.length) return
  const ids = open.map((t) => t.turnId).join(', ')
  if (typeof pass.agent.cancel !== 'function') {
    pass.log(
      `step 9b: ${ids} still open at the time limit, and the site agent cannot cancel; left open, not judged`
    )
    for (const t of open) t.leftOpen = true
    return
  }
  const answer = await clock
    .bounded('the session cancel', () => pass.agent.cancel({ sessionId: pass.sessionId }))
    .catch((error) => ({ ok: false, code: String(error?.message ?? error) }))
  pass.log(
    `step 9b: ${ids} still open at the time limit; the session's work was cancelled (${answer?.ok === false ? `refused: ${answer.code}` : 'accepted'})`
  )
  for (const t of open) t.cancelled = true
  await sweepTurns(pass, result)
}

/**
 * Judges the turns no check has judged yet once they ended: the site check runs, and those that made a page worse are
 * undone. A turn cut short by a cancel is not judged: it is taken back. Returns whether the site changed after the check.
 */
async function judge(pass, result, state, why) {
  const pending = pass.ledger.turns.filter(
    (t) => !t.judged && t.state !== 'open' && !pass.ledger.undone.has(t.turnId)
  )
  if (!pending.length) return false
  const cut = pending.filter((t) => t.cancelled)
  const ended = pending.filter((t) => !t.cancelled)
  for (const t of pending) t.judged = true
  let bad = []
  if (ended.length) {
    state.check = await checkNow(pass)
    result.checks += 1
    bad = turnsToUndo(ended, state.first, state.check, recordPagesOf(pass.ledger))
    result.undone.push(...(await undoTurns(pass, bad, why)))
  }
  const back = cut.filter((t) => t.changes.length).reverse()
  result.undone.push(
    ...(await undoTurns(pass, back, 'cancelled while open at the time limit, so never judged'))
  )
  return bad.length + back.length > 0
}

/** The faults to send again: the check's still failing, and the finder's still seen on a second look at their pages. */
async function stillFailing(pass, turns, check) {
  const finderPages = [
    ...new Set(turns.filter((t) => t.faults.some((f) => f.source === 'finder')).map((t) => t.page))
  ]
  let refound = []
  if (finderPages.length && pass.refind && !pass.clock.stopped()) {
    const look = await pass.clock
      .within(() => pass.refind(finderPages), Math.min(pass.clock.limits.finderMs, pass.clock.workLeft()))
      .catch((error) => ({ value: { faults: [], problem: String(error?.message ?? error) } }))
    if (look.late)
      pass.log('step 9b: the finder did not look again in the time left; its faults are not resent')
    else refound = look.value?.faults ?? []
  }
  return turns
    .map((t) => ({ page: t.page, faults: [...stillThere(t.faults, check), ...stillSeen(t.faults, refound)] }))
    .filter((p) => p.faults.length)
}

/**
 * @param {object} pass `{ agent, clock, checkSite, buildCommentTurn, urlOf, pageHtml?, refind?, log, ledger,
 *   nextRequestId }`; `ledger` is `{ turns, undone, records }`
 * @param {{ firstCheck: object, found?: object[], brief?: Map<string, string[]> | null }} input
 * @returns {Promise<object>} the pass's result: `check` the site check of the site handed over, and what was sent, made,
 *   undone, resent, dropped, skipped and not sent
 */
export async function runRepairPass(pass, { firstCheck, found = [], brief = null }) {
  const { pages, skipped } = faultsToSend({ firstCheck, found, brief })
  const result = {
    status: 'done',
    skipped,
    turns: [],
    undone: [],
    resent: [],
    dropped: [],
    notSent: [],
    checks: 1
  }
  if (!pages.length) return { ...result, status: 'nothing-to-send', check: firstCheck }
  const opened = await pass.clock.bounded('the site agent session', () => pass.agent.open())
  if (!opened?.sessionId)
    throw new Error(`no site agent session: ${opened?.reason ?? 'the session was not opened'}`)
  pass.sessionId = opened.sessionId
  result.sessionId = opened.sessionId

  await sendRound(pass, pages, 1, result)
  const state = { first: firstCheck, check: firstCheck }
  await sweepTurns(pass, result)
  let touched = await judge(pass, result, state, 'a new blocking failure on a page it changed')
  // One resend round: what is still there on pages whose turn was judged and kept.
  const kept = pass.ledger.turns.filter((t) => t.round === 1 && t.judged && !pass.ledger.undone.has(t.turnId))
  const again = state.check === firstCheck ? [] : await stillFailing(pass, kept, state.check)
  if (again.length && !pass.clock.stopped()) {
    const before = result.turns.length
    await sendRound(pass, again, 2, result)
    const resent = result.turns.slice(before)
    result.resent.push(...resent.map((t) => ({ page: t.page, turnId: t.turnId, faults: t.faults.length })))
  }
  await settle(pass, result)
  touched = (await judge(pass, result, state, 'a new blocking failure after the resend')) || touched
  // An undo changed the site after the last check: measure what is handed over, when there is time.
  if (touched) {
    state.check = await checkNow(pass)
    result.checks += 1
  }
  return { ...result, check: state.check }
}
