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
import { datesOf } from './step-chain-draft-write-dates.js'

const list = (value) => (Array.isArray(value) ? value : [])
const EXT = { 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg' }

/** A plan value with its references resolved to what the site holds. */
export function resolved(value, ctx) {
  if (!value || typeof value !== 'object') return value
  if (value.fixed) return value.fixed
  // A link of the kit (`pages.<type>`): its placeholders filled with the ids the site gave.
  if (typeof value.template === 'string')
    return value.template.replace(/\{([^}]*)\}/g, (_, name) => String(resolved(value.refs?.[name], ctx)))
  const ref = String(value.ref ?? '')
  const id = (key) => {
    const got = ctx.state.ids[key]
    if (got === undefined)
      throw new DraftWriteError('ref_unresolved', `${key} has no site id yet`, { ref: key })
    return got
  }
  // A page reached under its list page: its address, else (an assignment, a key) the list page's item.
  const under = ref.startsWith('page:') ? ctx.plan.under?.[ref.slice(5)] : null
  if (under && value.form === 'address') return resolved(under.link, ctx)
  if (under && value.form === 'alias')
    throw new DraftWriteError('ref_unresolved', `${ref} has no menu item to alias`, { ref })
  if (under) return resolved({ ref: `page:${under.list}`, form: value.form }, ctx)
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

/** Columns a kit declares as objects (`pages.<type>.record.base`), written as the JSON the record stores. */
const columnsOf = (base) =>
  Object.fromEntries(
    Object.entries(base ?? {}).map(([k, v]) => [k, v && typeof v === 'object' ? JSON.stringify(v) : v])
  )

/** The menu item columns the kit declares for a page (`pages.<type>.menuItem`): style, params, parent. */
const itemColumnsOf = (item, ctx) =>
  item
    ? {
        template_style_id: item.templateStyle,
        params: JSON.stringify(item.params ?? {}),
        ...(item.parent ? { parent_id: Number(resolved(item.parent, ctx)) } : {})
      }
    : {}

/** The fields a record the build creates starts with: no frame from the blank site (#584). */
export function baseFieldsOf(op, ctx) {
  const f = op.fields
  const common = { alias: f.alias, language: '*', access: 1 }
  if (op.recordKind === 'menuItem') {
    const alias = op.link?.form === 'alias'
    // `menu.items.link: "page-address"`: a url menu item (component 0) whose link is the page's own address.
    const url = op.link?.form === 'address'
    const target = op.link ? resolved(op.link, ctx) : 'index.php?option=com_content&view=featured'
    return {
      ...common,
      title: f.title,
      menutype: f.menutype,
      home: f.home,
      published: 1,
      type: alias ? 'alias' : url ? 'url' : 'component',
      // An empty alias link is refused; `index.php?Itemid=` is what Joomla stores (measured, fact K3).
      link: alias ? 'index.php?Itemid=' : target,
      ...(alias || url ? { component_id: 0 } : {}),
      params: JSON.stringify(alias ? { aliasoptions: target } : {}),
      ...itemColumnsOf(op.item, ctx)
    }
  }
  if (op.recordKind === 'category')
    return {
      ...common,
      title: f.title,
      extension: op.extension ?? 'com_content',
      published: 1,
      ...(op.params ? { params: JSON.stringify(op.params) } : {})
    }
  // A new contact has no default for these columns (measured: `write_failed` names the first one missing).
  if (op.recordKind === 'contact')
    return {
      ...common,
      name: f.title,
      published: 1,
      params: '{}',
      metadata: '{}',
      metadesc: '',
      ...(f.catid ? { catid: resolved(f.catid, ctx) } : {}),
      ...columnsOf(op.base)
    }
  return {
    ...common,
    title: f.title,
    state: 1,
    ...(f.catid ? { catid: resolved(f.catid, ctx) } : {}),
    introtext: '',
    fulltext: '',
    attribs: '{}',
    images: '{}',
    ...datesOf(op, ctx),
    ...columnsOf(op.base)
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
  // The frame the kit declares for the value (`createdFrames`), else the smallest one that holds its pieces.
  const declared = (at) => list(op.frames).find((f) => addressOf(f.loc) === addressOf(at))?.html
  for (const { at, xpaths } of groups.values())
    if (String(getAt(out, at, ctx.html) ?? '').trim() === '')
      out = setAt(out, at, declared(at) ?? frameOf(xpaths), ctx.html)
  return out
}

/** The fields with every value of the op set, its rows cut and its button elements taken out. */
export function writtenFields(fields, op, ctx) {
  let out = framed(fields, op, ctx)
  // Every key of a row the op writes, empty where the record holds none (`rowFillsOf`, measured K1).
  for (const f of list(op.fills))
    if (getAt(out, f.loc, ctx.html) === undefined) out = setAt(out, f.loc, f.value, ctx.html)
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
