// The words of sibling record pages (spec TracyHQ/tracy#189, site build rules 1 and 3): pages of one kind of record (a
// lesson, a service, a product) laid out alike are each written for their own record, and keep the template's structure.
// Pure and deterministic: it says which slots must be written again and why; the engine's writer asks the text model.
//
// 🔒 ONE RECORD, ONE TEXT: a section of a record page whose words, once the record's own name is taken out, are mostly
// the words of the same section on a sibling page is one template with the name swapped; it is written again for its
// record (the first sibling keeps its words).
// 🔒 NO EMPTY CARD, NO EMPTY BULLET: a card of a record page (an outline part, an item of a list) left without words while
// the same card of a sibling page has them is written from the trade and the brief, in the same shape (one line per slot
// the template gives it), never left as an empty title over empty bullet markers.
import { heldRecordPages, recordPagesOf } from './record-pages.mjs'

/** Body roles whose words are compared across siblings. */
const BODY_ROLES = new Set([
  'editorial.paragraph',
  'step.description',
  'offering.description',
  'offering.summary',
  'item.description',
  'feature.description'
])
/** Roles a card of a record page is written in when it is missing. */
const CARD_ROLES = new Set([...BODY_ROLES, 'editorial.heading', 'step.title', 'item.title', 'feature.title'])
const NAME_ROLES = new Set(['offering.name', 'person.name', 'product.name', 'location.name'])
/** Two texts are one template when they share this share of their words, the record names taken out. */
export const COPIED_SHARE = 0.7
/** Texts shorter than this many words are never compared: a label is allowed to repeat. */
const MIN_WORDS = 6

const plain = (v) =>
  String(v ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const wordsOf = (text, drop) =>
  new Set(
    plain(text)
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 1 && !drop.has(w))
  )

/** How much two word sets share: the shared words over the smaller set. */
export function sharedShare(a, b) {
  const small = Math.min(a.size, b.size)
  if (!small) return 0
  let hits = 0
  for (const w of a) if (b.has(w)) hits += 1
  return hits / small
}

/** The families of record pages of a map: its declared `recordPages` entries, else the record pages it holds. */
export function recordFamilies(contentMap) {
  const declared = recordPagesOf(contentMap)
    .map((p) => (Array.isArray(p.entities) ? p.entities.filter((e) => typeof e === 'string') : []))
    .filter((list) => list.length >= 2)
  if (declared.length) return declared
  const held = heldRecordPages(contentMap)
  return held.length >= 2 ? [held] : []
}

/**
 * The slots of a family at one place of the layout, one per page: a slot's place is its group's suffix (`.outline.3`),
 * its role and its order among the slots of that role there (`editorial.paragraph` #2 outside any group).
 * @returns {Map<string, Map<string, any>>} place → entity → slot
 */
export function alignedSlots(contentMap, entities) {
  const wanted = new Set(entities)
  const out = new Map()
  const seen = new Map()
  for (const slot of contentMap?.slots ?? []) {
    if (!wanted.has(slot.entity) || slot.type !== 'text' || !CARD_ROLES.has(slot.role)) continue
    const id = String(slot.group?.id ?? '')
    const where = id.startsWith(`${slot.entity}.`) ? id.slice(slot.entity.length) : id ? '?' : '-'
    if (where === '?') continue
    const at = `${slot.entity}|${where}|${slot.role}`
    const n = seen.get(at) ?? 0
    seen.set(at, n + 1)
    const place = `${where}|${slot.role}|${n}`
    out.set(place, (out.get(place) ?? new Map()).set(slot.entity, slot))
  }
  return out
}

/**
 * @param {object} input
 * @param {{slots?: any[], entities?: any[], recordPages?: any[]}} input.contentMap
 * @param {Record<string, string>} input.written - the words each slot will hold
 * @param {Set<string>} [input.blanked] - slots the build empties (demo words taken off)
 * @returns {{copied: Array<{key: string, entity: string, record: string, role: string, like: string[]}>,
 *   missing: Array<{key: string, entity: string, record: string, role: string, like: string[]}>}}
 */
export function siblingRecordCopy({ contentMap, written, blanked = new Set() }) {
  const copied = []
  const missing = []
  for (const family of recordFamilies(contentMap)) {
    const nameOf = new Map()
    for (const slot of contentMap?.slots ?? [])
      if (family.includes(slot.entity) && NAME_ROLES.has(slot.role) && plain(written[slot.key]))
        nameOf.set(slot.entity, nameOf.get(slot.entity) ?? plain(written[slot.key]))
    const drop = new Set([...nameOf.values()].flatMap((n) => [...wordsOf(n, new Set())]))
    const textOf = (slot) => (blanked.has(slot.key) ? '' : plain(written[slot.key]))
    for (const [place, bySlot] of alignedSlots(contentMap, family)) {
      const grouped = !place.startsWith('-|')
      const row = family.filter((e) => bySlot.has(e)).map((e) => ({ entity: e, slot: bySlot.get(e) }))
      const said = row.filter((r) => textOf(r.slot))
      if (said.length === 0) continue
      const like = said.map((r) => textOf(r.slot))
      const record = (e) => nameOf.get(e) ?? ''
      // A card of the layout no words fill on one page while a sibling's has them: written in the same shape.
      if (grouped)
        for (const r of row)
          if (!textOf(r.slot))
            missing.push({
              key: r.slot.key,
              entity: r.entity,
              record: record(r.entity),
              role: r.slot.role,
              like
            })
      if (!BODY_ROLES.has(said[0].slot.role)) continue
      const kept = []
      for (const r of said) {
        const words = wordsOf(textOf(r.slot), drop)
        const twin = words.size >= MIN_WORDS && kept.some((k) => sharedShare(words, k) >= COPIED_SHARE)
        if (twin)
          copied.push({
            key: r.slot.key,
            entity: r.entity,
            record: record(r.entity),
            role: r.slot.role,
            like: like.filter((t) => t !== textOf(r.slot))
          })
        else kept.push(words)
      }
    }
  }
  return { copied, missing }
}
