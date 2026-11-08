// Card links to an item's own page (ADR 0044, the plan owns link targets). A list of person or item cards whose plan sends
// several cards to one item page (the template's demo has one profile page, and the plan kept it for one person) would make
// every other card open someone else's page. The page belongs to the card it names: the card whose name slot is the page's
// main heading, or whose name the page's title or heading holds. Every other card of that list is sent to the page that
// lists the items (the item page's parent in the plan) instead, and its line says why. Pure: nothing here reads or writes.
import { contentMapKey } from '../lib/site-copy/contract-mapping.js'

const each = (value) => (Array.isArray(value) ? value : [])
const wordsOf = (text) =>
  String(text ?? '')
    .replace(/\(\([^()]*\)\)/g, ' ')
    .replace(/<[^<>]*>/g, ' ')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

/** The list id each row slot of the kit belongs to. */
function listOfSlot(kit) {
  const lists = new Map()
  for (const block of each(kit?.blocks))
    for (const list of each(block?.lists))
      for (const row of each(list?.rows)) for (const slot of each(row?.slots)) lists.set(slot?.id, list.id)
  return lists
}

/** Whether every word of the card's name stands in the page's own words. */
const names = (label, pageWords) => {
  const words = wordsOf(label)
  return words.length > 0 && words.every((w) => pageWords.has(w))
}

/**
 * @param {{ claims: { slot: string, content: string, label?: string | null }[], kit: object, plan: object,
 *   taken: Record<string, string> }} input `taken`: what the files send, by content map key (the card names, the page title)
 * @returns {Map<string, { content: string | null, reason: string }>} by link slot: the page to send it to instead (null: none)
 */
export function foreignItemLinks({ claims, kit, plan, taken }) {
  const lists = listOfSlot(kit)
  const pages = new Map(each(kit?.pages).map((p) => [p?.id, p]))
  const kept = new Set(
    each(plan?.pages)
      .filter((p) => p?.decision === 'keep')
      .map((p) => p.id)
  )
  const groups = new Map()
  for (const claim of claims) {
    const list = lists.get(claim.slot)
    if (!list || !claim.label || !pages.has(claim.content)) continue
    const id = `${list} ${claim.content}`
    groups.set(id, [...(groups.get(id) ?? []), claim])
  }
  const out = new Map()
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const page = pages.get(group[0].content)
    const heading = page?.h1?.slot ?? null
    const pageWords = new Set(
      [page?.titleSlot, heading].filter(Boolean).flatMap((slot) => wordsOf(taken[contentMapKey(slot)]))
    )
    const owns = (claim) => claim.label === heading || names(taken[contentMapKey(claim.label)], pageWords)
    const owners = group.filter(owns)
    if (!owners.length || owners.length === group.length) continue
    const parentPath = String(page.path ?? '').replace(/\/[^/]+\/?$/, '') || '/'
    const parent = [...pages.values()].find((p) => p?.path === parentPath && kept.has(p.id)) ?? null
    for (const claim of group)
      if (!owners.includes(claim))
        out.set(claim.slot, {
          content: parent?.id ?? null,
          reason: `the plan sends this card to ${page.id}, which is the page of another card (${owners
            .map((o) => o.label)
            .join(
              ', '
            )}); ${parent ? `it leads to ${parent.id}, the page that lists them, instead` : 'no page lists them, so it is not written'}`
        })
  }
  return out
}
