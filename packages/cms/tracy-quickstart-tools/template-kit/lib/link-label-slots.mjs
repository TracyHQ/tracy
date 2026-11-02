// Every link whose shown words a slot prints names that slot as its label (`labelId`), so a planner who rewrites the
// slot knows the link's words change with it, and the other way round. The slot is found in this order: the text slot
// of the link's own address group (a button's label and address are one row of the content map), a slot the block
// declares, a slot of the block's own entities, and last the one content map slot with those words (an item's title
// on a listing that links to the item). Words two unrelated slots share are a coincidence and pick nothing; words
// no slot prints (a CMS string such as "Read more") are the template's and need no label slot. Words without a letter
// (a phone number) pick only a slot of the link's own address group or block: a number alone proves nothing wider.
import { normText } from '../../content-coverage/lib/normalize.mjs'
import { neutralKey } from './ids.mjs'
import { declaredIn } from './page-coverage.mjs'

const LABEL_ROLE = /(_label|\.title|\.name)$/
const hasLetters = (s) => /\p{L}/u.test(s)
const hasDigits = (s) => /\p{N}/u.test(s)

/** A resolver: (block, link, declared ids of the block, ids its links already name) -> the label slot id, or null. */
function labelResolver(map) {
  const text = (map.slots ?? []).filter((s) => s.type === 'text')
  const byWords = new Map()
  for (const s of text) {
    const n = normText(s.sample ?? '')
    if (n) byWords.set(n, [...(byWords.get(n) ?? []), s])
  }
  const urlGroup = new Map(
    (map.slots ?? [])
      .filter((s) => s.type === 'url' && s.group?.id)
      .map((s) => [neutralKey(s.key), s.group.id])
  )
  // Label roles first, then the order given; a slot another link of the block already names is taken last, so
  // links repeating the same words (a "Select plan" button on each tab) take each its own twin slot.
  const first = (list, used) => {
    const order = [...list.filter((s) => LABEL_ROLE.test(s.role ?? '')), ...list]
    return order.find((s) => !used.has(neutralKey(s.key))) ?? order[0] ?? null
  }
  return (b, l, declared, used = new Set()) => {
    const n = normText(l.label ?? '')
    const letters = hasLetters(n)
    if (!n || (!letters && !hasDigits(n))) return null
    const same = byWords.get(n) ?? []
    if (!same.length) return null
    const group = urlGroup.get(l.id)
    // The block's declared slots, then those of its own entities: one list, so a twin of either kind is free.
    const near = [
      ...same.filter((s) => declared.has(neutralKey(s.key))),
      ...same.filter((s) => s.entity === b.source?.entity || (b.source?.contains ?? []).includes(s.entity))
    ]
    const pick =
      (group ? same.find((s) => s.group?.id === group) : null) ??
      first(near, used) ??
      (letters && same.length === 1 ? same[0] : null)
    return pick ? neutralKey(pick.key) : null
  }
}

/** Sets `labelId` on every link of the kit that shows a slot's words and names none. Returns how many were set. */
export function linkLabelSlots(kit, map) {
  const resolve = labelResolver(map)
  const declared = declaredIn(kit)
  let set = 0
  for (const b of kit.blocks) {
    const used = new Set((b.links ?? []).map((l) => l.labelId).filter(Boolean))
    for (const l of b.links ?? []) {
      if (l.labelId) continue
      const id = resolve(b, l, declared.get(b.id), used)
      if (id) {
        l.labelId = id
        used.add(id)
        set++
      }
    }
  }
  return set
}

/**
 * Gate part: links that show a slot's words but name no label slot. Each one is a failure, named by block, link and
 * the slot it should name.
 * @param {{kit: object, map: object, fail: Function}} o
 * @returns {number}
 */
export function linksWithoutLabelSlot({ kit, map, fail }) {
  const resolve = labelResolver(map)
  const declared = declaredIn(kit)
  let missing = 0
  for (const b of kit.blocks)
    for (const l of b.links ?? []) {
      if (l.labelId) continue
      const id = resolve(b, l, declared.get(b.id))
      if (!id) continue
      missing++
      fail(
        'linksWithoutLabelSlot',
        `blocks[${b.id}].links[${l.id}] ${id}`,
        `the link "${String(l.label).slice(0, 50)}" shows the words of ${id} but names no label slot`
      )
    }
  return missing
}
