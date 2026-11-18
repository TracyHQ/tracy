// The write step's closing rule (product owner rule, 2026-11-07): no slot or frame the plan keeps visible is handed over with its
// demo content. After the files are claimed and the hide stage has ordered its empties, every kept slot that holds no customer
// content climbs one ladder, once:
//   1. use what exists: a slot that has a value to send by now (a later file, a link, a picture the picture step accepted) is left
//      to it;
//   2. hidden: the slot is emptied with the existing contract empty, at the smallest unit that leaves no orphan: a slot of a list
//      row goes with every slot of its row (a stat card with its label, a quote with its signature), a slot of no row alone;
//   3. demo-remains: no unit slot can be emptied (the kit keeps it, or the site says it cannot), and the line says so.
// "No customer content" means: a text or picture slot of a kept block no file fills (the writer returned it, or left it out of
// the copy), a picture frame the picture step left without a picture, or a painted frame the write step could not draw (no brand
// file to colour it, a drawing that failed). Every resolution is a line in `report.closing`.
import { contentMapKey } from '../lib/site-copy/contract-mapping.js'
import { kitSlotIndex } from '../lib/template-kit/kit-slots.js'
import { slotCanEmpty } from './contract-write.js'

const each = (value) => (Array.isArray(value) ? value : [])
/** Slot types that print as content; an icon, a url or a setting goes with its row, never alone. */
const SHOWN = new Set(['text', 'image'])

/** The slot ids of the smallest unit that holds `id`: its list row, else itself. */
function unitOf(kit, id) {
  for (const block of each(kit?.blocks))
    for (const list of each(block?.lists)) {
      const row = each(list?.rows).find((r) => each(r?.slots).some((s) => s?.id === id))
      if (row) return { unit: `${list.id}#${row.index ?? 0}`, ids: each(row.slots).map((s) => s.id) }
      if (each(list?.rowSlots).some((s) => s?.id === id) && !each(list?.rows).length)
        return { unit: list.id, ids: each(list.rowSlots).map((s) => s.id) }
    }
  return { unit: id, ids: [id] }
}

/**
 * The slots the closing rule empties, and its lines.
 * @param {{ kit: object, reading: object | null, unowned: { slot: string, type?: string | null }[],
 *   unaddressable: { slot: string, owner?: string | null, reason?: string }[], returns?: { slot: string, reason?: string }[],
 *   held?: string[], changes: Record<string, string>, emptySlots: string[],
 *   undrawn?: { slot: string, reason?: string }[] }} input `changes` what will be sent and `held`
 *   the slots an earlier run wrote (rung 1), `emptySlots` what
 *   the hide stage already empties, `undrawn` the painted frames the picture stage could not draw
 * @returns {{ emptySlots: string[], dropped: string[], lines: object[] }} `emptySlots` to add, `dropped` change keys the
 *   unit's emptying takes back (a label written beside a number nobody gave), `lines` one per resolved slot
 */
export function closeDemoLeft({
  kit,
  reading,
  unowned,
  unaddressable,
  returns = [],
  held = [],
  changes,
  emptySlots,
  undrawn = []
}) {
  const heldSlots = new Set(held)
  const kitSlots = kitSlotIndex(kit)
  const onSite = new Map(each(reading?.slots).map((s) => [s?.key, s]))
  const returned = new Map(each(returns).map((r) => [r?.slot, r?.reason]))
  const empties = new Set(emptySlots)
  const why = new Map()
  for (const u of each(unowned))
    if (SHOWN.has(u?.type ?? kitSlots.get(u?.slot)?.type))
      why.set(
        u.slot,
        returned.has(u.slot)
          ? `the writer returned this slot (${returned.get(u.slot)})`
          : 'no file fills this slot of a kept block'
      )
  for (const item of each(unaddressable))
    if (item?.owner === 'picture' && kitSlots.has(item.slot))
      why.set(item.slot, 'the picture step left this frame without a picture')
  for (const item of each(undrawn))
    if (typeof item?.slot === 'string')
      why.set(item.slot, `this painted frame was not drawn (${item.reason ?? 'no reason given'})`)
  const add = []
  const dropped = []
  const lines = []
  const done = new Set()
  for (const [slot, reason] of why) {
    const key = contentMapKey(slot)
    if (done.has(slot) || empties.has(key)) continue
    // Rung 1: something already speaks for it.
    if ((typeof changes[key] === 'string' && changes[key] !== '') || heldSlots.has(slot)) {
      lines.push({
        slot,
        key,
        rung: 'used',
        reason: `${reason}; a value is sent for it, or an earlier run wrote it`
      })
      done.add(slot)
      continue
    }
    const { unit, ids } = unitOf(kit, slot)
    const keys = ids.map((id) => ({ id, key: contentMapKey(id) }))
    const nativeUnit = keys.map(({ key: k }) => onSite.get(k))
    const hideable = keys.every(
      ({ id, key: k }) => slotCanEmpty(onSite.get(k), nativeUnit) && kitSlots.get(id)?.canHide !== false
    )
    for (const { id, key: k } of keys) {
      done.add(id)
      if (!hideable) {
        if (id === slot)
          lines.push({
            slot,
            key,
            unit,
            rung: 'demo-remains',
            reason: `${reason}; the kit or the site does not let ${unit} be emptied, so the demo content remains on the site`
          })
        continue
      }
      if (!empties.has(k)) add.push(k)
      if (k in changes) dropped.push(k)
      lines.push({
        slot: id,
        key: k,
        unit,
        rung: 'hidden',
        reason:
          id === slot
            ? `${reason}, so ${unit} was emptied rather than show its demo content`
            : `it goes with ${slot} in ${unit}: ${reason}`
      })
    }
  }
  return { emptySlots: add, dropped, lines }
}

/** The report lines with the closing rule's outcome on each slot it emptied, or left with its demo. */
export function withClosing(lines, closing, emptied) {
  if (!closing?.length) return lines
  const byKey = new Map(closing.map((c) => [c.key, c]))
  const bySlot = new Map(closing.map((c) => [c.slot, c]))
  const gone = new Set(emptied)
  const out = lines.map((line) => {
    const c = (typeof line.key === 'string' && byKey.get(line.key)) || bySlot.get(line.slot)
    if (!c || c.rung === 'used') return line
    const { ordered: _sent, ...rest } = line
    if (c.rung === 'hidden' && gone.has(c.key))
      return { ...rest, status: 'hidden', closing: 'hidden', reason: c.reason }
    return { ...line, status: 'failed', closing: 'demo-remains', reason: c.reason }
  })
  return out
}
