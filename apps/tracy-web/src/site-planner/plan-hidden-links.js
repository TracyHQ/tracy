// Close link decisions already implied by a hidden list or a row the plan gives up. Reuse the writer's row
// selection so a named non-leading row stays kept. Missing links in visible rows still belong to the planner.
import { goneRowSlots } from '../lib/plan-rows.js'
import { decisionParts } from './plan-check/plan-index.js'

const each = (value) => (Array.isArray(value) ? value : [])
const idOf = (value) => (typeof value === 'string' ? value : value?.id)

export function withHiddenListLinks(plan, kit) {
  if (!plan || typeof plan !== 'object') return plan
  const blocks = new Map(each(kit?.blocks).map((block) => [block?.id, block]))
  let changed = false
  const close = (decision) => {
    if (decision?.decision !== 'keep') return decision
    const block = blocks.get(decision.block)
    if (!block) return decision
    const parts = decisionParts(decision)
    const hidden = new Set(parts.hidden.map((entry) => entry.slot))
    const decided = new Set([...hidden, ...parts.links.map((entry) => entry.link)])
    const filled = new Set([
      ...parts.copy.map((entry) => entry.slot),
      ...parts.pics.map((entry) => entry.frame),
      ...parts.links.map((entry) => entry.link)
    ])
    const safeLists = parts.lists.filter((list) => Number.isInteger(list.rows) && list.rows >= 0)
    const gone = goneRowSlots({
      plan: { sharedBlocks: [{ ...decision, lists: safeLists }] },
      kit,
      filled
    })
    // A slot must have one unambiguous row owner, and another explicit field in that row must not keep it alive.
    const membership = new Map()
    for (const list of each(block.lists)) {
      for (const row of each(list.rows)) {
        const ids = each(row.slots).map(idOf)
        for (const id of ids) {
          const owners = membership.get(id) ?? []
          owners.push({ list: list.id, ids })
          membership.set(id, owners)
        }
      }
    }
    const added = []
    for (const link of each(block.links)) {
      if (decided.has(link.id)) continue
      const owners = membership.get(link.id) ?? []
      if (owners.length !== 1 || owners[0].ids.some((id) => filled.has(id))) continue
      const parent = owners[0].list
      // A contradictory hidden-and-kept list needs a model decision rather than automatic reconciliation.
      const parentDecisions = parts.lists.filter((list) => list.list === parent)
      if (parentDecisions.length > 1 || (hidden.has(parent) && parentDecisions.length)) continue
      const parentHidden = hidden.has(parent)
      if (!parentHidden && !gone.has(link.id)) continue
      added.push({
        slot: link.id,
        why: `the containing list ${parent} or its row is explicitly hidden by the plan`
      })
      decided.add(link.id)
    }
    if (!added.length) return decision
    changed = true
    return { ...decision, hiddenSlots: [...parts.hidden, ...added] }
  }
  const sharedBlocks = each(plan.sharedBlocks).map(close)
  const pages = each(plan.pages).map((page) => {
    if (page?.decision !== 'keep') return page
    const blocks = each(page.blocks).map(close)
    return blocks.some((block, i) => block !== page.blocks[i]) ? { ...page, blocks } : page
  })
  return changed ? { ...plan, sharedBlocks, pages } : plan
}
