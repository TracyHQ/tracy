// `site.navigationGroups`: every menu block of the content map (`menuBlocks`, keyed by block), each item with its
// label, the most characters the label fits, its target and whether the target answers. What a footer column holds
// (`holds`, `itemsOf`), read on the pages, is joined in by block; a link column the pages show that is no menu block
// (a list in free HTML) is kept as read. Pure.
import { neutralKey } from '../ids.mjs'

/** A menu's own order is not in the map when `orderFrom` is `item-id`: the items are in id order, a stand-in. */
export const STAND_IN_ORDER = 'item-id'

function itemOf(i) {
  const { kind, page, path, alive, status } = i.target ?? {}
  return {
    item: i.item,
    level: i.level,
    parent: i.parent ?? null,
    type: i.type,
    label: i.label?.text ?? null,
    labelSlot: i.label?.slot ?? null,
    maxCharacters: i.label?.maxCharacters ?? null,
    limitFrom: i.label?.limitFrom ?? null,
    target: { kind: kind ?? 'none', ...(page ? { page } : {}), ...(path ? { path } : {}) },
    alive: alive ?? null,
    status: status ?? null
  }
}

/**
 * @param {{menuBlocks?: Record<string, object>}} map the content map
 * @param {object[]} readGroups footer link columns read on the pages (`buildNavigationGroups`)
 * @returns {{navigationGroups: object[], errors: object[]}}
 */
export function menuNavigationGroups(map, readGroups = []) {
  const errors = []
  const blocks = Object.values(map.menuBlocks ?? {})
  if (!map.menuBlocks)
    errors.push({
      kind: 'missing',
      field: 'site.navigationGroups',
      reason: 'the content map has no menuBlocks; only the link columns read on the pages are listed'
    })
  const readBy = new Map(readGroups.map((g) => [g.block, g]))
  const groups = blocks.map((b) => {
    const id = neutralKey(b.block)
    const read = readBy.get(id)
    readBy.delete(id)
    const items = (b.items ?? []).map(itemOf)
    const g = {
      id: `nav-${id}`,
      from: 'menu',
      block: id,
      menu: b.menu ?? null,
      titleSlot: b.titleSlot ? neutralKey(b.titleSlot) : null,
      levels: { start: b.startLevel ?? null, end: b.endLevel ?? null },
      orderFrom: b.orderFrom ?? null,
      ...(b.orderFrom === STAND_IN_ORDER
        ? { orderNote: 'stand-in order: items in id order, not the order the menu sets' }
        : {}),
      heading: read?.heading ?? null,
      holds: read?.holds ?? null,
      ...(read?.itemsOf ? { itemsOf: read.itemsOf } : {}),
      items
    }
    for (const [n, it] of items.entries())
      if (it.maxCharacters == null)
        errors.push({
          kind: 'missing',
          field: `site.navigationGroups[${g.id}].items[${n}].maxCharacters`,
          reason: 'the content map gives no label limit for this menu item'
        })
    return g
  })
  const pageOnly = [...readBy.values()].map((g) => ({ ...g, from: 'page' }))
  return { navigationGroups: [...groups, ...pageOnly], errors }
}
