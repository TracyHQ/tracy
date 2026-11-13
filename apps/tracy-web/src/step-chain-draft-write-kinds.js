// How `runDraftWrite` performs each kind of operation of a draft write plan (#597): the door calls of the operation,
// each with its own apply id (`ctx.applyId(op, <call>)`, stable across retries and resumes), then the read back of
// everything the calls changed (`step-chain-draft-write-check.js`). A kind not listed here stops the write
// (`op_unknown`).
import { getAt, setAt } from 'website-opportunities/domain/draft-write-codec.mjs'
import { DraftWriteError } from 'website-opportunities/domain/draft-write-error.mjs'
import { CREATED_KINDS } from 'website-opportunities/domain/draft-write-plan.mjs'
import {
  readAssignment,
  readContract,
  readIdentity,
  readSent,
  readUpload,
  readValues
} from './step-chain-draft-write-check.js'
import {
  baseFieldsOf,
  copyColumns,
  madeOnce,
  picturePathOf,
  resolved,
  writtenFields
} from './step-chain-draft-write-ops.js'

async function made(op, kind, fields, ctx) {
  const id = await madeOnce(op, kind, ctx, () => fields)
  const row = await ctx.doors.get({ kind, id })
  readSent(row, fields, op)
  readValues(row, op, ctx)
  return id
}

async function assign(op, id, menuids, ctx) {
  await ctx.doors.update({
    applyId: ctx.applyId(op, 'assign'),
    kind: 'moduleAssignment',
    id,
    fields: { menuids: JSON.stringify(menuids) }
  })
  await readAssignment(op, id, menuids, ctx)
}

export const RUN = {
  async create(op, ctx) {
    if (!CREATED_KINDS.includes(op.recordKind))
      throw new DraftWriteError('record_kind_unsupported', `${op.key} is a ${op.recordKind}`, { op: op.key })
    await made(op, op.recordKind, writtenFields(baseFieldsOf(op, ctx), op, ctx), ctx)
  },
  async 'module.copy'(op, ctx) {
    const source = copyColumns(await ctx.doors.get({ kind: 'module', id: op.source.id }))
    const base = { ...source, note: op.mark, ...(op.ordering ? { ordering: op.ordering } : {}) }
    await made(op, 'module', writtenFields(base, op, ctx), ctx)
  },
  async 'module.assign'(op, ctx) {
    const id = ctx.state.ids[op.record] ?? op.sourceId
    const menuids = op.menuids.map((m) => (typeof m === 'object' ? Number(resolved(m, ctx)) : m))
    await assign(op, id, menuids, ctx)
  },
  async 'module.position'(op, ctx) {
    const id = ctx.state.ids[op.record]
    const row = await ctx.doors.get({ kind: 'module', id })
    const value = `tracy-tabs-${id}`
    const fields = setAt({ params: row.params }, op.loc, value, ctx.html)
    await ctx.doors.update({ applyId: ctx.applyId(op, 'position'), kind: 'module', id, fields })
    const got = getAt(await ctx.doors.get({ kind: 'module', id }), op.loc, ctx.html)
    if (got !== value)
      throw new DraftWriteError('read_back_mismatch', `${op.key} reads another position`, { op: op.key })
  },
  async 'contract.apply'(op, ctx) {
    const changes = {}
    for (const v of op.values) changes[v.loc.slot] = String(resolved(v.value, ctx))
    const { revision } = await ctx.doors.inspect()
    await ctx.doors.contract({
      applyId: ctx.applyId(op, 'apply'),
      expectedRevision: revision,
      changes,
      removes: op.removes
    })
    await readContract(op, changes, op.removes ?? [], ctx)
  },
  async 'record.patch'(op, ctx) {
    const row = await ctx.doors.get({ kind: op.recordKind, id: op.sourceId })
    let fields = {}
    for (const v of op.values) fields = setAt({ ...row, ...fields }, v.loc, v.value, ctx.html)
    const sent = Object.fromEntries(op.values.map((v) => [v.loc.column, fields[v.loc.column]]))
    await ctx.doors.update({
      applyId: ctx.applyId(op, 'patch'),
      kind: op.recordKind,
      id: op.sourceId,
      fields: sent
    })
    const after = await ctx.doors.get({ kind: op.recordKind, id: op.sourceId })
    readSent(after, sent, op)
    readValues(after, op, ctx)
  },
  async 'picture.upload'(op, ctx) {
    const key = `picture:${op.picture}`
    if (ctx.state.paths[key]) return
    if (!op.stored?.id && op.draw && !ctx.drawInitials)
      throw new DraftWriteError(
        'initials_drawer_missing',
        `${op.key} shows initials and no drawer is wired`,
        {
          op: op.key
        }
      )
    const stored = op.stored?.id ? await ctx.openStored(op.stored.id) : await ctx.drawInitials(op.draw)
    const path = picturePathOf(stored.bytes, stored.mime)
    const answer = await ctx.doors.upload({
      applyId: ctx.applyId(op, 'upload'),
      path,
      bytes: stored.bytes,
      mime: stored.mime
    })
    await readUpload(op, answer?.path ?? path, stored.bytes, ctx)
    ctx.state.paths[key] = answer?.path ?? path
  },
  async 'library.create'(op, ctx) {
    const fields = {
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
    }
    const id = await made(op, 'module', fields, ctx)
    await assign(op, id, [Number(resolved({ ref: `page:${op.page}`, form: 'id' }, ctx))], ctx)
  },
  async 'site.identity'(op, ctx) {
    const fields = Object.fromEntries(op.values.map((v) => [v.loc.column, v.value]))
    await ctx.doors.identity({ applyId: ctx.applyId(op, 'identity'), fields })
    await readIdentity(op, fields, ctx)
  },
  async 'look.accent'(op, ctx) {
    if (op.unproven) ctx.report.unproven.push({ code: op.unproven, op: op.key })
  }
}
export const runOf = (op) => RUN[op.kind] ?? (op.kind.endsWith('.create') ? RUN.create : null)
