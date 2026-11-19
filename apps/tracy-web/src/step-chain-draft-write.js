// The write of a draft run (#597): performs the operations of a write plan (`writePlanOf`) on a blank site through
// injected doors, reads everything back, resumes a crashed run without making anything twice, and redoes a failing
// operation once before it stops. How each kind of operation runs: `step-chain-draft-write-kinds.js`.
// Spec: docs/references/draft-write-step.md.
//
// The doors (the Claude Cowork plugin's calls as `copy-proof*.mjs` and `door-proof.mjs` make them; the real client is
// not part of #597):
//   get({kind, id})                       content.get                  -> the record's columns; kind moduleAssignment
//                                                                         -> {menuids}
//   update({applyId, kind, id, fields})   content.update (id 0 makes)  -> {id}; kind moduleAssignment sets menuids
//   find({kind, mark})                    content.list by note / alias -> id | null, a record an earlier attempt made
//   inspect()                             content.contract inspect     -> {revision}
//   contract({applyId, expectedRevision, changes, removes})
//                                         content.contract apply       -> {ok}
//   read({slots})                         content.contract inspect     -> {<slot>: current value, null when removed}
//   upload({applyId, path, bytes, mime})  media.upload                 -> {path}
//   media({path})                         the site's public file       -> {sha256} | null
//   identity({applyId, fields})           site.identity set
//   readIdentity()                        site.identity read           -> {sitename, MetaDesc, sitename_pagetitles}
//   html: {get, set, remove}              the plugin's HTML piece functions (scripts/ai-quickstart/html-piece.php)
// Every write carries its own apply id. Only `content.contract` answers a replayed apply id (and request id) with its
// first answer; `content.update` writes again on every call (measured, plugin 0.24.85), so the run record is what keeps
// a resumed run from making a record twice (`madeOnce`: pending before the call, found by its mark after). A door
// error marked `fatal` (the process going away) is never retried: the run record says where to resume.
import { createHash } from 'node:crypto'
import { planCountsOf } from 'website-opportunities/domain/draft-write-coverage.mjs'
import { DraftWriteError } from 'website-opportunities/domain/draft-write-error.mjs'
import { isMainItem, withoutGone } from 'website-opportunities/domain/draft-write-skip.mjs'
import { runOf } from './step-chain-draft-write-kinds.js'

const list = (value) => (Array.isArray(value) ? value : [])
/** An operation is tried at most this many times; then the write stops, typed. */
export const DRAFT_WRITE_ATTEMPTS = 2

/** What a run record is tied to: the plan id and revision of the order, and a hash of the operations. */
export function planMarkOf(plan) {
  const ops = createHash('sha256').update(JSON.stringify(plan.ops)).digest('hex')
  return { plan: plan.order?.plan?.id ?? null, revision: plan.order?.plan?.revision ?? null, ops }
}
const sameMark = (a, b) => a.plan === b.plan && a.revision === b.revision && a.ops === b.ops

/**
 * The run record of this plan. A record that wrote part of another plan (another revision, other operations) is never
 * resumed nor overwritten: the site holds half of that plan, and only a decision above this step (a fresh blank site,
 * or that plan run to its end) can settle it (`write_record_stale`, noRerun).
 */
function stateOf(record, plan, now) {
  const mark = planMarkOf(plan)
  record.state ??= { mark, ids: {}, paths: {}, pending: {}, done: [] }
  const state = record.state
  const started =
    state.done.length > 0 || Object.keys(state.ids).length > 0 || Object.keys(state.pending).length > 0
  if (started && (!state.mark || !sameMark(state.mark, mark)))
    throw Object.assign(
      new DraftWriteError('write_record_stale', 'the run record belongs to another plan', {
        recorded: { plan: state.mark?.plan ?? null, revision: state.mark?.revision ?? null },
        plan: { plan: mark.plan, revision: mark.revision }
      }),
      {
        // What the stale record had done on the site: nothing of this plan ran, but that half site is named.
        report: {
          status: 'failed',
          ran: [],
          unproven: [],
          failed: { op: null, code: 'write_record_stale' },
          stale: {
            plan: state.mark?.plan ?? null,
            revision: state.mark?.revision ?? null,
            done: [...state.done],
            made: Object.keys(state.ids),
            pending: Object.keys(state.pending)
          }
        }
      }
    )
  state.mark = mark
  // The time the created articles are dated from (`step-chain-draft-write-dates.js`): kept, so a resume agrees.
  state.dateBase ??= new Date(now()).toISOString()
  return state
}

/** Optional places left out because their picture cannot take its slot's frame (`step-chain-draft-picture-fit.js`). */
const placesLeftOf = (state) =>
  state.left
    ? {
        placesLeft: Object.entries(state.left).map(([picture, cause]) => ({
          code: 'slot_picture_left_out',
          picture: picture.slice('picture:'.length),
          cause
        }))
      }
    : {}

/** An operation the doors failed on, as the build result keeps it: codes and ids only. */
const failedItemOf = (op, error) => ({
  code: error?.code === 'read_back_mismatch' ? 'read_back_mismatch' : 'redo_failed',
  op: op.key,
  place: error?.details?.slot ?? error?.details?.ref ?? null,
  reason: typeof error?.code === 'string' ? error.code : null,
  at: 'door'
})

/** How many page operations of the plan ran (a plan with none to write counts as one). */
function pagesWrittenOf(plan, report) {
  const pages = plan.ops.filter((op) => op.kind === 'menuItem.create')
  if (!pages.length) return 1
  const ran = new Set(report.ran)
  return pages.filter((op) => ran.has(op.key)).length
}

