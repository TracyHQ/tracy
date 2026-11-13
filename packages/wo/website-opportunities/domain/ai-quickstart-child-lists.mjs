// Child lists of the AI quickstart block store (ticket #583, decision of 13/11): a list inside a block (`lists`, the
// block's own) or inside each item of a repeating block (`itemLists`), with its own item fields, counts and the
// sources of the counts. A child list's rows may carry child lists of their own (`lists` on the child list).
//
// A child field stores its rows per parent place: `slots` is one entry per parent place, each the stored places of
// its rows in row order (`[["a.1", "a.3"], ["b.1"], []]`). The parent places are the block itself (one place) for
// `lists`, the stored item places for `itemLists`, and every row of the parent list, in order, for a nested list.
// Pure helpers shared by the block store rules (`ai-quickstart-contract.mjs`) and the mapping rules
// (`ai-quickstart-mapping.mjs`). Format: docs/references/ai-quickstart-contract.md.

import { labelProblem } from './ai-quickstart-labels.mjs'

export const CHILD_LIST_KEYS = Object.freeze(['lists', 'itemLists'])

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isName = (value) => typeof value === 'string' && value.trim() !== ''
const isWhole = (value, from) => Number.isInteger(value) && value >= from
const label = (value, index) => (isName(value) ? value : String(index))

/** The rows per parent place of a per-place list of places, or null when it is not one. */
export function rowsPerPlace(perPlace, isPlace = isName) {
  if (!Array.isArray(perPlace)) return null
  if (!perPlace.every((rows) => Array.isArray(rows) && rows.every(isPlace))) return null
  return perPlace.map((rows) => rows.length)
}

/** The child lists of a block or of a child list, by key, each with its place in the declaration. */
export function childListsOf(owner, at, keys = CHILD_LIST_KEYS) {
  const found = []
  for (const key of keys) {
    if (!Array.isArray(owner?.[key])) continue
    owner[key].forEach((list, i) => found.push({ key, list, at: `${at}.${key}[${label(list?.name, i)}]` }))
  }
  return found
}

/**
 * The problems of a list's rows against its counts: every parent place stores between `min` and `max` rows, and
 * one place stores `max` (a maximum no place stores is a claim nothing can write).
 * @param {number[]} rows the rows each parent place stores
 */
export function rowCountProblems(rows, items, at, report) {
  if (!isObject(items) || !isWhole(items.min, 0) || !isWhole(items.max, 1)) return
  rows.forEach((n, p) => {
    if (n < items.min)
      report(at, `parent place ${p} stores ${n} rows, below min ${items.min}: lower min or restructure`)
    if (n > items.max)
      report(
        at,
        `parent place ${p} stores ${n} rows, above max ${items.max}: a stored row the build never writes`
      )
  })
  const most = rows.length ? Math.max(...rows) : 0
  if (rows.length && most < items.max)
    report(
      at,
      `no parent place stores max ${items.max} rows: lower max to the most rows a place stores (${most})`
    )
}

/** Two rows-per-place lists differ: the fields of one list must agree row for row. */
export const sameRows = (a, b) => a.length === b.length && a.every((n, i) => n === b[i])

/**
 * The block store problems of every child list of `owner` (a block, or a child list for its nested lists).
 * @param {object} owner the block or child list
 * @param {string} at where the owner sits, e.g. `blocks[class-cards]`
 * @param {{keys: string[], places: (key: string) => number|null, names: Set<string>}} scope `places` gives the
 *   parent places of a key (`lists`, `itemLists`), null when unknown; `names` holds the names used in the block
 * @param {{report: Function, fieldProblems: Function, itemsProblems: Function}} rules
 */
export function childListProblems(owner, at, scope, rules) {
  const { report } = rules
  for (const key of scope.keys) {
    if (owner[key] !== undefined && !Array.isArray(owner[key]))
      report(`${at}.${key}`, `${key} must be a list of child lists`)
  }
  for (const { key, list, at: listAt } of childListsOf(owner, at, scope.keys)) {
    if (!isObject(list)) {
      report(listAt, 'a child list must be an object {name, label, items, itemsFrom, fields}')
      continue
    }
    if (!isName(list.name)) report(`${listAt}.name`, 'a child list needs a non-empty name')
    else if (scope.names.has(list.name))
      report(listAt, `name ${JSON.stringify(list.name)} appears twice in the block`)
    else scope.names.add(list.name)
    const labelled = labelProblem(list.label)
    if (labelled) report(`${listAt}.label`, labelled)
    rules.itemsProblems(list.items, `${listAt}.items`, report)
    if (!isObject(list.itemsFrom) || !isName(list.itemsFrom.min) || !isName(list.itemsFrom.max))
      report(`${listAt}.itemsFrom`, 'a child list states where each count comes from: itemsFrom {min, max}')
    const rows = childFieldsProblems(list, listAt, scope.places(key), rules)
    if (list.lists !== undefined)
      childListProblems(
        list,
        listAt,
        {
          keys: ['lists'],
          places: () => (rows ? rows.reduce((a, b) => a + b, 0) : null),
          names: scope.names
        },
        rules
      )
  }
}

/** The fields of one child list; returns the rows per parent place its fields agree on, or null. */
function childFieldsProblems(list, listAt, places, rules) {
  const { report } = rules
  if (!Array.isArray(list.fields) || list.fields.length === 0) {
    report(`${listAt}.fields`, 'a child list lists the fields of one row')
    return null
  }
  const names = new Set()
  let agreed = null
  let agreedBy = null
  list.fields.forEach((field, i) => {
    const fieldAt = `${listAt}.fields[${label(field?.name, i)}]`
    if (isName(field?.name) && names.has(field.name))
      report(fieldAt, `field name ${JSON.stringify(field.name)} appears twice in the child list`)
    if (isName(field?.name)) names.add(field.name)
    rules.fieldProblems(field, fieldAt, report)
    if (!isObject(field)) return
    if (field.slots === undefined) {
      if (!isName(field.derived))
        report(
          `${fieldAt}.slots`,
          'a child field lists its stored places per parent place (slots), or says what it is derived from (derived)'
        )
      return
    }
    const rows = rowsPerPlace(field.slots)
    if (!rows) {
      report(`${fieldAt}.slots`, 'slots must list, per parent place, the stored places of its rows')
      return
    }
    if (places !== null && rows.length !== places) {
      report(
        `${fieldAt}.slots`,
        `${rows.length} parent places for ${places}: every parent place lists its rows, [] when it stores none`
      )
      return
    }
    if (agreed && !sameRows(agreed, rows)) {
      report(
        `${fieldAt}.slots`,
        `rows per parent place ${rows.join(', ')} differ from field ${agreedBy}: ${agreed.join(', ')}`
      )
      return
    }
    if (!agreed) {
      agreed = rows
      agreedBy = field.name
      rowCountProblems(rows, list.items, `${listAt}.items`, report)
    }
  })
  return agreed
}
