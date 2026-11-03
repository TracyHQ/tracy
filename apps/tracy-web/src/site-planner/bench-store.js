// The site planner bench's tables (ADR 0041, #301; migration 189): runs, rounds and one append-only row per model
// call. The run row is also the durable queue's row, so the queue writes `status`, `error`, the lease and `attempts`;
// this store writes everything else. A write a worker makes takes its lease token and lands only while the run still
// holds that token, so a worker that lost its lease (a redeploy) can never write over the one that took it over.
import { createHash } from 'node:crypto'

export const SITE_PLANNER_RUN_ACTIVE = 'SITE_PLANNER_RUN_ACTIVE'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ONE_ACTIVE = 'site_planner_run_one_active'

const json = (value) => (value === undefined ? null : JSON.stringify(value))
const num = (value) => (value === null || value === undefined ? null : Number(value))
const iso = (value) => (value ? new Date(value).toISOString() : null)
/** SQL that is true when no lease token is given, or the run holds the given one. */
const fenced = (runParam, tokenParam) =>
  `($${tokenParam}::bigint is null or exists (select 1 from site_planner_run r where r.id = $${runParam} and r.lease_token = $${tokenParam}::bigint))`

/**
 * Queue a new run. Refused while another run is active (the database's one-active index decides, so two processes
 * starting at once cannot both win), naming that run.
 * @returns {Promise<{ run: object } | { error: string, active: object | null }>}
 */
export async function createRun(pool, input) {
  const { startedBy, brief, briefSource, kit, promptSha256, checkerVersion, door, harness } = input
  const briefText = JSON.stringify(brief)
  try {
    const { rows } = await pool.query(
      `insert into site_planner_run
         (started_by, brief, brief_source, brief_sha256, kit, prompt_sha256, checker_version, door, harness)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning *`,
      [
        startedBy,
        briefText,
        json(briefSource),
        createHash('sha256').update(briefText).digest('hex'),
        json(kit),
        promptSha256,
        checkerVersion,
        json(door),
        json(harness)
      ]
    )
    return { run: summaryOf(rows[0]) }
  } catch (error) {
    if (error?.code !== '23505' || error?.constraint !== ONE_ACTIVE) throw error
    return { error: SITE_PLANNER_RUN_ACTIVE, active: await activeRun(pool) }
  }
}

/** The run waiting or running now, or null. */
export async function activeRun(pool) {
  const { rows } = await pool.query(`select * from site_planner_run where status = 'queued' limit 1`)
  return rows[0] ? summaryOf(rows[0]) : null
}

/** What the run is doing, for the bench CLI's status. Written only under the run's lease. */
export async function setProgress(pool, { runId, step, round, leaseToken = null }) {
  const { rowCount } = await pool.query(
    `update site_planner_run set step = $2, round = $3, updated_at = now()
     where id = $1 and ${fenced(1, 4)}`,
    [runId, step, round, leaseToken]
  )
  return rowCount === 1
}

/** Ask an active run to stop; the worker honours it between model calls. Null when the run is not active. */
export async function requestCancel(pool, runId) {
  if (!UUID.test(String(runId))) return null
  const { rows } = await pool.query(
    `update site_planner_run set cancel_requested_at = coalesce(cancel_requested_at, now()), updated_at = now()
     where id = $1 and status = 'queued' returning *`,
    [runId]
  )
  return rows[0] ? summaryOf(rows[0]) : null
}

// ── Turns ────────────────────────────────────────────────────────────────────────────────────────

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

/**
 * Save one turn: a dispatched turn is inserted, a finished one replaces its dispatched row once and adds its cost to
 * the run. False when nothing was written: a stale lease, a turn number already taken, or a turn already finished.
 */
