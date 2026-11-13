// The abandon of a revision run that stopped half way (#599): a crashed run the customer does not want to resume leaves
// the site holding part of it, and the site's unfinished run (`builds.unfinished`) stops every other revision
// (`previous_run_unfinished`). `abandonRun` writes back, through the same doors, every place that run wrote over, from
// its own undo journal (`state.undo`, `step-chain-draft-journal.js`), with the rules of a restore
// (`step-chain-draft-restore.js`): each place must still hold what the run wrote or its value before
// (`site_changed_outside` otherwise: an owner edit is never written over), a value before that names a held text stops
// (`restore_shows_held_text`), and a record the run MADE or a slot it took out stops before any door
// (`restore_needs_removal`, unproven `record_removal_no_door`): no measured door removes a record. Such a run can only
// be resumed to its end. Done, the site holds the current build again and the run is no longer unfinished
// (`builds.end`); the current build does not change. Crash safe: the abandon keeps its own record `{abandon, done}`
// and resumes from it; each place has its own apply id `<abandon id>:abandon:<place>`.
import { DraftWriteError } from 'website-opportunities/domain/draft-write-error.mjs'
import { restorePlanOf } from './step-chain-draft-restore-plan.js'
import { stop, writeBack } from './step-chain-draft-restore.js'

const list = (value) => (Array.isArray(value) ? value : [])

/**
 * Abandon the site's unfinished run.
 * @param {{run: string, runRecord: {state?: object}, doors: object, record: {state?: object, save?: Function},
 *   runId: string, builds: {current: Function, unfinished: Function, end: Function}, ctx?: object}} input `run`: the
 *   unfinished run's id; `runRecord`: its run record as its store kept it; `record`: the abandon's own record; `runId`:
 *   the abandon's own id
 * @returns {Promise<{status: 'done', restored: number, left: object}>} `left`: the files the run uploaded, shown by
 *   nothing, which no door deletes
 */
export async function abandonRun({ run, runRecord, doors, record, runId, builds, ctx = {} }) {
  if (typeof builds?.unfinished !== 'function' || typeof builds?.end !== 'function')
    throw stop('previous_build_doors_missing', 'no build store says which run is unfinished on the site')
  const unfinished = await builds.unfinished(ctx)
  if (!unfinished || unfinished.runId !== run)
    throw stop('abandon_not_unfinished', 'this run is not the unfinished run of the site', {
      unfinished: unfinished?.runId ?? null
    })
  const current = (await builds.current?.(ctx)) ?? null
  if (current !== (unfinished.from ?? null))
    throw stop(
      'previous_build_not_current',
      'the site holds another build than the unfinished run started from',
      {
        current
      }
    )
  const state = runRecord?.state
  // A run that saved nothing wrote nothing: every write is journaled and saved before its door call.
  const plan = state ? restorePlanOf({ write: { state } }) : { stop: null, places: [], left: {} }
  if (plan.stop && plan.stop !== 'restore_not_a_revision')
    throw stop(
      plan.stop,
      'the unfinished run cannot be rolled back by the doors: resume it to its end instead',
      { made: list(plan.made), removed: list(plan.removed) },
      { unproven: plan.stop === 'restore_needs_removal' ? [{ code: 'record_removal_no_door' }] : [] }
    )
  record.state ??= { abandon: run, done: [] }
  if (record.state.abandon !== run)
    throw new DraftWriteError('write_record_stale', 'the abandon record belongs to another run', {
      recorded: record.state.abandon ?? null
    })
  const places = plan.stop ? [] : plan.places
  await writeBack({
    places,
    doors,
    record,
    state,
    applyId: (place) => `${runId}:abandon:${place.key}`,
    failed: 'abandon_failed',
    changed: 'site_changed_outside'
  })
  await builds.end(run, ctx)
  return { status: 'done', restored: places.length, left: plan.left ?? {} }
}
