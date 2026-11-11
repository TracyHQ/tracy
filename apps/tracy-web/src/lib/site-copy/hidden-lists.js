// Compile an explicit hidden-list decision to its declared leaf slots. No native slot or removal capability is inferred.
const each = (value) => (Array.isArray(value) ? value : [])
const named = (value) => typeof value === 'string' && value.trim() !== ''

/** Exact children only; an unresolved field invalidates the entire list rather than yielding a partial hide. */
function childrenOf(list) {
  const ids = new Set()
  const types = Object.create(null)
  let complete = list.rowKind === 'slots'
  const visit = (slot) => {
    if (Array.isArray(slot?.slots) && slot.slots.length) {
      slot.slots.forEach(visit)
    } else if (named(slot?.id) && ['text', 'url', 'image'].includes(slot.type)) {
      if (ids.has(slot.id) && types[slot.id] !== slot.type) complete = false
      ids.add(slot.id)
      types[slot.id] = slot.type
    } else complete = false
  }
  for (const slot of each(list.rowSlots)) visit(slot)
  for (const row of each(list.rows)) {
    if (!Array.isArray(row?.slots) || !row.slots.length) complete = false
    else row.slots.forEach(visit)
  }
  return complete && ids.size ? { children: [...ids], types } : null
}

/** A map from hidden list id to its complete unit, or null when the declaration conflicts or cannot be compiled. */
export function hiddenListsOf(plan, kit) {
  const blocks = new Map(each(kit?.blocks).map((block) => [block?.id, block]))
  const decisions = [
    ...each(plan?.sharedBlocks),
    ...each(plan?.pages)
      .filter((page) => page?.decision === 'keep')
      .flatMap((page) => each(page?.blocks))
  ].filter((decision) => decision?.decision !== 'hide')
  const kept = new Set()
  for (const decision of decisions) {
    const entries = [
      ...each(decision?.copy),
      ...each(decision?.lists).flatMap((list) => each(list?.items).flatMap((item) => each(item?.copy)))
    ]
    for (const entry of entries) if (named(entry?.slot)) kept.add(entry.slot)
    for (const list of each(decision?.lists)) if (named(list?.list)) kept.add(list.list)
    for (const link of each(decision?.links)) {
      if (named(link?.link)) kept.add(link.link)
      if (named(link?.labelSlot)) kept.add(link.labelSlot)
    }
    const pictures = [
      ...each(decision?.pictures),
      ...each(decision?.lists).flatMap((list) => each(list?.items).flatMap((item) => each(item?.pictures)))
    ]
    for (const picture of pictures) if (named(picture?.frame)) kept.add(picture.frame)
  }
  const out = new Map()
  for (const decision of decisions) {
    const lists = new Map(each(blocks.get(decision?.block)?.lists).map((list) => [list?.id, list]))
    for (const hidden of each(decision?.hiddenSlots)) {
      const list = lists.get(hidden?.slot)
      if (!list) continue
      const declaration = childrenOf(list)
      const children = declaration?.children
      const unit =
        children && !kept.has(list.id) && !children.some((id) => kept.has(id))
          ? { list: list.id, block: decision.block, ...declaration }
          : null
      // Repeated declarations of the same id must name the identical block and children.
      if (out.has(list.id) && JSON.stringify(out.get(list.id)) !== JSON.stringify(unit))
        out.set(list.id, null)
      else out.set(list.id, unit)
    }
  }
  const owners = new Map()
  const ambiguous = new Set()
  for (const [list, unit] of out)
    for (const child of unit?.children ?? []) {
      if (owners.has(child) && owners.get(child) !== list) {
        ambiguous.add(list)
        ambiguous.add(owners.get(child))
      } else owners.set(child, list)
    }
  for (const list of ambiguous) out.set(list, null)
  return out
}
