// The child list rows of a build plan (ticket #615): which rows each planned block shows in each of its Contract A child
// lists (`lists`, `itemLists`, nested `lists`), set by rules after the plan is composed. Pure: pages in, pages with
// their `lists`, the rows dropped and the rows planned out.
//
// - A row is data the business stated (`plan-row-data.mjs`): a list of an item's block (`itemLists`) takes that item's
//   rows, a list of the block itself (`lists`) the rows of the one item the block shows, else the business's rows, and
//   the facts the block shows of a kind the list declares (one row each, such as a social link). A nested list takes
//   its parent row's own rows. A list whose row field derives the page of the row lists the plan's pages.
// - A row fits a list when it holds a data kind of the list's fields. A list no row fits is planned EMPTY: never a row
//   the business did not state, never demo text.
// - Rows keep their order and stop at what the template stores: `items.max`, and the stored rows of the parent place
//   the item is written to. Contract A gives the item with the most rows the parent place that stores the most; the
//   rows beyond it are dropped with a reason (`row_beyond_stored_places`, `row_over_max`).
import { rowsPerPlace } from './ai-quickstart-child-lists.mjs'

/** The `derived` value of a link field that the write step fills with the page of its row (Contract A). */
export const PAGE_ROW = 'the page of the row'
export const CHILD_LIST_REASONS = Object.freeze({
  row_beyond_stored_places: 'the template stores fewer rows in the place this item is written to',
  row_over_max: 'more rows than the list shows',
  row_field_undeclared: 'the list has no field of this data kind'
})
const list = (value) => (Array.isArray(value) ? value : [])
const maxOf = (child) => (Number.isInteger(child?.items?.max) && child.items.max > 0 ? child.items.max : 0)

/** The data kinds a child list's rows hold: its fields' kinds, design and derived fields aside. */
export const listKindsOf = (child) =>
  new Set(
    list(child?.fields)
      .filter((f) => f?.type !== 'design' && typeof f?.kind === 'string' && f.derived === undefined)
      .map((f) => f.kind)
  )
/** Whether a list's rows are the plan's pages (a field derives the page of its row). */
export const isPageKeyed = (child) => list(child?.fields).some((f) => f?.derived === PAGE_ROW)
/** The rows each parent place of a list stores, from its first field with stored places; null when none has any. */
export function storedRowsOf(child) {
  for (const f of list(child?.fields)) {
    const rows = rowsPerPlace(f?.slots)
    if (rows) return rows
  }
  return null
}
/** Whether row values (data kind -> parts) hold a kind of the list. */
export const fitsList = (values, kinds) => Object.keys(values ?? {}).some((kind) => kinds.has(kind))

/** The items a planned block shows, in its data order. */
export const shownItemIds = (block, data) =>
  list(block?.data).filter((id) => data.byId.get(id)?.what === 'item')

/** Place indexes sorted by stored rows, most first (stable), and items sorted by rows, most first (stable). */
const byMost = (counts) => counts.map((n, i) => ({ n, i })).sort((a, b) => b.n - a.n || a.i - b.i)

/**
 * The rows of one list for one parent, cut at `room`; rows beyond go to `dropped`. `offset` is the index of the
 * parent's first row among all rows of the list, place after place: a nested list's stored rows are read at it.
 */
function plannedList(child, candidates, room, at, ctx, offset = 0) {
  const kept = candidates.slice(0, room)
  for (const c of candidates.slice(room))
    ctx.dropped.push({
      ...at,
      ...(c.data ? { row: c.data } : { page: c.page }),
      code: room < maxOf(child) ? 'row_beyond_stored_places' : 'row_over_max'
    })
  return kept.map((c, k) => {
    const row = c.data ? { data: c.data } : { page: c.page }
    if (c.data) ctx.planned.add(c.data)
    const record = c.data ? ctx.data.rowsById.get(c.data) : null
    if (record) trimFields(record, child, at, ctx)
    if (!list(child.lists).length) return row
    return { ...row, lists: list(child.lists).map((n) => nestedList(n, record, at, ctx, offset + k)) }
  })
}

