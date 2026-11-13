// One door operation of a draft write (#597), as `runDraftWrite` performs it: the fields a created record starts with,
// the references of the plan resolved to the ids the site gave (`page:`, `category:`, `article:`, `contact:`,
// `picture:`, `tabs:`), and every value read back after the write and compared with what was meant. The doors are
// injected (`step-chain-draft-write.js` documents them); nothing here reaches a site by itself.
import { createHash } from 'node:crypto'
import { MODULE_COLUMNS } from 'website-opportunities/domain/ai-quickstart-placement.mjs'
import {
  cutRows,
  getAt,
  movedAfterCut,
  removeAt,
  setAt
} from 'website-opportunities/domain/draft-write-codec.mjs'
import { DraftWriteError, lengthOf } from 'website-opportunities/domain/draft-write-error.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const EXT = { 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg' }

/** A plan value with its references resolved to what the site holds. */
export function resolved(value, ctx) {
  if (!value || typeof value !== 'object') return value
  if (value.fixed) return value.fixed
  const ref = String(value.ref ?? '')
  const id = (key) => {
    const got = ctx.state.ids[key]
    if (got === undefined)
      throw new DraftWriteError('ref_unresolved', `${key} has no site id yet`, { ref: key })
    return got
  }
  if (ref.startsWith('page:')) {
    const page = id(`menuItem:${ctx.plan.mainMenu}:${ref.slice(5)}`)
    return value.form === 'address' ? `index.php?Itemid=${page}` : String(page)
  }
  if (ref.startsWith('picture:')) {
    const path = ctx.state.paths[ref]
    if (!path) throw new DraftWriteError('ref_unresolved', `${ref} was not uploaded`, { ref })
    return path
  }
  if (ref.startsWith('tabs:')) return `tracy-tabs-${id(ref.slice(5))}`
  if (value.form === 'articleLink') return `index.php?option=com_content&view=article&id=${id(ref)}`
  if (value.form === 'contactLink') return `index.php?option=com_contact&view=contact&id=${id(ref)}`
  return String(id(ref))
}

/** The fields a record the build creates starts with: no frame from the blank site (#584). */
export function baseFieldsOf(op, ctx) {
  const f = op.fields
  const common = { alias: f.alias, language: '*', access: 1 }
  if (op.recordKind === 'menuItem') {
    const alias = op.link?.form === 'alias'
    const target = op.link ? resolved(op.link, ctx) : 'index.php?option=com_content&view=featured'
    return {
      ...common,
      title: f.title,
      menutype: f.menutype,
      home: f.home,
      published: 1,
      type: alias ? 'alias' : 'component',
      link: alias ? '' : target,
      params: JSON.stringify(alias ? { aliasoptions: target } : {})
    }
  }
  if (op.recordKind === 'category')
    return { ...common, title: f.title, extension: 'com_content', published: 1 }
  if (op.recordKind === 'contact') return { ...common, name: f.title, published: 1 }
  return {
    ...common,
    title: f.title,
    state: 1,
    ...(f.catid ? { catid: resolved(f.catid, ctx) } : {}),
    introtext: '',
    fulltext: '',
    attribs: '{}',
    images: '{}'
  }
}

/** The fields with every value of the op set, its rows cut and its button elements taken out. */
export function writtenFields(fields, op, ctx) {
  let out = fields
  for (const v of list(op.values)) out = setAt(out, v.loc, resolved(v.value, ctx), ctx.html)
  for (const cut of list(op.cuts)) out = cutRows(out, cut.row, cut.kept)
  for (const r of list(op.removes)) out = removeAt(out, r.loc, r.xpath, ctx.html)
  return out
}

/** Compare every value of the op with the record the site holds now; a difference is a typed error, no text. */
export function readBack(row, op, ctx) {
  for (const v of list(op.values)) {
    let loc = v.loc
    for (const cut of list(op.cuts)) loc = loc && movedAfterCut(loc, cut.row, cut.kept)
    if (!loc) continue
    const meant = String(resolved(v.value, ctx))
    const got = getAt(row, loc, ctx.html)
    if (String(got ?? '') !== meant)
      throw new DraftWriteError('read_back_mismatch', `${op.key} reads another value than it wrote`, {
        op: op.key,
        entity: v.loc.entity,
        slot: v.loc.slot ?? null,
        column: v.loc.column,
        expected: lengthOf(meant),
        got: lengthOf(got)
      })
  }
}

/** A module copy's fields: the store record's columns as the blank site holds them. */
export const copyColumns = (record) =>
  Object.fromEntries(
    MODULE_COLUMNS.filter((c) => record[c] !== null && record[c] !== undefined).map((c) => [c, record[c]])
  )

/** Where a stored picture lands on the site: a new name per content, since static files are cached. */
export function picturePathOf(bytes, mime) {
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16)
  return `images/tracy/${hash}.${EXT[mime] ?? 'jpg'}`
}

/** A record made once: found again by its mark when an earlier attempt made it and died before saving its id. */
export async function madeOnce(op, kind, ctx, fields) {
  const { state } = ctx
  if (state.ids[op.key] !== undefined) return state.ids[op.key]
  if (state.pending[op.key]) {
    const found = await ctx.doors.find({ kind, mark: op.mark })
    if (found !== null && found !== undefined) return keep(ctx, op.key, found)
  }
  state.pending[op.key] = true
  await ctx.save()
  const { id } = await ctx.doors.update({ applyId: ctx.applyId(op), kind, id: 0, fields: fields() })
  return keep(ctx, op.key, id)
}
async function keep(ctx, key, id) {
  ctx.state.ids[key] = id
  delete ctx.state.pending[key]
  await ctx.save()
  return id
}
