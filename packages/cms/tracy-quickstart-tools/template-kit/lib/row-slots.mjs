// The row slots of a block: the picture field that every row of a list repeats (the icon of every feature
// card, the photo of every trainer). Whether such a frame can be left empty is a decision for the whole list,
// never for one card: it is measured by emptying that slot in every row at once.
import { neutralKey } from './ids.mjs'

/** The list a slot's row belongs to and the field it fills in that row, or null outside a list. */
export function rowSlotKey(slot) {
  if (!slot?.group?.id) return null
  const list = String(slot.group.id).replace(/\.\d+$/, '')
  const field = (slot.jsonPath ?? []).filter((p) => typeof p !== 'number').join('/')
  return `${list}|${slot.column ?? ''}|${slot.nestedJson ?? ''}|${field}`
}

/**
 * @param {object[]} slots the content map slots of a block
 * @returns {{key: string, ids: string[]}[]} picture slots repeated by two rows or more
 */
export function rowSlotsOf(slots) {
  const by = new Map()
  for (const s of slots) {
    if (s.type !== 'image') continue
    const key = rowSlotKey(s)
    if (!key) continue
    const e = by.get(key) ?? { key, ids: [], rows: new Set() }
    e.ids.push(neutralKey(s.key))
    e.rows.add(`${s.group.id}#${s.group.item}`)
    by.set(key, e)
  }
  return [...by.values()].filter((e) => e.rows.size >= 2).map(({ key, ids }) => ({ key, ids }))
}
