// The site writer bench's tables (#329; migration 197): runs, rounds and one append-only row per model call, with the
// planner bench's shape. Everything but the start of a run is the shared bench store (lib/bench-run-store.js) over
// the writer's own tables; a round's document is its `copy` column.
import { createHash } from 'node:crypto'
import { json } from '../lib/bench-sql.js'
import { benchStore } from '../lib/bench-run-store.js'

export const SITE_WRITER_RUN_ACTIVE = 'SITE_WRITER_RUN_ACTIVE'

const ONE_ACTIVE = 'site_writer_run_one_active'

/** The writer bench's store: its tables, and every read and write of a run after it started. */
export const SITE_WRITER_STORE = benchStore({
  runTable: 'site_writer_run',
  roundTable: 'site_writer_round',
  turnTable: 'site_writer_turn',
  docColumn: 'copy'
})

export const { activeRun, listRuns, readRun, requestCancel, turnsOf } = SITE_WRITER_STORE

/** The sha256 of a JSON value as stored on a run (the bytes of JSON.stringify). */
export const sha256Of = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/**
 * Queue a new run. Refused while another writer run is active (the database's one-active index decides), naming it.
 * @returns {Promise<{ run: object } | { error: string, active: object | null }>}
 */
export async function createRun(pool, input) {
  const {
    startedBy,
    plan,
    planSource,
    brief,
    briefSource,
    kit,
    promptSha256,
    checkerVersion,
    door,
    harness
  } = input
  try {
    const { rows } = await pool.query(
      `insert into site_writer_run
         (started_by, plan, plan_source, plan_sha256, brief, brief_source, brief_sha256, kit, prompt_sha256,
          checker_version, door, harness)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       returning *`,
      [
        startedBy,
        JSON.stringify(plan),
        json(planSource),
        sha256Of(plan),
        JSON.stringify(brief),
        json(briefSource),
        sha256Of(brief),
        json(kit),
        promptSha256,
        checkerVersion,
        json(door),
        json(harness)
      ]
    )
    return { run: SITE_WRITER_STORE.summaryOf(rows[0]) }
  } catch (error) {
    if (error?.code !== '23505' || error?.constraint !== ONE_ACTIVE) throw error
    return { error: SITE_WRITER_RUN_ACTIVE, active: await activeRun(pool) }
  }
}

/** A run's own inputs that the shared reads leave out: the plan, where it came from and its hash. Null when none. */
export async function planOf(pool, runId) {
  const { rows } = await pool.query(
    'select plan, plan_source, plan_sha256 from site_writer_run where id = $1',
    [runId]
  )
  return rows[0]
    ? { plan: rows[0].plan, planSource: rows[0].plan_source, planSha256: rows[0].plan_sha256 }
    : null
}
