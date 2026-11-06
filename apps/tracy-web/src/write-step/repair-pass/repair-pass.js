// Step 9b, the repair pass through Tracy's site agent (#448; ADR 0044 decision 30). After the write and the first site
// check (with the finder beside it), it does what a person does with the preview's comment popover: for each page with
// customer-visible faults, point at each element, say in one sentence what should change, and ask Tracy to edit, one turn
// per page (repair-turns.js), in one session it opened for the site as the site owner. Then the site check runs again; a
// turn is undone (the whole turn, newest first) when that check shows a new blocking failure on a page the turn changed.
// Faults the check still fails on get one resend round, judged the same way; then the pass ends. Past `stopNewWorkMs` no
// new turn and no round starts, and the pass returns by `returnByMs` (repair-limits.js).
//
// It reaches the agent only through `agent`, the site check only through `checkSite`, so tests give fakes. It throws on
// anything it cannot handle; the caller (write-step-nine.js) then takes back the turns in `ledger` and hands over the site as
// written. Repairs are Tracy turns of the pass's session, so the customer sees and can undo each one in Site changes.
import { faultsToSend, newBlocking, pageOf, stillThere } from './repair-faults.js'
import { sendPageTurn } from './repair-turns.js'

/** The turns to undo after `later`: those that changed a page with a new blocking failure, newest first. */
function turnsToUndo(turns, first, later) {
  const broken = new Set(
    newBlocking(first, later)
      .map((f) => pageOf(f.page))
      .filter(Boolean)
  )
  const changed = (t) => new Set([t.page, ...t.changes.map((c) => pageOf(c.page)).filter(Boolean)])
  return turns
    .filter((t) => t.turnId && t.changes.length && [...changed(t)].some((p) => broken.has(p)))
    .reverse()
}

/** Undoes `turns` in the order given (newest first), each whole; a refusal is kept with its code. */
export async function undoTurns(pass, turns, why) {
  const undone = []
  for (const turn of turns) {
    if (pass.clock.returnLeft() <= 0) break
    const answer = await pass.agent
      .undo({ sessionId: pass.sessionId, turnId: turn.turnId })
      .catch((error) => ({ ok: false, code: String(error?.message ?? error) }))
    const entry = {
      turnId: turn.turnId,
      page: turn.page,
      why,
      ok: answer?.ok === true,
      code: answer?.code ?? null
    }
    undone.push(entry)
    if (entry.ok) pass.ledger.undone.add(turn.turnId)
    else pass.log(`step 9b: undo of ${turn.turnId} on ${turn.page} refused: ${entry.code}`)
  }
  return undone
}

/** The site check within the time left before the pass returns; a late check throws, as any 9b error. */
async function checkNow(pass) {
  const done = await pass.clock.within(() => pass.checkSite(), pass.clock.checkLeft())
  if (done.late) throw new Error('the site check after the repairs did not end in the time left')
  return done.value
}

/** One round: a turn per page while new work may start. */
async function sendRound(pass, pages, round, result) {
  const turns = []
  for (const { page, faults } of pages) {
    if (pass.clock.stopped()) {
      result.notSent.push({
        page,
        round,
        faults: faults.length,
        reason: 'the time limit for new work was reached'
      })
      continue
    }
    const turn = await sendPageTurn(pass, { page, faults, round })
    if (turn.turnId) {
      pass.ledger.turns.push(turn)
      turns.push(turn)
    } else
      result.dropped.push({ page, round, reason: turn.dropped ?? turn.refused, requestIds: turn.requestIds })
  }
  return turns
}

/**
 * @param {object} pass `{ agent, clock, checkSite, buildCommentTurn, urlOf, log, ledger, nextRequestId }`
 * @param {{ firstCheck: object, found?: object[] }} input
 * @returns {Promise<object>} the pass's result: `check` the site check of the site handed over, and what was sent, made,
 *   undone, resent, dropped and skipped
 */
export async function runRepairPass(pass, { firstCheck, found = [] }) {
  const { pages, skipped } = faultsToSend({ firstCheck, found })
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
  const opened = await pass.agent.open()
  if (!opened?.sessionId)
    throw new Error(`no site agent session: ${opened?.reason ?? 'the session was not opened'}`)
  pass.sessionId = opened.sessionId
  result.sessionId = opened.sessionId

  const first = await sendRound(pass, pages, 1, result)
  result.turns.push(...first)
  if (!first.length) return { ...result, check: firstCheck }
  let check = await checkNow(pass)
  result.checks += 1
  const bad = turnsToUndo(first, firstCheck, check)
  result.undone.push(...(await undoTurns(pass, bad, 'a new blocking failure on a page it changed')))

  // One resend round: the faults the check still fails on, on pages whose turn was kept.
  const kept = first.filter((t) => !pass.ledger.undone.has(t.turnId))
  const again = kept
    .map((t) => ({ page: t.page, faults: stillThere(t.faults, check) }))
    .filter((p) => p.faults.length)
  let touched = bad.length > 0
  if (again.length && !pass.clock.stopped()) {
    const resent = await sendRound(pass, again, 2, result)
    result.turns.push(...resent)
    result.resent.push(...resent.map((t) => ({ page: t.page, turnId: t.turnId, faults: t.faults.length })))
    if (resent.length) {
      check = await checkNow(pass)
      result.checks += 1
      const worse = turnsToUndo(resent, firstCheck, check)
      result.undone.push(...(await undoTurns(pass, worse, 'a new blocking failure after the resend')))
      touched ||= worse.length > 0
    }
  }
  // An undo changed the site after the last check: measure what is handed over, when there is time.
  if (touched) {
    check = await checkNow(pass)
    result.checks += 1
  }
  return { ...result, check }
}
