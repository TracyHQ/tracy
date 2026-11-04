// The brand bench's model call log (brand step trial bench, #320; migration 196, table brand_call): one row per model
// call. The agent's turns are saved the way the planner bench saves them (inserted dispatched before the call, then
// finished once; a turn with no answer is never sent again), reusing its turn row mapping. The drawing and
// reviewer calls the tools make are one row each, written when the call ends. Every finished call adds its cost to
// the run's cost split (agent / drawing / reviewer). Never a key, never image bytes.
import { turnOf, turnRow } from '../lib/bench-turn.js'
import { json } from '../lib/bench-sql.js'
import { fenced } from './brand-sql.js'

const COST_COLUMN = { agent: 'cost_agent_usd', drawing: 'cost_drawing_usd', reviewer: 'cost_reviewer_usd' }

/**
 * Save one agent turn: a dispatched turn is inserted, a finished one replaces its dispatched row once and adds its
 * cost to the run. False when nothing was written: a stale lease, a turn number already taken, or a turn already
 * finished.
 */
export async function saveTurn(
  pool,
  { runId, round, turn, model, leaseToken = null, costEstimated = false }
) {
  const r = turnRow(turn, round)
  if (r.state === 'dispatched') {
    const { rowCount } = await pool.query(
      `insert into brand_call (run_id, kind, n, round, model, purpose, state, request, sent, dispatched_at, resend_of)
       select $1::uuid, 'agent', $2::int, $3::int, $9::text, 'agent turn', 'dispatched', $4::jsonb, $5::jsonb,
              $6::timestamptz, $8::int
       where ${fenced(1, 7)}
       on conflict (run_id, n) where kind = 'agent' do nothing`,
      [runId, r.n, round, json(r.request), json(r.sent), r.dispatched_at, leaseToken, r.resend_of, model]
    )
    return rowCount === 1
  }
  const { rowCount } = await pool.query(
    `with t as (
       update brand_call set state = $3, message = $4, finish_reason = $5, generation_id = $6, provider_model = $7,
         refusal = $8, error = $9, usage = $10, cost_usd = $11, answered_at = $12, retries = $14::jsonb, cost_estimated = $15::boolean,
         latency_ms = (extract(epoch from ($12::timestamptz - dispatched_at)) * 1000)::int
       where run_id = $1 and kind = 'agent' and n = $2 and state = 'dispatched' and ${fenced(1, 13)}
       returning cost_usd)
     update brand_run set cost_agent_usd = cost_agent_usd + coalesce((select cost_usd from t), 0), updated_at = now()
     where id = $1 and exists (select 1 from t)`,
    [
      runId,
      r.n,
      r.state,
      json(r.message),
      r.finish_reason,
      r.generation_id,
      r.provider_model,
      r.refusal,
      json(r.error),
      json(r.usage),
      r.cost_usd,
      r.answered_at,
      leaseToken,
      json(r.retries),
      costEstimated
    ]
  )
  return rowCount === 1
}

/** What a streamed call in flight has received so far: a hint, one small update of the dispatched row. */
export async function saveTurnProgress(pool, { runId, n, progress, leaseToken = null }) {
  const { rowCount } = await pool.query(
    `update brand_call set progress = $3::jsonb
     where run_id = $1 and kind = 'agent' and n = $2 and state = 'dispatched' and ${fenced(1, 4)}`,
    [runId, n, json(progress), leaseToken]
  )
  return rowCount === 1
}

/** How many agent turns a round has saved: none means a fix round has not sent its message yet. */
export async function turnCountOf(pool, runId, round) {
  const { rows } = await pool.query(
    `select count(*)::int as n from brand_call where run_id = $1 and round = $2 and kind = 'agent'`,
    [runId, round]
  )
  return rows[0].n
}

/** Every saved agent turn of a run in order: the history runAgent resumes from. */
export async function turnsOf(pool, runId) {
  const { rows } = await pool.query(
    `select * from brand_call where run_id = $1 and kind = 'agent' order by n`,
    [runId]
  )
  return rows.map(turnOf)
}

/**
 * Log one finished drawing or reviewer call (a tool made it) and add its cost to the run's split. `status` is
 * 'answered' or 'failed'. False when the lease is stale.
 */
export async function logCall(pool, call) {
  const {
    runId,
    round,
    kind,
    tool,
    model,
    purpose,
    status,
    latencyMs,
    costUsd,
    costEstimated = false,
    usage,
    error,
    leaseToken = null
  } = call
  const column = COST_COLUMN[kind]
  if (!column || kind === 'agent') throw new Error(`logCall takes a drawing or reviewer call, not ${kind}`)
  const { rowCount } = await pool.query(
    `with c as (
       insert into brand_call (run_id, kind, round, tool, model, purpose, state, latency_ms, cost_usd, cost_estimated,
                               usage, error, answered_at)
       select $1::uuid, $2::text, $3::int, $4::text, $5::text, $6::text, $7::text, $8::int, $9::numeric, $13::boolean,
              $10::jsonb, $11::jsonb, now()
       where ${fenced(1, 12)}
       returning cost_usd)
     update brand_run set ${column} = ${column} + coalesce((select cost_usd from c), 0), updated_at = now()
     where id = $1 and exists (select 1 from c)`,
    [
      runId,
      kind,
      round,
      tool ?? null,
      model ?? null,
      purpose,
      status,
      latencyMs ?? null,
      costUsd ?? null,
      json(usage),
      json(error),
      leaseToken,
      costEstimated
    ]
  )
  return rowCount === 1
}

/** The call log of a run in order, without what each call sent or answered. */
export async function callsOf(pool, runId) {
  const { rows } = await pool.query(
    `select id, kind, n, round, tool, model, purpose, state, finish_reason, usage, cost_usd, cost_estimated, latency_ms, error,
            dispatched_at, answered_at
       from brand_call where run_id = $1 order by id`,
    [runId]
  )
  return rows.map((r) => ({
    id: Number(r.id),
    kind: r.kind,
    n: r.n,
    round: r.round,
    tool: r.tool,
    model: r.model,
    purpose: r.purpose,
    status: r.state,
    finishReason: r.finish_reason,
    usage: r.usage,
    costUsd: r.cost_usd === null ? null : Number(r.cost_usd),
    costEstimated: r.cost_estimated,
    latencyMs: r.latency_ms,
    error: r.error,
    at: new Date(r.dispatched_at).toISOString()
  }))
}
