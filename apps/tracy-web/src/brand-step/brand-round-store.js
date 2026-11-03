// The brand bench's rounds table (brand step trial bench, #320; migration 196, table brand_round). A write takes the
// run's lease token and lands only while the run still holds it (brand-sql.js fenced).
import { iso, json } from '../lib/bench-sql.js'
import { fenced } from './brand-sql.js'

/**
 * Open or update one round. Its cost is always the sum of the agent turns saved for it. Fields left undefined keep
 * what the round already holds.
 */
export async function saveRound(pool, input) {
  const {
    runId,
    round,
    state,
    attempt,
    answer,
    gateResult,
    sentBack,
    fault,
    error,
    leaseToken = null
  } = input
  const { rowCount } = await pool.query(
    `insert into brand_round as o (run_id, round, state, attempt, answer, gate_result, sent_back, fault, error,
                                   cost_usd, finished_at)
     select $1::uuid, $2::int, $3::text, $4::jsonb, $5::text, $6::jsonb, $7::jsonb, $8::text, $9::text,
            coalesce((select sum(cost_usd) from brand_call where run_id = $1::uuid and round = $2::int
                      and kind = 'agent'), 0),
            case when $3::text = 'working' then null else now() end
     where ${fenced(1, 10)}
     on conflict (run_id, round) do update set
       state = excluded.state,
       attempt = case when $11::boolean then excluded.attempt else o.attempt end,
       answer = case when $12::boolean then excluded.answer else o.answer end,
       gate_result = case when $13::boolean then excluded.gate_result else o.gate_result end,
       sent_back = case when $14::boolean then excluded.sent_back else o.sent_back end,
       fault = case when $15::boolean then excluded.fault else o.fault end,
       error = excluded.error,
       cost_usd = excluded.cost_usd,
       finished_at = excluded.finished_at`,
    [
      runId,
      round,
      state,
      json(attempt),
      answer ?? null,
      json(gateResult),
      json(sentBack),
      fault ?? null,
      error ?? null,
      leaseToken,
      attempt !== undefined,
      answer !== undefined,
      gateResult !== undefined,
      sentBack !== undefined,
      fault !== undefined
    ]
  )
  return rowCount === 1
}

function roundOf(r) {
  return {
    round: r.round,
    state: r.state,
    attempt: r.attempt,
    answer: r.answer,
    gateResult: r.gate_result,
    sentBack: r.sent_back,
    fault: r.fault,
    costUsd: Number(r.cost_usd),
    error: r.error,
    startedAt: iso(r.started_at),
    finishedAt: iso(r.finished_at)
  }
}

/** The rounds of a run in order. */
export async function roundsOf(pool, runId) {
  const { rows } = await pool.query('select * from brand_round where run_id = $1 order by round', [runId])
  return rows.map(roundOf)
}
