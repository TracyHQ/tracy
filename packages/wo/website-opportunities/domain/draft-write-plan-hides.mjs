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
//          (`control_shared_by_items`, unproven: the plan does not choose which item's words win). Declared
//          `scope: "block", from: "first-item"`, the first item's words are written into every item.
// Pure; part of `planCopies`.
import { addressOf, movedAfterCut } from './draft-write-codec.mjs'
import { DraftWriteError } from './draft-write-error.mjs'
import { dropEntry, put, unproven } from './draft-write-sink.mjs'

/** The skip reason of an item's own words for a control printed from the first item's words. */
export const CONTROL_FROM_FIRST = 'control_printed_from_first_item'

const list = (value) => (Array.isArray(value) ? value : [])
const elementOf = (xpath) => String(xpath ?? '').replace(/\/(@[\w-]+|text\(\)(\[\d+\])?)$/, '')
/** A location without its xpath: the whole stored value the piece sits in. */
const withoutXpath = ({ xpath: _xpath, ...loc }) => loc
const valueAddress = (loc) => addressOf(withoutXpath(loc))
const indexOf = (element) => Number(/\[(\d+)\]$/.exec(element)?.[1] ?? 1)
/** An element path with every step indexed (`/ul/li` is `/ul[1]/li[1]`), so paths compare step by step. */
const indexed = (element) => element.replace(/\/([a-zA-Z][\w-]*)(?=\/|$)/g, '/$1[1]')
/** Whether a written piece sits in a row element: the element itself or a node inside it, never `li[10]` for `li[1]`. */
const within = (at, element) => {
  const [a, e] = [indexed(at), indexed(element)]
  return a === e || a.startsWith(`${e}/`)
}

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
      (v) => valueAddress(v.loc) === valueAddress(piece) && within(elementOf(v.loc.xpath), element)
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
    if ([...group].some(([e, g]) => !g.filled && indexOf(e) < last)) {
      // `order: "packed"`: the plan's rows fill the first places in order, so a gap breaks the declaration.
      if (hide.order === 'packed')
        throw new DraftWriteError(
          'omit_row_gap',
          `${record.key} leaves a ${hide.rows} row empty before a filled one`,
          {
            record: record.key,
            rows: hide.rows
          }
        )
      unproven(state.sink, 'omit_row_gap', { record: record.key, rows: hide.rows })
    }
    for (const [, { piece }] of out) {
      let loc = piece
      for (const cut of list(record.cuts)) loc = loc && movedAfterCut(loc, cut.row, cut.kept)
      if (!loc) continue
      record.removes.push({
        loc: withoutXpath(loc),
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
  // `scope: "item"`: each item prints its own control.
  if (items < 2 || hide.scope === 'item') return
  if (hide.scope === 'block' && hide.from === 'first-item')
    return fromFirstItem(state, record, hide, fields, kept)
  for (const f of fields) {
    const words = f.items.map((locs) =>
      JSON.stringify(locs.map((loc) => writtenAt(record, loc)?.value ?? null))
    )
    if (words.some((w) => w !== words[0]) || f.items[0].every((loc) => !writtenAt(record, loc)))
      return unproven(state.sink, 'control_shared_by_items', { record: record.key, fields: hide.control })
  }
}

const stop = (code, record, hide, why) =>
  new DraftWriteError(code, `${record.key}: ${why}`, { record: record.key, fields: hide.control })

/**
 * A control the template prints on every item from the first item's words (`scope: "block"`, `from: "first-item"`):
 * those words are written into every item, so the stored items agree with what prints. Another item's own words
 * never print, so they are not written: the first item's words take their place and their entry is skipped
 * (`CONTROL_FROM_FIRST`, with the entry whose words print). A first item with no words while another has some would
 * print no button where the plan meant one: the plan stops.
 */
function fromFirstItem(state, record, hide, fields, kept) {
  for (const f of fields) {
    const items = f.items.map((locs) => locs.filter(kept)).filter((locs) => locs.length)
    const first = items[0]?.map((loc) => writtenAt(record, loc)) ?? []
    if (first.some((v) => !v))
      throw stop('control_first_item_empty', record, hide, 'the first item, whose control prints, has none')
    for (const locs of items.slice(1))
      locs.forEach((loc, i) => {
        const held = writtenAt(record, loc)
        if (held && JSON.stringify(held.value) === JSON.stringify(first[i].value)) return
        if (held) record.values.delete(addressOf(loc))
        put(state.sink, record.key, loc, first[i].value, { rule: 'hides.from_first_item' })
        if (held?.entry && ![...record.values.values()].some((v) => v.entry === held.entry))
          dropEntry(state.sink, held.entry, record.key, {
            reason: CONTROL_FROM_FIRST,
            by: first[i].entry,
            fields: hide.control
          })
      })
  }
}

/** Whether a control field holds a value on the record, in any of its locations. */
export function holdsField(state, record, field) {
  return locationsOf(state.kit.mapping.blocks?.[record.block], field)
    .items.flat()
    .some((loc) => writtenAt(record, loc))
}
