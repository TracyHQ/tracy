// The write of a draft run (#597): performs the operations of a write plan (`writePlanOf`) on a blank site through
// injected doors, reads every record back, resumes a crashed run without making anything twice, and redoes a failing
// operation once before it stops. Spec: docs/references/draft-write-step.md.
//
// The doors (the Claude Cowork plugin's calls as `copy-proof*.mjs` and `door-proof.mjs` make them; the real client is
// not part of #597):
//   get({kind, id})                       content.get                  -> the record's columns
//   update({applyId, kind, id, fields})   content.update (id 0 makes)  -> {id}; kind moduleAssignment sets menuids
//   find({kind, mark})                    content.list by note / alias -> id | null, a record an earlier attempt made
//   contract({applyId, changes, removes}) content.contract apply (after inspect, expected_revision) -> {ok}
//   read({slots})                         content.contract inspect     -> {<slot>: current value}
//   upload({applyId, path, bytes, mime})  media.upload                 -> {path}
//   identity({applyId, fields})           site.identity set            -> sitename, fromname
//   html: {get, set, remove}              the plugin's HTML piece functions (scripts/ai-quickstart/html-piece.php)
// A door error marked `fatal` (the process going away) is never retried: the run record says where to resume.
import { DraftWriteError } from 'website-opportunities/domain/draft-write-error.mjs'
import { getAt, setAt } from 'website-opportunities/domain/draft-write-codec.mjs'
import {
  baseFieldsOf,
  copyColumns,
  madeOnce,
  picturePathOf,
  readBack,
  resolved,
  writtenFields
} from './step-chain-draft-write-ops.js'

const list = (value) => (Array.isArray(value) ? value : [])
/** An operation is tried at most this many times; then the write stops, typed. */
export const DRAFT_WRITE_ATTEMPTS = 2

const RUN = {
  async create(op, ctx) {
    const kind = op.recordKind
    const id = await madeOnce(op, kind, ctx, () => writtenFields(baseFieldsOf(op, ctx), op, ctx))
    readBack(await ctx.doors.get({ kind, id }), op, ctx)
  },
  async 'module.copy'(op, ctx) {
    const source = copyColumns(await ctx.doors.get({ kind: 'module', id: op.source.id }))
    const id = await madeOnce(op, 'module', ctx, () =>
      writtenFields({ ...source, note: op.mark, ...(op.ordering ? { ordering: op.ordering } : {}) }, op, ctx)
    )
    readBack(await ctx.doors.get({ kind: 'module', id }), op, ctx)
  },
  async 'module.assign'(op, ctx) {
    const id = ctx.state.ids[op.record] ?? op.sourceId
    const menuids = JSON.stringify(
      op.menuids.map((m) => (typeof m === 'object' ? Number(resolved(m, ctx)) : m))
    )
    await ctx.doors.update({ applyId: ctx.applyId(op), kind: 'moduleAssignment', id, fields: { menuids } })
  },
  async 'module.position'(op, ctx) {
    const id = ctx.state.ids[op.record]
    const row = await ctx.doors.get({ kind: 'module', id })
    const value = `tracy-tabs-${id}`
    const fields = setAt({ params: row.params }, op.loc, value, ctx.html)
    await ctx.doors.update({ applyId: ctx.applyId(op), kind: 'module', id, fields })
    if (getAt(await ctx.doors.get({ kind: 'module', id }), op.loc, ctx.html) !== value)
      throw new DraftWriteError('read_back_mismatch', `${op.key} reads another position`, { op: op.key })
  },
  async 'contract.apply'(op, ctx) {
    const changes = {}
    for (const v of op.values) changes[v.loc.slot] = String(resolved(v.value, ctx))
    await ctx.doors.contract({ applyId: ctx.applyId(op), changes, removes: op.removes })
    const read = await ctx.doors.read({ slots: Object.keys(changes) })
    for (const [slot, value] of Object.entries(changes))
      if (read[slot] !== value)
        throw new DraftWriteError('read_back_mismatch', `${op.key} reads another value`, {
          op: op.key,
          slot,
          expected: value.length,
          got: String(read[slot] ?? '').length
        })
  },
  async 'record.patch'(op, ctx) {
    const row = await ctx.doors.get({ kind: op.recordKind, id: op.sourceId })
    let fields = {}
    for (const v of op.values) fields = setAt({ ...row, ...fields }, v.loc, v.value, ctx.html)
    await ctx.doors.update({ applyId: ctx.applyId(op), kind: op.recordKind, id: op.sourceId, fields })
  },
  async 'picture.upload'(op, ctx) {
    const key = `picture:${op.picture}`
    if (ctx.state.paths[key]) return
    if (!op.stored?.id && op.draw && !ctx.drawInitials)
      throw new DraftWriteError(
        'initials_drawer_missing',
        `${op.key} shows initials and no drawer is wired`,
        { op: op.key }
      )
    const stored = op.stored?.id ? await ctx.openStored(op.stored.id) : await ctx.drawInitials(op.draw)
    const path = picturePathOf(stored.bytes, stored.mime)
    const answer = await ctx.doors.upload({
      applyId: ctx.applyId(op),
      path,
      bytes: stored.bytes,
      mime: stored.mime
    })
    ctx.state.paths[key] = answer?.path ?? path
  },
  async 'library.create'(op, ctx) {
    const id = await madeOnce(op, 'module', ctx, () => ({
      title: `Tracy ${op.key}`,
      note: op.mark,
      module: 'mod_custom',
      position: op.position,
      content: op.html,
      showtitle: 0,
      published: 1,
      ordering: op.ordering ?? 0,
      access: 1,
      language: '*',
      params: JSON.stringify({ layout: '_:default', moduleclass_sfx: '', containerClass: op.containerClass })
    }))
    const menuids = JSON.stringify([Number(resolved({ ref: `page:${op.page}`, form: 'id' }, ctx))])
    await ctx.doors.update({ applyId: ctx.applyId(op), kind: 'moduleAssignment', id, fields: { menuids } })
  },
  async 'site.identity'(op, ctx) {
    const fields = Object.fromEntries(op.values.map((v) => [v.loc.column, v.value]))
    await ctx.doors.identity({ applyId: ctx.applyId(op), fields })
  },
  async 'look.accent'(op, ctx) {
    if (op.unproven) ctx.report.unproven.push({ code: op.unproven, op: op.key })
  }
}
const runOf = (op) => RUN[op.kind] ?? (op.kind.endsWith('.create') ? RUN.create : null)

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
  const state = (record.state ??= { ids: {}, paths: {}, pending: {}, done: [] })
  const report = { status: 'running', ran: [...state.done], unproven: [...list(plan.unproven)] }
  const ctx = {
    plan,
    doors,
    html: doors.html,
    state,
    report,
    openStored,
    drawInitials,
    save: () => record.save?.(state),
    applyId: (op) => `${runId}:${op.key}`
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
          if (error?.fatal) throw error
          const code = error?.code === 'read_back_mismatch' ? 'read_back_mismatch' : 'redo_failed'
          throw Object.assign(
            new DraftWriteError(code, `${op.key} failed ${attempt} time(s)`, {
              op: op.key,
              cause: error?.code ?? null,
              ...error?.details
            }),
            {
              report: {
                ...report,
                status: 'failed',
                ran: [...state.done],
                failed: { op: op.key, code: error?.code ?? null }
              }
            }
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
