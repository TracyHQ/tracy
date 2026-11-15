// The write of a revision run (#599): the new revision's full write plan (every guard over the whole site) run on the
// site the previous build wrote, through only the operations the revision changed (`writeDeltaOf`).
//
// 🔒 A NEW RUN RECORD, NEVER THE OLD ONE. The previous build's record names its plan revision, and `runDraftWrite`
// refuses it for any other plan (`write_record_stale`): that guard stays. A revision run starts its OWN record from the
// previous build's: the same ids and picture paths (so every reference resolves to what the site holds), the
// unchanged operations `kept` (run nothing), the changed ones in `rewrite` (a record the build made is updated in
// place, same id), a picture whose bytes changed uploaded again, `base` naming the previous record, and `seq` one more
// than its. Its mark is the new plan's, so it resumes only this revision. Every door call carries the apply id
// `<run>:r<revision>:w<seq>:<op>:<call>`: a replay of the old build, or of this revision before a restore, is never
// taken for this run's call. Every write over a place is journaled first (`journaledDoors`) for the restore.
//
// 🔒 NOTHING IS DELETED. An operation the revision no longer has is settled by the doors that exist
// (`step-chain-draft-removal.js`), after the writes: a record a build made is hidden, a module is put on no page, each
// act journaled (`state.undo`, `state.removal`) so a restore or an abandon brings back exactly what was there, and the
// report says so (`hidden_not_deleted`, `on_no_page_not_deleted`). What only an unavailable door settles (a place written
// in place no longer written) stops before any door (`revision_needs_removal`, noRerun, naming the door).
//
// 🔒 AN OWNER'S EDIT IS NEVER WRITTEN OVER: a place first touched must still hold what the previous build wrote
// (`journaledDoors`), else `site_changed_outside` (noRerun, the place named, never its text).
//
// 🔒 NOTHING HELD IS NAMED. What the revision holds (`previous.hold`: `{texts, ids}`, given by the write step of the
// draft steps) is masked in every key, ref and path the record and the report keep (`maskHeld`); an id of the
// previous record that names a held text is dropped. A held item's picture uploaded by an earlier build stays on the
// site (a revision deletes no file: the restore of the previous build shows it again, and no door brings a deleted file
// back, `revertDelete`): the report carries the flag `held_file_left_on_site` with the masked
// operation and the file, which the caller must show.
//
// `report.delta.orphaned` lists every file the site keeps that nothing shows any more: the previous record's paths
// that the new record no longer names (a picture taken off, or uploaded again with other bytes): kept for the restore.
import { DraftWriteError } from 'website-opportunities/domain/draft-write-error.mjs'
import { writeDeltaOf } from 'website-opportunities/domain/revision-write-delta.mjs'
import { maskedOf, maskHeld, namesAnyIn } from 'website-opportunities/domain/revision-text-forms.mjs'
import { emptyUndo, journaledDoors } from './step-chain-draft-journal.js'
import { checkAct, removalActsOf, removalFlagsOf } from './step-chain-draft-removal.js'
import { missingDoorOf, runRemovals } from './step-chain-draft-removal-run.js'
import { planMarkOf, runDraftWrite } from './step-chain-draft-write.js'

const list = (value) => (Array.isArray(value) ? value : [])
const KEPT_IN_REPORT = 20
/** The causes a failed operation keeps as the run's own stop: an owner's edit, a column with no empty value. */
const TYPED_CAUSES = new Set(['site_changed_outside', 'revision_needs_removal'])

/** The typed stop of a revision that takes off the site what only an unavailable door would: nothing is called. */
function removalStop(stops, plan, held) {
  const doors = [...new Set(stops.map((s) => s.door ?? 'none'))]
  const shown = stops.slice(0, KEPT_IN_REPORT)
  return Object.assign(
    new DraftWriteError(
      'revision_needs_removal',
      `the revision takes ${stops.length} operation(s) or place set(s) off the site that no available door settles (${doors.join(', ')})`,
      maskHeld({ stops: shown, doors }, held),
      { noRerun: true }
    ),
    {
      report: maskHeld(
        {
          status: 'failed',
          ran: [],
          failed: { op: null, code: 'revision_needs_removal' },
          unproven: [...list(plan.unproven), { code: 'record_removal_no_door', stops: shown, doors }]
        },
        held
      )
    }
  )
}

/** The run record of a revision, started from the previous build's state; a key naming a held text is not carried. */
export function revisionStateOf(previous, plan, delta, held) {
  const before = previous.state
  const pictures = new Set([
    ...delta.rewrite.filter((r) => r.key.startsWith('picture:')).map((r) => r.key),
    ...delta.orphaned
  ])
  const shown = (k) => !(held.length && namesAnyIn(k, held))
  return {
    mark: planMarkOf(plan),
    base: before.mark,
    seq: (before.seq ?? 1) + 1,
    baseIds: maskHeld(Object.keys(before.ids ?? {}), held),
    ids: Object.fromEntries(Object.entries(before.ids ?? {}).filter(([k]) => shown(k))),
    paths: Object.fromEntries(
      Object.entries(before.paths ?? {}).filter(([k]) => !pictures.has(k) && shown(k))
    ),
    pending: {},
    done: [],
    kept: [...delta.same],
    rewrite: delta.rewrite.map((r) => r.key),
    wrote: { ...before.wrote },
    shapes: { ...before.shapes },
    cleared: [...list(before.cleared)],
    undo: emptyUndo()
  }
}

