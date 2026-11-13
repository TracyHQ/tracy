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
// Every write carries its own apply id; the client answers a replayed id with its first answer. A door error marked
// `fatal` (the process going away) is never retried: the run record says where to resume.
import { createHash } from 'node:crypto'
import { DraftWriteError } from 'website-opportunities/domain/draft-write-error.mjs'
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
function stateOf(record, plan) {
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
        report: { status: 'failed', ran: [], unproven: [], failed: { op: null, code: 'write_record_stale' } }
      }
    )
  state.mark = mark
  return state
}

/**
 * Run a write plan.
 * @param {{plan: object, doors: object, record: {state?: object, save?: (state: object) => Promise<void>},
 *   openStored: (id: string) => Promise<{bytes: Uint8Array, mime?: string}>, runId?: string,
 *   drawInitials?: (draw: {initials: string, width: number, height: number}) => Promise<{bytes: Uint8Array, mime?: string}>}}
 *   input `record`: the run record, kept between attempts and runs (`state` is resumed from, `save` is called after
 *   every step of an op); `drawInitials`: draws the initials picture of a person with no photo
 * @returns {Promise<{status: 'done', ran: string[], counts: object, unproven: object[]}>}
 */
export async function runDraftWrite({ plan, doors, record, openStored, drawInitials, runId = 'draft' }) {
  const state = stateOf(record, plan)
  const report = {
    status: 'running',
    ran: [...state.done],
    unproven: [...list(plan.unproven)],
    conflicts: [...list(plan.conflicts)]
  }
  const ctx = {
    plan,
    doors,
    html: doors.html,
    state,
    report,
    openStored,
    drawInitials,
    save: () => record.save?.(state),
    // One id per door call of an operation, the same on every retry and resume: `<run>:<op>:<call>`.
    applyId: (op, call) => `${runId}:${op.key}:${call}`
  }
  for (const op of plan.ops) {
    if (state.done.includes(op.key)) continue
    const run = runOf(op)
    if (!run) throw new DraftWriteError('op_unknown', `no way to run ${op.kind}`, { op: op.key })
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
            failed: { op: op.key, code: error?.code ?? null }
          }
          // The process went away: the error is passed on as it is, with what ran, so a half site is never silent.
          if (error?.fatal) throw Object.assign(error, { report: failed })
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
    state.done.push(op.key)
    report.ran.push(op.key)
    await ctx.save()
  }
  const written = plan.ops.reduce((n, op) => n + list(op.entries).length, 0)
  return {
    ...report,
    status: 'done',
    counts: { written, skipped: plan.skipped.length, ops: plan.ops.length }
  }
}
