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
// (unproven `record_removal_no_door`). The previous build stays on the site, whole.
import { DraftWriteError } from 'website-opportunities/domain/draft-write-error.mjs'
import { writeDeltaOf } from 'website-opportunities/domain/revision-write-delta.mjs'
import { emptyUndo, journaledDoors } from './step-chain-draft-journal.js'
import { planMarkOf, runDraftWrite } from './step-chain-draft-write.js'

const list = (value) => (Array.isArray(value) ? value : [])
const KEPT_IN_REPORT = 20

/** The typed stop of a revision that would take something off the site: nothing is called. */
function removalStop(delta, plan) {
  const removed = delta.removed.map((r) => r.key)
  const dropped = delta.dropped.map((d) => d.key)
  return Object.assign(
    new DraftWriteError(
      'revision_needs_removal',
      `the revision takes ${removed.length} operation(s) and ${dropped.length} place set(s) off the site; no measured door removes them`,
      { removed: removed.slice(0, KEPT_IN_REPORT), dropped: dropped.slice(0, KEPT_IN_REPORT) },
      { noRerun: true }
    ),
    {
      report: {
        status: 'failed',
        ran: [],
        failed: { op: null, code: 'revision_needs_removal' },
        unproven: [...list(plan.unproven), { code: 'record_removal_no_door', removed, dropped }]
      }
    }
  )
}

/** The run record of a revision, started from the previous build's state. */
function revisionStateOf(previous, plan, delta) {
  const before = previous.state
  const pictures = new Set([
    ...delta.rewrite.filter((r) => r.key.startsWith('picture:')).map((r) => r.key),
    ...delta.orphaned
  ])
  return {
    mark: planMarkOf(plan),
    base: before.mark,
    seq: (before.seq ?? 1) + 1,
    baseIds: Object.keys(before.ids ?? {}),
    ids: { ...before.ids },
    paths: Object.fromEntries(Object.entries(before.paths ?? {}).filter(([k]) => !pictures.has(k))),
    pending: {},
    done: [],
    kept: [...delta.same],
    rewrite: delta.rewrite.map((r) => r.key),
    undo: emptyUndo()
  }
}

/**
 * @param {{plan: object, previous: {state: object, ops: object[]}, doors: object, record: object, runId: string,
 *   openStored: Function, drawInitials?: Function}} input `previous`: the previous build's `write`; `record`: THIS run's
 *   record (empty on its first attempt, resumed after)
 * @returns {Promise<{report: object, delta: object}>}
 */
export async function runRevisionWrite({ plan, previous, doors, record, runId, openStored, drawInitials }) {
  const delta = writeDeltaOf({ previous: previous.ops, plan })
  if (delta.removed.length || delta.dropped.length) throw removalStop(delta, plan)
  record.state ??= revisionStateOf(previous, plan, delta)
  const revision = plan.order?.plan?.revision ?? 'none'
  const report = await runDraftWrite({
    plan,
    doors: journaledDoors(doors, record),
    record,
    openStored,
    drawInitials,
    runId: `${runId}:r${revision}:w${record.state.seq ?? 1}`
  })
  return { report: { ...report, delta: deltaCountsOf(delta) }, delta }
}

/** The delta in the report: counts and the keys written again (operation keys only, never words). */
export const deltaCountsOf = (delta) => ({
  same: delta.same.length,
  rewrite: delta.rewrite.map((r) => r.key),
  added: delta.added,
  orphaned: delta.orphaned
})
