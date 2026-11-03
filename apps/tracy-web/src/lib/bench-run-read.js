// Reading a bench step's runs and rounds (ADR 0041, #301; shared by every bench step since #327): the run summary, one
// run with everything it ran on, its rounds and the totals of its turns, and the newest runs. The step's tables and the
// round column that holds its document come from bench-run-store.js.
import { iso, UUID } from './bench-sql.js'

/** The reads of one step. */
export function benchRunReads({ runTable, roundTable, turnTable, docColumn }) {
  function summaryOf(row) {
    return {
      id: row.id,
      startedBy: row.started_by,
      status: row.status,
      step: row.step,
      round: row.round,
      error: row.error,
      kitRef: row.kit?.ref ?? null,
      model: row.door?.model ?? null,
      briefSource: row.brief_source,
      costUsd: Number(row.cost_usd),
      attempts: row.attempts,
      cancelRequestedAt: iso(row.cancel_requested_at),
      queuedAt: iso(row.queued_at),
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      finishedAt: iso(row.finished_at)
    }
  }

  // A round as the run loop and the export read it; the step's document is under its own column name.
  function roundOf(r) {
    return {
      round: r.round,
      state: r.state,
      answer: r.answer,
      [docColumn]: r[docColumn],
      checkResult: r.check_result,
      failureList: r.failure_list,
      changes: r.changes ?? null,
      reading: r.reading ?? null,
      costUsd: Number(r.cost_usd),
      error: r.error,
      startedAt: iso(r.started_at),
      finishedAt: iso(r.finished_at)
    }
  }

  /** The run waiting or running now, or null. */
  async function activeRun(pool) {
    const { rows } = await pool.query(`select * from ${runTable} where status = 'queued' limit 1`)
    return rows[0] ? summaryOf(rows[0]) : null
  }

  /** The rounds of a run in order. */
  async function roundsOf(pool, runId) {
    const { rows } = await pool.query(`select * from ${roundTable} where run_id = $1 order by round`, [runId])
    return rows.map(roundOf)
  }

  /** The newest runs first, without their inputs or documents. */
  async function listRuns(pool, { limit = 50 } = {}) {
    const { rows } = await pool.query(`select * from ${runTable} order by created_at desc limit $1`, [
      Math.max(1, Math.min(200, Number(limit) || 50))
    ])
    return rows.map(summaryOf)
  }

  /** One run with everything it ran on, its rounds and the totals of its turns; null when there is none. */
  async function readRun(pool, id) {
    if (!UUID.test(String(id))) return null
    const { rows } = await pool.query(`select * from ${runTable} where id = $1`, [id])
    if (!rows[0]) return null
    const row = rows[0]
    const rounds = await roundsOf(pool, id)
    const totals = await pool.query(
      `select count(*) filter (where state in ('answered', 'refused'))::int as turns,
              count(*)::int as calls,
              coalesce(sum((usage->>'promptTokens')::bigint), 0)::bigint as prompt_tokens,
              coalesce(sum((usage->>'completionTokens')::bigint), 0)::bigint as completion_tokens,
              coalesce(sum((usage->>'cachedTokens')::bigint), 0)::bigint as cached_tokens,
              coalesce(sum((usage->>'cacheWriteTokens')::bigint), 0)::bigint as cache_write_tokens,
              coalesce(sum((usage->>'reasoningTokens')::bigint), 0)::bigint as reasoning_tokens,
              coalesce(sum(cost_usd), 0) as cost_usd,
              count(*) filter (where state in ('answered', 'refused') and cost_usd is null)::int as without_cost
         from ${turnTable} where run_id = $1`,
      [id]
    )
    const t = totals.rows[0]
    const flying = await pool.query(
      `select n, round, dispatched_at, progress, request from ${turnTable}
        where run_id = $1 and state = 'dispatched' order by n desc limit 1`,
      [id]
    )
    const f = flying.rows[0]
    return {
      ...summaryOf(row),
      brief: row.brief,
      briefSha256: row.brief_sha256,
      kit: row.kit,
      promptSha256: row.prompt_sha256,
      checkerVersion: row.checker_version,
      door: row.door,
      harness: row.harness,
      standingFailures: row.standing_failures ?? null,
      // The provider balance before and after the run (provider-balance.js), or null.
      balance: row.balance ?? null,
      rounds,
      // The call in flight, if any: when it went out, whether it streams, and what it has received so far.
      inFlight: f
        ? {
            n: f.n,
            round: f.round,
            dispatchedAt: iso(f.dispatched_at),
            streamed: f.request?.stream === true,
            progress: f.progress ?? null
          }
        : null,
      totals: {
        turns: t.turns,
        calls: t.calls,
        promptTokens: Number(t.prompt_tokens),
        completionTokens: Number(t.completion_tokens),
        cachedTokens: Number(t.cached_tokens),
        cacheWriteTokens: Number(t.cache_write_tokens),
        reasoningTokens: Number(t.reasoning_tokens),
        costUsd: Number(t.cost_usd),
        turnsWithoutCost: t.without_cost
      }
    }
  }

  return { summaryOf, activeRun, roundsOf, listRuns, readRun }
}
