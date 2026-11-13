// The `omit` and `empty` hides of a copy or an in-place record (ticket #597), beside the `row`, `rows.remove` and
// `setting` hides of `draft-write-plan-copies.mjs`. Spec: docs/references/ai-quickstart-contract.md, "hides".
//
//   omit   the rows of a list are pieces of one stored HTML value (a plan's features, a trainer's social links): every
//          row element the write does not fill is taken out of the value it writes, last first, so no empty bullet or
//          empty link is left on the page. Only a copy's value is written whole; on a record written in place the
//          rows stay (`omit_on_record_in_place`). A row left empty before a filled one stays too: taking it out would
//          move the filled row's place (`omit_row_gap`).
//   empty  a control (label and address) left empty in every location of its fields is written `""` there, label and
//          address together. When the fields are item fields one control is printed for every item from the first
//          item's words (JA Boxing's pricing cards): written, it must be the same words in every item, first included
//          (`control_shared_by_items`, unproven: the plan does not choose which item's words win).
// Pure; part of `planCopies`.
import { addressOf, movedAfterCut } from './draft-write-codec.mjs'
import { put, unproven } from './draft-write-sink.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const elementOf = (xpath) => String(xpath ?? '').replace(/\/(@[\w-]+|text\(\)(\[\d+\])?)$/, '')
const valueAddress = (loc) => addressOf({ ...loc, xpath: undefined })
const indexOf = (element) => Number(/\[(\d+)\]$/.exec(element)?.[1] ?? 1)

/** Every location of a field of a block: one (a block field), or a list per item (an item field). */
function locationsOf(block, field) {
  const at = block?.fields?.[field] ?? block?.itemFields?.[field]
  if (!at) return { items: [] }
  if (!Array.isArray(at)) return { items: [[at]] }
  return { items: at.map((one) => (Array.isArray(one) ? one.flat(Infinity) : [one]).filter(Boolean)) }
}

const writtenAt = (record, loc) => record.values.get(addressOf(loc))

/** The `omit` hide: the row elements of the list the write leaves out of the copy's value. */
export function omitRows(state, record, hide) {
  const block = state.kit.mapping.blocks?.[record.block]
  const rows = block?.itemLists?.[hide.rows] ?? block?.lists?.[hide.rows]
  if (record.kind !== 'copy') {
    unproven(state.sink, 'omit_on_record_in_place', { record: record.key, rows: hide.rows })
    return
  }
  const written = [...record.values.values()].filter((v) => v.loc.xpath)
  const parents = new Map()
  for (const piece of Object.values(rows?.fields ?? {}).flatMap((f) => list(f).flat(Infinity))) {
    if (!piece?.xpath) continue
    const element = elementOf(piece.xpath)
    const parent = `${valueAddress(piece)}|${element.replace(/\/[^/]+$/, '')}`
    const group = parents.get(parent) ?? new Map()
    parents.set(parent, group)
    const filled = written.some(
      (v) => valueAddress(v.loc) === valueAddress(piece) && elementOf(v.loc.xpath).startsWith(element)
    )
    const held = group.get(element) ?? { piece, filled: false }
    held.filled ||= filled
    group.set(element, held)
  }
  for (const group of parents.values()) {
    const last = Math.max(0, ...[...group].filter(([, g]) => g.filled).map(([e]) => indexOf(e)))
    const out = [...group]
      .filter(([e, g]) => !g.filled && indexOf(e) > last)
      .sort(([a], [b]) => indexOf(b) - indexOf(a))
    if ([...group].some(([e, g]) => !g.filled && indexOf(e) < last))
      unproven(state.sink, 'omit_row_gap', { record: record.key, rows: hide.rows })
    for (const [, { piece }] of out) {
      let loc = piece
      for (const cut of list(record.cuts)) loc = loc && movedAfterCut(loc, cut.row, cut.kept)
      if (!loc) continue
      record.removes.push({
        loc: { ...loc, xpath: undefined },
        xpath: elementOf(loc.xpath),
        rule: 'hides.omit'
      })
    }
  }
}

/** The `empty` hide: `""` in every location of a control none of whose locations is written. */
export function emptyControl(state, record, hide) {
  const block = state.kit.mapping.blocks?.[record.block]
  const fields = hide.control.map((f) => locationsOf(block, f))
  const kept = (loc) => list(record.cuts).every((cut) => movedAfterCut(loc, cut.row, cut.kept))
  const all = fields.flatMap((f) => f.items.flat()).filter(kept)
  const held = all.map((loc) => writtenAt(record, loc))
  if (held.every((v) => !v)) {
    for (const loc of all) put(state.sink, record.key, loc, '', { rule: 'hides.empty' })
    return
  }
  const items = Math.max(...fields.map((f) => f.items.length))
  if (items < 2) return
  for (const f of fields) {
    const words = f.items.map((locs) =>
      JSON.stringify(locs.map((loc) => writtenAt(record, loc)?.value ?? null))
    )
    if (words.some((w) => w !== words[0]) || f.items[0].every((loc) => !writtenAt(record, loc)))
      return unproven(state.sink, 'control_shared_by_items', { record: record.key, fields: hide.control })
  }
}

/** Whether a control field holds a value on the record, in any of its locations. */
export function holdsField(state, record, field) {
  return locationsOf(state.kit.mapping.blocks?.[record.block], field)
    .items.flat()
    .some((loc) => writtenAt(record, loc))
}
