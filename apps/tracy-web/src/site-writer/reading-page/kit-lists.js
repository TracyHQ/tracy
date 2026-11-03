// The kit's own view of a block on the copy reading page: its lists with every row and row slot, and every text slot
// of a kept block that the copy neither writes nor the plan hides (its demo text would stay on the site). Pure.
//
// A kit list comes in two shapes: rowKind "slots" (rowSlots are slots, rows[] the demo rows with their own slots) and
// rowKind "items" (rowSlots are fields, each listing one slot per item the list pulls, e.g. one article per card).
// Only text slots are listed: image and video fields are the media step's, links and icons are not copy.
const asArray = (x) => (Array.isArray(x) ? x : [])
// Text slots only: links, icons and images are not copy, and a video id or an image field is the media step's.
const isText = (s) =>
  s && s.type === 'text' && !/image|video/.test(String(s.role ?? '')) && typeof s.id === 'string'

/** The rows of one kit list as [{ item, slots: [kit slot] }]. */
function rowsOf(list) {
  const fields = asArray(list.rowSlots)
  if (fields.some((f) => Array.isArray(f?.slots))) {
    const items = [...asArray(list.shown)]
    for (const f of fields) for (const s of asArray(f?.slots)) if (!items.includes(s.item)) items.push(s.item)
    return items.map((item) => ({
      item,
      slots: fields
        .filter((f) => f && f.type !== 'image')
        .map((f) => {
          const s = asArray(f.slots).find((x) => x.item === item)
          return s ? { role: f.role ?? null, ...s } : null
        })
        .filter(isText)
    }))
  }
  const rows = asArray(list.rows).filter((r) => asArray(r?.slots).length)
  if (rows.length)
    return rows.map((r, i) => ({ item: `row ${(r.index ?? i) + 1}`, slots: asArray(r.slots).filter(isText) }))
  return [{ item: 'row 1', slots: fields.filter(isText) }]
}

/**
 * @param {{ kit: object | null, written: Map<string, object>, hiddenWhy: Map<string, string>, returned: Map<string, string> }} input
 *   `written`: the copy's slots by id; `hiddenWhy`: every slot a kept plan decision hides, with the plan's reason
 */
export function kitListsIndex({ kit, written, hiddenWhy, returned }) {
  const blocks = new Map(asArray(kit?.blocks).map((b) => [b?.id, b]))
  const cell = (s) => {
    const w = written.get(s.id)
    const base = {
      slot: s.id,
      role: s.role ?? null,
      sample: typeof s.sample === 'string' ? s.sample.trim() : ''
    }
    if (w)
      return {
        ...base,
        state: 'written',
        owner: w.owner,
        text: Array.isArray(w.text) ? w.text.join(' ') : String(w.text ?? '')
      }
    if (hiddenWhy.has(s.id)) return { ...base, state: 'hidden', why: hiddenWhy.get(s.id) }
    return { ...base, state: 'demo', returned: returned.get(s.id) ?? null }
  }
  const listsOf = (blockId) =>
    asArray(blocks.get(blockId)?.lists).map((l) => ({
      id: l.id,
      rows: rowsOf(l).map((r) => ({ item: r.item, cells: r.slots.map(cell) }))
    }))
  /** Every text slot of the kept blocks that keeps its demo text, once, in block order. */
  const unhandled = (blockIds) => {
    const seen = new Set()
    const out = []
    for (const id of blockIds) {
      const b = blocks.get(id)
      if (!b) continue
      const cells = [
        ...asArray(b.slots).filter(isText).map(cell),
        ...listsOf(id).flatMap((l) => l.rows.flatMap((r) => r.cells))
      ]
      for (const c of cells)
        if (c.state === 'demo' && !seen.has(c.slot)) {
          seen.add(c.slot)
          out.push({ block: id, ...c })
        }
    }
    return out
  }
  return { available: blocks.size > 0, listsOf, unhandled }
}
