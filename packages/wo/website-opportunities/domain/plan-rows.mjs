// The child list rows of a build plan (ticket #615): which rows each planned block shows in each of its Contract A child
// lists (`lists`, `itemLists`, nested `lists`), set by rules after the plan is composed. Pure: pages in, pages with
// their `lists`, the rows report and the rows planned out.
//
// - A row is data the business stated (`plan-row-data.mjs`): a list of an item's block (`itemLists`) takes that item's
//   rows, a list of the block itself (`lists`) the rows of the one item the block shows, else the business's rows, and
//   the facts the block shows of a kind the list declares (one row each, such as a social link). Which kind a list takes
//   is what the store declares, for every block alike. A nested list takes its parent row's own rows. A list whose row
//   field derives the page of the row lists the plan's pages.
// - A row fits a list when it holds a data kind of the list's fields and can be written whole (`plan-rows-fit.mjs`).
//   A list no row fits is planned EMPTY: never a row the business did not state, never demo text. A list left with
//   fewer rows than its `items.min` is reported (`list_below_min`) and never padded; Contract A says nothing more about
//   such a block, so it is not hidden.
// - Item N of a block's data is written to stored place N (Contract A: `slots` per item, in item order). So the block's
//   items are put in the order of the places that hold their rows, the item with the most rows in the place that stores
//   the most (`placeOrder`, counting the rows that pass the fit), and each item's rows stop at what ITS place stores
//   and at `items.max`; the rows beyond are reported (`row_beyond_stored_places`, `row_over_max`). After a customer's
//   edit the customer's order is kept (`keepOrder`) and the rows are cut at the places the items land in.
// - A fact a block holds only for its lists (a social link) that no row shows leaves the block's data and is reported.
import { placeLimitsOf } from './field-place-limits.mjs'
import { rowsPerPlace } from './ai-quickstart-child-lists.mjs'
import { fitCandidates, reported, withoutUnshownFacts } from './plan-rows-fit.mjs'

export { CHILD_LIST_REASONS } from './plan-rows-fit.mjs'
/** The `derived` value of a link field that the write step fills with the page of its row (Contract A). */
export const PAGE_ROW = 'the page of the row'
const list = (value) => (Array.isArray(value) ? value : [])
const maxOf = (child) => (Number.isInteger(child?.items?.max) && child.items.max > 0 ? child.items.max : 0)
const minOf = (child) => (Number.isInteger(child?.items?.min) ? child.items.min : 0)

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
/** How many rows parent place `place` of a list holds: what it stores, and never above `items.max`. */
export function roomOf(child, place) {
  const stored = storedRowsOf(child)
  return Math.min(maxOf(child), stored ? (stored[place] ?? 0) : maxOf(child))
}
/** The index of the first row of parent place `place` among all rows of the list, place after place. */
export const firstRowOf = (child, place) =>
  (storedRowsOf(child) ?? []).slice(0, place).reduce((a, b) => a + b, 0)
/** Whether row values (data kind -> parts) hold a kind of the list. */
export const fitsList = (values, kinds) => Object.keys(values ?? {}).some((kind) => kinds.has(kind))

/** The items a planned block shows, in its data order. */
export const shownItemIds = (block, data) =>
  list(block?.data).filter((id) => data.byId.get(id)?.what === 'item')

/**
 * The order of a block's items so that position = stored place: items with the most rows first, each taking the free
 * place among the first `items.length` that keeps the most of its rows (its own place on a tie, then the lowest).
 * @param {Array<number[]>} counts per item, its row count in each item list
 * @param {object[]} children the item lists
 * @returns {number[]} the item index at each place
 */
export function placeOrder(counts, children) {
  const kept = (i, p) => children.reduce((sum, c, l) => sum + Math.min(counts[i][l], roomOf(c, p)), 0)
  const total = counts.map((c, i) => ({ i, n: c.reduce((a, b) => a + b, 0) }))
  total.sort((a, b) => b.n - a.n || a.i - b.i)
  const free = new Set(counts.map((_, p) => p))
  const at = []
  for (const { i } of total) {
    let best = free.has(i) ? i : Math.min(...free)
    for (const p of free) if (kept(i, p) > kept(i, best)) best = p
    at[best] = i
    free.delete(best)
  }
  return at
}

/** The rows of one list for one parent, fitted and cut at `place`'s room; the rest is reported. */
function plannedList(child, candidates, place, at, ctx) {
  const { kept, dropped } = fitCandidates(child, candidates, roomOf(child, place), ctx.limits)
  for (const { candidate: c, code, detail } of dropped)
    ctx.dropped.push(reported({ ...at, ...(c.data ? { row: c.data } : { page: c.page }) }, code, detail))
  if (kept.length < minOf(child))
    ctx.dropped.push(reported({ ...at, rows: kept.length, min: minOf(child) }, 'list_below_min'))
  const offset = firstRowOf(child, place)
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
  if (extra.length)
    ctx.dropped.push(reported({ ...at, row: record.id, fields: extra }, 'row_field_undeclared'))
}

