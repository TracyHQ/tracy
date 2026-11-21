// R27 a hide is one the site can take off (2026-11-20). The Joomla receiver empties only the slots its review lists
// (lib/receiver-hide-review.js), a `withRow` one only with another slot of its row; the write step's `rows.remove` door
// takes a slot of an HTML field and a row the plan hides whole. Any other hide is refused, and the slot keeps the demo's
// words or picture: the final check's `unaddressable-items` (`contract-has-no-slot`) or the read-back's `plugin-refused`
// (a `withRow` picture hidden alone). The plan is told here, so a fix round writes that slot, or gives it a picture.
//
// Only what the write step would surely refuse fails (write-step/hide-plan.js `hideOrders`): a slot of the contract's
// content map, still holding words or a picture, under a kept block of a kept page. Not checked, because the write step
// takes them off another way: links and menu labels (their doors), a frame the template paints (writable: false), a slot
// in a list row past the row count the plan keeps (the row goes), a slot whose stored field prints only on pages the plan
// drops, and a kit without a review (another platform).
import { slotKeyOf } from '../../lib/receiver-hide-review.js'
import { droppedBlocks, printedOnlyOnDropped } from '../../write-step/hide-plan.js'
import { arr, obj, str } from './rule-set.js'

const TEMPLATE_FILE = /^\/?(?:media\/)?templates\//

export function checkR27(ctx) {
  const {
    R,
    receiver,
    plan,
    kit,
    keptDecisions,
    keptPageIds,
    decisionParts,
    slotRow,
    frameById,
    linkIx,
    navGroups,
    W
  } = ctx
  const r = R.r27
  if (!receiver) {
    r.skip('cannot check: the kit has no receiver review (no Joomla content map)')
    return
  }
  const menuLabels = new Set(
    [...(navGroups?.values?.() ?? [])].flatMap((g) => [
      g?.titleSlot,
      ...arr(g?.items).map((it) => it?.labelSlot)
    ])
  )
  // The write step's own reading (write-step/hide-plan.js): a slot printed only where the plan drops is not taken off.
  const dropped = droppedBlocks(plan, kit)
  const unshown = (slot) => printedOnlyOnDropped(slot, { kit, plan, dropped }) !== null
  const hiddenKeys = new Set(
    keptDecisions.flatMap((x) => decisionParts(x.d).hidden.map((h) => slotKeyOf(str(obj(h).slot))))
  )
  // What the plan writes holds its row: the door never takes a row with a written slot in it.
  const writtenKeys = new Set(
    keptDecisions.flatMap((x) => {
      const parts = decisionParts(x.d)
      return [...parts.copy, ...parts.pics].map((c) => slotKeyOf(str(c.slot ?? c.frame)))
    })
  )
  const heldRows = new Set([...writtenKeys].map((k) => receiver.rowOf.get(k)).filter(Boolean))
  const rowGoes = (key) => {
    const row = receiver.rowOf.get(key)
    const words = row ? (receiver.rowWords.get(row) ?? []) : []
    return words.length > 0 && !heldRows.has(row) && words.every((k) => hiddenKeys.has(k))
  }
  for (const x of keptDecisions) {
    if (x.page && !keptPageIds.has(x.page)) continue
    const parts = decisionParts(x.d)
    const rowsOf = new Map(
      parts.lists.map((l) => [l.list, typeof l.rows === 'number' ? l.rows : arr(l.items).length])
    )
    for (const h of parts.hidden) {
      const slot = str(h.slot)
      const key = slotKeyOf(slot)
      if (!slot || !receiver.known.has(key)) continue
      if (linkIx?.has?.(slot) || menuLabels.has(slot)) continue
      const frame = frameById?.get?.(slot)
      if (frame?.writable === false && TEMPLATE_FILE.test(str(frame.picture))) continue
      const row = slotRow?.get?.(slot)
      if (row && rowsOf.has(row.list) && row.row >= rowsOf.get(row.list)) continue
      if (unshown(slot)) continue
      const partners = receiver.withRow.get(key)
      if (
        receiver.empty.has(key) ||
        receiver.alone.has(key) ||
        receiver.inHtml.has(key) ||
        rowGoes(key) ||
        partners?.some((p) => hiddenKeys.has(p))
      ) {
        r.ok()
        continue
      }
      if (partners) {
        r.fail(
          W(x, `hidden ${slot}`),
          `the site takes this off only with another slot of its row (${partners.join(', ')}), and the plan hides none of them: hide the row with it, or give this slot a picture or words`,
          'plan'
        )
        continue
      }
      r.fail(
        W(x, `hidden ${slot}`),
        "the site cannot take this off: its receiver never empties this slot (an article's title or picture column, a setting outside any row), so it would keep the demo; write it, or give it a picture",
        'plan'
      )
    }
  }
}
