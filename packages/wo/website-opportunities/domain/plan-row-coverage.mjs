// The accounting of child list fields against the DECLARATION (ticket #615): every field instance the placed blocks'
// child lists declare, enumerated straight from the block store, and the decision the build took for it. Its own walk
// of the declaration, apart from the walks that plan and write rows (`plan-rows.mjs`, `page-writer-rows.mjs`), so a
// field nothing decides shows as unexplained instead of being left out of both sides. Pure.
//
// Declared instances: per placed block, per parent place (the block for `lists`, each item it shows for `itemLists`,
// item N in stored place N), every row the list may hold (`items.max`), every field of that row, nested lists likewise
// (as `picture-declared.mjs`). That is the declared total. Each instance also says whether its parent place STORES that
// row (`stored`): a second count, the instances the template can hold at all, reported beside the total.
//
// Decided, read against the plan's own rows: a field of a row the plan holds takes the page writer's entry (`writer`,
// `data`, or `no-data` with its action); a planned row field with NO entry is unexplained, never empty, and so is a
// data entry whose value is not the planned row's own part for that field (another row's value). A field the planned
// row holds a value for must take exactly that value from 'data': a writer or no-data entry there is unexplained too.
// A field showing the network of its row's link (`textOf: 'network'`) expects that network's name. A row the plan does
// not hold is `empty`: with the code of the business row cut from that place when there was one
// (`row_beyond_stored_places`, `row_over_max`, `social_link_over_rows`), else `no_business_row` (the place stays
// empty, never invented); a design field is `design`.
import { takesData } from './plan-rows-fit.mjs'
import { firstRowOf, roomOf, shownItemIds } from './plan-rows.mjs'
import { rowNetworkNameOf, TEXT_OF_NETWORK } from './row-network-text.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const maxOf = (child) => (Number.isInteger(child?.items?.max) ? child.items.max : 0)
const idOf = (page, block, item, row, field) => [page, block, item, row, field].filter(Boolean).join('.')
/** The codes of a business row cut from a place for lack of room: the place it would fill stays empty for that. */
const CUT_CODES = new Set(['row_beyond_stored_places', 'row_over_max', 'social_link_over_rows'])

/** The values of a planned row by data kind: a row's own, or a fact's. */
function valuesOf(planned, data) {
  const record = planned?.data === undefined ? null : data.rowsById?.get(planned.data)
  if (record) return record.values
  const fact = planned?.data === undefined ? null : data.byId.get(planned.data)
  return fact?.what === 'fact' ? { [fact.kind]: [String(fact.entry.value)] } : {}
}

/** The value each field of a planned row must take: its own part (by rank among the row's fields of its kind). */
function expectedOf(child, values) {
  const rank = new Map()
  return list(child.fields).map((field) => {
    if (field?.textOf === TEXT_OF_NETWORK) return rowNetworkNameOf(list(child.fields), values) ?? undefined
    // Ranked as the page writer ranks the fields of a kind (`page-writer-rows.mjs`).
    const k = rank.get(field?.kind) ?? 0
    if (field?.textOf === undefined) rank.set(field?.kind, k + 1)
    return takesData(field) ? values[field.kind]?.[k] : undefined
  })
}

/** The codes of the business rows cut from this list at this parent place, in order. */
function cutsOf(at, path, parentRow, ctx) {
  return ctx.dropped
    .filter(
      (d) =>
        CUT_CODES.has(d.code) &&
        d.page === at.page &&
        d.block === at.block &&
        d.item === at.item &&
        d.list === path &&
        (parentRow === undefined || ctx.data.rowsById?.get(d.row)?.parent === parentRow)
    )
    .map((d) => d.code)
}

