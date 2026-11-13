// The `blocks` half of the AI quickstart mapping file (ticket #584): where each field of the block store is written.
// Pure. Each field place of the block store becomes exactly one entry:
//   - a location (mapping-locations.mjs), the place the build writes the field's value;
//   - `{fact: <name>}` when the place is one of the places of a business fact (`facts`): the value comes from the
//     fact, declared once, so the field has no writer of its own;
//   - `{derived, keyAt?, pageType?}` for a field the build does not write as a value (a page address, the page a
//     keyed row is drawn on): `keyAt` is where the build writes the id of the page it creates for the row.
// A design field's location is also one of the block's `designLines`.
import { locationOf } from './mapping-locations.mjs'

/** The business fact each fact place belongs to: place -> fact name. */
export function factOfPlace(facts) {
  const of = new Map()
  for (const [name, places] of Object.entries(facts ?? {}))
    for (const p of places) if (p.place) of.set(p.place, name)
  return of
}

function derivedEntry(field) {
  return {
    derived: field.derived,
    ...(field.keyAt ? { keyAt: field.keyAt } : {}),
    ...(field.pageType ? { pageType: field.pageType } : {})
  }
}

/** The entry of one place: the fact it shows, or its location. */
function placeEntry(place, ctx) {
  const fact = ctx.factOf.get(place)
  return fact ? { fact } : locationOf(place, ctx.slots)
}

/** The entries of a list of places, nested as deep as the list is. */
function placesEntries(places, ctx) {
  return places.map((p) => (Array.isArray(p) ? placesEntries(p, ctx) : placeEntry(p, ctx)))
}

function fieldEntry(field, ctx) {
  if (field.derived) return derivedEntry(field)
  if (field.slot) return placeEntry(field.slot, ctx)
  throw new Error(`${ctx.at}.${field.name}: a field with neither a slot nor a derived source`)
}

function itemFieldEntry(field, ctx) {
  if (field.derived) return derivedEntry(field)
  if (Array.isArray(field.slots)) return placesEntries(field.slots, ctx)
  throw new Error(`${ctx.at}.${field.name}: an item field with neither slots nor a derived source`)
}

/** The child lists of `owner` (lists, itemLists, or the nested lists of a list). */
function listsEntry(lists, ctx) {
  const out = {}
  for (const list of lists ?? []) {
    const fields = {}
    for (const f of list.fields ?? [])
      fields[f.name] = itemFieldEntry(f, { ...ctx, at: `${ctx.at}/${list.name}` })
    out[list.name] = { fields }
    if (list.lists?.length)
      out[list.name].lists = listsEntry(list.lists, { ...ctx, at: `${ctx.at}/${list.name}` })
  }
  return out
}

function designLinesOf(block, ctx) {
  return (block.fields ?? [])
    .filter((f) => f.type === 'design' && f.slot)
    .map((f) => locationOf(f.slot, ctx.slots))
}

/** The mapping of one block of the store. */
export function blockEntry(block, ctx) {
  const at = block.id
  const entry = { fields: {} }
  for (const f of block.fields ?? []) entry.fields[f.name] = fieldEntry(f, { ...ctx, at })
  if (block.itemFields?.length) {
    entry.itemFields = {}
    for (const f of block.itemFields) entry.itemFields[f.name] = itemFieldEntry(f, { ...ctx, at })
  }
  if (block.lists?.length) entry.lists = listsEntry(block.lists, { ...ctx, at })
  if (block.itemLists?.length) entry.itemLists = listsEntry(block.itemLists, { ...ctx, at })
  const designLines = designLinesOf(block, ctx)
  if (designLines.length) entry.designLines = designLines
  return entry
}

/** The `blocks` of the mapping file, in the order of the block store. */
export function blocksEntries(blockStore, ctx) {
  return Object.fromEntries((blockStore.blocks ?? []).map((b) => [b.id, blockEntry(b, ctx)]))
}
