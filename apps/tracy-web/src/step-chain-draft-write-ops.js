// One door operation of a draft write (#597), as `runDraftWrite` performs it: the fields a created record starts with,
// the references of the plan resolved to the ids the site gave (`page:`, `category:`, `article:`, `contact:`,
// `picture:`, `tabs:`), and every value read back after the write and compared with what was meant. The doors are
// injected (`step-chain-draft-write.js` documents them); nothing here reaches a site by itself.
import { createHash } from 'node:crypto'
import { MODULE_COLUMNS } from 'website-opportunities/domain/ai-quickstart-placement.mjs'
import {
  addressOf,
  cutRows,
  getAt,
  removeAt,
  setAt
} from 'website-opportunities/domain/draft-write-codec.mjs'
import { DraftWriteError } from 'website-opportunities/domain/draft-write-error.mjs'
import { frameOf } from 'website-opportunities/domain/draft-write-frame.mjs'

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

/** A created record's empty HTML values given the frame their pieces name (`created_record_frame`). */
export function framed(fields, op, ctx) {
  if (!op.kind.endsWith('.create')) return fields
  const groups = new Map()
  for (const v of list(op.values))
    if (v.loc.xpath) {
      const at = { ...v.loc, xpath: undefined }
      groups.set(addressOf(at), { at, xpaths: [...(groups.get(addressOf(at))?.xpaths ?? []), v.loc.xpath] })
    }
  let out = fields
  for (const { at, xpaths } of groups.values())
    if (String(getAt(out, at, ctx.html) ?? '').trim() === '') out = setAt(out, at, frameOf(xpaths), ctx.html)
  return out
}

/** The fields with every value of the op set, its rows cut and its button elements taken out. */
export function writtenFields(fields, op, ctx) {
  let out = framed(fields, op, ctx)
  for (const v of list(op.values)) out = setAt(out, v.loc, resolved(v.value, ctx), ctx.html)
  for (const cut of list(op.cuts)) out = cutRows(out, cut.row, cut.kept)
  for (const r of list(op.removes)) out = removeAt(out, r.loc, r.xpath, ctx.html)
  return out
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

/**
 * A record made once: found again by its mark when an earlier attempt made it and died before saving its id. In a
 * revision run (#599) an operation to write again whose record the previous build made updates that record, same id,
 * with every field a new record would get (its own apply id: `rewrite`, never the build's `create`).
 */
export async function madeOnce(op, kind, ctx, fields) {
  const { state } = ctx
  if (state.ids[op.key] !== undefined) {
    if (ctx.rewrite?.has(op.key))
      await ctx.doors.update({
        applyId: ctx.applyId(op, 'rewrite'),
        kind,
        id: state.ids[op.key],
        fields: fields()
      })
    return state.ids[op.key]
  }
  if (state.pending[op.key]) {
    const found = await ctx.doors.find({ kind, mark: op.mark })
    if (found !== null && found !== undefined) return keep(ctx, op.key, found)
  }
  state.pending[op.key] = true
  await ctx.save()
  const { id } = await ctx.doors.update({ applyId: ctx.applyId(op, 'create'), kind, id: 0, fields: fields() })
  return keep(ctx, op.key, id)
}
async function keep(ctx, key, id) {
  ctx.state.ids[key] = id
  delete ctx.state.pending[key]
  await ctx.save()
  return id
}
