// The fields of one kit block, as the AI quickstart block store describes them (ticket #583). Pure. Called by
// `draftBlocks` (draft-blocks.mjs) once per store block; the list sorting (own, single row, repeating, nested) is
// there, the slot-to-field step is here.
import { fieldTypeOf, limitOf, mapKeyOf } from './draft-fields.mjs'

/** A slot the build never writes as a field of a content block: a page's menu label or a template string. */
export const isDerivedSlot = (id) => /^(menuItem|languageString)-/.test(String(id ?? ''))

/** The short name of a field from its data kind: `contact.cta_label` -> `cta-label`. */
export function baseNameOf(role, type) {
  const leaf = String(role ?? type ?? 'value')
    .split('.')
    .pop()
  return leaf.replace(/_/g, '-')
}

/** The picture frame of an image or icon slot: the kit's frame, else the content map's measured desktop box. */
export function frameOf(id, ctx) {
  const frame = ctx.frames.get(id)
  if (frame && frame.width > 0 && frame.height > 0) return { width: frame.width, height: frame.height }
  const box = ctx.mapSlots.get(mapKeyOf(id))?.fit?.boxes?.desktop
  if (box && box.width > 0 && box.height > 0)
    return { width: Math.round(box.width), height: Math.round(box.height) }
  return null
}

/** Makes names unique within one block: `heading`, `heading-2`, ... */
export function nameAllocator() {
  const used = new Map()
  return (wanted) => {
    const n = (used.get(wanted) ?? 0) + 1
    used.set(wanted, n)
    return n === 1 ? wanted : `${wanted}-${n}`
  }
}

/**
 * One field from a kit slot entry. `slotIds` are the slot's ids, one per item for an item field (`item`).
 * @returns {{field: object, unmeasured: boolean}|null} null when the slot is not in the content map
 */
export function fieldOf(entry, slotIds, name, ctx, { item = false } = {}) {
  const keys = slotIds.map(mapKeyOf)
  const mapSlot = ctx.mapSlots.get(keys[0])
  if (!mapSlot) return null
  const role = entry.role ?? mapSlot.role ?? null
  const type = fieldTypeOf({ role, type: entry.type ?? mapSlot.type })
  const field = { name }
  if (type !== 'design') field.kind = role
  field.type = type
  let unmeasured = false
  if (type === 'text') {
    // The rows of a list are one slot for a limit (the kit gives them one number): one measured row holds for all.
    const limits = keys.map((key) => limitOf(entry, ctx.measured[key]))
    const ok = limits.filter((l) => l.measured)
    if (ok.length > 0) {
      const least = ok.reduce((a, b) => (b.limit < a.limit ? b : a))
      field.limit = least.limit
      field.limitFrom = least.limitFrom
    } else {
      field.limitFrom = limits.find((l) => !l.measured).limitFrom
      unmeasured = true
    }
  }
  if (type === 'image' || type === 'icon') {
    const frame = frameOf(slotIds[0], ctx)
    if (frame) field.frame = frame
    if (type === 'icon')
      field.storage = (entry.type ?? mapSlot.type) === 'image' ? 'image-file' : 'class-name'
    // A picture the template draws on a transparent ground (the released slot's measured fit): a cut-out, a logo, a
    // signature. An opaque file there covers what is drawn behind it, and the door refuses it (SLOT_IMAGE_OPAQUE).
    if (keys.some((key) => ctx.mapSlots.get(key)?.fit?.transparent === true)) field.transparent = true
  }
  if (!item) field.slot = keys[0]
  else field.slots = keys
  return { field, unmeasured }
}

/** The per item ids of the slot at place `j` of a slot-row list, in row order. */
export function rowIdsOf(list, j) {
  const rows = Array.isArray(list.rows) && list.rows.length ? list.rows : [{ slots: list.rowSlots }]
  return rows.map((r) => r.slots?.[j]?.id).filter(Boolean)
}

/** The per item ids of an item-list row slot (`rowKind: "items"`: one item per linked page). */
export function itemIdsOf(rowSlot) {
  return (rowSlot.slots ?? []).map((s) => s.id).filter(Boolean)
}
