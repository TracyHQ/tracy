// The restore of the build before a revision (#599): writes back, through the same doors, every place a revision run
// wrote over, as its undo journal kept it (`step-chain-draft-journal.js`): the columns of each record, the pages of each
// module, the contract slots (one apply) and the site identity. The site then holds the previous build again, and the
// previous build is the site's current build again (`builds.keep`).
//
// What a restore cannot undo, said before any door (a typed stop, noRerun, nothing written):
//   - the revision is not the build the site holds now (`builds.current(ctx)`): `previous_build_not_current`;
//   - a record the revision MADE (a new page, item or copy): no measured door removes it (`restore_needs_removal`,
//     unproven `record_removal_no_door`);
//   - a slot the revision took out (`removes`): no door puts an element back (same stop).
//   - a place whose value before names a text the revision's profile holds (a held person, the held business name),
//     on any leaf and in any form (`revision-text-forms.mjs`), or kept as `HELD_BEFORE`: the restore would show it
//     again (`restore_shows_held_text`); the owner's hold wins over going back.
//   - a place that holds another value than the revision wrote: someone edited it outside Tracy since
//     (`restore_site_changed`, naming the place, never the text). A place that already holds its value before was
//     restored by a crashed attempt of this restore and is written again, unchanged.
// A file the revision uploaded stays on the site, shown by nothing once the restore is done: listed in `left.uploads`.
//
// Each place is restored once: its own apply id `<run>:restore:w<seq>:<place>`, done places kept in the restore's own
// record `{restore, done}` so a crashed restore resumes; each is read back; a failing place is tried twice, then the
// restore stops (`restore_failed`, noRerun). Doors as `step-chain-draft-write.js` lists them.
import { DraftWriteError } from 'website-opportunities/domain/draft-write-error.mjs'
import { placeHolds } from 'website-opportunities/domain/revision-place-value.mjs'
import { checkUnchanged, restorePlanOf } from './step-chain-draft-restore-plan.js'

export { restorePlanOf }

const list = (value) => (Array.isArray(value) ? value : [])
const ATTEMPTS = 2

const mismatch = (place) =>
  new DraftWriteError('read_back_mismatch', `${place.key} reads another value after the restore`, {
    place: place.key
  })

/** One place written back and read back. */
async function restorePlace(place, doors, applyId) {
  if (place.type === 'record') {
    await doors.update({ applyId, kind: place.kind, id: place.id, fields: place.fields })
    const row = await doors.get({ kind: place.kind, id: place.id })
    for (const [column, value] of Object.entries(place.fields))
      if (!placeHolds(`record:${place.kind}:${place.id}:${column}`, value, row[column] ?? null))
        throw mismatch(place)
  } else if (place.type === 'assignment') {
    // A module with no pages before is set to none: Joomla shows a module with no assignment row on no page.
    const menuids = JSON.stringify(place.menuids ?? [])
    await doors.update({ applyId, kind: 'moduleAssignment', id: Number(place.id), fields: { menuids } })
    const got = (await doors.get({ kind: 'moduleAssignment', id: Number(place.id) })).menuids
    if (!placeHolds(`assignment:${Number(place.id)}`, menuids, got)) throw mismatch(place)
  } else if (place.type === 'slots') {
    const { revision } = await doors.inspect()
    await doors.contract({ applyId, expectedRevision: revision, changes: place.slots, removes: [] })
    const got = await doors.read({ slots: Object.keys(place.slots) })
    for (const [key, value] of Object.entries(place.slots)) if (got[key] !== value) throw mismatch(place)
  } else {
    await doors.identity({ applyId, fields: place.fields })
    const got = await doors.readIdentity()
    for (const [key, value] of Object.entries(place.fields))
      if (!placeHolds(`identity:${key}`, value, got[key] ?? null)) throw mismatch(place)
  }
}

/**
 * Every place written back once and read back, each checked first for an edit made outside Tracy (`state`: the run's
 * `{wrote, shapes}`; `changed`: the code of that stop), the done places kept in `record.state.done` so a crashed write
 * back resumes; a failing place is tried twice, then `failed` (noRerun).
 */
export async function writeBack({ places, doors, record, state, applyId, failed, changed }) {
  for (const place of places) {
    if (record.state.done.includes(place.key)) continue
    await checkUnchanged(place, doors, state, changed)
    for (let attempt = 1; ; attempt++) {
      try {
        await restorePlace(place, doors, applyId(place))
        break
      } catch (error) {
        if (error?.fatal) throw error
        if (attempt >= ATTEMPTS)
          throw new DraftWriteError(
            failed,
            `${place.key} failed ${attempt} time(s)`,
            {
              place: place.key,
              cause: error?.code ?? null
            },
            { noRerun: true }
          )
      }
    }
    record.state.done.push(place.key)
    await record.save?.(record.state)
  }
}

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
  const plan = restorePlanOf(build)
  if (plan.stop)
    throw stop(
      plan.stop,
      'the build before this revision cannot be restored by the doors',
      { made: list(plan.made), removed: list(plan.removed) },
      { unproven: plan.stop === 'restore_needs_removal' ? [{ code: 'record_removal_no_door' }] : [] }
    )
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
  return { status: 'done', restored: plan.places.length, current, left: plan.left }
}
