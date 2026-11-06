// One page turn of step 9b (#448), sent as a person sends comments from the preview: the comment requests are made through
// the requests door (the agent's `request`, which numbers them), the numbered comment turn is built from them, and it is
// prompted into the pass's session through the site session prompt path demo QA uses (the agent's `prompt`). Completion is
// read from the site turn records (the agent's `turns`), as demo QA does: a turn on this prompt's request id that is closed
// or stale. A prompt that opened no turn in `noTurnMs` is resent once under a new request id; a resend that opened none
// either is dropped and logged. A turn still open when new work must stop is left as it is and said.
import { commentItem, pageTurn } from './repair-items.js'

const ENDED = new Set(['closed', 'stale'])

/** Waits for a turn on one of `requestIds`: the turn once ended, `{ open }` when time ran out on an open one, or null. */
async function awaitTurn(pass, requestIds, noTurnBy) {
  const { agent, sessionId, clock } = pass
  let open = null
  for (;;) {
    const turns = await agent.turns({ sessionId, requestIds })
    const ended = turns.find((t) => ENDED.has(t.state))
    if (ended) return ended
    open = turns.find((t) => t.state === 'open') ?? open
    if (!open && clock.now() >= noTurnBy) return null
    if (clock.workLeft() <= 0) return open ? { ...open, open: true } : null
    await clock.sleep(Math.max(1, Math.min(clock.limits.pollMs, clock.workLeft())))
  }
}

/**
 * Sends one page's faults as one turn and waits for it.
 * @param {object} pass the pass's context (repair-pass.js)
 * @param {{ page: string, faults: object[], round: number }} input
 * @returns {Promise<object>} the turn record: `{ page, round, faults, numbers, requestIds, turnId, state, changes, costUsd,
 *   ms }`, or with `dropped` (no turn after one resend) or `refused` (the agent did not take the prompt)
 */
export async function sendPageTurn(pass, { page, faults, round }) {
  const { agent, sessionId, clock, buildCommentTurn } = pass
  const from = clock.now()
  const sent = faults.slice(0, clock.limits.itemsPerTurn)
  const items = sent.map((f) => commentItem(f, pass.urlOf))
  const requestId = pass.nextRequestId()
  const { numbers } = await agent.request({ sessionId, requestId, items })
  if (!Array.isArray(numbers) || numbers.length !== items.length)
    throw new Error(`the comment requests door numbered ${numbers?.length ?? 0} of ${items.length} items`)
  const text = pageTurn(buildCommentTurn, items, numbers)
  const record = { page, round, faults: sent, items, numbers, requestIds: [requestId], text }
  if (!(await agent.prompt({ sessionId, requestId, text })))
    return { ...record, refused: 'the session did not accept the prompt', ms: clock.now() - from }
  let turn = await awaitTurn(pass, record.requestIds, clock.now() + clock.limits.noTurnMs)
  if (!turn && !clock.stopped()) {
    const again = `${requestId}-resend`
    record.requestIds.push(again)
    pass.log(`step 9b: no turn on ${page} after ${clock.limits.noTurnMs / 1000} s; resent once`)
    if (await agent.prompt({ sessionId, requestId: again, text }))
      turn = await awaitTurn(pass, record.requestIds, clock.now() + clock.limits.noTurnMs)
  }
  const ms = clock.now() - from
  if (!turn) {
    pass.log(`step 9b: no turn on ${page} after the resend; dropped`)
    return { ...record, dropped: 'no turn opened after one resend', ms }
  }
  return {
    ...record,
    turnId: turn.turnId,
    state: turn.open ? 'open' : turn.state,
    changes: Array.isArray(turn.changes) ? turn.changes : [],
    costUsd: turn.costUsd ?? null,
    ms
  }
}
