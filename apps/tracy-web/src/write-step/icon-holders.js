// Icons a template draws as links inside a slot of words that holds no words of its own: a person card's social icons
// (JA Boxing's trainers: module-163.12 and module-178.24 hold `<div class="list-social">` and four `<a href="#">` icons,
// nothing else). No door rewrites or takes out one address among words (link-lines.js, hide-plan.js), so a plan that
// sends such an icon somewhere, or hides it alone, cannot be done: dev, BXR London on JA Boxing 16/11/2026, 36 read-back
// and 13 unaddressable final-check blocks, every one a trainer's icon. The slot that holds them can be emptied (the
// contract's hide review lists it), and its icons leave with it (hide-plan.js carriedLink).
//
// So before the write step reads the plan's claims, each such icon the plan decides becomes a hide, and its holder is
// hidden with it: the card keeps its name, picture and words, and shows no icon that leads nowhere or to the template's
// demo. A holder the plan writes itself stays the plan's (its new words take the icons out), and a slot with any words
// besides its links is never emptied here. Read from the contract's content map, the same samples the link doors read.
import { contentMapKey } from '../lib/site-copy/contract-mapping.js'
import { linkDoors } from './link-doors.js'

const each = (value) => (Array.isArray(value) ? value : [])
// Content map markup is written in doubled round brackets; a page read gives real tags. The whole sample is matched
// as tags and white space, not stripped of its tags and compared with '': a check, not a sanitizer.
const LINKS_ONLY = /^(?:\(\([^)]*\)\)|<[^>]*>|&nbsp;|\s)*$/
const ANCHOR = /\(\(a[\s)]|<a[\s>]/i

/** Whether a holder's sample is links only: tags and white space, no word a visitor reads. */
export function linksOnly(sample) {
  const text = String(sample ?? '')
  return ANCHOR.test(text) && LINKS_ONLY.test(text)
}

const WHY_LINK = (holder) =>
  `an icon drawn inside ${holder}, a slot that holds only the template's icons: no door changes one address among words, so it leaves with them`
const WHY_HOLDER = (links) =>
  `holds only the template's icons (${links.join(', ')}), which no door can point elsewhere: emptied so none leads nowhere`

/**
 * @param {any} plan
 * @param {{ kit: any, contentMap: any }} input
 * @returns {{ plan: any, moved: { block: string, holder: string, links: string[] }[] }} the same plan when nothing moved
 */
export function withIconHoldersHidden(plan, { kit, contentMap }) {
  const slots = each(contentMap?.slots)
  if (!plan || typeof plan !== 'object' || !kit || !slots.length) return { plan, moved: [] }
  const doorOf = linkDoors({ kit, reading: { slots }, rows: [], contentMap })
  const byKey = new Map(slots.map((s) => [s?.key, s]))
  const kitSlotOf = new Map()
  for (const block of each(kit.blocks)) {
    const ids = [
      ...each(block?.slots).map((s) => s?.id),
      ...each(block?.lists).flatMap((l) => each(l?.rows).flatMap((r) => each(r?.slots).map((s) => s?.id)))
    ]
    for (const id of ids) if (typeof id === 'string') kitSlotOf.set(contentMapKey(id), id)
  }
  const kitLinks = new Map(
    each(kit.blocks).flatMap((b) => each(b?.links).map((l) => [l?.id, { link: l, block: b?.id }]))
  )
  const moved = []
  const fix = (decision) => {
    if (!decision || typeof decision !== 'object' || decision.decision !== 'keep') return decision
    const written = new Set(each(decision.copy).map((c) => c?.slot))
    const decided = [
      ...each(decision.links).map((l) => l?.link),
      ...each(decision.hiddenSlots).map((h) => h?.slot)
    ].filter((id) => kitLinks.get(id)?.block === decision.block)
    const holders = new Map()
    for (const id of new Set(decided)) {
      let door
      try {
        door = doorOf(id)
      } catch {
        continue
      }
      if (door?.via !== 'words') continue
      const holder = kitSlotOf.get(door.key)
      if (!holder || written.has(holder) || !linksOnly(byKey.get(door.key)?.sample)) continue
      holders.set(holder, [...(holders.get(holder) ?? []), id])
    }
    if (!holders.size) return decision
    const links = new Set([...holders.values()].flat())
    const hidden = new Set(each(decision.hiddenSlots).map((h) => h?.slot))
    for (const [holder, ids] of holders) moved.push({ block: decision.block, holder, links: ids })
    return {
      ...decision,
      links: each(decision.links).filter((l) => !links.has(l?.link)),
      hiddenSlots: [
        ...each(decision.hiddenSlots),
        ...[...holders].flatMap(([holder, ids]) => [
          ...ids.filter((id) => !hidden.has(id)).map((id) => ({ slot: id, why: WHY_LINK(holder) })),
          ...(hidden.has(holder) ? [] : [{ slot: holder, why: WHY_HOLDER(ids) }])
        ])
      ]
    }
  }
  const sharedBlocks = Array.isArray(plan.sharedBlocks) ? plan.sharedBlocks.map(fix) : plan.sharedBlocks
  const pages = Array.isArray(plan.pages)
    ? plan.pages.map((page) => {
        if (!page || page.decision !== 'keep' || !Array.isArray(page.blocks)) return page
        const blocks = page.blocks.map(fix)
        return blocks.some((b, i) => b !== page.blocks[i]) ? { ...page, blocks } : page
      })
    : plan.pages
  if (!moved.length) return { plan, moved }
  return { plan: { ...plan, sharedBlocks, pages }, moved }
}
