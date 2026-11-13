// The rules gate for child list rows (ticket #615): a plan's rows (`plan-rows.mjs`), however they were set (by the
// rules, or kept through a plan edit), are held to what the block store declares, and every row of the needs profile
// the plan does not show is reported in the left out list. Pure.
//
// Codes: `unknown_list` (a list the block does not declare there), `list_item_not_shown` (an item list for an item
// the block does not show), `too_many_rows` (more than `items.max`, or than the parent place of the list stores: item
// N of the block's data is written to stored place N, a nested list's parent row to its row's place),
// `row_unknown` (not a row or fact of the plan data, or not a page of the plan), `row_fields_undeclared` (a row
// holding no data kind of the list), `row_not_owned` (a row of another item), `row_repeated`.
import { NO_LIST_REASON } from './plan-rows-fit.mjs'
import { firstRowOf, fitsList, isPageKeyed, listKindsOf, roomOf, shownItemIds } from './plan-rows.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/**
 * `expect`: `{owner}` (an item id or null) for a top level list, `{parent}` (a row id) for a nested one; `place`: the
 * index of the parent place the rows are written to.
 */
function rowsProblems(child, planned, expect, at, ctx, place) {
  const most = roomOf(child, place)
  const rows = list(planned?.rows)
  if (rows.length > most)
    ctx.problem(
      'too_many_rows',
      `${at}.rows`,
      `${rows.length} rows for list ${child.name}: its place ${place + 1} holds at most ${most}`
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
        rowsProblems(
          n,
          nested.get(n.name),
          { parent: record?.id },
          `${rowAt}.lists[${n.name}]`,
          ctx,
          firstRowOf(child, place) + i
        )
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
        rowsProblems(
          child,
          planned,
          { owner },
          at,
          ctx,
          key === 'itemLists' ? items.indexOf(planned.item) : 0
        )
      })
    }
}

/**
 * The left out entries of the profile's rows the plan does not show, each naming its row `id` and the reason of the
 * code that dropped it (`CHILD_LIST_REASONS`); then every fact a list dropped (a social link) that no list and no block
 * shows, as a `feature`. A row goes with what holds it: a row of an item left out or of an item no page shows (`shown`:
 * every id the pages' blocks hold, when given), or of a parent row not shown, is reported with it, never twice.
 */
export function rowsLeftOut(data, planned, dropped, leftOutIds, shown = null) {
  const why = new Map()
  for (const d of dropped)
    if (d.row && d.code !== 'row_field_undeclared' && !why.has(d.row)) why.set(d.row, d)
  const out = []
  for (const record of data.rowsById.values()) {
    if (planned.has(record.id)) continue
    if (record.parent !== null && !planned.has(record.parent)) continue
    if (record.owner !== null && leftOutIds.has(record.owner)) continue
    if (record.owner !== null && shown && !shown.has(record.owner)) continue
    out.push({
      id: record.id,
      what: record.entry.label,
      kind: 'item',
      reason: why.get(record.id)?.reason ?? NO_LIST_REASON
    })
  }
  for (const [id, d] of why) {
    const fact = data.byId.get(id)
    if (fact?.what !== 'fact' || planned.has(id) || shown?.has(id) || leftOutIds.has(id)) continue
    // The fact's own value (the link itself) tells the customer which one; held to the 80 character `what` limit.
    const value = String(fact.entry.value)
    const what = [...value].length > 80 ? `${[...value].slice(0, 79).join('')}\u2026` : value
    out.push({ id, what, kind: 'feature', reason: d.reason })
  }
  return out
}

/** One left out entry per list left below its minimum (`list_below_min`), named by its block's label. */
export function listsBelowMinLeftOut(dropped, pages) {
  const labels = new Map(list(pages).flatMap((p) => list(p.blocks).map((b) => [`${p.id}|${b.id}`, b.label])))
  const seen = new Set()
  const out = []
  for (const d of dropped) {
    const key = `${d.page}|${d.block}|${d.list}`
    if (d.code !== 'list_below_min' || seen.has(key)) continue
    seen.add(key)
    out.push({ what: labels.get(`${d.page}|${d.block}`) ?? d.block, kind: 'block', reason: d.reason })
  }
  return out
}
