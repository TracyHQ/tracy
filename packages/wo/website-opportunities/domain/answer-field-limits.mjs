// How long a customer's typed answer may be in a given template (ticket #615): an answer becomes a fact (the main button
// label, a contact detail, a corrected value), and a fact is never shortened, so a fact longer than a text field of its
// kind would stop the page writer (`data_over_limit`) after the customer approved the plan. The questions offer, and
// the answer settling accepts, no more than the smallest limit of the text fields of that kind in the template, each
// field's limit being the smallest of the stored places it shares (`field-place-limits.mjs`). Pure.
import { limitOf, placeLimitsOf } from './field-place-limits.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/** Every field a block declares: its own, its items', and those of its child lists at any depth. */
function fieldsOf(block) {
  const out = [...list(block?.fields), ...list(block?.itemFields)]
  const walk = (lists) => {
    for (const child of list(lists)) {
      out.push(...list(child?.fields))
      walk(child?.lists)
    }
  }
  walk(block?.lists)
  walk(block?.itemLists)
  return out
}

/**
 * The smallest limit of the text fields of each kind in a template.
 * @param {Iterable<object>} blocks the block descriptions (a store's `blocks`, the library, or a block map's values)
 * @returns {Map<string, number>} data kind -> characters
 */
export function kindLimitsOf(blocks) {
  const all = [...blocks]
  const places = placeLimitsOf(all)
  const out = new Map()
  for (const field of all.flatMap(fieldsOf)) {
    if (field?.type !== 'text' || typeof field.kind !== 'string') continue
    const limit = limitOf(field, places)
    if (Number.isInteger(limit) && limit < (out.get(field.kind) ?? Infinity)) out.set(field.kind, limit)
  }
  return out
}

/** The blocks of a raw block store and a library, for `kindLimitsOf`. */
export const storeBlocksOf = (blockStore, library = []) => [...list(blockStore?.blocks), ...list(library)]

/** `max` lowered to the template's limit for `kind`, when the template has one. */
export const cappedLength = (max, kind, limits) => Math.min(max, limits?.get?.(kind) ?? Infinity)