/** `planned`: the plan's entry of this list for this parent place (`{rows}`), or undefined. */
function declareList(child, at, place, planned, ctx, path, parentRow) {
  const rows = list(planned?.rows)
  const cuts = cutsOf(at, path, parentRow, ctx)
  for (let n = 1; n <= maxOf(child); n++) {
    const row = at.row ? `${at.row}.${child.name}.${n}` : `${child.name}.${n}`
    const own = rows[n - 1]
    const stored = n <= roomOf(child, place)
    const expected = own ? expectedOf(child, valuesOf(own, ctx.data)) : []
    const cut = own ? undefined : cuts[n - rows.length - 1]
    list(child.fields).forEach((field, i) => {
      ctx.out.push({
        id: idOf(at.page, at.block, at.item, row, field.name),
        ...at,
        row,
        list: path,
        field,
        planned: !!own,
        stored,
        ...(expected[i] === undefined ? {} : { expected: expected[i] }),
        ...(cut === undefined ? {} : { cut })
      })
    })
    const nested = new Map(list(own?.lists).map((l) => [l.name, l]))
    for (const n2 of list(child.lists))
      declareList(
        n2,
        { ...at, row },
        firstRowOf(child, place) + n - 1,
        nested.get(n2.name),
        ctx,
        `${path}.${n2.name}`,
        own?.data
      )
  }
}

/**
 * Every child list field instance the placed blocks declare, each with `planned` (the plan holds its row), `stored`
 * (its parent place stores that row), `expected` (the value the planned row holds for it) and `cut` (the code of the
 * business row cut from that place).
 * @param {object[]} [dropped] the plan's rows report (`planRows(...).dropped`)
 * @returns {Array<{id: string, page: string, block: string, item?: string, row: string, list: string, field: object,
 *   planned: boolean, stored: boolean, expected?: string, cut?: string}>}
 */
export function declaredRowFieldsOf(pages, blocks, data, dropped = []) {
  const ctx = { data, dropped: list(dropped), out: [] }
  for (const page of list(pages))
    for (const block of list(page?.blocks)) {
      const d = blocks.get(block.block) ?? {}
      const plannedOf = (name, item) => list(block.lists).find((l) => l?.name === name && l?.item === item)
      for (const child of list(d.lists))
        declareList(
          child,
          { page: page.id, block: block.id },
          0,
          plannedOf(child.name, undefined),
          ctx,
          child.name
        )
      shownItemIds(block, data).forEach((item, place) => {
        for (const child of list(d.itemLists))
          declareList(
            child,
            { page: page.id, block: block.id, item },
            place,
            plannedOf(child.name, item),
            ctx,
            child.name
          )
      })
    }
  return ctx.out
}

/**
 * The decision for every declared child list field, from the page writer's output.
 * @param {ReturnType<typeof declaredRowFieldsOf>} declared
 * @param {{pages: Array<{id: string, fields: object[]}>}} copy the page writer's output (`writePages`)
 * @returns {{declared: number, stored: number, decided: number, decisions: Record<string, number>,
 *   unexplained: string[], extra: string[], byId: Map<string, object>}} `declared`: the declared total (`items.max`
 *   rows per parent place); `stored`: the instances whose parent place stores their row; `unexplained`: planned row
 *   fields with no entry, a data entry that is not the row's own value, or any other entry where the row holds a
 *   value; `extra`: entries no declared field has
 */
export function rowFieldAccountOf(declared, copy) {
  const written = new Map()
  for (const page of list(copy?.pages))
    for (const f of list(page.fields))
      if (f.row) written.set(idOf(page.id, f.block, f.item, f.row, f.field), f)
  const byId = new Map()
  const decisions = {}
  const unexplained = []
  const note = (id, decision) => {
    byId.set(id, decision)
    const key = decision.from === 'no-data' ? `no-data:${decision.action}` : decision.from
    decisions[key] = (decisions[key] ?? 0) + 1
  }
  for (const d of declared) {
    const entry = written.get(d.id)
    if (d.field.type === 'design') note(d.id, { from: 'design', reason: 'design_never_written' })
    else if (entry?.from === 'data' && entry.value !== d.expected) unexplained.push(d.id)
    else if (d.expected !== undefined && entry?.from !== 'data') unexplained.push(d.id)
    else if (entry) note(d.id, entry)
    else if (d.planned) unexplained.push(d.id)
    else note(d.id, { from: 'empty', reason: d.cut ?? 'no_business_row' })
  }
  const ids = new Set(declared.map((d) => d.id))
  return {
    declared: declared.length,
    stored: declared.filter((d) => d.stored).length,
    decided: byId.size,
    decisions,
    unexplained,
    extra: [...written.keys()].filter((id) => !ids.has(id)),
    byId
  }
}
