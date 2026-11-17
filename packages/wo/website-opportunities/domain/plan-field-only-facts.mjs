// Facts only a field of their own kind shows (#575 walk, fourth round): the model put the opening hours into the
// contact block of a template whose contact block has no hours field, and the plan card said the hours were on the
// site; on the next walk of the same business the model left them out and the card said the template had no place for
// them. Whether a page shows the hours is the template's, not the model's: it is read from the fields the block store
// declares. A fact of a kind in `FIELD_ONLY_FACT_KINDS` in a block with no field of that kind (its own fields, its item
// fields, the fields of its lists' rows) leaves that block, a recorded fix (`fact_without_place`): no field would ever
// write it. Placement then finds it a block with such a field, or reports it left out with the reason code knows
// (`plan-placement-facts.mjs`, `no_place_in_design`), the same on every walk.
// Other facts are not held to this: the business name and the main button's words are written by blocks with no
// field of their kind (a hero's heading says the name, the site name is a setting the template prints). Pure: the
// reply is copied when anything changes.

/** The fact kinds no block shows unless it has a field of that kind. */
export const FIELD_ONLY_FACT_KINDS = Object.freeze(['contact.hours'])
export const FACT_WITHOUT_PLACE_FIX = 'fact_without_place'

const list = (value) => (Array.isArray(value) ? value : [])

/** Whether a block of the store has a field of data kind `kind`: its own, an item field or a field of a list row. */
export function hasFieldOfKind(description, kind) {
  const fields = [
    ...list(description?.fields),
    ...list(description?.itemFields),
    ...list(description?.lists).flatMap((l) => list(l?.fields))
  ]
  return fields.some((f) => f?.type !== 'design' && f?.kind === kind)
}

/**
 * The reply with every field only fact taken out of a block that has no field of its kind.
 * @param {object} reply the model's reply, its shape checked
 * @param {{data: {byId: Map<string, object>}, blocks: Map<string, object>}} context
 * @param {(fix: object) => void} fix
 */
export function withoutFactsWithoutPlace(reply, { data, blocks }, fix) {
  const fieldOnly = (id) => {
    const record = data?.byId?.get(id)
    return record?.what === 'fact' && FIELD_ONLY_FACT_KINDS.includes(record.kind) ? record.kind : null
  }
  const misplaced = (block, id) => {
    const kind = fieldOnly(id)
    const description = blocks?.get(block?.block)
    return kind !== null && description !== undefined && !hasFieldOfKind(description, kind)
  }
  const pages = list(reply?.pages)
  if (!pages.some((p) => list(p?.blocks).some((b) => list(b?.data).some((id) => misplaced(b, id)))))
    return reply
  const rule = 'opening hours are shown only by a block with a field for them, as the template declares'
  return {
    ...reply,
    pages: pages.map((page, i) => ({
      ...page,
      blocks: list(page.blocks).map((block, j) => {
        if (!list(block.data).some((id) => misplaced(block, id))) return block
        const data = block.data.filter((id, k) => {
          if (!misplaced(block, id)) return true
          fix({
            code: FACT_WITHOUT_PLACE_FIX,
            at: `pages[${i}].blocks[${j}].data[${k}]`,
            rule,
            was: id,
            now: null
          })
          return false
        })
        return { ...block, data }
      })
    }))
  }
}
