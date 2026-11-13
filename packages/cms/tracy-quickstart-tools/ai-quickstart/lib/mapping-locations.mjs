// Locations of the AI quickstart mapping file (ticket #584), read off the template's content map. Pure.
//
// A location keeps the shape a content map slot already has, so the existing write functions take it unchanged:
//   { slot, entity, column, jsonPath?, nestedJson?, xpath?, piece? }
// `slot` is the content map key the write functions are keyed by (`applyJoomlaContract` changes, emptySlots).
// A piece of a stored HTML value (`<key>@<xpath>` in the block store) is the location of its stored value with the
// piece's xpath and `piece: true`: the build reads the stored value, sets that piece, and writes the whole value.
// Every xpath of the mapping file reads the stored value the way the Claude Cowork plugin's content slots do, inside
// a synthetic `/html/body/div` root. The block store writes a piece against the value as the document body
// (`/html/body/ul/li[2]`, measure-plan.mjs), so a piece's xpath is moved under that root (`/html/body/div/ul/li[2]`).

/** The content map slots by key. */
export function slotsByKey(contentMap) {
  return new Map((contentMap.slots ?? []).map((s) => [s.key, s]))
}

/** The location of a content map slot, or of a piece of its stored HTML value (`<key>@<xpath>`). */
export function locationOf(place, slots) {
  const at = place.indexOf('@')
  const key = at < 0 ? place : place.slice(0, at)
  const slot = slots.get(key)
  if (!slot) throw new Error(`${key} is not a slot of the content map`)
  const loc = { slot: key, entity: slot.entity, column: slot.column }
  if (slot.jsonPath) loc.jsonPath = slot.jsonPath
  if (slot.nestedJson) loc.nestedJson = slot.nestedJson
  if (at < 0) {
    if (slot.xpath) loc.xpath = slot.xpath
    return loc
  }
  if (slot.xpath) throw new Error(`${place}: a piece of a slot that already names an xpath`)
  const piece = place.slice(at + 1)
  if (!piece.startsWith('/html/body/')) throw new Error(`${place}: a piece xpath starts at /html/body/`)
  return { ...loc, xpath: `/html/body/div/${piece.slice('/html/body/'.length)}`, piece: true }
}

/** The locations of a list of places, nested as deep as the list is. */
export function locationsOf(places, slots) {
  return places.map((p) => (Array.isArray(p) ? locationsOf(p, slots) : locationOf(p, slots)))
}

/** Every entity a location names, walking any nesting of lists and objects. */
export function entitiesNamed(value, found = new Set()) {
  if (Array.isArray(value)) for (const v of value) entitiesNamed(v, found)
  else if (value && typeof value === 'object') {
    if (typeof value.entity === 'string' && typeof value.column === 'string') found.add(value.entity)
    for (const v of Object.values(value)) entitiesNamed(v, found)
  }
  return found
}

/**
 * The entities table of the mapping file: every entity a location names, with its kind and identity from the content
 * map (or from the reviewed decisions for an entity the content map does not hold), and `created: true` for a
 * record the blank site deletes, which the build creates (a page, a contact, an account) and writes in its own shape.
 */
export function entitiesTable({ named, contentMap, decisions, removedWithPage }) {
  const fromMap = new Map((contentMap.entities ?? []).map((e) => [e.key, e]))
  const extra = decisions.entities ?? {}
  const table = {}
  for (const key of [...named].filter((k) => k !== 'page').sort()) {
    const e = fromMap.get(key)
    if (e) {
      const removed = removedWithPage[e.kind]
      const created = Boolean(removed) && !(removed.except ?? []).includes(key)
      table[key] = {
        kind: e.kind,
        identity: e.identity,
        ...(e.sourceId !== undefined ? { sourceId: e.sourceId } : {}),
        ...(created ? { created: true } : {})
      }
    } else if (extra[key]) table[key] = extra[key]
    else
      throw new Error(
        `${key} is neither an entity of the content map nor declared in mapping-decisions entities`
      )
  }
  return table
}
