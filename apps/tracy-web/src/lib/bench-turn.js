// A model turn as a bench stores it: the columns of a turn row from a turn as runAgent hands it to onTurn, and the
// turn back from its row. Shared by the planner bench and the brand bench (#301, #320).
import { iso, num } from './bench-sql.js'

/** The columns of one turn row, from a turn as runAgent hands it to onTurn. */
export function turnRow(turn, round) {
  const refused =
    turn.state === 'answered' && (Boolean(turn.refusal) || turn.finishReason === 'content_filter')
  return {
    n: turn.n,
    round,
    state: refused ? 'refused' : turn.state,
    request: turn.request ?? {},
    sent: turn.sent ?? [],
    message: turn.message ?? null,
    finish_reason: turn.finishReason ?? null,
    generation_id: turn.generationId ?? null,
    provider_model: turn.providerModel ?? null,
    refusal: turn.refusal ?? null,
    error: turn.error ?? null,
    usage: turn.usage ?? null,
    cost_usd: turn.cost ?? null,
    dispatched_at: turn.dispatchedAt,
    answered_at: turn.answeredAt ?? null,
    resend_of: turn.resendOf ?? null,
    retries: turn.retries ?? null
  }
}

/** A turn as runAgent takes it back in `history`, from its row. */
export function turnOf(row) {
  const state = row.state === 'refused' ? 'answered' : row.state
  const turn = { n: row.n, state, sent: row.sent, request: row.request, dispatchedAt: iso(row.dispatched_at) }
  if (row.resend_of !== null && row.resend_of !== undefined) turn.resendOf = row.resend_of
  if (Array.isArray(row.retries)) turn.retries = row.retries
  if (state === 'answered')
    Object.assign(turn, {
      message: row.message,
      finishReason: row.finish_reason,
      generationId: row.generation_id,
      providerModel: row.provider_model,
      usage: row.usage,
      cost: num(row.cost_usd),
      // The request keeps the price table a cost was computed from; without one the cost is the provider's own.
      ...(row.request?.price ? { costSource: 'price-table' } : {}),
      ...(row.refusal ? { refusal: row.refusal } : {})
    })
  if (state === 'failed') turn.error = row.error
  if (state === 'abandoned') turn.error = row.error
  else if (state !== 'dispatched') turn.answeredAt = iso(row.answered_at)
  return turn
}
