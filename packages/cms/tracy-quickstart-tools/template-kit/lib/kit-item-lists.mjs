// Item lists of a block: the content map's `itemLists` (a block that shows content items pulled from a category,
// each card an item of its own) as `lists[]` rows with `rowKind: "items"`. The map's facts are carried as they are:
// the source category, the bounds, the items shown, and per card field the item slots it fills with their character
// limits. The minimum comes from a measurement (min-evidence.json) or the map; an unknown one stays null and is named
// in `errors`. A card field whose text matches the text of another field's slot on the same item (a title printed
// from either of two fields) keeps both and is an open question in `errors`, until a person decides it in
// card-fields.json: `{"<field>" | "<list id> <field>": {"printed": true|false, "reason": "...", "by": "..."}}`. A
// field decided not printed stays in `rowSlots` with `printed: false`; the open question is then closed.
import { neutralKey } from './ids.mjs'
import { measuredMin } from './min-evidence.mjs'

const norm = (s) =>
  String(s ?? '')
    .split('#')[0]
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** One card field of an item list, in kit ids: its slots per item and the tightest character limit. */
function rowSlotOf(r) {
  const slots = (r.items ?? []).map((i) => ({
    item: neutralKey(i.item),
    ...(i.slot ? { id: neutralKey(i.slot) } : {}),
    ...(i.path ? { path: i.path } : {}),
    ...(i.maxCharacters != null ? { maxCharacters: i.maxCharacters } : {}),
    ...(i.inferred ? { inferred: true } : {})
  }))
  const limits = slots.map((s) => s.maxCharacters).filter((n) => n != null)
  const out = {
    field: r.field,
    kind: r.kind,
    type: r.type ?? null,
    role: r.role ?? null,
    demoOwned: !!r.demoOwned
  }
  if (r.target) out.target = r.target
  if (r.labels) out.labels = r.labels
  if (limits.length) out.maxCharacters = Math.min(...limits)
  out.slots = slots
  return out
}

/** Fields of one list whose slots print the same text for one item: which of them the card shows is open. */
export function sameTextFields(entry, sampleOf) {
  const out = []
  const fields = (entry.rowSlots ?? []).filter((r) => r.type === 'text')
  for (let a = 0; a < fields.length; a++)
    for (let b = a + 1; b < fields.length; b++) {
      const items = (fields[a].items ?? []).filter((x) => {
        const y = (fields[b].items ?? []).find((i) => i.item === x.item)
        const t = norm(sampleOf(x.slot))
        return y && t && t === norm(sampleOf(y.slot))
      })
      if (items.length)
        out.push({ fields: [fields[a].field, fields[b].field], items: items.map((x) => x.item) })
    }
  return out
}

/**
 * @param {{map: object, blockId: string, entities: string[], minEvidence?: object, cardFields?: object, errors: object[]}} o
 * @returns {{lists: object[], demoOwned: {id: string, role: string|null, sample: string, from: string}[]}}
 */
export function itemListsOf({ map, blockId, entities, minEvidence = {}, cardFields = {}, errors }) {
  const slotBy = new Map((map.slots ?? []).map((s) => [s.key, s]))
  const sampleOf = (key) => slotBy.get(key)?.sample ?? ''
  const lists = []
  const demoOwned = []
  for (const [key, e] of Object.entries(map.itemLists ?? {})) {
    if (!entities.includes(e.block)) continue
    const id = neutralKey(key)
    const field = (f) => `blocks[${blockId}].lists[${id}].${f}`
    const decided = (name) => cardFields[`${id} ${name}`] ?? cardFields[name] ?? null
    const list = {
      id,
      rowKind: 'items',
      min: null,
      max: e.max ?? null,
      maxFrom: e.maxFrom ?? null,
      source: e.source ?? null,
      shown: (e.shown ?? []).map(neutralKey),
      rowSlots: (e.rowSlots ?? []).map((r) => {
        const out = rowSlotOf(r)
        const d = decided(r.field)
        if (typeof d?.printed === 'boolean')
          Object.assign(out, {
            printed: d.printed,
            decidedBy: `${d.by ?? 'person'}: ${d.reason ?? ''}`.trim()
          })
        return out
      }),
      observedBy: e.observedBy ?? null
    }
    const measured = minEvidence[id]
    if (measured?.okCounts?.length) Object.assign(list, measuredMin(measured))
    else if (e.min != null) Object.assign(list, { min: e.min, minSource: e.minFrom ?? 'content map' })
    else
      errors.push({
        kind: 'missing',
        field: field('min'),
        reason: `the content map says ${e.minFrom ?? 'nothing'} and no measurement was made`
      })
    if (list.max == null)
      errors.push({ kind: 'missing', field: field('max'), reason: 'the content map gives no item count' })
    for (const q of sameTextFields(e, sampleOf)) {
      if (q.fields.some((f) => typeof decided(f)?.printed === 'boolean')) continue // a person decided it
      errors.push({
        kind: 'open-question',
        field: field('rowSlots'),
        reason: `fields ${q.fields.join(' and ')} hold the same text for ${q.items.map(neutralKey).join(', ')}: which one the card prints is not known, both are kept`
      })
    }
    for (const k of e.demoOwned ?? [])
      if (!demoOwned.some((d) => d.id === neutralKey(k)))
        demoOwned.push({
          id: neutralKey(k),
          role: slotBy.get(k)?.role ?? null,
          sample: String(sampleOf(k)).split('#')[0].slice(0, 80),
          from: id
        })
    lists.push(list)
  }
  return { lists, demoOwned }
}

/** Item page path -> its category page's route, from the map's `itemPages`. */
export const itemParents = (map) =>
  Object.values(map.itemPages ?? {})
    .filter((p) => p.path && p.categoryRoute)
    .map((p) => ({ path: p.path, categoryRoute: p.categoryRoute }))
