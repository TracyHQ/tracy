// The child lists of a store block (ticket #583, decision of 13/11), drafted from the template's reviewed decisions.
// Pure. A decision names a list and the stored place pattern of each of its fields; the rows each parent place
// stores are read from the content map, so the declaration lists, per parent place, exactly the child places that
// exist (a class card storing two calendar rows, another one, another none).
//
// Decision shape, on a block decision (`lists`: the block's own; `itemLists`: inside each item):
//   { "name": "calendar", "column": "attribs",
//     "items": {"min": 0}, "itemsFrom": {"min": "<why>"},          max defaults to the most rows a place stores
//     "fields": [{ "name": "days", "jsonPath": ["classes-info", "classes-info{1}", "project_label"] }],
//     "exceptRows": {"14": "<why this row is not a row of the list>"},
//     "lists": [ ...a nested list, whose patterns may use {1} (the parent row) and {2} (its own row) ] }
// A field may also give `xpath` (with the same placeholders; a list of alternatives, null for a place stored without
// one), `kind` and `type`; without them the content map role
// of its first place decides, as for any field. The keys of FIELD_KEYS (`storage`, `iconOf`, `textOf`, `frame`, `theme`,
// `variantOf`, `for`, ...) are copied onto the drafted field as the decision gives them.
//
// Two more decision keys of a list:
//   "key": {"name": "page", "jsonPath": ["menuitem_config", "item_id", "{1}", 0]}
//     each row is keyed to a page: the draft adds a link field derived as "the page of the row" whose `keyAt` gives,
//     per parent place and row, where the key is stored on the parent record (a `{d}` element alone becomes the row
//     number).
//   "html": {"jsonPath": [...], "row": "a"}
//     the rows are pieces of one stored HTML value of the parent place (the social links of a trainer, kept as one
//     paragraph): one row per element `row` the stored value holds, each field a place `<content map key>@<xpath>`
//     (its `xpath` with `{1}` the row, counted from 1). The HTML value is claimed by the list, so it is no other field.
import { frameOf } from './draft-block-fields.mjs'
import { fieldTypeOf, limitOf } from './draft-fields.mjs'

/** Decision keys copied onto a drafted child field as given. */
export const FIELD_KEYS = Object.freeze([
  'storage',
  'iconOf',
  'textOf',
  'frame',
  'frameFrom',
  'theme',
  'variantOf',
  'for'
])

const escape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A pattern element as a regular expression: `{d}` of a fixed depth is that row, of the own depth captured. */
function patternOf(element, depth, fixed) {
  let own = false
  const source = escape(element).replace(/\\\{(\d)\\\}/g, (_, d) => {
    if (fixed[d] !== undefined) return escape(fixed[d])
    if (Number(d) === depth) {
      own = true
      return '(\\d+)'
    }
    return '(?:\\d+)'
  })
  return { re: new RegExp(`^${source}$`), own }
}

/** The row index a slot stores for one field pattern, or null when the slot is not a place of the field. */
function rowOf(slot, field, column, depth, fixed) {
  if (column && slot.column !== column) return null
  const path = slot.jsonPath ?? []
  const want = field.jsonPath ?? []
  if (path.length !== want.length) return null
  let row = null
  const take = (value, element) => {
    const { re, own } = patternOf(element, depth, fixed)
    const m = String(value).match(re)
    if (!m) return false
    if (own && m[1] !== undefined) row = m[1]
    return true
  }
  for (let i = 0; i < want.length; i++) if (!take(path[i], want[i])) return null
  // `xpath` may list alternatives; null (or no xpath at all) is a place stored without one.
  const alternatives = Array.isArray(field.xpath) ? field.xpath : [field.xpath ?? null]
  const xpathOk = alternatives.some((alt) =>
    alt === null ? !slot.xpath : Boolean(slot.xpath) && take(slot.xpath, alt)
  )
  return xpathOk ? row : null
}

/** The rows one parent place (`entity`, with the rows of the lists above it `fixed`) stores, in row order. */
function rowsOf(decl, entity, depth, fixed, ctx) {
  const byRow = new Map()
  for (const slot of ctx.slotsByEntity.get(entity) ?? [])
    for (const field of decl.fields ?? []) {
      const row = rowOf(slot, field, decl.column, depth, fixed)
      if (row === null || Object.hasOwn(decl.exceptRows ?? {}, row)) continue
      byRow.set(row, { ...byRow.get(row), [field.name]: slot.key })
    }
  return [...byRow].sort((a, b) => Number(a[0]) - Number(b[0]))
}

/** One child field from its places per parent place: type, kind, limit or frame as any field of the store. */
function childField(decl, perPlace, ctx, report) {
  const keys = perPlace.flat()
  const first = ctx.mapSlots.get(keys[0])
  const role = decl.kind ?? first?.role ?? null
  const type = decl.type ?? fieldTypeOf({ role, type: first?.type })
  const field = { name: decl.name }
  if (type !== 'design') field.kind = role
  field.type = type
  if (type === 'text') {
    const limits = keys.map((k) => limitOf(ctx.kitEntries.get(k), ctx.measured[k]))
    const ok = limits.filter((l) => l.measured)
    if (ok.length) {
      const least = ok.reduce((a, b) => (b.limit < a.limit ? b : a))
      field.limit = least.limit
      field.limitFrom = least.limitFrom
    } else {
      field.limitFrom = limits[0]?.limitFrom ?? 'no reading'
      for (const slot of keys) report.unmeasured(decl.name, slot, field.limitFrom)
    }
  }
  if (type === 'image' || type === 'icon') {
    const frame = keys.map((k) => frameOf(k.replace(/^module-/, 'block-'), ctx)).find(Boolean)
    if (frame) field.frame = frame
    if (type === 'icon') field.storage = first?.type === 'image' ? 'image-file' : 'class-name'
  }
  for (const key of FIELD_KEYS) if (decl[key] !== undefined) field[key] = decl[key]
  field.slots = perPlace
  return field
}

