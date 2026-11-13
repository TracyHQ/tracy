// Child list rows of the Contract B build plan (ticket #615). Both keys are OPTIONAL, so a plan without them is valid
// as before:
// - `rows` on the plan: the rows the business stated (`[{id, label, sources}]`), in the id space of facts and items;
// - `lists` on a block: the rows each child list of the block shows (`[{name, item?, rows: [{data} | {page},
//   lists?]}]`). A row names a row or a fact of the plan (`data`), or a page of the plan (`page`) for a list keyed to
//   pages; `item` names the item (never a fact) of the block an item list belongs to; `lists` holds a row's nested
//   lists. A list `name` is at most 64 characters (`TEXT_LIMITS`).
// Like the rest of the plan these are closed shapes with no written copy. How many rows a list may show is held by the
// rules gate against the block store (`plan-rows-check.mjs`), not here: Contract B does not know the template.
import { sourcesProblems } from './build-contract-plan-parts.mjs'
import { closedShapeProblems, textProblems } from './build-contract-shapes.mjs'
import { isName, isObject, label } from './build-contract-shared.mjs'

/** How deep lists may nest inside a block: a list, a list of its rows, and one more. */
export const MAX_LIST_DEPTH = 3

/** The plan's `rows`, checked; each id joins `known` (facts and items) as `{what: 'row'}`. */
export function rowDataProblems(plan, known, report) {
  if (plan.rows === undefined) return
  if (!Array.isArray(plan.rows)) return report('rows', 'rows must list the rows the business stated')
  plan.rows.forEach((row, i) => {
    const at = `rows[${label(row?.id, i)}]`
    if (!isObject(row)) return report(at, 'a row must be an object {id, label, sources}')
    closedShapeProblems(row, 'row', at, report)
    if (!isName(row.id)) report(`${at}.id`, 'needs a non-empty id')
    else if (known.has(row.id))
      report(`${at}.id`, `id ${JSON.stringify(row.id)} is used twice by facts, items and rows`)
    else known.set(row.id, { what: 'row' })
    textProblems(row.label, `${at}.label`, report, 'label', 'a row needs a label the customer can read')
    sourcesProblems(row.sources, `${at}.sources`, report)
  })
}

function rowsProblems(rows, at, ctx, depth) {
  if (!Array.isArray(rows))
    return ctx.report(`${at}.rows`, 'rows must list the rows of the list (may be empty)')
  const seen = new Set()
  rows.forEach((row, i) => {
    const rowAt = `${at}.rows[${i}]`
    if (!isObject(row)) return ctx.report(rowAt, 'a planned row must be an object {data} or {page}')
    closedShapeProblems(row, 'planned row', rowAt, ctx.report)
    if ((row.data === undefined) === (row.page === undefined))
      return ctx.report(rowAt, 'a planned row names one of data (a row or fact of the plan) or page')
    const key = row.data === undefined ? `page:${row.page}` : row.data
    if (seen.has(key)) ctx.report(rowAt, `${JSON.stringify(key)} appears twice in the list`)
    seen.add(key)
    if (row.data !== undefined) {
      const entry = ctx.known.get(row.data)
      if (entry?.what !== 'row' && entry?.what !== 'fact')
        ctx.report(`${rowAt}.data`, `${JSON.stringify(row.data)} is not a row or fact of the plan`)
    } else if (!ctx.pageIds.has(row.page))
      ctx.report(`${rowAt}.page`, `${JSON.stringify(row.page)} is not a page of the plan`)
    if (row.lists !== undefined) listsProblems(row.lists, `${rowAt}.lists`, ctx, depth + 1, null)
  })
}

function listsProblems(lists, at, ctx, depth, block) {
  if (!Array.isArray(lists)) return ctx.report(at, 'lists must list the child lists of the block')
  if (depth > MAX_LIST_DEPTH) return ctx.report(at, `lists nest at most ${MAX_LIST_DEPTH} deep`)
  const seen = new Set()
  lists.forEach((entry, i) => {
    const listAt = `${at}[${i}]`
    if (!isObject(entry)) return ctx.report(listAt, 'a child list must be an object {name, item?, rows}')
    closedShapeProblems(entry, 'child list', listAt, ctx.report)
    textProblems(
      entry.name,
      `${listAt}.name`,
      ctx.report,
      'lists[].name',
      'a child list needs the name the block store gives it'
    )
    const key = `${entry.name}|${entry.item ?? ''}`
    if (seen.has(key)) ctx.report(listAt, `list ${JSON.stringify(entry.name)} appears twice for one place`)
    seen.add(key)
    if (entry.item !== undefined && (!block || !block.data?.includes(entry.item)))
      ctx.report(`${listAt}.item`, 'item names an item the block shows; a nested list has none')
    else if (entry.item !== undefined && ctx.known.get(entry.item)?.what !== 'item')
      ctx.report(
        `${listAt}.item`,
        `${JSON.stringify(entry.item)} is not an item of the plan: a fact has no item list`
      )
    rowsProblems(entry.rows, listAt, ctx, depth)
  })
}

/** A block's optional `lists`, checked against the plan's data ids and page ids. */
export function blockListsProblems(block, at, known, pageIds, report) {
  if (block.lists === undefined) return
  listsProblems(block.lists, `${at}.lists`, { known, pageIds, report }, 1, block)
}
