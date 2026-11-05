import { arr, has, obj } from './rule-set.js'

// R22 paired list rows follow their text cards. A kit list row may print its picture inside the same card as some of
// the block's own text slots (rows[i].pairedSlots, measured by the kit tool). Keeping any of those text slots while
// the row is dropped prints a card without its picture; dropping them all while the row is kept prints a picture
// without its card. The row is kept when its picture slot is a frame of the plan list's items (or, when the items
// carry no frame, when its index is below the list's row count); its card is kept when one paired slot is written
// and not hidden. A kit without pairedSlots (every kit measured before the field) is not checked.
export function checkR22(ctx) {
  const { R, blockIx, keptDecisions, decisionParts, W } = ctx
  const r = R.r22
  let pairedRows = 0
  keptDecisions.forEach((x) => {
    const o = blockIx.get(x.d.block)
    if (!o) return
    const parts = decisionParts(x.d)
    const hidden = new Set(parts.hidden.map((h) => h.slot).filter(has))
    const written = new Set(parts.copy.map((c) => c.slot).filter((s) => has(s) && !hidden.has(s)))
    parts.lists.forEach((l) => {
      const kl = o.lists.get(l.list)
      if (!kl || hidden.has(l.list)) return
      const items = arr(l.items)
      const frames = new Set(
        parts.pics
          .filter((p) => p.inItem && p.inItem.list === l.list)
          .map((p) => p.frame)
          .filter(has)
      )
      const rows = typeof l.rows === 'number' ? l.rows : items.length
      arr(kl.rows).forEach((kitRow, i) => {
        const paired = arr(obj(kitRow).pairedSlots).filter(has)
        if (!paired.length) return
        pairedRows++
        const picture = arr(obj(kitRow).slots)
          .map(obj)
          .find((s) => s.type === 'image' || o.frames.has(s.id))?.id
        const rowKept = frames.size && has(picture) ? frames.has(picture) : i < rows
        const cardKept = paired.some((s) => written.has(s))
        if (rowKept === cardKept) return r.ok()
        r.fail(
          W(x, `list ${l.list}`),
          `row ${i} (picture ${picture ?? 'none'}) is ${rowKept ? 'kept' : 'dropped'} but the text slots printed in its card ` +
            `(${paired.join(', ')}) are ${cardKept ? 'kept' : 'all hidden'}; keep the row while any of them is kept and drop it ` +
            "when they are all hidden; a list's rows count follows the cards kept, never the pictures on hand",
          'plan'
        )
      })
    })
  })
  if (!pairedRows) r.skip('cannot check: no list row carries pairedSlots in the kept lists of this kit')
}
