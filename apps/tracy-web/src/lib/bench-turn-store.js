// The turn rows of a bench step (ADR 0041, #301; shared by every bench step since #327): one append-only row per model
// call, in the step's own turn table (bench-run-store.js says which). A write a worker makes takes its lease token and
// lands only while the run still holds that token.
import { fenced as fencedOn, json } from './bench-sql.js'
import { turnOf, turnRow } from './bench-turn.js'

/**
 * The turn store of one step.
 * @param {{ runTable: string, turnTable: string }} tables trusted table names of the step, never user input
 */
export function benchTurnStore({ runTable, turnTable }) {
  const fenced = (runParam, tokenParam) => fencedOn(runTable, runParam, tokenParam)

  /**
   * Save one turn: a dispatched turn is inserted, a finished one replaces its dispatched row once and adds its cost
   * to the run. False when nothing was written: a stale lease, a turn number already taken, or a turn already
   * finished.
   */
  async function saveTurn(pool, { runId, round, turn, leaseToken = null }) {
    const r = turnRow(turn, round)
    if (r.state === 'dispatched') {
      const { rowCount } = await pool.query(
        `insert into ${turnTable} (run_id, n, round, state, request, sent, dispatched_at, resend_of)
         select $1::uuid, $2::int, $3::int, 'dispatched', $4::jsonb, $5::jsonb, $6::timestamptz, $8::int
         where ${fenced(1, 7)}
         on conflict (run_id, n) do nothing`,
        [runId, r.n, round, json(r.request), json(r.sent), r.dispatched_at, leaseToken, r.resend_of]
      )
      return rowCount === 1
    }
    const { rowCount } = await pool.query(
      `with t as (
         update ${turnTable} set state = $3, message = $4, finish_reason = $5, generation_id = $6,
           provider_model = $7, refusal = $8, error = $9, usage = $10, cost_usd = $11, answered_at = $12,
           retries = $14::jsonb
         where run_id = $1 and n = $2 and state = 'dispatched' and ${fenced(1, 13)}
         returning cost_usd)
       update ${runTable} set cost_usd = cost_usd + coalesce((select cost_usd from t), 0), updated_at = now()
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
        json(r.retries)
      ]
    )
    return rowCount === 1
  }

  /**
   * Record what a streamed call in flight has received so far (agent-over-door.js onProgress): one small update of
   * the dispatched row. False when the turn is no longer dispatched or the lease is stale; nothing else is touched.
   */
  async function saveTurnProgress(pool, { runId, n, progress, leaseToken = null }) {
    const { rowCount } = await pool.query(
      `update ${turnTable} set progress = $3::jsonb
       where run_id = $1 and n = $2 and state = 'dispatched' and ${fenced(1, 4)}`,
      [runId, n, json(progress), leaseToken]
    )
    return rowCount === 1
  }

  /**
   * Mark a turn that was dispatched and never answered (a restart while waiting for the model) as abandoned, so the
   * same request can be sent once more as a new turn. Its row stays. False when the turn is not dispatched any more
   * or the lease is stale.
   */
  async function abandonTurn(pool, { runId, n, leaseToken = null }) {
    const { rowCount } = await pool.query(
      `update ${turnTable} set state = 'abandoned', error = $3::jsonb
       where run_id = $1 and n = $2 and state = 'dispatched' and ${fenced(1, 4)}`,
      [
        runId,
        n,
        json({
          code: 'TURN_ABANDONED',
          reason: 'no answer before a restart; the same request is sent again'
        }),
        leaseToken
      ]
    )
    return rowCount === 1
  }

  /** How many turns a round has saved: none means a fix round has not sent its failure list yet. */
  async function turnCountOf(pool, runId, round) {
    const { rows } = await pool.query(
      `select count(*)::int as n from ${turnTable} where run_id = $1 and round = $2`,
      [runId, round]
    )
    return rows[0].n
  }

  /** Whether a turn of this round already sent the given user message (a resumed round must not send it twice). */
  async function roundSent(pool, runId, round, content) {
    const { rows } = await pool.query(
      `select exists (select 1 from ${turnTable} where run_id = $1 and round = $2 and sent @> $3::jsonb) as sent`,
      [runId, round, JSON.stringify([{ role: 'user', content }])]
    )
    return rows[0].sent
  }

  /** Every saved turn of a run in order: the history runAgent resumes from. */
  async function turnsOf(pool, runId) {
    const { rows } = await pool.query(`select * from ${turnTable} where run_id = $1 order by n`, [runId])
    return rows.map(turnOf)
  }

  return { saveTurn, saveTurnProgress, abandonTurn, turnCountOf, roundSent, turnsOf }
}
