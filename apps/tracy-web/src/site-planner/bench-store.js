// The site planner bench's tables (ADR 0041, #301; migration 189): runs, rounds and one append-only row per model
// call. Everything but the start of a run is the shared bench store (lib/bench-run-store.js, #327) over the
// planner's own tables; a round's document is its `plan` column.
import { createHash } from 'node:crypto'
import { json } from '../lib/bench-sql.js'
import { benchStore } from '../lib/bench-run-store.js'
import { turnOf, turnRow } from '../lib/bench-turn.js'
export { turnOf, turnRow }

export const SITE_PLANNER_RUN_ACTIVE = 'SITE_PLANNER_RUN_ACTIVE'

const ONE_ACTIVE = 'site_planner_run_one_active'

/** The planner bench's store: its tables, and every read and write of a run after it started. */
export const SITE_PLANNER_STORE = benchStore({
  runTable: 'site_planner_run',
  roundTable: 'site_planner_round',
  turnTable: 'site_planner_turn',
  docColumn: 'plan'
})

export const {
  abandonTurn,
  activeRun,
  listRuns,
  readRun,
  requestCancel,
  roundSent,
  roundsOf,
  saveBalance,
  saveRound,
  saveTurn,
  saveTurnProgress,
  setProgress,
  turnCountOf,
  turnsOf
} = SITE_PLANNER_STORE

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
    return { run: SITE_PLANNER_STORE.summaryOf(rows[0]) }
  } catch (error) {
    if (error?.code !== '23505' || error?.constraint !== ONE_ACTIVE) throw error
    return { error: SITE_PLANNER_RUN_ACTIVE, active: await activeRun(pool) }
  }
}
