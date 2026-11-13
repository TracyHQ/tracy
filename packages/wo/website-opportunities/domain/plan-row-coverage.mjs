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
// data entry whose value is not the planned row's own part for that field (another row's value). A row the plan
// does not hold is `empty` (`no_business_row`: the place stays empty, never invented); a design field is `design`.
import { firstRowOf, roomOf, shownItemIds } from './plan-rows.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const maxOf = (child) => (Number.isInteger(child?.items?.max) ? child.items.max : 0)
const idOf = (page, block, item, row, field) => [page, block, item, row, field].filter(Boolean).join('.')

/** The values of a planned row by data kind: a row's own, or a fact's. */
function valuesOf(planned, data) {
  const record = planned?.data === undefined ? null : data.rowsById?.get(planned.data)
  if (record) return record.values
  const fact = planned?.data === undefined ? null : data.byId.get(planned.data)
  return fact?.what === 'fact' ? { [fact.kind]: [String(fact.entry.value)] } : {}
}

/** `planned`: the plan's entry of this list for this parent place (`{rows}`), or undefined. */
function declareList(child, at, place, planned, data, out) {
  const rows = list(planned?.rows)
  for (let n = 1; n <= maxOf(child); n++) {
    const row = at.row ? `${at.row}.${child.name}.${n}` : `${child.name}.${n}`
    const own = rows[n - 1]
    const stored = n <= roomOf(child, place)
    const values = valuesOf(own, data)
    const rank = new Map()
    for (const field of list(child.fields)) {
      const k = rank.get(field.kind) ?? 0
      rank.set(field.kind, k + 1)
      const expected = values[field.kind]?.[k]
      out.push({
        id: idOf(at.page, at.block, at.item, row, field.name),
        ...at,
        row,
        field,
        planned: !!own,
        stored,
        ...(expected === undefined ? {} : { expected })
      })
    }
    const nested = new Map(list(own?.lists).map((l) => [l.name, l]))
    for (const n2 of list(child.lists))
      declareList(n2, { ...at, row }, firstRowOf(child, place) + n - 1, nested.get(n2.name), data, out)
  }
}

/**
 * Every child list field instance the placed blocks declare, each with `planned` (the plan holds its row) and `stored`
 * (its parent place stores that row).
 * @returns {Array<{id: string, page: string, block: string, item?: string, row: string, field: object,
 *   planned: boolean, stored: boolean}>}
 */
export function declaredRowFieldsOf(pages, blocks, data) {
  const out = []
  for (const page of list(pages))
    for (const block of list(page?.blocks)) {
      const d = blocks.get(block.block) ?? {}
      const plannedOf = (name, item) => list(block.lists).find((l) => l?.name === name && l?.item === item)
      for (const child of list(d.lists))
        declareList(child, { page: page.id, block: block.id }, 0, plannedOf(child.name, undefined), data, out)
      shownItemIds(block, data).forEach((item, place) => {
        for (const child of list(d.itemLists))
          declareList(
            child,
            { page: page.id, block: block.id, item },
            place,
            plannedOf(child.name, item),
            data,
            out
          )
      })
    }
  return out
}

/**
 * The decision for every declared child list field, from the page writer's output.
 * @param {ReturnType<typeof declaredRowFieldsOf>} declared
 * @param {{pages: Array<{id: string, fields: object[]}>}} copy the page writer's output (`writePages`)
 * @returns {{declared: number, stored: number, decided: number, decisions: Record<string, number>,
 *   unexplained: string[], extra: string[], byId: Map<string, object>}} `declared`: the declared total (`items.max`
 *   rows per parent place); `stored`: the instances whose parent place stores their row; `unexplained`: planned row
 *   fields with no entry, or a data entry that is not the row's own value; `extra`: entries no declared field has
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
    else if (entry) note(d.id, entry)
    else if (d.planned) unexplained.push(d.id)
    else note(d.id, { from: 'empty', reason: 'no_business_row' })
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
