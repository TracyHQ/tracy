// The rules gate for child list rows (ticket #615): a plan's rows (`plan-rows.mjs`), however they were set (by the
// rules, or kept through a plan edit), are held to what the block store declares, and every row of the needs profile
// the plan does not show is reported in the left out list. Pure.
//
// Codes: `unknown_list` (a list the block does not declare there), `list_item_not_shown` (an item list for an item
// the block does not show), `too_many_rows` (more than `items.max`, or than the most rows a parent place stores),
// `row_unknown` (not a row or fact of the plan data, or not a page of the plan), `row_fields_undeclared` (a row
// holding no data kind of the list), `row_not_owned` (a row of another item), `row_repeated`.
import { fitsList, isPageKeyed, listKindsOf, shownItemIds, storedRowsOf } from './plan-rows.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const maxOf = (child) => (Number.isInteger(child?.items?.max) ? child.items.max : 0)

/** `expect`: `{owner}` (an item id or null) for a top level list, `{parent}` (a row id) for a nested one. */
function rowsProblems(child, planned, expect, at, ctx) {
  const stored = storedRowsOf(child)
  const most = Math.min(maxOf(child), stored ? Math.max(0, ...stored) : maxOf(child))
  const rows = list(planned?.rows)
  if (rows.length > most)
    ctx.problem(
      'too_many_rows',
      `${at}.rows`,
      `${rows.length} rows for list ${child.name}: it shows at most ${most}, the most rows a stored place holds`
    )
  const kinds = listKindsOf(child)
  const seen = new Set()
  rows.forEach((row, i) => {
    const rowAt = `${at}.rows[${i}]`
    const key = row?.data ?? `page:${row?.page}`
    if (seen.has(key))
      ctx.problem('row_repeated', rowAt, `${JSON.stringify(key)} is planned twice in one list`)
    seen.add(key)
    if (isPageKeyed(child)) {
      if (!ctx.pageIds.has(row?.page))
        ctx.problem('row_unknown', rowAt, 'a row of this list names a page of the plan')
      return
    }
    const record = ctx.data.rowsById.get(row?.data)
    const fact = ctx.data.byId.get(row?.data)
    if (!record && fact?.what !== 'fact')
      return ctx.problem(
        'row_unknown',
        rowAt,
        `${JSON.stringify(row?.data)} is not a row or fact of the business`
      )
    const owned =
      expect.parent === undefined
        ? record?.parent === null && record.owner === expect.owner
        : record?.parent === expect.parent
    if (record && !owned)
      ctx.problem('row_not_owned', rowAt, `row ${record.id} belongs to another item or row`)
    if (!(record ? fitsList(record.values, kinds) : kinds.has(fact.kind)))
      ctx.problem(
        'row_fields_undeclared',
        rowAt,
        `row ${row.data} holds no field list ${child.name} declares`
      )
    const nested = new Map(list(row.lists).map((n) => [n?.name, n]))
    for (const name of nested.keys())
      if (!list(child.lists).some((n) => n.name === name))
        ctx.problem(
          'unknown_list',
          `${rowAt}.lists[${name}]`,
          `list ${child.name} declares no nested list ${name}`
        )
    for (const n of list(child.lists))
      if (nested.has(n.name))
        rowsProblems(n, nested.get(n.name), { parent: record?.id }, `${rowAt}.lists[${n.name}]`, ctx)
  })
}

/**
 * Report every problem of the planned rows of `pages` through `problem(code, at, message)`. A block without `lists`
 * plans no rows and is never a problem: the key is optional.
 */
export function rowListProblems(pages, blocks, data, problem) {
  const ctx = { data, problem, pageIds: new Set(list(pages).map((p) => p.id)) }
  for (const page of list(pages))
    for (const block of list(page.blocks)) {
      if (block.lists === undefined) continue
      const d = blocks.get(block.block) ?? {}
      const items = shownItemIds(block, data)
      list(block.lists).forEach((planned, i) => {
        const at = `pages[${page.id}].blocks[${block.id}].lists[${i}]`
        const key = planned?.item === undefined ? 'lists' : 'itemLists'
        const child = list(d[key]).find((c) => c.name === planned?.name)
        if (!child)
          return problem('unknown_list', at, `block ${d.id} declares no ${key} entry ${planned?.name}`)
        if (key === 'itemLists' && !items.includes(planned.item))
          return problem('list_item_not_shown', at, `the block does not show item ${planned.item}`)
        const owner = key === 'itemLists' ? planned.item : items.length === 1 ? items[0] : null
        rowsProblems(child, planned, { owner }, at, ctx)
      })
    }
}

/** The left out entries of the profile's rows the plan does not show, each naming its row `id`. */
export function rowsLeftOut(data, planned, dropped, leftOutIds) {
  const why = new Map(
    dropped.filter((d) => d.row && d.code !== 'row_field_undeclared').map((d) => [d.row, d])
  )
  const out = []
  for (const record of data.rowsById.values()) {
    if (planned.has(record.id)) continue
    // A row goes with what holds it: an item left out, or a parent row not shown, already reports it.
    if (record.parent !== null && !planned.has(record.parent)) continue
    if (record.owner !== null && leftOutIds.has(record.owner)) continue
    const cut = why.get(record.id)
    out.push({
      id: record.id,
      what: record.entry.label,
      kind: 'item',
      reason: cut
        ? 'The section that shows these has room for fewer rows than you have.'
        : 'No section of the template shows rows like this one.'
    })
  }
  return out
}
