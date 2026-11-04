// Which rows a plan gives up and which hidden slots leave the stored field with their row or element (`rows.remove`): nothing
// here writes. The plan says how many rows of a list it keeps; the kit says which slots make each row; the plugin says which
// rows it can prove (`slot.row`, in inspect) and refuses by name what it cannot.
const each = (value) => (Array.isArray(value) ? value : [])
const idOf = (entry) => (typeof entry === 'string' ? entry : entry?.id)
const keptDecisions = (plan) => [
  ...each(plan?.sharedBlocks),
  ...each(plan?.pages)
    .filter((p) => p?.decision === 'keep')
    .flatMap((p) => each(p.blocks))
]

/** The slots the plan's own words place in a list: a row holding one is a row it keeps. */
function namedSlots(list) {
  const named = new Set()
  for (const item of each(list?.items)) {
    for (const copy of each(item?.copy)) named.add(copy?.slot)
    for (const picture of each(item?.pictures)) named.add(picture?.frame)
  }
  return named
}

/**
 * The slots of the rows past what the plan keeps. `lists[].rows` is how many it keeps: the rows its items name, then the first
 * ones, and a row something fills is never given up.
 * @param {{ plan: object, kit: object, filled?: Set<string> }} input
 * @returns {Set<string>} kit slot ids
 */
export function goneRowSlots({ plan, kit, filled = new Set() }) {
  const blocks = new Map(each(kit?.blocks).map((b) => [b?.id, b]))
  const gone = new Set()
  for (const decision of keptDecisions(plan)) {
    if (decision?.decision === 'hide') continue
    for (const list of each(decision?.lists)) {
      const rows = each(each(blocks.get(decision.block)?.lists).find((l) => l?.id === list?.list)?.rows)
      if (!Number.isInteger(list?.rows) || list.rows >= rows.length) continue
      const named = namedSlots(list)
      const slotsOf = rows.map((row) => each(row?.slots).map(idOf))
      const kept = new Set()
      slotsOf.forEach((slots, at) => {
        if (slots.some((slot) => named.has(slot) || filled.has(slot))) kept.add(at)
      })
      for (let at = 0; at < rows.length && kept.size < list.rows; at++) kept.add(at)
      slotsOf.forEach((slots, at) => {
        if (!kept.has(at)) for (const slot of slots) gone.add(slot)
      })
    }
  }
  return gone
}

/**
 * The hidden slots the door takes. A row goes when nothing of it stays and either the plan gave it up or every word and picture
 * in it is hidden; a row holding only a hidden link keeps its words. A slot of an HTML field goes in any case: the plugin takes
 * its own element or text, and refuses by name what holds a slot that stays.
 * @param {{ hidden: Set<string>, keep: Set<string>, gone: Set<string>, onSite: Map<string, object> }} input content map keys
 * @returns {Set<string>}
 */
export function slotsToRemove({ hidden, keep, gone, onSite }) {
  const rows = new Map()
  for (const slot of onSite.values()) if (slot?.row) rows.set(slot.row, [...(rows.get(slot.row) ?? []), slot])
  const held = (slot) => String(slot.current ?? '').trim() !== ''
  const going = (members) =>
    !members.some((s) => keep.has(s.key)) &&
    (members.some((s) => gone.has(s.key)) ||
      members.filter((s) => s.type !== 'url' && held(s)).every((s) => hidden.has(s.key)))
  const out = new Set()
  for (const key of hidden) {
    const slot = onSite.get(key)
    if (!slot || keep.has(key)) continue
    if (slot.xpath) out.add(key)
    else if (slot.row && going(rows.get(slot.row))) out.add(key)
  }
  return out
}