const rowCandidate = (ctx) => (data) => ({ data, values: ctx.data.rowsById.get(data)?.values ?? {} })
const ownRows = (ids, child, ctx) =>
  ids.filter((id) => fitsList(ctx.data.rowsById.get(id)?.values, listKindsOf(child))).map(rowCandidate(ctx))

function nestedList(child, parent, at, ctx, place) {
  const where = { ...at, list: `${at.list}.${child.name}` }
  const rows = plannedList(child, ownRows(parent ? parent.rows : [], child, ctx), place, where, ctx)
  return { name: child.name, rows }
}

/** The candidates of a list of the block itself: the plan's pages, else the owner's rows and the block's facts. */
function blockCandidates(child, block, pages, ctx) {
  if (isPageKeyed(child)) return pages.map((p) => ({ page: p.id, values: {} }))
  const kinds = listKindsOf(child)
  const items = shownItemIds(block, ctx.data)
  const rows = ownRows(ctx.data.rowsOf(items.length === 1 ? items[0] : null), child, ctx)
  const facts = list(block.data).flatMap((id) => {
    const entry = ctx.data.byId.get(id)
    if (entry?.what !== 'fact' || entry.itemField || !kinds.has(entry.kind)) return []
    return [{ data: id, values: { [entry.kind]: [String(entry.entry.value)] } }]
  })
  return [...rows, ...facts]
}

/** The block with its items in place order and its planned lists. */
function plannedBlock(page, block, d, pages, ctx) {
  const lists = []
  for (const child of list(d.lists)) {
    const at = { page: page.id, block: block.id, list: child.name }
    lists.push({
      name: child.name,
      rows: plannedList(child, blockCandidates(child, block, pages, ctx), 0, at, ctx)
    })
  }
  const children = list(d.itemLists)
  const shown = shownItemIds(block, ctx.data)
  const own = shown.map((item) => children.map((c) => ownRows(ctx.data.rowsOf(item), c, ctx)))
  // Rows that would survive the fit (length, parts, links) are what an item brings to a place.
  const counts = own.map((o) =>
    o.map((rows, l) => fitCandidates(children[l], rows, maxOf(children[l]), ctx.limits).kept.length)
  )
  const order = children.length && !ctx.keepOrder ? placeOrder(counts, children) : shown.map((_, i) => i)
  const items = order.map((i) => shown[i])
  let n = 0
  const ordered = list(block.data).map((id) => (ctx.data.byId.get(id)?.what === 'item' ? items[n++] : id))
  children.forEach((child, l) => {
    items.forEach((item, place) => {
      const at = { page: page.id, block: block.id, item, list: child.name }
      lists.push({ name: child.name, item, rows: plannedList(child, own[order[place]][l], place, at, ctx) })
    })
  })
  return { ...block, data: withoutUnshownFacts(ordered, lists, d, ctx.data.byId, listKindsOf), lists }
}

/**
 * Plan the rows of every child list of every placed block.
 * @param {object[]} pages the plan's pages
 * @param {Map<string, object>} blocks block id -> description
 * @param {object} data the plan data (`planDataOf`, with its rows)
 * @param {{keepOrder?: boolean}} [options] `keepOrder`: keep the blocks' item order as given (a customer's edit sets
 *   it) and cut each item's rows at the place it lands in; the automatic place order is for composing only
 * @returns {{pages: object[], dropped: object[], planned: Set<string>}} a block declaring child lists gets `lists`
 *   (`[{name, item?, rows: [{data} | {page}, lists?]}]`, empty rows when no business row fits) and its items in place
 *   order; `dropped`: the rows report, each entry with its `code` and `reason` (`CHILD_LIST_REASONS`); `planned`: the
 *   row ids
 */
export function planRows(pages, blocks, data, { keepOrder = false } = {}) {
  const ctx = { data, dropped: [], planned: new Set(), limits: placeLimitsOf(blocks.values()), keepOrder }
  const out = pages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block) => {
      const { lists: _old, ...rest } = block
      const d = blocks.get(block.block) ?? {}
      if (!list(d.lists).length && !list(d.itemLists).length) return rest
      return plannedBlock(page, rest, d, pages, ctx)
    })
  }))
  return { pages: out, dropped: ctx.dropped, planned: ctx.planned }
}
