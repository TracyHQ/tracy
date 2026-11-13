// The design fields of a store block (ticket #583): stored values of the block's record that the kit never shows
// as content and whose key reads as layout (a gutter, a column count, a class), or that the template's decisions
// name. They are typed `design` and carry no data kind, so a build never writes text into them (ADR 0046 decision
// 2; JA Boxing 1.0.11 crashed four pages when two such values were written as text). Every other unshown value of
// the record is reported in `unlisted`, for the mapping file to keep or empty.
import { baseNameOf } from './draft-block-fields.mjs'

export const DESIGN_KEY =
  /(show-on|gutter|column|cols|layout|class|style|spacing|padding|margin|align|height|width|size|colou?r|background|bg-|animation|effect|overlay|opacity|ratio)/i

const neutral = (key) => String(key).replace(/^module-/, 'block-')

/** The readable key of a stored value: `["gallery", "isotope[gutter]", 0]` -> `gutter`. */
export function designKeyOf(slot) {
  const named =
    [...(slot.jsonPath ?? [])].reverse().find((k) => !/^\d+$/.test(String(k))) ?? slot.column ?? 'value'
  const inner = String(named).match(/\[([^\]]+)\]$/)
  return baseNameOf(
    String(inner ? inner[1] : named)
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_|_$/g, '')
  )
}

/** The design fields of the block's record, reporting every other unshown value of it. */
export function designFieldsOf({ entity, used, inLists, decision, ctx, alloc, out, id }) {
  const fields = []
  for (const slot of entity ? (ctx.slotsByEntity.get(entity) ?? []) : []) {
    const kitId = neutral(slot.key)
    const named = (decision.design ?? []).includes(slot.key)
    if (!named && (used.has(kitId) || inLists.has(kitId) || ctx.shownAnywhere.has(kitId))) continue
    const where = [...(slot.jsonPath ?? []), slot.column ?? ''].join('.')
    if (named || DESIGN_KEY.test(where))
      fields.push({
        name: alloc(`design-${designKeyOf(slot)}`),
        type: 'design',
        slot: slot.key,
        designFrom: where
      })
    else out.unlisted.push({ block: id, slot: slot.key, at: where })
  }
  return fields
}
