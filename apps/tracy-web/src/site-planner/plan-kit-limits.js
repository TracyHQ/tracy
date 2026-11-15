// After the model, before the checker: the planner spec says each copy entry carries "maxCharacters copied from the
// kit so the writer knows the room". Copying a number needs no judgement, yet a planner that leaves it out pays a whole
// fix round for it (Central Padel 12/11/2026: 53 of round 0's R06 failures, every one "maxCharacters is missing").
// So a kept decision's copy entry, its own or a list row's, whose maxCharacters is missing, null or not a number gets
// the kit's limit for its slot: the same limit R06 reads (plan-check/kit-index.js slotLimit). An entry that names a
// number keeps it, so R06 still fails one above the kit's limit; a slot the kit gives no limit is left alone.
// The writer reads the smaller of the kit's and the plan's limit (site-writer/plan-labels.js), so the room it is told
// does not change. Returns the same plan when nothing was missing.
import { indexKit } from './plan-check/kit-index.js'

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/**
 * @param {any} plan
 * @param {any} kit
 */
export function withKitCharacterLimits(plan, kit) {
  if (!isObject(plan) || !isObject(kit)) return plan
  const { slotLimit } = indexKit(kit)
  if (!slotLimit.size) return plan
  let changed = false
  const fillCopy = (copy) => {
    if (!Array.isArray(copy)) return copy
    let filled = false
    const out = copy.map((entry) => {
      if (!isObject(entry) || typeof entry.maxCharacters === 'number') return entry
      const limit = slotLimit.get(entry.slot)
      if (typeof limit !== 'number') return entry
      filled = true
      return { ...entry, maxCharacters: limit }
    })
    return filled ? out : copy
  }
  const fill = (decision) => {
    if (!isObject(decision) || decision.decision !== 'keep') return decision
    const copy = fillCopy(decision.copy)
    let listsChanged = false
    const lists = Array.isArray(decision.lists)
      ? decision.lists.map((list) => {
          if (!isObject(list) || !Array.isArray(list.items)) return list
          let itemsChanged = false
          const items = list.items.map((item) => {
            if (!isObject(item)) return item
            const itemCopy = fillCopy(item.copy)
            if (itemCopy === item.copy) return item
            itemsChanged = true
            return { ...item, copy: itemCopy }
          })
          if (!itemsChanged) return list
          listsChanged = true
          return { ...list, items }
        })
      : decision.lists
    if (copy === decision.copy && !listsChanged) return decision
    changed = true
    return {
      ...decision,
      ...(copy !== decision.copy ? { copy } : {}),
      ...(listsChanged ? { lists } : {})
    }
  }
  const sharedBlocks = Array.isArray(plan.sharedBlocks) ? plan.sharedBlocks.map(fill) : plan.sharedBlocks
  const pages = Array.isArray(plan.pages)
    ? plan.pages.map((page) => {
        if (!isObject(page) || page.decision === 'drop' || !Array.isArray(page.blocks)) return page
        const blocks = page.blocks.map(fill)
        return blocks.some((block, i) => block !== page.blocks[i]) ? { ...page, blocks } : page
      })
    : plan.pages
  if (!changed) return plan
  return {
    ...plan,
    ...(Array.isArray(sharedBlocks) ? { sharedBlocks } : {}),
    ...(Array.isArray(pages) ? { pages } : {})
  }
}
