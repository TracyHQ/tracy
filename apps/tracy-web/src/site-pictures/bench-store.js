// The picture bench's tables (#340; migration 198): runs, rounds and one append-only row per model call with the
// writer bench's shape, read and written by the shared bench store (lib/bench-run-store.js); a round's document is its
// `pictures` column. Beside them, one row per picture file a run wrote (site_picture_file).
import { createHash } from 'node:crypto'
import { insertRunWithinLimit, json } from '../lib/bench-sql.js'
import { benchStore } from '../lib/bench-run-store.js'

export const SITE_PICTURES_RUN_ACTIVE = 'SITE_PICTURES_RUN_ACTIVE'

/** The picture bench's store: its tables, and every read and write of a run after it started. */
export const SITE_PICTURES_STORE = benchStore({
  runTable: 'site_picture_run',
  roundTable: 'site_picture_round',
  turnTable: 'site_picture_turn',
  docColumn: 'pictures'
})

export const { activeRun, activeRuns, listRuns, readRun, requestCancel } = SITE_PICTURES_STORE

/** The sha256 of a JSON value as stored on a run (the bytes of JSON.stringify). */
export const sha256Of = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/**
 * Queue a new run. Refused while the bench already holds BENCH_RUNS_AT_ONCE active picture runs (counted under a lock,
 * lib/bench-sql.js), naming them.
 * @returns {Promise<{ run: object } | { error: string, active: object | null, activeRuns: object[] }>}
 */
export async function createRun(pool, input) {
  const { startedBy, plan, planSource, brief, briefSource, photoSource, kit, prompts, checkerVersion } = input
  const created = await insertRunWithinLimit(
    pool,
    'site_picture_run',
    `insert into site_picture_run
       (started_by, plan, plan_source, plan_sha256, brief, brief_source, brief_sha256, photo_source, kit,
        prompt_sha256, prompts, checker_version, door, harness, copy)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     returning *`,
    [
      startedBy,
      JSON.stringify(plan),
      json(planSource),
      sha256Of(plan),
      JSON.stringify(brief),
      json(briefSource),
      sha256Of(brief),
      json(photoSource),
      json(kit),
      prompts.sha256,
      json(prompts.roles),
      checkerVersion,
      json(input.door ?? {}),
      json(input.harness ?? {}),
      input.copy ? json(input.copy) : null
    ]
  )
  if (created.row) return { run: SITE_PICTURES_STORE.summaryOf(created.row) }
  const running = await activeRuns(pool)
  return { error: SITE_PICTURES_RUN_ACTIVE, active: running[0] ?? null, activeRuns: running }
}

/** A run's own inputs that the shared reads leave out. Null when there is no such run. */
export async function inputsOf(pool, runId) {
  const { rows } = await pool.query(
    'select plan, plan_source, plan_sha256, photo_source, prompts, copy from site_picture_run where id = $1',
    [runId]
  )
  const r = rows[0]
  return r
    ? {
        plan: r.plan,
        planSource: r.plan_source,
        planSha256: r.plan_sha256,
        photoSource: r.photo_source,
        prompts: r.prompts,
        copy: r.copy ?? null
      }
    : null
}

/** Record one picture file a run wrote; a file already recorded for the run stays as it is (a resumed run). */
export async function saveFile(pool, { runId, sha256, path, bytes, width, height, costUsd = 0 }) {
  await pool.query(
    `insert into site_picture_file (run_id, sha256, path, bytes, width, height, cost_usd)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (run_id, sha256) do nothing`,
    [runId, sha256, path, bytes, width, height, costUsd]
  )
}

/** The picture files of a run, in the order they were recorded. */
export async function filesOf(pool, runId) {
  const { rows } = await pool.query(
    `select sha256, path, bytes, width, height, cost_usd, created_at from site_picture_file
      where run_id = $1 order by created_at, sha256`,
    [runId]
  )
  return rows.map((r) => ({
    sha256: r.sha256,
    path: r.path,
    bytes: Number(r.bytes),
    width: r.width,
    height: r.height,
    costUsd: Number(r.cost_usd)
  }))
}

/**
 * Add what a role other than the picker spent (the looker, the icon ranker) to the run's cost, which the picker's turns
 * already add to (lib/bench-turn-store.js), so a run's `costUsd` is the cost of every role. With a lease token, only
 * while the run is still held with it.
 */
export async function addRunCost(pool, { runId, usd, leaseToken = null }) {
  if (!(usd > 0)) return
  await pool.query(
    `update site_picture_run set cost_usd = cost_usd + $2, updated_at = now()
      where id = $1 and ($3::bigint is null or lease_token = $3::bigint)`,
    [runId, usd, leaseToken]
  )
}
