// Where a value of the write order lands (ticket #597): the mapping entry of an order field (a location, a fact or a
// derived link), and the record a location sits on, by the rules of `docs/references/ai-quickstart-contract.md`
// ("Copies and blocks written in place"). Pure.
//
//   a copy block's own record            the copy (one per placed block, or one for the site: `assign`)
//   the record of a block it holds       the held copy on the same page (`holds`, a plans container's tab label)
//   an in-place block's record           the store record itself, through the blank site contract
//   a site language string               the store record, through the blank site contract, once for every copy
//   a record the blank site removed      the record the build creates: the article of the item or page, the contact
//   `page`                               the page record the SEO entry names (a menu item or an article)
//   `settings`                           the site identity (site name, mail sender name)

const list = (value) => (Array.isArray(value) ? value : [])

/** The mapping entry of an order field at its scope: a location, `{fact}`, `{derived}`, or undefined. */
export function mappingEntryOf(mb, scope, field) {
  if (!mb) return undefined
  if (scope.level === 'block') return mb.fields?.[field]
  if (scope.level === 'item') {
    const entry = mb.itemFields?.[field]
    return Array.isArray(entry) ? entry[scope.index] : entry
  }
  const lists = scope.owner === 'item' ? mb.itemLists : mb.lists
  const entry = lists?.[scope.list]?.fields?.[field]
  if (!Array.isArray(entry)) return entry
  return list(entry[scope.parent])[scope.rank - 1]
}

/** Every place of the order with its scope and its parent item, in write order. */
export function placesWithScope(order) {
  const out = []
  for (const page of list(order.pages))
    for (const block of list(page.blocks)) {
      out.push({ page, block, place: block, scope: { level: 'block' } })
      for (const g of list(block.lists))
        for (const row of list(g.rows))
          out.push({
            page,
            block,
            place: row,
            scope: { level: 'row', owner: 'block', list: g.list, parent: 0, rank: row.rank }
          })
      for (const item of list(block.items)) {
        out.push({ page, block, item, place: item, scope: { level: 'item', index: item.index } })
        for (const g of list(item.lists))
          for (const row of list(g.rows))
            out.push({
              page,
              block,
              item,
              place: row,
              scope: { level: 'row', owner: 'item', list: g.list, parent: item.index, rank: row.rank }
            })
      }
    }
  return out
}

/** The key of the record a block writes on: its copy, its store record, or none (a created or layout block). */
export function blockRecordOf(kit, page, block) {
  const placement = kit.mapping.placements?.[block.block]
  const kind = kit.store.get(block.block)?.placement
  if (kind === 'copy' && placement?.entity)
    return placement.assign === 'page'
      ? { key: `copy:${page.id}.${block.id}`, init: copyInit(kit, block.block) }
      : { key: `copy:site.${block.block}`, init: copyInit(kit, block.block) }
  if (kind === 'in-place' && placement?.entity)
    return { key: `store:${placement.entity}`, init: storeInit(kit, placement.entity, block.block) }
  return null
}
const sourceIdOf = (kit, entity) => kit.mapping.entities?.[entity]?.sourceId ?? null
export const copyInit = (kit, blockId) => {
  const entity = kit.mapping.placements[blockId].entity
  return { kind: 'copy', recordKind: 'module', entity, block: blockId, sourceId: sourceIdOf(kit, entity) }
}
const storeInit = (kit, entity, blockId) => ({
  kind: 'store',
  recordKind: kit.mapping.entities?.[entity]?.kind ?? 'module',
  entity,
  block: blockId ?? kit.ownerOf.get(entity) ?? null,
  sourceId: sourceIdOf(kit, entity)
})

/**
 * The record a location of an order field lands on.
 * @returns {{key: string, init: object} | {skip: string}}
 */
export function targetOf(loc, { kit, site, page, block, item }) {
  const entity = loc.entity
  if (entity === 'page') return site.pageRecordOf(page)
  if (entity === 'settings') return { key: 'identity', init: { kind: 'identity', recordKind: 'identity' } }
  const declared = kit.mapping.entities?.[entity]
  const own = blockRecordOf(kit, page, block)
  const placement = kit.mapping.placements?.[block.block]
  if (own && placement?.entity === entity) return own
  if (list(placement?.holds?.blocks).some((b) => kit.mapping.placements[b]?.entity === entity)) {
    const held = site.heldOf(page, block, entity)
    return held ?? { skip: 'held_block_not_placed' }
  }
  if (declared?.created) {
    if (declared.kind === 'menuItem') return { skip: 'menu_item_title' }
    const subject = item?.data ?? site.subjectOf(page)
    return {
      key: `${declared.kind}:${subject}`,
      init: { kind: 'created', recordKind: declared.kind, subject }
    }
  }
  if (!declared) return { skip: 'entity_not_declared' }
  const owner = kit.ownerOf.get(entity)
  if (owner && kit.store.get(owner)?.placement === 'copy') return site.copyOfOwner(page, owner)
  if (!loc.slot) return { skip: 'kept_record_without_slot' }
  return { key: `store:${entity}`, init: storeInit(kit, entity) }
}
