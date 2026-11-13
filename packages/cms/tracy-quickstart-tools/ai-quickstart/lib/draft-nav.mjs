// The items of a navigation block (ticket #583): a block whose menu labels are its items (decision `nav`). Pure.
// When the content map describes the menu the block draws (`menuBlocks`, by the block's record, or by menu name with
// the decision `menu`), every item of that menu is an item of the block, whatever level it sits at; otherwise the
// labels the kit read in the block are (a breadcrumb trail).
import { fieldOf } from './draft-block-fields.mjs'

/** The menu a navigation block draws, from the content map, or null. */
export function menuOf(decision, entity, ctx) {
  const menus = Object.values(ctx.menuBlocks ?? {})
  if (decision.menu) return menus.find((m) => m.menu === decision.menu) ?? null
  return (entity && ctx.menuBlocks?.[entity]) || null
}

const levelsOf = (menu) => {
  const by = {}
  for (const i of menu.items) by[i.level] = (by[i.level] ?? 0) + 1
  return Object.entries(by)
    .map(([level, n]) => `${n} at level ${level}`)
    .join(', ')
}

/**
 * The item fields and counts of a navigation block. A label without a measured limit is offered for measuring even
 * when another label has one: a submenu label may be folded away where the top level is drawn.
 * @param {{id: string}[]} labels the kit's entries of the label slots (its own reading of each), in menu order
 * @param {object|null} menu the menu of the content map the labels come from
 */
export function navItems(labels, menu, ctx, out, id) {
  const read = labels.map((s) => ({ s, f: fieldOf(s, [s.id], 'label', ctx)?.field }))
  const measured = read.filter((r) => Number.isInteger(r.f?.limit)).sort((a, b) => a.f.limit - b.f.limit)
  const label = { name: 'label', kind: 'editorial.menu_label', type: 'text', slots: labels.map((s) => s.id) }
  if (measured.length)
    Object.assign(label, {
      limit: measured[0].f.limit,
      limitFrom: `the narrowest measured menu label (${measured.length} of ${labels.length} measured): ${measured[0].f.limitFrom}`
    })
  for (const r of read)
    if (!Number.isInteger(r.f?.limit))
      out.unmeasured.push({ block: id, field: 'label', slot: r.s.id, limitFrom: 'no menu label measured' })
  const itemFields = [
    label,
    { name: 'link', kind: 'editorial.navigation_url', type: 'link', derived: 'the page address' }
  ]
  const n = labels.length
  return {
    itemFields,
    items: { min: 1, max: n },
    itemsFrom: {
      min: 'the rule default 1: a menu draws as many links as it is given (not measured)',
      max: menu
        ? `the menu the block draws (${menu.menu}) holds ${n} items in the demo (${levelsOf(menu)}), content map menuBlocks; the build rebuilds it from the pages it creates, and the layout was not measured with more`
        : `the labels the kit reads in the block on the demo pages (${n})`
    }
  }
}
