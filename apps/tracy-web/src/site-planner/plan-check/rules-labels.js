import { arr, has, obj } from './rule-set.js'
import { indexRows, shownRows } from './rules-kept-rows.js'

// R24 a control that stays visible keeps its label. A link whose label slot (the kit's labelId / labelOf, a slot whose
// role ends in "_label": a button, a tab) is hidden prints an arrow or an empty button. A label hidden in
// one block is hidden in every block that prints it, so each kept control that uses it fails on its own page.
// Hiding the label is allowed with the control itself (its link id in hiddenSlots, its row or its block dropped),
// except for a shared label: one slot printed by the links of several kit blocks (a template string). The write step
// takes no button out by its shared words, so the buttons stay and print without them; such a label is written.
// Not checked here: contact lines (an email or a phone number that is itself the link) are not label slots, and menu
// item labels (role menu_label, or a navigation item's labelSlot) leave with their menu item, which R04 checks.

// Label slot -> the kit blocks whose links print it, and the blocks the kit says also show it.
function sharedLabels(ctx) {
  const { kitBlocks, linkLabelSlot, slotRole } = ctx
  const out = new Map()
  const add = (label, block) => {
    if (!out.has(label)) out.set(label, new Set())
    out.get(label).add(block)
  }
  for (const b of kitBlocks.values()) {
    for (const l of arr(b.links).map(obj))
      if (has(linkLabelSlot.get(l.id))) add(linkLabelSlot.get(l.id), b.id)
    for (const s of arr(b.slots).map(obj))
      if (slotRole.has(s.id)) for (const other of arr(s.alsoShownIn)) if (has(other)) add(s.id, other)
  }
  return out
}

export function checkR24(ctx) {
  const { R, keptDecisions, blockIx, linkLabelSlot, isLabelSlot, slotRole, navGroups, decisionParts, W } = ctx
  const r = R.r24
  const { rowOfSlot } = indexRows(ctx)
  const printedBy = sharedLabels(ctx)
  const menuLabels = new Set(
    [...navGroups.values()].flatMap((g) => arr(g.items).map((it) => obj(it).labelSlot))
  )
  const isMenuLabel = (id) => menuLabels.has(id) || String(slotRole.get(id) ?? '').endsWith('menu_label')
  // Every place a kept decision hides a slot: a label hidden in one block is hidden wherever it prints.
  const hiddenAt = new Map()
  keptDecisions.forEach((x) => {
    for (const h of decisionParts(x.d).hidden)
      if (has(h.slot)) {
        if (!hiddenAt.has(h.slot)) hiddenAt.set(h.slot, [])
        hiddenAt.get(h.slot).push(x)
      }
  })
  let controls = 0
  keptDecisions.forEach((x) => {
    const o = blockIx.get(x.d.block)
    if (!o) return
    const hidden = new Set(
      decisionParts(x.d)
        .hidden.map((h) => h.slot)
        .filter(has)
    )
    let rows = null
    for (const l of o.links.values()) {
      const label = linkLabelSlot.get(l.id)
      if (!has(label) || l.fixedLabel || !isLabelSlot(label) || isMenuLabel(label)) continue
      const blocks = printedBy.get(label) ?? new Set()
      const shared = blocks.size > 1
      if (hidden.has(l.id) && !shared) continue
      // A control printed in a list row goes with its row: a dropped row takes the control along.
      const inRow = rowOfSlot.get(`${x.d.block}|${label}`)
      if (inRow) {
        rows ??= shownRows(ctx, x)
        const row = rows.find((ls) => ls.list === inRow.list)?.shown.find((rw) => rw.index === inRow.row)
        if (!row?.kept) continue
      }
      controls++
      const at = hiddenAt.get(label)
      if (!at) {
        r.ok()
        continue
      }
      const where = at.map((h) => W(h)).join('; ')
      r.fail(
        W(x, `link ${l.id}`),
        shared
          ? `label slot ${label} of link ${l.id} is hidden (in ${where}), but it is one label shared by ${[...blocks].join(', ')}: ` +
              'the buttons that print it stay on the page without words even when their links are hidden; write the label in ' +
              'copy with text that fits every page that prints it, never hide it'
          : `label slot ${label} of link ${l.id} is hidden (in ${where}) while the control stays visible, so it prints ` +
              'without its words; write the label, or hide the control itself (its link id in hiddenSlots) in every ' +
              'block that prints this label',
        'plan'
      )
    }
  })
  if (!controls) r.skip('cannot check: no kept block keeps a link the kit gives a label slot')
  r.note('menu item labels leave with their menu item and are checked by R04, not here')
}
