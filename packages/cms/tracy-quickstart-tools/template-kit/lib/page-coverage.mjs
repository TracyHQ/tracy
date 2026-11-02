// Coverage gate parts read against the page itself (the read pass's readings), not against what the kit already
// declared: every element that prints a block's own content is a slot of its own, and every clickable element whose
// label is a slot says what it opens. Both read only the kit, the content map and the readings, so they judge a kit
// built by any version of the generator.
import { normText } from '../../content-coverage/lib/normalize.mjs'
import { neutralKey } from './ids.mjs'

const hasLetters = (s) => /\p{L}/u.test(s)

/** Every slot id a block declares in any place, and the slots other blocks own but name this block as showing. */
export function declaredIn(kit) {
  const out = new Map(kit.blocks.map((b) => [b.id, new Set()]))
  for (const b of kit.blocks) {
    const ids = out.get(b.id)
    const add = (x, also) => {
      if (!x?.id) return
      ids.add(x.id)
      for (const other of also ?? x.alsoShownIn ?? []) out.get(other)?.add(x.id)
    }
    for (const s of b.slots ?? []) add(s)
    for (const d of b.demoOwned ?? []) add(d)
    for (const l of b.lists ?? []) {
      for (const s of l.rowSlots ?? []) {
        add(s)
        for (const x of s.slots ?? []) add(x)
      }
      for (const r of l.rows ?? []) for (const s of r.slots ?? []) add(s)
    }
    for (const l of b.links ?? []) if (l.labelId) ids.add(l.labelId)
  }
  return out
}

/**
 * Elements printing a block's own content with no slot of their own: a text printed by k elements of a block whose
 * own entities hold n slots with those words needs min(k, n) distinct slots declared for the block. A text no slot of
 * the block's own entities holds (the template's words, another item's words) is not counted here. Each missing
 * slot is a failure, named by block and text.
 * @param {{kit: object, map: object, readings: Map<string, object>, fail: Function}} o
 * @returns {number}
 */
export function textsWithoutSlot({ kit, map, readings, fail }) {
  const words = new Map((map.slots ?? []).map((s) => [neutralKey(s.key), normText(s.sample ?? '')]))
  const byWords = new Map()
  for (const s of map.slots ?? []) {
    if (s.type !== 'text') continue
    const n = normText(s.sample ?? '')
    byWords.set(n, [...(byWords.get(n) ?? []), s])
  }
  const declared = declaredIn(kit)
  let missing = 0
  for (const b of kit.blocks) {
    const counts = readings.get(b.id)?.textCounts
    if (!counts) continue
    const entities = new Set([b.source?.entity, ...(b.source?.contains ?? [])].filter(Boolean))
    const fixed = new Set((b.fixedText ?? []).map((t) => normText(t.text)))
    for (const [text, k] of Object.entries(counts)) {
      const n = normText(text)
      if (!n || !hasLetters(n) || fixed.has(n)) continue
      const mine = (byWords.get(n) ?? []).filter((s) => entities.has(s.entity))
      if (!mine.length) continue
      const need = Math.min(k, mine.length)
      const have = [...declared.get(b.id)].filter((id) => words.get(id) === n).length
      if (have >= need) continue
      missing += need - have
      // The slots of the block's own entities holding the words that the block does not declare.
      const absent = mine.map((s) => neutralKey(s.key)).filter((id) => !declared.get(b.id).has(id))
      fail(
        'textsWithoutSlot',
        `blocks[${b.id}] ${absent.slice(0, need - have).join(' ')}`,
        `"${text.slice(0, 50)}" is printed by ${k} elements but ${have} slot${have === 1 ? '' : 's'} of the block hold it (${need} needed)`
      )
    }
  }
  return missing
}

/**
 * Clickable elements without a declared target: every clickable element the page shows without an address (a button,
 * a tab, a submit) whose label a slot of its block prints is a link of the block with an address or with what it
 * opens (`opens.kind`). Each one is a failure, named by block and label.
 * @param {{kit: object, map: object, readings: Map<string, object>, fail: Function}} o
 * @returns {number}
 */
export function linksWithoutTarget({ kit, map, readings, fail }) {
  const words = new Map((map.slots ?? []).map((s) => [neutralKey(s.key), normText(s.sample ?? '')]))
  const declared = declaredIn(kit)
  let missing = 0
  for (const b of kit.blocks) {
    const labels = new Set([...declared.get(b.id)].map((id) => words.get(id)).filter(Boolean))
    const opening = new Set(
      (b.links ?? []).filter((l) => l.target || l.opens?.kind).map((l) => normText(l.label ?? ''))
    )
    for (const c of readings.get(b.id)?.clickables ?? []) {
      const n = normText(c.label)
      if (!n || !labels.has(n) || opening.has(n)) continue
      missing++
      const slot = [...declared.get(b.id)].find((id) => words.get(id) === n)
      fail(
        'linksWithoutTarget',
        `blocks[${b.id}] ${slot}`,
        `the clickable "${c.label.slice(0, 50)}" has a label slot but no declared target`
      )
    }
  }
  return missing
}
