// The slot ids a template kit list holds, in the kit's order: each row pair (`rowSlots`) and the slots nested in it, then each
// demo row's slots. One reader for every place that asks which slots a block shows (write-step/kit-slot-ids.js,
// lib/printed-in-body.js), so a list shape the kit gains is read once (cards AA and AY, 2026-11-06).
const each = (value) => (Array.isArray(value) ? value : [])

/** @param {object} list a kit block's list @returns {string[]} */
export function listSlotIds(list) {
  const ids = []
  for (const s of each(list?.rowSlots)) ids.push(s?.id, ...each(s?.slots).map((nested) => nested?.id))
  for (const row of each(list?.rows)) ids.push(...each(row?.slots).map((s) => s?.id))
  return ids.filter((id) => typeof id === 'string' && id)
}
