// A copy entry named under a block that does not own its slot (R01 "slot belongs to block X"), put right by code before
// the plan is checked: moved to the decision of the block that owns the slot on the same page (or in sharedBlocks), when
// that block is kept there; left out when that block already writes the slot. Anything else stays with the planner and
// R01: a slot id in no block of the kit (it may be a kit gap the planner should name), and a slot whose own block is not
// kept on the page. Pure: inputs in, new values out.
//
// Why: R01 on a slot in the wrong block was the failure a chain plan most often still had after its last fix round
// (dev: BXR London lat18, article-2.9 under block-165 instead of block-160; Arabian Tea House lat20, category-8.0
// under a blog page's body block). The fix rounds spend a model turn on what code can settle, and the plan step ends
// "failed, best version used". Only a block's own copy list is touched: list rows, hidden slots, pictures, links, a
// slot the kit marks unwritable and made-up fixed-text ids stay with the planner, as do blocks the kit does not have.
import { indexKit } from './plan-check/kit-index.js'

const arr = (x) => (Array.isArray(x) ? x : [])
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)

/**
 * @param {any} plan
 * @param {any} kit
 * @returns {any} the plan, the same object when nothing moved or went
 */
export function withSlotsInTheirBlocks(plan, kit) {
  if (!isObject(plan)) return plan
  const { blockIx, slotOwner, unwritable, navGroups, kitBlocks } = indexKit(isObject(kit) ? kit : {})
  const navSlots = new Map()
  for (const g of navGroups.values()) {
    const set = navSlots.get(g?.block) ?? new Set()
    for (const id of [g?.titleSlot, ...arr(g?.items).map((it) => it?.labelSlot)]) if (id) set.add(id)
    navSlots.set(g?.block, set)
  }
  const owns = (block, slot) =>
    slotOwner.get(slot) === block || blockIx.get(block)?.slots.has(slot) || navSlots.get(block)?.has(slot)
  const leftToPlanner = (block, slot) =>
    typeof slot !== 'string' ||
    !kitBlocks.has(block) ||
    unwritable.has(slot) ||
    slot.startsWith('fixedText:') ||
    owns(block, slot)

  let changed = false
  const shared = arr(plan.sharedBlocks).map((d) => (isObject(d) ? { ...d, copy: arr(d.copy).slice() } : d))
  const hasBlocks = (p) => isObject(p) && Array.isArray(p.blocks)
  const pages = arr(plan.pages).map((p) =>
    hasBlocks(p)
      ? { ...p, blocks: p.blocks.map((d) => (isObject(d) ? { ...d, copy: arr(d.copy).slice() } : d)) }
      : p
  )
  const keptIn = (list, block) => list.find((d) => isObject(d) && d.block === block && d.decision === 'keep')
  const settle = (decisions) => {
    for (const d of decisions) {
      if (!isObject(d) || !Array.isArray(d.copy)) continue
      const stays = []
      for (const entry of d.copy) {
        const slot = entry?.slot
        if (!isObject(entry) || leftToPlanner(d.block, slot)) {
          stays.push(entry)
          continue
        }
        const owner = slotOwner.get(slot)
        const target = owner ? (keptIn(decisions, owner) ?? keptIn(shared, owner)) : null
        if (!target) {
          stays.push(entry)
          continue
        }
        changed = true
        if (!target.copy.some((c) => c?.slot === slot)) target.copy.push(entry)
      }
      d.copy = stays
    }
  }
  for (const p of pages) if (hasBlocks(p)) settle(p.blocks)
  settle(shared)
  if (!changed) return plan
  const restore = (d, before) => (isObject(d) && !Array.isArray(before?.copy) ? withoutCopy(d) : d)
  return {
    ...plan,
    ...(Array.isArray(plan.sharedBlocks)
      ? { sharedBlocks: shared.map((d, i) => restore(d, plan.sharedBlocks[i])) }
      : {}),
    ...(Array.isArray(plan.pages)
      ? {
          pages: pages.map((p, i) =>
            hasBlocks(p) ? { ...p, blocks: p.blocks.map((d, j) => restore(d, plan.pages[i].blocks[j])) } : p
          )
        }
      : {})
  }
}

// A decision that had no copy list before keeps none (an empty one would be a change of its own).
function withoutCopy(d) {
  if (d.copy.length) return d
  const { copy: _copy, ...rest } = d
  return rest
}
