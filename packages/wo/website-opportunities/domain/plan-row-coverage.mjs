// The accounting of child list fields against the DECLARATION (ticket #615): every field instance the placed blocks'
// child lists declare, enumerated straight from the block store, and the decision the build took for it. Its own walk
// of the declaration, apart from the walks that plan and write rows (`plan-rows.mjs`, `page-writer-rows.mjs`), so a
// field nothing decides shows as missing instead of being left out of both sides. Pure.
//
// Declared instances: per placed block, per parent place (the block for `lists`, each item it shows for `itemLists`),
// every row the list may hold (`items.max`), every field of that row, nested lists likewise (as `picture-declared.mjs`).
// Decided: a field of a planned row takes the page writer's entry (`writer`, `data`, or `no-data` with its action:
// `hide`, `derived` for the page of the row, `pictures` for the pictures step); a row the plan does not hold is
// `empty` (`no_business_row`: the place stays empty, never invented); a design field is `design` (never written).
import { shownItemIds } from './plan-rows.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const maxOf = (child) => (Number.isInteger(child?.items?.max) ? child.items.max : 0)
const idOf = (page, block, item, row, field) => [page, block, item, row, field].filter(Boolean).join('.')

function declareList(child, at, out) {
  for (let n = 1; n <= maxOf(child); n++) {
    const row = at.row ? `${at.row}.${child.name}.${n}` : `${child.name}.${n}`
    for (const field of list(child.fields))
      out.push({ id: idOf(at.page, at.block, at.item, row, field.name), ...at, row, field })
    for (const nested of list(child.lists)) declareList(nested, { ...at, row }, out)
  }
}

/**
 * Every child list field instance the placed blocks declare.
 * @returns {Array<{id: string, page: string, block: string, item?: string, row: string, field: object}>}
 */
export function declaredRowFieldsOf(pages, blocks, data) {
  const out = []
  for (const page of list(pages))
    for (const block of list(page?.blocks)) {
      const d = blocks.get(block.block) ?? {}
      for (const child of list(d.lists)) declareList(child, { page: page.id, block: block.id }, out)
      for (const item of shownItemIds(block, data))
        for (const child of list(d.itemLists))
          declareList(child, { page: page.id, block: block.id, item }, out)
    }
  return out
}

/**
 * The decision for every declared child list field, from the page writer's output.
 * @param {ReturnType<typeof declaredRowFieldsOf>} declared
 * @param {{pages: Array<{id: string, fields: object[]}>}} copy the page writer's output (`writePages`)
 * @returns {{declared: number, decided: number, decisions: Record<string, number>, missing: string[],
 *   extra: string[], unexplained: number, byId: Map<string, object>}}
 */
export function rowFieldAccountOf(declared, copy) {
  const written = new Map()
  for (const page of list(copy?.pages))
    for (const f of list(page.fields))
      if (f.row) written.set(idOf(page.id, f.block, f.item, f.row, f.field), f)
  const byId = new Map()
  const decisions = {}
  let unexplained = 0
  const note = (id, decision) => {
    byId.set(id, decision)
    const key = decision.from === 'no-data' ? `no-data:${decision.action}` : decision.from
    decisions[key] = (decisions[key] ?? 0) + 1
  }
  for (const d of declared) {
    const entry = written.get(d.id)
    if (d.field.type === 'design') note(d.id, { from: 'design', reason: 'design_never_written' })
    else if (!entry) {
      // A row the plan does not hold: the row index is beyond the rows planned for this list.
      const planned = [...written.keys()].some((k) => k.startsWith(`${d.id.slice(0, -d.field.name.length)}`))
      if (planned) unexplained += 1
      note(d.id, { from: 'empty', reason: 'no_business_row' })
    } else note(d.id, entry)
  }
  const ids = new Set(declared.map((d) => d.id))
  return {
    declared: declared.length,
    decided: byId.size,
    decisions,
    missing: declared.filter((d) => !byId.has(d.id)).map((d) => d.id),
    extra: [...written.keys()].filter((id) => !ids.has(id)),
    unexplained,
    byId
  }
}
