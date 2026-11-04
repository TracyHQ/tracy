// The slot each text link's label comes from. A menu link prints its menu item's title: the block's own menu is the
// menu block whose labels most of its links show, and within it the item with the link's label and address (the top
// level first), never another menu's item that happens to share the words. Any other link (a button) takes a
// button or menu label slot that prints exactly its words; a heading sharing the words is a coincidence. Labels
// shown in capitals by the style still match.
import { normText } from '../../content-coverage/lib/normalize.mjs'
import { neutralKey } from './ids.mjs'
import { canonicalPath } from './kit-paths.mjs'

const LABEL_ROLE = /(button|menu)_label$/
const words = (s) => normText(s ?? '')
const hasLetters = (s) => /\p{L}/u.test(words(s))

/**
 * Sets `labelId` (and for a menu link `menuItem` and `menu`) on each text link that has none. Returns the block's
 * menu block key, or null.
 * @param {{links: object[], menuBlocks?: object, mapSlots?: object[], siteUrl: string, aliasHosts?: string[]}} o
 */
export function labelLinks({ links, menuBlocks = {}, mapSlots = [], siteUrl, aliasHosts = [] }) {
  const shown = links.filter((l) => hasLetters(l.label))
  let menu = null
  let best = 1 // two links at least make a block's menu
  for (const [key, m] of Object.entries(menuBlocks)) {
    const labels = new Set((m.items ?? []).map((it) => words(it.label?.text)))
    const hits = shown.filter((l) => labels.has(words(l.label))).length
    if (hits > best) {
      best = hits
      menu = { key, items: m.items ?? [] }
    }
  }
  const pathOf = (p) => (p ? canonicalPath(p, siteUrl, aliasHosts) : null)
  for (const l of shown) {
    if (l.labelId) continue
    const w = words(l.label)
    const score = (it) => (pathOf(it.target?.path) === l.target ? 2 : 0) + (it.level === 1 ? 1 : 0)
    const it = (menu?.items ?? [])
      .filter((x) => x.label?.slot && words(x.label.text) === w)
      .sort((a, b) => score(b) - score(a))[0]
    if (it) {
      Object.assign(l, { labelId: neutralKey(it.label.slot), menuItem: it.item, menu: menu.key })
      continue
    }
    const same = mapSlots.filter((s) => s.type === 'text' && words(s.sample) === w)
    const pick = same.find((s) => LABEL_ROLE.test(s.role ?? ''))
    if (pick) l.labelId = neutralKey(pick.key)
  }
  return menu?.key ?? null
}

/**
 * Self-check: every link the kit reads as a menu item (`menuItem`) names its label slot, and every top-level item
 * of a site menu group (`groups`: site.navigationGroups) is the label of some link of the kit. Returns how many fail.
 * @param {{blocks: object[], groups?: object[], errors: object[]}} o
 */
export function menuLinkChecks({ blocks, groups = [], errors }) {
  let missing = 0
  const named = new Set()
  for (const b of blocks)
    for (const l of b.links ?? []) {
      if (l.labelId) named.add(l.labelId)
      else if (l.menuItem) {
        missing++
        errors.push({
          kind: 'menu-link-without-label-slot',
          field: `blocks[${b.id}].links[${l.id}]`,
          reason: `the menu link "${String(l.label ?? '').slice(0, 40)}" names no slot its label comes from`
        })
      }
    }
  for (const g of groups)
    for (const it of g.items ?? []) {
      if (it.level !== 1 || !it.labelSlot || named.has(it.labelSlot)) continue
      missing++
      errors.push({
        kind: 'menu-link-without-label-slot',
        field: `site.navigationGroups[${g.id}].items[${it.label}]`,
        reason: `the top-level menu item "${it.label}" (${it.labelSlot}) is the label of no link of the kit`
      })
    }
  return missing
}

/**
 * What else changes when a block slot is rewritten: the other blocks that show it (`alsoShownIn`), the pages whose
 * main title prints it, and the menus whose items print it (a menu item title is the label of every menu that lists
 * the item). Set as `alsoChanges` on the slot, only when something else changes.
 */
export function whatElseChanges(kit) {
  const titles = new Map()
  for (const p of kit.pages ?? [])
    if (p.titleSlot ?? p.h1?.slot) {
      const id = p.titleSlot ?? p.h1.slot
      titles.set(id, [...(titles.get(id) ?? []), p.id])
    }
  const menus = new Map()
  for (const g of kit.site?.navigationGroups ?? [])
    for (const it of g.items ?? [])
      if (it.labelSlot && !(menus.get(it.labelSlot) ?? []).includes(g.id))
        menus.set(it.labelSlot, [...(menus.get(it.labelSlot) ?? []), g.id])
  for (const b of kit.blocks ?? [])
    for (const s of b.slots ?? []) {
      const also = {
        blocks: s.alsoShownIn ?? [],
        pageTitles: titles.get(s.id) ?? [],
        menus: menus.get(s.id) ?? []
      }
      if (also.blocks.length || also.pageTitles.length || also.menus.length) s.alsoChanges = also
    }
}
