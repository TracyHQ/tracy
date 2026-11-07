// One page of step 9b (#448): a session of its own for the site, as the site owner; one turn with the page's faults
// (repair-turns.js); a turn still open at the time limit cut short and read again (`cutShort`); the turn judged by the
// check after it (repair-check.js), undone when it made a page it changed worse. Faults still there once it is kept (the
// check's, and the finder's on a second look at this page) get one resend in the same session, judged the same way.
import { stillSeen, stillThere } from './repair-faults.js'
import { cutShort, sendPageTurn } from './repair-turns.js'

/** One turn of the page, kept in the ledger and the result; null when none was made. */
async function sendOne(pass, result, { page, faults, round, sessionId }) {
  const cap = pass.clock.limits.itemsPerTurn
  if (faults.length > cap)
    result.notSent.push({
      page,
      round,
      faults: faults.length - cap,
      reason: 'item-cap',
      slots: faults.slice(cap).map((f) => f.slot ?? f.block ?? f.kind)
    })
  const from = pass.clock.now()
  const turn = await sendPageTurn(pass, { page, faults: faults.slice(0, cap), round, sessionId })
  if (turn.timeLimit) {
    result.notSent.push({ page, round, faults: turn.faults.length, reason: 'time-limit' })
    return null
  }
  if (!turn.turnId) {
    result.dropped.push({ page, round, reason: turn.dropped ?? turn.refused, requestIds: turn.requestIds })
    return null
  }
  pass.ledger.turns.push(turn)
  result.turns.push(turn)
  if (turn.state === 'open') await cutShort(pass, turn)
  pass.mark?.('turn', from, { page, round, turnId: turn.turnId, state: turn.state })
  return turn
}

/** What is still failing on the page after its kept turn: the check's faults, and the finder's on a second look. */
async function stillFailing(pass, turn, check) {
  let refound = []
  if (turn.faults.some((f) => f.source === 'finder') && pass.refind && !pass.clock.stopped()) {
    const from = pass.clock.now()
    const look = await pass.clock
      .within(() => pass.refind([turn.page]), Math.min(pass.clock.limits.finderMs, pass.clock.workLeft()))
      .catch((error) => ({ value: { faults: [], problem: String(error?.message ?? error) } }))
    pass.mark?.('finder-again', from, { page: turn.page })
    if (look.late) pass.log(`step 9b: the finder did not look at ${turn.page} again in the time left`)
    else refound = look.value?.faults ?? []
  }
  return [...stillThere(turn.faults, check), ...stillSeen(turn.faults, refound)]
}

/**
 * @param {object} pass the pass's context (repair-pass.js)
 * @param {{ page: string, faults: object[] }} page
 * @param {object} result the pass's result
 * @param {{ judge: (turn: object) => Promise<{ undone: boolean }> }} checks the check worker (repair-check.js)
 * @param {{ check: object }} state the site as it now is
 */
export async function repairPage(pass, { page, faults }, result, checks, state) {
  const from = pass.clock.now()
  const opened = await pass.clock.bounded('the site agent session', () => pass.agent.open())
  if (!opened?.sessionId)
    throw new Error(`no site agent session: ${opened?.reason ?? 'the session was not opened'}`)
  const { sessionId } = opened
  result.sessions.push(sessionId)
  pass.mark?.('session', from, { page })
  const turn = await sendOne(pass, result, { page, faults, round: 1, sessionId })
  if (!turn || turn.leftOpen) return
  const verdict = await checks.judge(turn)
  // A turn that wrote nothing gave no check to resend from; a cut-short or undone one is not resent.
  if (verdict.undone || pass.clock.stopped() || turn.cancelled || !turn.changes.length) return
  const again = await stillFailing(pass, turn, state.check)
  if (!again.length || pass.clock.stopped()) return
  const resent = await sendOne(pass, result, { page, faults: again, round: 2, sessionId })
  if (!resent) return
  result.resent.push({ page, turnId: resent.turnId, faults: resent.faults.length })
  if (!resent.leftOpen) await checks.judge(resent)
}