export async function saveTurn(pool, { runId, round, turn, leaseToken = null }) {
  const r = turnRow(turn, round)
  if (r.state === 'dispatched') {
    const { rowCount } = await pool.query(
      `insert into site_planner_turn (run_id, n, round, state, request, sent, dispatched_at, resend_of)
       select $1::uuid, $2::int, $3::int, 'dispatched', $4::jsonb, $5::jsonb, $6::timestamptz, $8::int
       where ${fenced(1, 7)}
       on conflict (run_id, n) do nothing`,
      [runId, r.n, round, json(r.request), json(r.sent), r.dispatched_at, leaseToken, r.resend_of]
    )
    return rowCount === 1
  }
  const { rowCount } = await pool.query(
    `with t as (
       update site_planner_turn set state = $3, message = $4, finish_reason = $5, generation_id = $6,
         provider_model = $7, refusal = $8, error = $9, usage = $10, cost_usd = $11, answered_at = $12,
         retries = $14::jsonb
       where run_id = $1 and n = $2 and state = 'dispatched' and ${fenced(1, 13)}
       returning cost_usd)
     update site_planner_run set cost_usd = cost_usd + coalesce((select cost_usd from t), 0), updated_at = now()
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
 * Mark a turn that was dispatched and never answered (a restart while waiting for the model) as abandoned, so the
 * same request can be sent once more as a new turn. Its row stays. False when the turn is not dispatched any more or
 * the lease is stale.
 */
export async function abandonTurn(pool, { runId, n, leaseToken = null }) {
  const { rowCount } = await pool.query(
    `update site_planner_turn set state = 'abandoned', error = $3::jsonb
     where run_id = $1 and n = $2 and state = 'dispatched' and ${fenced(1, 4)}`,
    [
      runId,
      n,
      json({ code: 'TURN_ABANDONED', reason: 'no answer before a restart; the same request is sent again' }),
      leaseToken
    ]
  )
  return rowCount === 1
}

/** How many turns a round has saved: none means a fix round has not sent its failure list yet. */
export async function turnCountOf(pool, runId, round) {
  const { rows } = await pool.query(
    'select count(*)::int as n from site_planner_turn where run_id = $1 and round = $2',
    [runId, round]
  )
  return rows[0].n
}

/** Whether a turn of this round already sent the given user message (a resumed round must not send it twice). */
export async function roundSent(pool, runId, round, content) {
  const { rows } = await pool.query(
    `select exists (select 1 from site_planner_turn where run_id = $1 and round = $2 and sent @> $3::jsonb) as sent`,
    [runId, round, JSON.stringify([{ role: 'user', content }])]
  )
  return rows[0].sent
}

/** Every saved turn of a run in order: the history runAgent resumes from. */
export async function turnsOf(pool, runId) {
  const { rows } = await pool.query('select * from site_planner_turn where run_id = $1 order by n', [runId])
  return rows.map(turnOf)
}

// ── Rounds ───────────────────────────────────────────────────────────────────────────────────────

/**
 * Open or update one round. Its cost is always the sum of the turns saved for it. Fields left undefined keep what
 * the round already holds.
 */
export async function saveRound(pool, input) {
  const { runId, round, state, answer, plan, checkResult, failureList, error, leaseToken = null } = input
  const { changes, reading } = input
  const { rowCount } = await pool.query(
    `insert into site_planner_round as o (run_id, round, state, answer, plan, check_result, failure_list, error,
                                         cost_usd, finished_at, changes, reading)
     select $1::uuid, $2::int, $3::text, $4::text, $5::jsonb, $6::jsonb, $7::text, $8::text,
            coalesce((select sum(cost_usd) from site_planner_turn where run_id = $1::uuid and round = $2::int), 0),
            case when $3::text = 'planning' then null else now() end, $14::jsonb, $15::jsonb
     where ${fenced(1, 13)}
     on conflict (run_id, round) do update set
       state = excluded.state,
       answer = case when $9::boolean then excluded.answer else o.answer end,
       plan = case when $10::boolean then excluded.plan else o.plan end,
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
      json(plan),
      json(checkResult),
      failureList ?? null,
      error ?? null,
      answer !== undefined,
      plan !== undefined,
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

// ── Reading ──────────────────────────────────────────────────────────────────────────────────────

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

/** One run with everything it ran on, its rounds and the totals of its turns; null when there is none. */
export async function readRun(pool, id) {
  if (!UUID.test(String(id))) return null
  const { rows } = await pool.query('select * from site_planner_run where id = $1', [id])
  if (!rows[0]) return null
  const row = rows[0]
  const rounds = await pool.query('select * from site_planner_round where run_id = $1 order by round', [id])
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
       from site_planner_turn where run_id = $1`,
    [id]
  )
  const t = totals.rows[0]
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
    rounds: rounds.rows.map(roundOf),
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

function roundOf(r) {
  return {
    round: r.round,
    state: r.state,
    answer: r.answer,
    plan: r.plan,
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

/** The rounds of a run in order. */
export async function roundsOf(pool, runId) {
  const { rows } = await pool.query('select * from site_planner_round where run_id = $1 order by round', [
    runId
  ])
  return rows.map(roundOf)
}

/** The newest runs first, without their brief or plans. */
export async function listRuns(pool, { limit = 50 } = {}) {
  const { rows } = await pool.query('select * from site_planner_run order by created_at desc limit $1', [
    Math.max(1, Math.min(200, Number(limit) || 50))
  ])
  return rows.map(summaryOf)
}
