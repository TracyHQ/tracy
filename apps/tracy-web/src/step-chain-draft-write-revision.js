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
// 🔒 NOTHING IS TAKEN OFF A SITE. A revision that removes an operation (a page, a record, a place written in place) stops
// before any door (`revision_needs_removal`, noRerun): no measured door removes a record or puts a place back
// (unproven `record_removal_no_door`). The previous build stays on the site, whole. The plan step stops most of these
// before any model call (`revisionOf`); this stop holds whatever reaches the write.
//
// 🔒 AN OWNER'S EDIT IS NEVER WRITTEN OVER: a place first touched must still hold what the previous build wrote
// (`journaledDoors`), else `site_changed_outside` (noRerun, the place named, never its text).
//
// 🔒 NOTHING HELD IS NAMED. What the revision holds (`previous.hold`: `{texts, ids}`, given by the write step of the
// draft steps) is masked in every key, ref and path the record and the report keep (`maskHeld`); an id of the
// previous record that names a held text is dropped. A held item's picture uploaded by an earlier build stays on the
// site (no measured door deletes a file): the report carries the flag `held_file_left_on_site` with the masked
// operation and the file, which the caller must show.
//
// `report.delta.orphaned` lists every file the site keeps that nothing shows any more: the previous record's paths
// that the new record no longer names (a picture taken off, or uploaded again with other bytes).
import { DraftWriteError } from 'website-opportunities/domain/draft-write-error.mjs'
import { writeDeltaOf } from 'website-opportunities/domain/revision-write-delta.mjs'
import { maskedOf, maskHeld, namesAnyIn } from 'website-opportunities/domain/revision-text-forms.mjs'
import { emptyUndo, journaledDoors } from './step-chain-draft-journal.js'
import { planMarkOf, runDraftWrite } from './step-chain-draft-write.js'

const list = (value) => (Array.isArray(value) ? value : [])
const KEPT_IN_REPORT = 20

/** The typed stop of a revision that would take something off the site: nothing is called. */
function removalStop(delta, plan, held) {
  const removed = delta.removed.map((r) => r.key)
  const dropped = delta.dropped.map((d) => d.key)
  return Object.assign(
    new DraftWriteError(
      'revision_needs_removal',
      `the revision takes ${removed.length} operation(s) and ${dropped.length} place set(s) off the site; no measured door removes them`,
      maskHeld(
        { removed: removed.slice(0, KEPT_IN_REPORT), dropped: dropped.slice(0, KEPT_IN_REPORT) },
        held
      ),
      { noRerun: true }
    ),
    {
      report: maskHeld(
        {
          status: 'failed',
          ran: [],
          failed: { op: null, code: 'revision_needs_removal' },
          unproven: [...list(plan.unproven), { code: 'record_removal_no_door', removed, dropped }]
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
 *   doors: object, record: object, runId: string, openStored: Function, drawInitials?: Function}} input `previous`:
 *   the previous build's `write` (with `hold`, what the revision holds); `record`: THIS run's record (empty on its first
 *   attempt, resumed after)
 * @returns {Promise<{report: object, delta: object}>}
 */
export async function runRevisionWrite({ plan, previous, doors, record, runId, openStored, drawInitials }) {
  const hold = { texts: list(previous.hold?.texts), ids: list(previous.hold?.ids) }
  const delta = writeDeltaOf({ previous: previous.ops, plan })
  if (delta.removed.length || delta.dropped.length) throw removalStop(delta, plan, hold.texts)
  record.state ??= revisionStateOf(previous, plan, delta, hold.texts)
  const revision = plan.order?.plan?.revision ?? 'none'
  let report
  try {
    report = await runDraftWrite({
      plan,
      doors: journaledDoors(doors, record, { previousWrote: previous.state.wrote ?? {}, held: hold.texts }),
      record,
      openStored,
      drawInitials,
      runId: `${runId}:r${revision}:w${record.state.seq ?? 1}`
    })
  } catch (error) {
    throw outsideEditOf(error, hold.texts)
  }
  const flags = []
  const files = heldFilesOf(previous, record.state, hold)
  if (files.length) flags.push({ code: 'held_file_left_on_site', places: files })
  const counts = deltaCountsOf(delta, orphanedFilesOf(previous, record.state))
  return { report: maskHeld({ ...report, delta: counts, flags }, hold.texts), delta }
}

/** A write stopped by an edit made outside Tracy keeps its own code; every report is masked. */
function outsideEditOf(error, held) {
  if (error?.report) error.report = maskHeld(error.report, held)
  if (error?.details?.cause !== 'site_changed_outside') return error
  return Object.assign(
    new DraftWriteError(
      'site_changed_outside',
      'a place the revision writes was edited outside Tracy since the previous build',
      maskHeld({ op: error.details.op, place: error.details.place }, held),
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