/** A pattern element filled with the rows of the lists above it; an element that is one placeholder is a number. */
export function filledPath(pattern, rows) {
  return (pattern ?? []).map((element) => {
    const whole = String(element).match(/^\{(\d)\}$/)
    if (whole && rows[whole[1]] !== undefined) return Number(rows[whole[1]])
    return typeof element === 'string' ? element.replace(/\{(\d)\}/g, (m, d) => rows[d] ?? m) : element
  })
}

/** The rows of an HTML list in one parent place: the pieces of its stored HTML value, one per element `row`. */
function htmlRowsOf(decl, entity, fixed, ctx) {
  const want = JSON.stringify(filledPath(decl.html.jsonPath, fixed).map(String))
  const slot = (ctx.slotsByEntity.get(entity) ?? []).find(
    (s) =>
      (!decl.column || s.column === decl.column) &&
      !s.xpath &&
      JSON.stringify((s.jsonPath ?? []).map(String)) === want
  )
  if (!slot) return { rows: [], slot: null }
  const count = (
    String(slot.sample ?? '').match(new RegExp(`\\(\\(${escape(decl.html.row)}[\\s)]`, 'g')) ?? []
  ).length
  const rows = Array.from({ length: count }, (_, r) => [
    String(r),
    Object.fromEntries(
      (decl.fields ?? []).map((f) => [f.name, `${slot.key}@${String(f.xpath).replace('{1}', String(r + 1))}`])
    )
  ])
  return { rows, slot: slot.key }
}

/**
 * The child lists a decision declares, drafted over their parent places.
 * @param {object[]} decls the decision's lists
 * @param {{entity: string, fixed: Record<string, string>}[]} parents the parent places, in order
 * @param {number} depth 1 for a list of a block or of its items, 2 for a list inside one of those rows
 * @param {object} ctx the draft context (content map slots by entity, kit entries, measured limits, frames)
 * @param {{unmeasured: Function, problem: Function, claim: Function}} report
 */
export function draftChildLists(decls, parents, depth, ctx, report) {
  const lists = []
  for (const decl of decls ?? []) {
    const html = decl.html ? parents.map((p) => htmlRowsOf(decl, p.entity, p.fixed, ctx)) : null
    for (const h of html ?? []) if (h.slot) report.claim(h.slot)
    const rowsPerParent = html
      ? html.map((h) => h.rows)
      : parents.map((p) => rowsOf(decl, p.entity, depth, p.fixed, ctx))
    const perPlaceOf = (name) => rowsPerParent.map((rows) => rows.map(([, f]) => f[name]).filter(Boolean))
    const counts = rowsPerParent.map((rows) => rows.length)
    for (const [p, rows] of rowsPerParent.entries())
      for (const [row, got] of rows)
        for (const f of decl.fields ?? [])
          if (!got[f.name])
            report.problem(`child list ${decl.name}: row ${row} of parent place ${p} stores no ${f.name}`)
    const fields = []
    for (const f of decl.fields ?? []) {
      const perPlace = perPlaceOf(f.name)
      if (perPlace.flat().length === 0) {
        report.problem(`child list ${decl.name}: no parent place stores a ${f.name}`)
        continue
      }
      for (const key of perPlace.flat()) report.claim(key)
      fields.push(childField(f, perPlace, ctx, report))
    }
    if (decl.key)
      fields.push({
        name: decl.key.name ?? 'page',
        kind: 'editorial.navigation_url',
        type: 'link',
        derived: 'the page of the row',
        keyAt: rowsPerParent.map((rows, p) =>
          rows.map(([row]) => ({
            entity: parents[p].entity,
            column: decl.key.column ?? decl.column,
            jsonPath: filledPath(decl.key.jsonPath, { ...parents[p].fixed, [depth]: row })
          }))
        )
      })
    const most = counts.length ? Math.max(...counts) : 0
    const items = { min: decl.items?.min ?? null, max: decl.items?.max ?? most }
    const itemsFrom = {
      min: decl.itemsFrom?.min ?? null,
      max:
        decl.itemsFrom?.max ??
        `the most rows a stored parent place holds (${most}; per place ${counts.join(', ')})`
    }
    if (items.min === null || !itemsFrom.min)
      report.problem(
        `child list ${decl.name}: state its minimum and where it comes from (items.min, itemsFrom.min)`
      )
    const list = { name: decl.name, items, itemsFrom, fields }
    if (decl.lists?.length) {
      const rowParents = parents.flatMap((p, i) =>
        rowsPerParent[i].map(([row]) => ({ entity: p.entity, fixed: { ...p.fixed, [depth]: row } }))
      )
      list.lists = draftChildLists(decl.lists, rowParents, depth + 1, ctx, report)
    }
    lists.push(list)
  }
  return lists
}

/** Every stored place a list of child lists declares, nested lists included. */
export function childPlacesOf(lists) {
  return (lists ?? []).flatMap((l) => [
    ...(l.fields ?? []).flatMap((f) => (Array.isArray(f.slots) ? f.slots.flat() : [])),
    ...childPlacesOf(l.lists)
  ])
}
