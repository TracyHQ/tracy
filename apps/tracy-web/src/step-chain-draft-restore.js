// The restore of the build before a revision (#599): writes back, through the same doors, every place a revision run
// wrote over, as its undo journal kept it (`step-chain-draft-journal.js`): the columns of each record, the pages of each
// module, the contract slots (one apply) and the site identity. The site then holds the previous build again, and the
// previous build is the site's current build again (`builds.keep`).
//
// What a restore cannot undo, said before any door (a typed stop, noRerun, nothing written):
//   - the revision is not the build the site holds now (`builds.current(ctx)`): `previous_build_not_current`;
//   - a revision run is still unfinished on the site (`builds.unfinished(ctx)`): `previous_run_unfinished`;
//   - a make whose id the run never saved (`pending`), or a made record of a kind no hide covers: no id or no door to
//     take it off (`restore_needs_removal`, unproven `record_removal_no_door`);
//   - a slot the revision took out (`removes`): no door puts an element back (same stop).
//   - a place whose value before names a text the revision's profile holds (a held person, the held business name),
//     on any leaf and in any form (`revision-text-forms.mjs`), or kept as `HELD_BEFORE`: the restore would show it
//     again (`restore_shows_held_text`); the owner's hold wins over going back.
//   - a place that holds another value than the revision wrote: someone edited it outside Tracy since
//     (`restore_site_changed`, naming the place, never the text). A place that already holds its value before was
//     restored by a crashed attempt of this restore and is written again, unchanged.
// A record the revision MADE is hidden (a module put on no page), never deleted, after the places (`left.hidden`); a
// file it uploaded is deleted (`media.delete`) once its dry run names no record but those, else it stays, listed in
// `left.uploads` with why (`left.kept`). A site whose door client lacks hide or unassign stops `door_not_available`.
//
// The write back itself (each place, its read back, a JSON column at the keys Tracy owned): `step-chain-draft-write-back.js`.
// Each place is restored once: its own apply id `<run>:restore:w<seq>:<place>`, done places kept in the restore's own
// record `{restore, done}` so a crashed restore resumes; each is read back; a failing place is tried twice, then the
// restore stops (`restore_failed`, noRerun). Doors as `step-chain-draft-write.js` lists them.
import { DraftWriteError } from 'website-opportunities/domain/draft-write-error.mjs'
import { missingDoorOf } from './step-chain-draft-removal-run.js'
import { restorePlanOf } from './step-chain-draft-restore-plan.js'
import { writeBack } from './step-chain-draft-write-back.js'

export { restorePlanOf, writeBack }

const list = (value) => (Array.isArray(value) ? value : [])
export const stop = (code, message, details = {}, report = {}) =>
  Object.assign(new DraftWriteError(code, message, details, { noRerun: true }), {
    report: { status: 'failed', restored: 0, unproven: [], ...report }
  })

/**
 * Restore the build a revision run started from.
 * @param {{build: object, previous?: object, doors: object, record: {state?: object, save?: Function}, runId: string,
 *   builds: {current: Function, read: Function, keep: Function}, ctx?: object}} input `build`: the REVISION's build
 *   result (`buildResultOf`, its `write.state.undo`); `previous`: the build it started from (`build.previous` names it;
 *   read from `builds` when not given); `record`: the restore's own record; `builds`: the build store (`deps.builds`)
 * @returns {Promise<{status: 'done', restored: number, current: object, left: object}>} `current`: the previous build,
 *   kept again as the site's build (`builds.keep`), its `seq` past the revision's, so that the same revision run again
 *   after the restore never sends an apply id the site already answered
 */
export async function restoreBuild({ build, previous = null, doors, record, runId, builds, ctx = {} }) {
  if (typeof builds?.current !== 'function' || typeof builds?.keep !== 'function')
    throw stop('previous_build_doors_missing', 'no build store says which build the site holds')
  const holds = await builds.current(ctx)
  if (holds !== build?.ref)
    throw stop('previous_build_not_current', 'the site holds another build than the one restored from', {
      current: holds ?? null
    })
  // A revision still unfinished on the site (marked by `builds.begin`) holds part of its writes: it is resumed or
  // abandoned first; a restore over it would take the half run for an owner's edit, or write under it.
  const unfinished = typeof builds.unfinished === 'function' ? await builds.unfinished(ctx) : null
  if (unfinished)
    throw stop('previous_run_unfinished', 'another run is still unfinished on this site', {
      run: unfinished.runId ?? null
    })
  const plan = restorePlanOf(build)
  if (plan.stop)
    throw stop(
      plan.stop,
      'the build before this revision cannot be restored by the doors',
      { made: list(plan.made), removed: list(plan.removed) },
      { unproven: plan.stop === 'restore_needs_removal' ? [{ code: 'record_removal_no_door' }] : [] }
    )
  const missing = missingDoorOf(
    plan.places.filter((p) => p.type !== 'media'),
    doors
  )
  if (missing) throw Object.assign(missing, { report: { status: 'failed', restored: 0, unproven: [] } })
  const before = previous ?? (await builds.read?.(build.previous, ctx))
  if (!before?.write?.state)
    throw stop('previous_build_missing', 'the build before this revision is not in the store', {
      previous: build.previous ?? null
    })
  record.state ??= { restore: build.ref, done: [] }
  if (record.state.restore !== build.ref)
    throw new DraftWriteError('write_record_stale', 'the restore record belongs to another build', {
      recorded: record.state.restore ?? null
    })
  const seq = build.write.state.seq ?? 1
  await writeBack({
    places: plan.places,
    doors,
    record,
    state: build.write.state,
    applyId: (place) => `${runId}:restore:w${seq}:${place.key}`,
    failed: 'restore_failed'
  })
  const current = {
    ...before,
    restoredFrom: build.ref,
    write: { ...before.write, state: { ...before.write.state, seq: seq + 1 } }
  }
  if ((await builds.keep(current, ctx, { expected: build.ref })) === false)
    throw stop(
      'previous_build_not_current',
      'another run changed the build the site holds during the restore',
      {
        expected: build.ref
      }
    )
  return { status: 'done', restored: plan.places.length, current, left: leftOf(plan, record) }
}

/** What stays on the site after a restore or an abandon: the files kept (with why) and the records hidden. */
export const leftOf = (plan, record) => {
  const kept = new Map(list(record.state?.left).map((f) => [f.path, f]))
  return { ...plan.left, uploads: [...kept.keys()], kept: [...kept.values()] }
}
