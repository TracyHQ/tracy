// The restore of the build before a revision (#599): writes back, through the same doors, every place a revision run
// wrote over, as its undo journal kept it (`step-chain-draft-journal.js`): the columns of each record, the pages of each
// module, the contract slots (one apply) and the site identity. The site then holds the previous build again, and the
// previous build's result is the one a next revision starts from (`build.previous`).
//
// What a restore cannot undo, said before any door (a typed stop, noRerun, nothing written):
//   - a record the revision MADE (a new page, item or copy): no measured door removes it (`restore_needs_removal`,
//     unproven `record_removal_no_door`);
//   - a slot the revision took out (`removes`): no door puts an element back (same stop).
//   - a place whose value before names a text the revision's profile holds (a held person, the held business name):
//     the restore would show it again (`restore_shows_held_text`); the owner's hold wins over going back.
// A file the revision uploaded stays on the site, shown by nothing once the restore is done: listed in `left.uploads`.
//
// Each place is restored once: its own apply id `<run>:restore:w<seq>:<place>`, done places kept in the restore's own
// record `{restore, done}` so a crashed restore resumes; each is read back; a failing place is tried twice, then the
// restore stops (`restore_failed`, noRerun). Doors as `step-chain-draft-write.js` lists them.
import { DraftWriteError } from 'website-opportunities/domain/draft-write-error.mjs'
import { heldTextsOf, namesHeldInAnyForm } from 'website-opportunities/domain/plan-withheld.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const ATTEMPTS = 2

/** What the restore of a revision's build must put back, or why it cannot. */
export function restorePlanOf(build) {
  const state = build?.write?.state
  if (!state?.undo || !Array.isArray(state.baseIds)) return { stop: 'restore_not_a_revision', places: [] }
  const base = new Set(state.baseIds)
  const made = Object.keys(state.ids ?? {}).filter((k) => !base.has(k))
  const { records, assignments, slots, removed, identity, uploads } = state.undo
  if (made.length || removed.length) return { stop: 'restore_needs_removal', made, removed, places: [] }
  // A place the revision wrote over held a text the owner now keeps off the site: writing it back would show it again.
  const held = heldTextsOf(build.profile?.withheld)
  const before = [records, assignments, slots, identity].map((part) => JSON.stringify(part))
  if (held.length && namesHeldInAnyForm(before, held)) return { stop: 'restore_shows_held_text', places: [] }
  const places = [
    ...Object.entries(records).map(([key, r]) => ({ key: `record:${key}`, type: 'record', ...r })),
    ...Object.entries(assignments).map(([id, menuids]) => ({
      key: `assignment:${id}`,
      type: 'assignment',
      id,
      menuids
    })),
    ...(Object.keys(slots).length ? [{ key: 'slots', type: 'slots', slots }] : []),
    ...(Object.keys(identity).length ? [{ key: 'identity', type: 'identity', fields: identity }] : [])
  ]
  // A module with no pages before gets an empty list: no door deletes its assignment row (it shows on no page again).
  const unassigned = Object.entries(assignments)
    .filter(([, m]) => m === null)
    .map(([id]) => id)
  return { stop: null, places, left: { uploads: [...uploads], assignments: unassigned } }
}

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
      if ((row[column] ?? null) !== value) throw mismatch(place)
  } else if (place.type === 'assignment') {
    // A module with no pages before is set to none: Joomla shows a module with no assignment row on no page.
    const menuids = JSON.stringify(place.menuids ?? [])
    await doors.update({ applyId, kind: 'moduleAssignment', id: Number(place.id), fields: { menuids } })
    if ((await doors.get({ kind: 'moduleAssignment', id: Number(place.id) })).menuids !== menuids)
      throw mismatch(place)
  } else if (place.type === 'slots') {
    const { revision } = await doors.inspect()
    await doors.contract({ applyId, expectedRevision: revision, changes: place.slots, removes: [] })
    const got = await doors.read({ slots: Object.keys(place.slots) })
    for (const [key, value] of Object.entries(place.slots)) if (got[key] !== value) throw mismatch(place)
  } else {
    await doors.identity({ applyId, fields: place.fields })
    const got = await doors.readIdentity()
    for (const [key, value] of Object.entries(place.fields))
      if ((got[key] ?? null) !== value) throw mismatch(place)
  }
}

/**
 * Restore the build a revision run started from.
 * @param {{build: object, previous?: object, doors: object, record: {state?: object, save?: Function}, runId: string}}
 *   input `build`: the REVISION's build result (`buildResultOf`, its `write.state.undo`); `previous`: the build it
 *   started from (`build.previous` names it); `record`: the restore's own record
 * @returns {Promise<{status: 'done', restored: number, current: object | null, left: object}>} `current`: the previous
 *   build to keep as the site's build again, its `seq` past the revision's, so that the same revision run again after
 *   the restore never sends an apply id the site already answered
 */
export async function restoreBuild({ build, previous = null, doors, record, runId }) {
  const plan = restorePlanOf(build)
  if (plan.stop)
    throw Object.assign(
      new DraftWriteError(plan.stop, 'the build before this revision cannot be restored by the doors', {
        made: list(plan.made),
        removed: list(plan.removed)
      }),
      {
        report: {
          status: 'failed',
          restored: 0,
          unproven: plan.stop === 'restore_needs_removal' ? [{ code: 'record_removal_no_door' }] : []
        }
      }
    )
  record.state ??= { restore: build.ref, done: [] }
  if (record.state.restore !== build.ref)
    throw new DraftWriteError('write_record_stale', 'the restore record belongs to another build', {
      recorded: record.state.restore ?? null
    })
  const seq = build.write.state.seq ?? 1
  for (const place of plan.places) {
    if (record.state.done.includes(place.key)) continue
    for (let attempt = 1; ; attempt++) {
      try {
        await restorePlace(place, doors, `${runId}:restore:w${seq}:${place.key}`)
        break
      } catch (error) {
        if (error?.fatal) throw error
        if (attempt >= ATTEMPTS)
          throw new DraftWriteError('restore_failed', `${place.key} failed ${attempt} time(s)`, {
            place: place.key,
            cause: error?.code ?? null
          })
      }
    }
    record.state.done.push(place.key)
    await record.save?.(record.state)
  }
  const current = previous && {
    ...previous,
    restoredFrom: build.ref,
    write: { ...previous.write, state: { ...previous.write.state, seq: seq + 1 } }
  }
  return { status: 'done', restored: plan.places.length, current, left: plan.left }
}
