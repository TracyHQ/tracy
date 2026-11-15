// The site planner bench's tables (ADR 0041, #301; migration 189): runs, rounds and one append-only row per model
// call. Everything but the start of a run is the shared bench store (lib/bench-run-store.js, #327) over the
// planner's own tables; a round's document is its `plan` column.
import { createHash } from 'node:crypto'
import { insertRunWithinLimit, json } from '../lib/bench-sql.js'
import { benchStore } from '../lib/bench-run-store.js'
import { turnOf, turnRow } from '../lib/bench-turn.js'
export { turnOf, turnRow }

export const SITE_PLANNER_RUN_ACTIVE = 'SITE_PLANNER_RUN_ACTIVE'

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
  activeRuns,
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
 * Queue a new run. Refused while the bench already holds BENCH_RUNS_AT_ONCE active runs (counted under a lock, so two
 * processes starting at once cannot both pass the limit; lib/bench-sql.js), naming them.
 * @returns {Promise<{ run: object } | { error: string, active: object | null, activeRuns: object[] }>}
 */
export async function createRun(pool, input) {
  const { startedBy, brief, briefSource, kit, promptSha256, checkerVersion, door, harness } = input
  const briefText = JSON.stringify(brief)
  const created = await insertRunWithinLimit(
    pool,
    'site_planner_run',
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
  if (created.row) return { run: SITE_PLANNER_STORE.summaryOf(created.row) }
  const running = await activeRuns(pool)
  return { error: SITE_PLANNER_RUN_ACTIVE, active: running[0] ?? null, activeRuns: running }
}
