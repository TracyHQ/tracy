// The limit a field is written within (ticket #615, Contract A "a shared place is written within the smallest limit of
// its fields"): its own declared limit, lowered to the smallest limit of every field of the store that writes one of
// the same stored places. Keyed by the stored places themselves, so two fields of the same name (two child lists of
// one block that both have a `title`) never mix their limits. Block, item and child list row fields alike. Pure.

const list = (value) => (Array.isArray(value) ? value : [])
const isName = (value) => typeof value === 'string' && value.trim() !== ''

/** Every stored place a field writes: its `slot` and every place of its `slots`, nested per parent place. */
export const placesOfField = (field) => [field?.slot, ...list(field?.slots).flat(3)].filter(isName)

function walkFields(fields, visit) {
  for (const field of list(fields)) if (field?.type !== 'design') visit(field)
}
function walkLists(lists, visit) {
  for (const child of list(lists)) {
    walkFields(child?.fields, visit)
    walkLists(child?.lists, visit)
  }
}

/**
 * The smallest declared limit of each stored place, over every field that writes it.
 * @param {Iterable<object>} blocks the block descriptions (a store's `blocks`, or the values of a block map)
 * @returns {Map<string, number>}
 */
export function placeLimitsOf(blocks) {
  const out = new Map()
  const visit = (field) => {
    if (!Number.isInteger(field?.limit)) return
    for (const place of placesOfField(field))
      out.set(place, Math.min(field.limit, out.get(place) ?? field.limit))
  }
  for (const block of blocks ?? []) {
    walkFields(block?.fields, visit)
    walkFields(block?.itemFields, visit)
    walkLists(block?.lists, visit)
    walkLists(block?.itemLists, visit)
  }
  return out
}

/** The limit `field` is written within: its declared limit, or the smallest limit of a place it shares. */
export function limitOf(field, placeLimits) {
  if (!Number.isInteger(field?.limit)) return field?.limit
  const shared = placesOfField(field)
    .map((place) => placeLimits?.get(place))
    .filter(Number.isInteger)
  return Math.min(field.limit, ...shared)
}
