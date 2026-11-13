// The entries of an AI quickstart mapping file (ticket #584): a location, a business fact, or a derived source. Pure.
// Used by `ai-quickstart-mapping.mjs` (the field rules) and `ai-quickstart-mapping-places.mjs` (the place rules).
//
// A location has the shape a content map slot already has, so the existing write functions take it unchanged:
//   { "slot": "module-160.3", "entity": "module-160", "column": "params", "jsonPath": ["items", 0, "title"],
//     "nestedJson": "jatools-config", "xpath": "/html/body/div", "piece": true }
// Only `entity` and `column` are required. `slot` is the content map key the write functions are keyed by;
// `jsonPath` holds keys and list indexes; `nestedJson` names a JSON value stored inside the JSON column; `piece` says
// the xpath names a piece of the stored HTML value (the build reads the value, sets the piece, writes the value back).
// `as` (a fact place only) says how the fact is written there: `tel` (a tel: link of the phone), `mailto`.

export const FACT_WRITTEN_AS = Object.freeze(['tel', 'mailto'])

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isName = (value) => typeof value === 'string' && value.trim() !== ''
const isStep = (value) => isName(value) || (Number.isInteger(value) && value >= 0)

/** Why `loc` is not a location, or null when it is one. */
export function locationProblem(loc) {
  if (!isObject(loc)) return 'a location must be an object {entity, column, jsonPath?, xpath?}'
  if (!isName(loc.entity) || !isName(loc.column)) return 'a location needs an entity and a column'
  if (loc.jsonPath !== undefined && !(Array.isArray(loc.jsonPath) && loc.jsonPath.every(isStep)))
    return 'jsonPath must be a list of keys and list indexes'
  if (loc.xpath !== undefined && !isName(loc.xpath)) return 'xpath must be a non-empty string'
  if (loc.slot !== undefined && !isName(loc.slot)) return 'slot must be a content map key'
  if (loc.nestedJson !== undefined && !isName(loc.nestedJson))
    return 'nestedJson must name the nested JSON value'
  if (loc.piece !== undefined && !(loc.piece === true && isName(loc.xpath)))
    return 'piece is true, with the xpath of the piece'
  if (loc.as !== undefined && !FACT_WRITTEN_AS.includes(loc.as))
    return `as must be one of ${FACT_WRITTEN_AS.join(', ')}`
  return null
}

/** The stored place a location names: two locations with the same key are written by the same write. */
export const locationKey = (loc) =>
  JSON.stringify([loc.entity, loc.column, loc.nestedJson ?? '', loc.jsonPath ?? [], loc.xpath ?? ''])

export const isFactEntry = (entry) => isObject(entry) && Object.hasOwn(entry, 'fact')
export const isDerivedEntry = (entry) => isObject(entry) && Object.hasOwn(entry, 'derived')

/**
 * Why `entry` is not the entry of `field` (a store field), or null. A field is written at a location, takes the
 * value of a business fact (`{fact}`), or is derived by the build (`{derived, keyAt?}`, only for a store field that
 * is derived; a derived field whose worked-out value is stored somewhere has that location instead).
 */
export function entryProblem(entry, field, { facts, factKinds }) {
  if (isFactEntry(entry)) {
    if (!Object.hasOwn(factKinds, entry.fact)) return `${JSON.stringify(entry.fact)} is not a business fact`
    if (!Array.isArray(facts?.[entry.fact])) return `fact "${entry.fact}" has no places in facts`
    if (field.kind !== factKinds[entry.fact])
      return `field kind ${field.kind} is not the kind of fact "${entry.fact}" (${factKinds[entry.fact]})`
    return null
  }
  if (isDerivedEntry(entry)) {
    if (!isName(field.derived)) return 'only a derived store field has a derived entry'
    if (entry.derived !== field.derived) return `derived must repeat the store's "${field.derived}"`
    return null
  }
  // A derived field may also have a location: the build works the value out and writes it there (a page address).
  return locationProblem(entry)
}