/**
 * Run a write plan.
 * @param {{plan: object, doors: object, record: {state?: object, save?: (state: object) => Promise<void>},
 *   openStored: (id: string) => Promise<{bytes: Uint8Array, mime?: string}>, runId?: string,
 *   drawInitials?: (draw: {initials: string, width: number, height: number}) => Promise<{bytes: Uint8Array, mime?: string}>}}
 *   input `record`: the run record, kept between attempts and runs (`state` is resumed from, `save` is called after
 *   every step of an op); `drawInitials`: draws the initials picture of a person with no photo; `now`: the clock the
 *   created articles are dated from on the first run; `pictureLabels`: the research labels of the owner photos by
 *   address (`picture-research-labels.mjs`), read by the photo cut (`step-chain-draft-photo-cut.js`); `skipFailed`: the
 *   build's policy (#575), an operation that fails after its redo is left out and listed in `skippedItems`, and the
 *   run goes on; only no page written at all stops it (`no_page_written`)
 * @returns {Promise<{status: 'done', ran: string[], counts: object, unproven: object[]}>}
 */
export async function runDraftWrite({
  plan,
  doors,
  record,
  openStored,
  drawInitials,
  runId = 'draft',
  now = () => Date.now(),
  pictureLabels = null,
  skipFailed = false
}) {
  const state = stateOf(record, plan, now)
  const report = {
    status: 'running',
    ran: [...state.done],
    unproven: [...list(plan.unproven)],
    // Fact places the kit leaves unwritten by decision: the report says so, never counts them written.
    notWritten: [...list(plan.notWritten)],
    // The approved plan's created legal pages and its not-found page, not built yet: the report says so (#575).
    notBuilt: [...list(plan.notBuilt)],
    conflicts: [...list(plan.conflicts)],
    // Words the plan changed before any door (control characters out, plugin codes neutralised), with a code.
    cleaned: [...list(plan.cleaned)],
    // The items left out, each with a code and ids, never the words (#575): refused before any door, or failed at it.
    skippedItems: [...list(plan.skippedItems)],
    // A revision run (#599): the operations the site already holds from the previous build run nothing.
    ...(state.kept ? { kept: state.kept.length } : {})
  }
  const kept = new Set(list(state.kept))
  const ctx = {
    plan,
    doors,
    html: doors.html,
    state,
    // A revision run's operations that write a record the previous build made: written again in place, same id.
    rewrite: new Set(list(state.rewrite)),
    report,
    openStored,
    drawInitials,
    // The research labels of the owner photos by address: the photo cut keeps their subject and heads whole.
    pictureLabels,
    save: () => record.save?.(state),
    // One id per door call of an operation, the same on every retry and resume: `<run>:<op>:<call>`.
    applyId: (op, call) => `${runId}:${op.key}:${call}`
  }
  // The operations the doors failed on in this run: what names one loses that value only (`withoutGone`).
  const gone = new Set()
  let defaultLost = false
  for (const planned of plan.ops) {
    if (state.done.includes(planned.key) || kept.has(planned.key)) continue
    const run = runOf(planned)
    if (!run) throw new DraftWriteError('op_unknown', `no way to run ${planned.kind}`, { op: planned.key })
    const live = skipFailed ? withoutGone(planned, gone, plan, 'door') : { op: planned, skipped: [] }
    for (const { value: _v, ...item } of live.skipped) report.skippedItems.push(item)
    // The default menu item failed at the door: the next page item of the main menu takes the flag (#575).
    const promoted = defaultLost && isMainItem(live.op, plan.mainMenu)
    if (promoted) {
      defaultLost = false
      report.skippedItems.push({
        code: 'default_page_moved',
        op: live.op.key,
        place: null,
        reason: null,
        at: 'door'
      })
    }
    const op = promoted ? { ...live.op, fields: { ...live.op.fields, home: 1 } } : live.op
    for (let attempt = 1; ; attempt++) {
      try {
        await run(op, ctx)
        break
      } catch (error) {
        if (
          error?.fatal ||
          attempt >= DRAFT_WRITE_ATTEMPTS ||
          (error?.noRerun && error.code !== 'read_back_mismatch')
        ) {
          const failed = {
            ...report,
            status: 'failed',
            ran: [...state.done],
            failed: { op: op.key, code: error?.code ?? null },
            ...placesLeftOf(state)
          }
          // The process went away: the error is passed on as it is, with what ran, so a half site is never silent.
          if (error?.fatal) throw Object.assign(error, { report: failed })
          // The build's policy (#575): one operation that fails is left out and listed, and the rest is written.
          if (skipFailed) {
            report.skippedItems.push(failedItemOf(op, error))
            gone.add(op.key)
            if (isMainItem(op, plan.mainMenu) && op.fields.home) defaultLost = true
            break
          }
          const code = error?.code === 'read_back_mismatch' ? 'read_back_mismatch' : 'redo_failed'
          throw Object.assign(
            new DraftWriteError(code, `${op.key} failed ${attempt} time(s)`, {
              op: op.key,
              cause: error?.code ?? null,
              ...error?.details
            }),
            { report: failed }
          )
        }
      }
    }
    if (gone.has(op.key)) continue
    state.done.push(op.key)
    report.ran.push(op.key)
    await ctx.save()
  }
  // A site with no page written is no site: the only failure of the door stage that stops the build.
  if (skipFailed && pagesWrittenOf(plan, report) === 0)
    throw Object.assign(new DraftWriteError('no_page_written', 'no page of the plan was written', {}), {
      report: {
        ...report,
        status: 'failed',
        failed: { op: null, code: 'no_page_written' },
        ...placesLeftOf(state)
      }
    })
  // Each entry counted once: written by an operation, conflicted (lost its place, written nowhere) or skipped.
  return { ...report, ...placesLeftOf(state), status: 'done', counts: planCountsOf(plan) }
}
