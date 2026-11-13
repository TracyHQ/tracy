// The item counts of a store block and where each came from (ticket #583). Pure. Called by `draftOne`
// (draft-one-block.mjs) once the block's fields are sorted.
//
// The rule: the maximum is what the layout holds (a count the kit or the block's own setting measured, or the
// places the template stores); the minimum is the smallest count at which the block still lays out acceptably,
// 1 unless the layout needs more. Each count carries its source in `itemsFrom` ({min, max}). A minimum the kit only
// copied from the demo has no source: the draft reports it as a problem until the template's decisions state one.
// An item field stored for fewer items than the maximum is not one shape for every item: the decisions either lower
// the maximum or name the field in `sparse` with what it is instead, and it leaves the item fields.

const MAX_SOURCES = {
  'demo-count': 'the places the template stores: one per demo item',
  'slot-rows': 'the rows the template stores',
  'block-setting': "the block's own setting for the number of items it shows",
  'view-setting': "the listing view's setting for the number of items per page",
  'page-size': "the listing view's page size"
}

/** Where the kit's minimum of a list came from, or null when the kit only copied the demo count. */
export function minSourceOf(list) {
  const src = list?.minSource
  if (src === 'measured') {
    const ok = list.minEvidence?.layoutOkAt
    return Array.isArray(ok) && ok.length
      ? `measured by the kit at 390 and 1440 px: the layout is acceptable with ${ok.join(', ')} item(s)`
      : 'measured by the kit at 390 and 1440 px'
  }
  if (src === 'slider-or-tab')
    return 'the kit: a slider or tabs show one item at a time, so one item lays out'
  return null
}

/** Where the kit's maximum of a list came from. */
export function maxSourceOf(list) {
  const from = list?.maxSource ?? list?.maxFrom
  return MAX_SOURCES[from] ?? (from ? `the kit: ${from}` : null)
}

/**
 * Sets `block.items` and `block.itemsFrom`, and moves item fields stored for fewer items than the maximum out of
 * the item fields (decided) or reports them (undecided).
 * @param {object} block the drafted block, with `itemFields` when it repeats
 * @param {{items?: {min: number, max: number}, itemsFrom?: {min?: string, max?: string}, sparse?: Record<string, string>}} decision
 * @param {{items: object|null, from: object|null}} drafted the counts the lists gave and their sources
 * @param {object} out the draft report
 */
export function applyItems(block, decision, drafted, out) {
  const id = block.id
  const items = decision.items ?? drafted.items ?? { min: 1, max: 1 }
  const single = !decision.items && !drafted.items
  const from = {
    min: decision.itemsFrom?.min ?? (decision.items ? null : drafted.from?.min),
    max: decision.itemsFrom?.max ?? (decision.items ? null : drafted.from?.max)
  }
  if (single) {
    from.min = 'the block shows one thing'
    from.max = 'the block shows one thing'
  }
  block.items = { min: items.min, max: items.max }
  block.itemsFrom = from
  if (items.min === null || items.min === undefined)
    out.problems.push({ block: id, problem: 'item minimum not measured by the kit' })
  else if (!from.min)
    out.problems.push({
      block: id,
      problem: `item minimum ${items.min} has no source: state it in the decisions (itemsFrom.min)`
    })
  if (!from.max)
    out.problems.push({
      block: id,
      problem: `item maximum ${items.max} has no source: state it in the decisions (itemsFrom.max)`
    })
  if (!block.itemFields) return
  const kept = []
  for (const field of block.itemFields) {
    const places = field.slots?.length
    if (places === undefined || places >= items.max) {
      kept.push(field)
      continue
    }
    const key = field.slots[0]
    const why = decision.sparse?.[key]
    if (why) {
      out.sparse.push({ block: id, field: field.name, slots: field.slots, max: items.max, why })
      continue
    }
    kept.push(field)
    out.problems.push({
      block: id,
      problem: `item field ${field.name} is stored for ${places} of max ${items.max} items: lower the maximum or name ${key} in sparse`
    })
  }
  block.itemFields = kept
  if (!kept.length) delete block.itemFields
}
