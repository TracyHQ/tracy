// The brand bench's run and round tables (brand step trial bench, #320; migration 196). Same conventions as the site
// planner bench (site-planner/bench-store.js): the run row is also the durable queue's row, so the queue writes
// `status`, `error`, the lease and `attempts` and this store writes everything else; a write a worker makes takes its
// lease token and lands only while the run still holds that token, so a worker that lost its lease (a redeploy) never
// writes over the one that took it over. The model calls are in brand-call-store.js.
import { createHash } from 'node:crypto'
import { fenced, iso, json, num, UUID } from './brand-sql.js'
import { roundsOf } from './brand-round-store.js'

export { UUID }

export const BRAND_RUN_ACTIVE = 'BRAND_RUN_ACTIVE'

const ONE_ACTIVE = 'brand_run_one_active'

/**
 * Queue a new run. Refused while another brand run is active (the database's one-active index decides, so two
 * processes starting at once cannot both win), naming that run. Planner runs are another table and never block it.
 * @returns {Promise<{ run: object } | { error: string, active: object | null }>}
 */
export async function createRun(pool, input) {
  const { startedBy, brief, briefSource, kit, promptSha256, door, tools, harness } = input
  const briefText = JSON.stringify(brief)
  try {
    const { rows } = await pool.query(
      `insert into brand_run (started_by, brief, brief_source, brief_sha256, kit, prompt_sha256, door, tools, harness)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
      [
        startedBy,
        briefText,
        json(briefSource),
        createHash('sha256').update(briefText).digest('hex'),
        json(kit),
        promptSha256,
        json(door),
        json(tools),
        json(harness)
      ]
    )
    return { run: summaryOf(rows[0]) }
  } catch (error) {
    if (error?.code !== '23505' || error?.constraint !== ONE_ACTIVE) throw error
    return { error: BRAND_RUN_ACTIVE, active: await activeRun(pool) }
  }
}

/** The run waiting or running now, or null. */
export async function activeRun(pool) {
  const { rows } = await pool.query(`select * from brand_run where status = 'queued' limit 1`)
  return rows[0] ? summaryOf(rows[0]) : null
}

/** What the run is doing, for the bench CLI's status. Written only under the run's lease. */
export async function setProgress(pool, { runId, step, round, leaseToken = null }) {
  const { rowCount } = await pool.query(
    `update brand_run set step = $2, round = $3, updated_at = now() where id = $1 and ${fenced(1, 4)}`,
    [runId, step, round, leaseToken]
  )
  return rowCount === 1
}

/** Ask an active run to stop; the worker honours it between model calls. Null when the run is not active. */
export async function requestCancel(pool, runId) {
  if (!UUID.test(String(runId))) return null
  const { rows } = await pool.query(
    `update brand_run set cancel_requested_at = coalesce(cancel_requested_at, now()), updated_at = now()
     where id = $1 and status = 'queued' returning *`,
    [runId]
  )
  return rows[0] ? summaryOf(rows[0]) : null
}

/** The run's spend so far in USD, all three parts: what the cap is checked against before every model call. */
export async function spentOf(pool, runId) {
  const { rows } = await pool.query(
    'select cost_agent_usd + cost_drawing_usd + cost_reviewer_usd as spent from brand_run where id = $1',
    [runId]
  )
  return Number(rows[0]?.spent ?? 0)
}

export async function cancelAsked(pool, runId) {
  const { rows } = await pool.query('select cancel_requested_at from brand_run where id = $1', [runId])
  return Boolean(rows[0]?.cancel_requested_at)
}

// ── Reading ──────────────────────────────────────────────────────────────────────────────────────

function summaryOf(row) {
  const cost = {
    agent: num(row.cost_agent_usd),
    drawing: num(row.cost_drawing_usd),
    reviewer: num(row.cost_reviewer_usd)
  }
  return {
    id: row.id,
    startedBy: row.started_by,
    status: row.status,
    step: row.step,
    round: row.round,
    error: row.error,
    kitRef: row.kit?.ref ?? null,
    model: row.door?.agent?.model ?? null,
    reviewerModel: row.door?.reviewer?.model ?? null,
    briefSource: row.brief_source,
    outcome: row.outcome,
    safeVersionReason: row.safe_version_reason,
    realPageVerdict: row.real_page_verdict ?? null,
    cost,
    costUsd: Math.round((cost.agent + cost.drawing + cost.reviewer) * 1e9) / 1e9,
    attempts: row.attempts,
    cancelRequestedAt: iso(row.cancel_requested_at),
    queuedAt: iso(row.queued_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    finishedAt: iso(row.finished_at)
  }
}

/** One run with everything it ran on and its rounds; null when there is none. */
export async function readRun(pool, id) {
  if (!UUID.test(String(id))) return null
  const { rows } = await pool.query('select * from brand_run where id = $1', [id])
  if (!rows[0]) return null
  const row = rows[0]
  return {
    ...summaryOf(row),
    brief: row.brief,
    briefSha256: row.brief_sha256,
    kit: row.kit,
    promptSha256: row.prompt_sha256,
    door: row.door,
    tools: row.tools,
    harness: row.harness,
    brandFile: row.brand_file,
    rounds: await roundsOf(pool, id)
  }
}

/** The newest runs first, without their brief or brand files. */
export async function listRuns(pool, { limit = 50 } = {}) {
  const { rows } = await pool.query('select * from brand_run order by created_at desc limit $1', [
    Math.max(1, Math.min(200, Number(limit) || 50))
  ])
  const out = []
  for (const row of rows) {
    const rounds = await pool.query(
      'select count(*)::int as n, (array_agg(gate_result order by round desc))[1] as last from brand_round where run_id = $1',
      [row.id]
    )
    out.push({ ...summaryOf(row), rounds: rounds.rows[0].n, gate: rounds.rows[0].last ?? null })
  }
  return out
}