/** The files of the previous record no path of the new record names: shown by nothing, left on the site. */
const orphanedFilesOf = (previous, state) => {
  const now = new Set(Object.values(state.paths ?? {}))
  return [...new Set(Object.values(previous.state.paths ?? {}))].filter((p) => !now.has(p))
}

/** The uploads of a held item the site keeps: each masked operation and its file. */
function heldFilesOf(previous, state, hold) {
  const now = new Set(Object.values(state.paths ?? {}))
  return Object.entries(previous.state.paths ?? {})
    .filter(
      ([key, path]) =>
        !now.has(path) && (namesAnyIn(key, hold.texts) || hold.ids.some((id) => key.includes(id)))
    )
    .map(([key, path]) => ({ op: maskedOf(key), file: path }))
}

/**
 * @param {{plan: object, previous: {state: object, ops: object[], hold?: {texts: string[], ids: string[]}},
 *   doors: object, record: object, runId: string, openStored: Function, drawInitials?: Function,
 *   beforeDoors?: Function}} input `beforeDoors`: the site check and mark, called after every check that writes
 *   nothing and before the first door write; `previous`:
 *   the previous build's `write` (with `hold`, what the revision holds); `record`: THIS run's record (empty on its first
 *   attempt, resumed after)
 * @returns {Promise<{report: object, delta: object}>}
 */
export async function runRevisionWrite(input) {
  const { plan, previous, doors, record, runId, openStored, drawInitials, beforeDoors } = input
  const hold = { texts: list(previous.hold?.texts), ids: list(previous.hold?.ids) }
  const delta = writeDeltaOf({ previous: previous.ops, plan })
  const removal = removalActsOf(delta, previous.state)
  if (removal.stops.length) throw removalStop(removal.stops, plan, hold.texts)
  const missing = missingDoorOf(removal.acts, doors)
  if (missing) throw missing
  record.state ??= revisionStateOf(previous, plan, delta, hold.texts)
  const revision = plan.order?.plan?.revision ?? 'none'
  const runOf = `${runId}:r${revision}:w${record.state.seq ?? 1}`
  const journaled = journaledDoors(doors, record, {
    previousWrote: previous.state.wrote ?? {},
    previousShapes: previous.state.shapes ?? {},
    previousCleared: list(previous.state.cleared),
    held: hold.texts
  })
  const before = { wrote: previous.state.wrote ?? {}, shapes: previous.state.shapes ?? {} }
  let report
  try {
    // An owner edit on a record the revision takes off stops before any door writes (checked again before each act).
    const done = new Set(list(record.state.removal?.done))
    for (const act of removal.acts.filter((a) => !done.has(a.key)))
      await checkAct(act, doors, [before, record.state], record.state.undo)
    // Every stop that writes nothing came first: only now is the site marked as this run's (`builds.begin`).
    await beforeDoors?.()
    report = await runDraftWrite({ plan, doors: journaled, record, openStored, drawInitials, runId: runOf })
    await runRemovals({ acts: removal.acts, doors: journaled, record, previous: before, runId: runOf })
  } catch (error) {
    error.report ??= {
      status: 'failed',
      ran: [...list(record.state.done)],
      unproven: [...list(plan.unproven)]
    }
    throw outsideEditOf(error, hold.texts)
  }
  const flags = removalFlagsOf(removal)
  const files = heldFilesOf(previous, record.state, hold)
  if (files.length) flags.push({ code: 'held_file_left_on_site', places: files })
  const counts = deltaCountsOf(delta, orphanedFilesOf(previous, record.state))
  return { report: maskHeld({ ...report, delta: counts, flags }, hold.texts), delta }
}

/** A write stopped by an edit made outside Tracy keeps its own code; every report is masked. */
function outsideEditOf(error, held) {
  if (error?.report) error.report = maskHeld(error.report, held)
  const cause = error?.details?.cause
  if (!TYPED_CAUSES.has(cause)) return error
  return Object.assign(
    new DraftWriteError(
      cause,
      `a place the revision writes cannot be written: ${cause}`,
      maskHeld(
        {
          op: error.details.op,
          place: error.details.place,
          ...(error.details.why ? { why: error.details.why } : {})
        },
        held
      ),
      { noRerun: true }
    ),
    { report: error.report }
  )
}

/** The delta in the report: counts, the keys written again (operation keys only, never words), the files left. */
export const deltaCountsOf = (delta, orphaned = []) => ({
  same: delta.same.length,
  rewrite: delta.rewrite.map((r) => r.key),
  added: delta.added,
  unused: delta.orphaned,
  orphaned
})
