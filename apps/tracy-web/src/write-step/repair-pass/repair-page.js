// One page of step 9b (#448): a session of its own for the site, as the site owner; the page's faults as comment items,
// packed into as few turns as fit the comment turn's budget (repair-parts.js), sent one after the other in that session
// (repair-turns.js); a turn still open at the time limit cut short and read again (`cutShort`); each turn judged by the
// check after it (repair-check.js), undone when it made a page it changed worse. Site check faults still there once a turn
// is kept get one resend round in the same session, packed and judged the same way.
import { pageItems } from './repair-locate.js'
import { faultsToSend, stillThere } from './repair-faults.js'
import { turnParts } from './repair-parts.js'
import { cutShort, sendPageTurn } from './repair-turns.js'

const slotsOf = (faults) => faults.map((f) => f.slot ?? f.block ?? f.kind)

/** One turn of the page, kept in the ledger and the result; null when none was made, `{ stop }` past the time limit. */
async function sendOne(pass, result, { page, faults, items, round, sessionId }) {
  const from = pass.clock.now()
  const turn = await sendPageTurn(pass, { page, faults, items, round, sessionId })
  if (turn.timeLimit) {
    result.notSent.push({ page, round, faults: turn.faults.length, reason: 'time-limit' })
    return { stop: true }
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

/**
 * One round of the page: its faults (at most `itemsPerTurn`, the rest named `item-cap`) as items, packed into turns
 * (an item no turn holds named `too-long`), each sent and judged in turn.
 * @returns {Promise<{ made: object[], kept: object[] }>} the turns made, and those of them judged and not undone
 */
async function sendRound(pass, result, checks, { page, faults, round, sessionId }) {
  const cap = pass.clock.limits.itemsPerTurn
  if (faults.length > cap)
    result.notSent.push({
      page,
      round,
      faults: faults.length - cap,
      reason: 'item-cap',
      slots: slotsOf(faults.slice(cap))
    })
  const capped = faults.slice(0, cap)
  const items = await pageItems(pass, page, capped)
  const { parts, tooLong } = turnParts(pass.buildCommentTurn, items)
  if (tooLong.length) {
    const left = tooLong.map((i) => capped[i])
    result.notSent.push({ page, round, faults: left.length, reason: 'too-long', slots: slotsOf(left) })
    pass.log(`step 9b: ${left.length} fault(s) on ${page} do not fit a comment turn even alone; not sent`)
  }
  const made = []
  const kept = []
  for (const [k, part] of parts.entries()) {
    if (pass.writerOpen) {
      result.notSent.push({ page, round, faults: parts.slice(k).flat().length, reason: 'open-turn' })
      break
    }
    const turnFaults = part.map((i) => capped[i])
    if (k > 0 && pass.clock.stopped()) {
      const rest = parts.slice(k).flat().length
      result.notSent.push({ page, round, faults: rest, reason: 'time-limit' })
      break
    }
    const turn = await sendOne(pass, result, {
      page,
      faults: turnFaults,
      items: part.map((i) => items[i]),
      round,
      sessionId
    })
    if (turn?.stop) break
    if (!turn) continue
    made.push(turn)
    if (turn.leftOpen) continue
    const verdict = await checks.judge(turn)
    if (!verdict.undone) kept.push(turn)
  }
  return { made, kept }
}

/**
 * @param {object} pass the pass's context (repair-pass.js)
 * @param {{ page: string, faults: object[] }} page
 * @param {object} result the pass's result
 * @param {{ judge: (turn: object) => Promise<{ undone: boolean }> }} checks the check worker (repair-check.js)
 * @param {{ check: object }} state the site as it now is
 */
export async function repairPage(pass, { page, faults }, result, checks, state) {
  // A shared repair can clear a queued page while it waits for a free session.
  // Only a completed check can remove its faults; scoped checks retain the other pages.
  if (pass.writerOpen) {
    result.notSent.push({ page, round: 1, faults: faults.length, reason: 'open-turn' })
    return
  }
  faults = stillThere(faults, state.check)
  if (!faults.length) return
  const from = pass.clock.now()
  const opened = await pass.clock.bounded('the site agent session', () => pass.agent.open())
  if (!opened?.sessionId)
    throw new Error(`no site agent session: ${opened?.reason ?? 'the session was not opened'}`)
  const { sessionId } = opened
  result.sessions.push(sessionId)
  pass.mark?.('session', from, { page })
  const { kept } = await sendRound(pass, result, checks, { page, faults, round: 1, sessionId })
  // A completed no-op gets the same single retry as a write. Recovery can expose faults that could not be measured before.
  const retryable = kept.filter((t) => !t.cancelled && t.verdict !== 'unverified')
  const exposed = retryable.some((t) => t.newlyObserved?.length)
  const exposedFaults = exposed
    ? faultsToSend({
        firstCheck: state.check,
        brief: pass.brief,
        altSlots: pass.altSlots,
        contentMap: pass.contentMap
      })
    : null
  for (const skipped of exposedFaults?.skipped ?? [])
    if (
      skipped.fault.page === page &&
      !result.skipped.some(
        (s) => s.code === skipped.code && s.fault.page === page && s.fault.slot === skipped.fault.slot
      )
    )
      result.skipped.push(skipped)
  const again = exposedFaults
    ? (exposedFaults.pages.find((p) => p.page === page)?.faults ?? [])
    : retryable.flatMap((t) => stillThere(t.faults, state.check))
  if (!again.length || pass.clock.stopped() || pass.writerOpen) return
  const { made } = await sendRound(pass, result, checks, { page, faults: again, round: 2, sessionId })
  for (const t of made) result.resent.push({ page, turnId: t.turnId, faults: t.faults.length })
}
