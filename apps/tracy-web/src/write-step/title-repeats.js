// A heading that repeats its page's title in the demo repeats the page's new title. A template can print an article's name
// twice: as the title, and again from a field of its own (JA Boxing's class page prints `classes-title` as its hero, "Beginner
// <span>Boxing</span>", while the kit reads that field only on the listing cards), or from a module heading of the page
// ("PRIVATE<br/>TRAINING"). The writer renames the page through its title slot (`pages[].titleSlot`), and the repeat no file
// speaks for keeps the template's name. Before (dev lat28 and lat29, 22–23/11/2026), JA Boxing's three renamed class pages
// printed "Beginner Boxing", "Private Training" and "Advanced Boxing" over their new names.
//
// Only a text slot of the page with a heading or title role, which no file claims, whose demo words are the demo words of the
// page's title (markup, spaces and case aside) takes the title's words; nothing here writes: it returns twins as the button
// twins do (kit-buttons.js), one claim each.
import { contentMapKey } from '../lib/site-copy/contract-mapping.js'

const each = (value) => (Array.isArray(value) ? value : [])
const HEADING = /(?:heading|title)$/
const wordsOf = (text) =>
  String(text ?? '')
    .replace(/\(\([^()]*\)\)|<[^<>]*>/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()

/**
 * Every slot a kit block holds: its own, its list rows' and its row pattern's; an items list (an article listing) keeps one
 * slot per item under each field, which gives them its type and role.
 */
const slotsOf = (block) => [
  ...each(block?.slots),
  ...each(block?.lists).flatMap((l) => [
    ...each(l?.rowSlots).flatMap((field) =>
      Array.isArray(field?.slots)
        ? field.slots.map((s) => ({ type: field.type, role: field.role, ...s }))
        : [field]
    ),
    ...each(l?.rows).flatMap((r) => each(r?.slots))
  ])
]

/**
 * @param {{ plan: object, kit: object, contentMap: { slots?: object[] } | null, claims: object[] }} input
 * @returns {{ claims: object[], twins: Map<string, string> }} `twins` repeating slot -> the title slot whose words it takes
 */
export function titleRepeatTwins({ plan, kit, contentMap, claims }) {
  const filed = new Map()
  for (const c of each(claims)) if (!filed.has(c?.slot)) filed.set(c.slot, c)
  const sampleOf = new Map(each(contentMap?.slots).map((s) => [s?.key, s?.sample]))
  const blocks = new Map(each(kit?.blocks).map((b) => [b?.id, b]))
  const kept = new Set(
    each(plan?.pages)
      .filter((p) => p?.decision === 'keep')
      .map((p) => p.id)
  )
  const out = []
  const twins = new Map()
  for (const page of each(kit?.pages)) {
    const title = page?.titleSlot
    if (!kept.has(page?.id) || typeof title !== 'string') continue
    const written = filed.get(title)
    const demo = wordsOf(sampleOf.get(contentMapKey(title)))
    if (written?.kind !== 'text' || !demo) continue
    // The page's own slots, and every slot of the title's own entity wherever the kit read it: a field of the article is one
    // stored value, printed on its page even where the kit only saw it on a listing card.
    const ids = new Set(Object.values(page.blocks ?? {}).flatMap((list) => each(list)))
    const entity = contentMapKey(title).slice(0, contentMapKey(title).lastIndexOf('.') + 1)
    const candidates = [
      ...[...ids].flatMap((id) => slotsOf(blocks.get(id))),
      ...[...blocks.values()].flatMap(slotsOf).filter((s) => contentMapKey(s?.id ?? '').startsWith(entity))
    ]
    for (const slot of candidates) {
      if (typeof slot?.id !== 'string' || slot.id === title || filed.has(slot.id) || twins.has(slot.id))
        continue
      if (slot.type !== 'text' || !HEADING.test(String(slot.role ?? ''))) continue
      if (wordsOf(sampleOf.get(contentMapKey(slot.id)) ?? slot.sample) !== demo) continue
      twins.set(slot.id, title)
      out.push({ ...written, slot: slot.id })
    }
  }
  return { claims: out, twins }
}

/**
 * A stored field that repeats a written heading's demo words, in the same entity, takes the heading's new words. The kit reads
 * a printed heading as one slot when two fields hold the same words, and the page may print the other: JA Boxing's memberships
 * section prints its `main-section` ("Memberships<br/><span>workshops</span>"), while the kit took the module title for it.
 * Before (dev lat30, 23/11/2026) the written title was printed nowhere and the demo heading stayed on /memberships.
 * Only a stored field no file claims, of type text, whose demo words are those of a written slot with a heading or title role.
 * @param {{ kit: object, contentMap: { slots?: object[] } | null, claims: object[] }} input
 * @returns {{ claims: object[], twins: Map<string, string> }}
 */
export function storedRepeatTwins({ kit, contentMap, claims }) {
  const filed = new Map()
  for (const c of each(claims)) if (!filed.has(c?.slot)) filed.set(c.slot, c)
  const byKey = new Map(each(contentMap?.slots).map((s) => [s?.key, s]))
  const roles = new Map()
  for (const b of each(kit?.blocks))
    for (const s of slotsOf(b)) if (typeof s?.id === 'string') roles.set(s.id, s.role)
  const entityOf = (key) => key.slice(0, key.lastIndexOf('.'))
  // The written headings by entity and demo words.
  const written = new Map()
  for (const [slot, c] of filed) {
    if (c?.kind !== 'text' || !HEADING.test(String(roles.get(slot) ?? ''))) continue
    const key = contentMapKey(slot)
    const demo = wordsOf(byKey.get(key)?.sample)
    if (demo) written.set(`${entityOf(key)} ${demo}`, c)
  }
  const out = []
  const twins = new Map()
  for (const field of each(kit?.storedFields)) {
    const slot = field?.slot
    if (typeof slot !== 'string' || filed.has(slot) || twins.has(slot)) continue
    const key = contentMapKey(slot)
    if (byKey.get(key)?.type !== 'text') continue
    const source = written.get(`${entityOf(key)} ${wordsOf(byKey.get(key)?.sample)}`)
    if (!source || source.slot === slot) continue
    twins.set(slot, source.slot)
    out.push({ ...source, slot })
  }
  return { claims: out, twins }
}
