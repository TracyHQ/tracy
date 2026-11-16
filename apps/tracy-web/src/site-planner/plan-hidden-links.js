// Close link decisions already implied by a hidden list or a row the plan gives up. Reuse the writer's row
// selection so a named non-leading row stays kept. Missing links in visible rows still belong to the planner.
//
// Also implied: a link whose kit label slot (plan-check/kit-index.js linkLabelSlot, the slot R10b ties it to) the
// same decision hides, and does not write. The spec pairs the two ("hide its label slot, and the link with it"), so a
// planner that hid the label of a menu item, a button or a contact line and left its link undecided has already
// decided: the link goes. A label the decision also writes, a business-name slot (the brand step's), a label several
// kit blocks print (R24: such a label is written, never hidden, so hiding a link does not settle it; a menu item's
// label is not one, it leaves with its menu item) and a block whose links R10b leaves to its navigation group stay with
// the planner. Central Padel 12/11/2026, round 0: 4 of the 69 undecided links (two menu items, the contact form's
// submit button, an e-mail line), and round 1's last R10b failure.
import { goneRowSlots } from '../lib/plan-rows.js'
import { indexKit } from './plan-check/kit-index.js'
import { decisionParts } from './plan-check/plan-index.js'

const each = (value) => (Array.isArray(value) ? value : [])
const idOf = (value) => (typeof value === 'string' ? value : value?.id)

export function withHiddenListLinks(plan, kit) {
  if (!plan || typeof plan !== 'object') return plan
  const blocks = new Map(each(kit?.blocks).map((block) => [block?.id, block]))
  const { linkLabelSlot, navGroups, slotRole } = indexKit(kit && typeof kit === 'object' ? kit : {})
  const navBlocks = new Set([...navGroups.values()].map((group) => group?.block))
  const menuLabels = new Set(
    [...navGroups.values()].flatMap((group) => each(group?.items).map((it) => it?.labelSlot))
  )
  const isMenuLabel = (id) => menuLabels.has(id) || String(slotRole.get(id) ?? '').endsWith('menu_label')
  const nameSlots = new Set(
    each(kit?.site?.nameSlots)
      .filter((entry) => entry?.kind === 'slot')
      .map((entry) => entry.id)
  )
  const shared = sharedLabels(kit, linkLabelSlot)
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
    if (!navBlocks.has(block.id)) {
      const written = new Set(parts.copy.map((entry) => entry.slot))
      for (const link of each(block.links)) {
        if (decided.has(link.id)) continue
        const label = linkLabelSlot.get(link.id)
        if (!label || !hidden.has(label) || written.has(label) || nameSlots.has(label)) continue
        if (shared.has(label) && !isMenuLabel(label)) continue
        added.push({ slot: link.id, why: `its label slot ${label} is hidden by the plan` })
        decided.add(link.id)
      }
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

// Label slots printed in more than one kit block: by the links of several blocks, or a slot the kit also shows elsewhere
// (the same reading as R24's shared labels and menu labels, plan-check/rules-labels.js).
function sharedLabels(kit, linkLabelSlot) {
  const printedBy = new Map()
  const add = (label, block) => {
    if (!printedBy.has(label)) printedBy.set(label, new Set())
    printedBy.get(label).add(block)
  }
  for (const block of each(kit?.blocks)) {
    for (const link of each(block?.links)) {
      const label = linkLabelSlot.get(link?.id)
      if (label) add(label, block.id)
    }
    for (const slot of each(block?.slots))
      for (const other of each(slot?.alsoShownIn)) if (slot?.id && other) add(slot.id, other)
  }
  return new Set([...printedBy].filter(([, blocks]) => blocks.size > 1).map(([label]) => label))
}