/** The fields of a row the list does not declare are not shown: recorded once per row and list. */
function trimFields(record, child, at, ctx) {
  const kinds = listKindsOf(child)
  const extra = Object.keys(record.values).filter((kind) => !kinds.has(kind))
  if (extra.length) ctx.dropped.push({ ...at, row: record.id, fields: extra, code: 'row_field_undeclared' })
}

function nestedList(child, parent, at, ctx, index) {
  const kinds = listKindsOf(child)
  const own = parent ? parent.rows.filter((id) => fitsList(ctx.data.rowsById.get(id)?.values, kinds)) : []
  const stored = storedRowsOf(child)
  const room = Math.min(maxOf(child), stored ? (stored[index] ?? 0) : maxOf(child))
  const before = stored ? stored.slice(0, index).reduce((a, b) => a + b, 0) : 0
  const where = { ...at, list: `${at.list}.${child.name}` }
  const rows = plannedList(
    child,
    own.map((data) => ({ data })),
    room,
    where,
    ctx,
    before
  )
  return { name: child.name, rows }
}

/** The candidates of a list of the block itself: the plan's pages, else the owner's rows and the block's facts. */
function blockCandidates(child, block, pages, ctx) {
  if (isPageKeyed(child)) return pages.map((p) => ({ page: p.id }))
  const kinds = listKindsOf(child)
  const items = shownItemIds(block, ctx.data)
  const owner = items.length === 1 ? items[0] : null
  const rows = ctx.data.rowsOf(owner).filter((id) => fitsList(ctx.data.rowsById.get(id)?.values, kinds))
  const facts = list(block.data).filter((id) => {
    const entry = ctx.data.byId.get(id)
    return entry?.what === 'fact' && !entry.itemField && kinds.has(entry.kind)
  })
  return [...rows, ...facts].map((data) => ({ data }))
}

function listsOfBlock(page, block, d, pages, ctx) {
  const out = []
  for (const child of list(d.lists)) {
    const at = { page: page.id, block: block.id, list: child.name }
    const stored = storedRowsOf(child)
    const room = Math.min(maxOf(child), stored ? (stored[0] ?? 0) : maxOf(child))
    out.push({
      name: child.name,
      rows: plannedList(child, blockCandidates(child, block, pages, ctx), room, at, ctx)
    })
  }
  const items = shownItemIds(block, ctx.data)
  for (const child of list(d.itemLists)) {
    const kinds = listKindsOf(child)
    const own = items.map((item) =>
      ctx.data.rowsOf(item).filter((id) => fitsList(ctx.data.rowsById.get(id)?.values, kinds))
    )
    // The item with the most rows takes the parent place that stores the most (Contract A, child lists).
    const stored = storedRowsOf(child) ?? items.map(() => maxOf(child))
    const places = byMost(stored)
    const room = new Map(byMost(own.map((r) => r.length)).map((it, rank) => [it.i, places[rank]]))
    items.forEach((item, i) => {
      const place = room.get(i)
      const cut = Math.min(maxOf(child), place ? place.n : 0)
      const offset = place ? stored.slice(0, place.i).reduce((a, b) => a + b, 0) : 0
      const at = { page: page.id, block: block.id, item, list: child.name }
      const rows = plannedList(
        child,
        own[i].map((data) => ({ data })),
        cut,
        at,
        ctx,
        offset
      )
      out.push({ name: child.name, item, rows })
    })
  }
  return out
}

/**
 * Plan the rows of every child list of every placed block.
 * @param {object[]} pages the plan's pages
 * @param {Map<string, object>} blocks block id -> description
 * @param {object} data the plan data (`planDataOf`, with its rows)
 * @returns {{pages: object[], dropped: object[], planned: Set<string>}} a block declaring child lists gets `lists`
 *   (`[{name, item?, rows: [{data} | {page}, lists?]}]`, empty rows when no business row fits); `planned`: the row ids
 */
export function planRows(pages, blocks, data) {
  const ctx = { data, dropped: [], planned: new Set() }
  const out = pages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block) => {
      const { lists: _old, ...rest } = block
      const d = blocks.get(block.block) ?? {}
      if (!list(d.lists).length && !list(d.itemLists).length) return rest
      return { ...rest, lists: listsOfBlock(page, rest, d, pages, ctx) }
    })
  }))
  return { pages: out, dropped: ctx.dropped, planned: ctx.planned }
}
