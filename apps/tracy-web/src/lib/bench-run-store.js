// The store of a bench step (ADR 0041, #301; shared by every bench step since #327): runs, rounds and one append-only
// row per model call, in tables of the step's own. The run row is also the durable queue's row, so the queue writes
// `status`, `error`, the lease and `attempts`; this store writes everything else. A write a worker makes takes its
// lease token and lands only while the run still holds that token, so a worker that lost its lease (a redeploy) can
// never write over the one that took it over.
//
// Every step has its own three tables with the planner's shape (migrations 189 to 194): the run row (inputs frozen,
// `step`, `round`, `cost_usd`, `balance`, `standing_failures`, `cancel_requested_at`), the round row (`state`,
// `answer`, the document column, `check_result`, `failure_list`, `changes`, `reading`, `error`, `cost_usd`) and the
// turn row. The state words are shared: a round is open while 'planning', then 'checked', 'not_a_plan', 'failed' or
// 'cancelled'; the run's step is 'waiting', 'planning', 'fixing', 'checking' or 'done'. Starting a run (its insert)
// stays the step's own, since what a run is started on differs per step (ADR 0042 section 6).
import { fenced as fencedOn, json, UUID } from './bench-sql.js'
import { benchRunReads } from './bench-run-read.js'
import { benchTurnStore } from './bench-turn-store.js'

/**
 * The store of one step.
 * @param {{ runTable: string, roundTable: string, turnTable: string, docColumn: string }} tables trusted names: the
 *   step's three tables and the round column that holds its document ("plan")
 */
export function benchStore(tables) {
  const { runTable, roundTable, turnTable, docColumn } = tables
  const fenced = (runParam, tokenParam) => fencedOn(runTable, runParam, tokenParam)
  const reads = benchRunReads(tables)

  /** What the run is doing, for the bench CLI's status. Written only under the run's lease. */
  async function setProgress(pool, { runId, step, round, leaseToken = null }) {
    const { rowCount } = await pool.query(
      `update ${runTable} set step = $2, round = $3, updated_at = now()
       where id = $1 and ${fenced(1, 4)}`,
      [runId, step, round, leaseToken]
    )
    return rowCount === 1
  }

  /**
   * Record one provider balance read around the run (provider-balance.js), as `before` or `after`. A side already
   * recorded is kept: a resumed run never replaces the balance read before its first call. Written only under the
   * lease.
   */
  async function saveBalance(pool, { runId, side, balance, leaseToken = null }) {
    const { rowCount } = await pool.query(
      `update ${runTable}
          set balance = coalesce(balance, '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb), updated_at = now()
        where id = $1 and not coalesce(balance ? $2::text, false) and ${fenced(1, 4)}`,
      [runId, side, json(balance), leaseToken]
    )
    return rowCount === 1
  }

  /** Ask an active run to stop; the worker honours it between model calls. Null when the run is not active. */
  async function requestCancel(pool, runId) {
    if (!UUID.test(String(runId))) return null
    const { rows } = await pool.query(
      `update ${runTable} set cancel_requested_at = coalesce(cancel_requested_at, now()), updated_at = now()
       where id = $1 and status = 'queued' returning *`,
      [runId]
    )
    return rows[0] ? reads.summaryOf(rows[0]) : null
  }

  /** Whether a cancel was asked for the run. */
  async function cancelAsked(pool, runId) {
    const { rows } = await pool.query(`select cancel_requested_at from ${runTable} where id = $1`, [runId])
    return Boolean(rows[0]?.cancel_requested_at)
  }

  /**
   * Open or update one round. Its cost is always the sum of the turns saved for it. Fields left undefined keep what
   * the round already holds. The document is given under the step's column name (`plan`).
   */
  async function saveRound(pool, input) {
    const { runId, round, state, answer, checkResult, failureList, error, leaseToken = null } = input
    const { changes, reading } = input
    const doc = input[docColumn]
    const { rowCount } = await pool.query(
      `insert into ${roundTable} as o (run_id, round, state, answer, ${docColumn}, check_result, failure_list, error,
                                     cost_usd, finished_at, changes, reading)
       select $1::uuid, $2::int, $3::text, $4::text, $5::jsonb, $6::jsonb, $7::text, $8::text,
              coalesce((select sum(cost_usd) from ${turnTable} where run_id = $1::uuid and round = $2::int), 0),
              case when $3::text = 'planning' then null else now() end, $14::jsonb, $15::jsonb
       where ${fenced(1, 13)}
       on conflict (run_id, round) do update set
         state = excluded.state,
         answer = case when $9::boolean then excluded.answer else o.answer end,
         ${docColumn} = case when $10::boolean then excluded.${docColumn} else o.${docColumn} end,
         check_result = case when $11::boolean then excluded.check_result else o.check_result end,
         failure_list = case when $12::boolean then excluded.failure_list else o.failure_list end,
         changes = case when $16::boolean then excluded.changes else o.changes end,
         reading = case when $17::boolean then excluded.reading else o.reading end,
         error = excluded.error,
         cost_usd = excluded.cost_usd,
         finished_at = excluded.finished_at`,
      [
        runId,
        round,
        state,
        answer ?? null,
        json(doc),
        json(checkResult),
        failureList ?? null,
        error ?? null,
        answer !== undefined,
        doc !== undefined,
        checkResult !== undefined,
        failureList !== undefined,
        leaseToken,
        json(changes),
        json(reading),
        changes !== undefined,
        reading !== undefined
      ]
    )
    return rowCount === 1
  }

  return {
    tables: Object.freeze({ ...tables }),
    ...reads,
    ...benchTurnStore(tables),
    setProgress,
    saveBalance,
    requestCancel,
    cancelAsked,
    saveRound
  }
}
