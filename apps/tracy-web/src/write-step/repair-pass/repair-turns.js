// One page turn of step 9b (#448), sent as a person sends comments from the preview: the items are made as the popover
// makes them (repair-locate.js), the comment requests through the requests door (the agent's `request`, which numbers
// them), the numbered comment turn is built from them and prompted into the pass's session through the site session
// prompt path demo QA uses (the agent's `prompt`). Completion is read from the site turn records (the agent's `turns`): a
// turn on one of this prompt's request ids that is closed or stale. A prompt that opened no turn in `noTurnMs` is resent
// once under a new request id; a resend that opened none either is dropped and logged. An open turn is waited for until
// only the last check's and the undos' time is left (`waitLeft`), then left open and said. Every call races the step clock.
//
// Every request id is kept in the ledger with the page record it belongs to, because the session queue can still run a
// dropped prompt later, and a resend can yield two turns: `sweepTurns` reads every turn of every request id of the pass,
// and a turn the ledger does not hold yet joins it (`late` for a dropped page, `duplicate` beside a page's turn), to be
// judged and undone like the rest.
import { pageItems } from './repair-locate.js'
import { pageTurn } from './repair-items.js'

const ENDED = new Set(['closed', 'stale'])

/** The turn records of `requestIds`, within the time left. */
export const readTurns = (pass, requestIds) =>
  pass.clock.bounded('the site turn records', () =>
    pass.agent.turns({ sessionId: pass.sessionId, requestIds })
  )

/** Waits for a turn on one of `requestIds`: the turn once ended, `{ open }` when time ran out on an open one, or null. */
async function awaitTurn(pass, requestIds, noTurnBy) {
  const { clock } = pass
  let open = null
  for (;;) {
    const turns = await readTurns(pass, requestIds)
    const ended = turns.find((t) => ENDED.has(t.state))
    if (ended) return ended
    open = turns.find((t) => t.state === 'open') ?? open
    if (!open && (clock.now() >= noTurnBy || clock.workLeft() <= 0)) return null
    const left = open ? clock.waitLeft() : Math.min(noTurnBy - clock.now(), clock.workLeft())
    if (left <= 0) return open ? { ...open, open: true } : null
    await clock.sleep(Math.max(1, Math.min(clock.limits.pollMs, left)))
  }
}

/** A turn of the site turn records as the ledger keeps it, for the page record it answers. */
export const turnEntry = (record, turn, how) => ({
  ...record,
  how,
  turnId: turn.turnId,
  state: turn.open ? 'open' : turn.state,
  changes: Array.isArray(turn.changes) ? turn.changes : [],
  costUsd: turn.costUsd ?? null
})

/** Brings what the records now say into a turn the ledger holds (an open turn that ended, its writes). */
const refresh = (entry, turn) => {
  entry.state = turn.state
  entry.changes = Array.isArray(turn.changes) ? turn.changes : entry.changes
  entry.costUsd = turn.costUsd ?? entry.costUsd
}

/**
 * Reads every turn of the pass's request ids: turns the ledger holds are refreshed, others join it and `result.turns`.
 * @returns {Promise<object[]>} the turns that joined
 */
export async function sweepTurns(pass, result) {
  const { ledger } = pass
  const ids = [...ledger.records.keys()]
  if (!ids.length) return []
  const joined = []
  for (const turn of await readTurns(pass, ids)) {
    const held = ledger.turns.find((t) => t.turnId === turn.turnId)
    if (held) {
      refresh(held, turn)
      continue
    }
    const record = ledger.records.get(turn.rpcId)
    if (!record) continue
    const how = ledger.turns.some((t) => t.record === record) ? 'duplicate' : 'late'
    const entry = turnEntry(record, turn, how)
    entry.record = record
    ledger.turns.push(entry)
    result.turns.push(entry)
    joined.push(entry)
    pass.log(
      `step 9b: a ${how} turn ${turn.turnId} on ${record.page}, from request ${turn.rpcId}; judged with the rest`
    )
  }
  return joined
}

/**
 * Sends one page's faults as one turn and waits for it.
 * @param {object} pass the pass's context (repair-pass.js)
 * @param {{ page: string, faults: object[], round: number }} input
 * @returns {Promise<object>} the turn record: `{ page, round, faults, items, numbers, requestIds, turnId, state, changes,
 *   costUsd, ms, how }`, or with `dropped` (no turn after one resend) or `refused` (the agent did not take the prompt)
 */
export async function sendPageTurn(pass, { page, faults, round }) {
  const { agent, sessionId, clock, buildCommentTurn, ledger } = pass
  const from = clock.now()
  const items = await pageItems(pass, page, faults)
  const requestId = pass.nextRequestId()
  const { numbers } = await clock.bounded('the comment requests door', () =>
    agent.request({ sessionId, requestId, items, timeLeftMs: clock.workLeft() })
  )
  if (!Array.isArray(numbers) || numbers.length !== items.length)
    throw new Error(`the comment requests door numbered ${numbers?.length ?? 0} of ${items.length} items`)
  const text = pageTurn(buildCommentTurn, items, numbers)
  const record = { page, round, faults, items, numbers, requestIds: [requestId], text }
  const prompt = (id) =>
    clock.bounded('the site session prompt', () => agent.prompt({ sessionId, requestId: id, text }))
  ledger.records.set(requestId, record)
  if (!(await prompt(requestId)))
    return { ...record, refused: 'the session did not accept the prompt', ms: clock.now() - from }
  let turn = await awaitTurn(pass, record.requestIds, clock.now() + clock.limits.noTurnMs)
  if (!turn && !clock.stopped()) {
    const again = `${requestId}-resend`
    record.requestIds.push(again)
    ledger.records.set(again, record)
    pass.log(`step 9b: no turn on ${page} after ${clock.limits.noTurnMs / 1000} s; resent once`)
    if (await prompt(again))
      turn = await awaitTurn(pass, record.requestIds, clock.now() + clock.limits.noTurnMs)
  }
  const ms = clock.now() - from
  if (!turn) {
    pass.log(`step 9b: no turn on ${page} after the resend; dropped (its request ids stay followed)`)
    return { ...record, dropped: 'no turn opened after one resend', ms }
  }
  const entry = { ...turnEntry(record, turn, 'sent'), ms, record }
  if (turn.open)
    pass.log(`step 9b: the turn ${turn.turnId} on ${page} is still open; it is not judged while open`)
  return entry
}
