import { recordAltPlace } from '../record-alt-stage.js'

// The alt slot of a picture, from the template kit (#448). A gallery keeps each picture's alt in a slot of its own beside
// the picture in its list row (the kit's stored field of it ends in `[alt]`), while a site check names an alt fault by the
// picture slot. Step 9b names the real alt slot, so the agent writes the slot the site prints as that picture's alt. An
// article picture keeps its alt in the picture slot itself, so it has no row here. Pure.
const each = (value) => (Array.isArray(value) ? value : [])

/** The rows of a kit list, each its slots: the demo rows, then the row pair, so every row the kit names is read. */
const rowsOf = (list) => [...each(list?.rows).map((row) => each(row?.slots)), each(list?.rowSlots)]

/**
 * @param {object | null} kit a template kit
 * @returns {Map<string, string>} each picture slot whose alt sits in another slot, to that slot
 */
export function kitAltSlots(kit) {
  const altFields = new Set(
    each(kit?.storedFields)
      .filter((f) => typeof f?.slot === 'string' && /\[alt\]/.test(String(f.field ?? '')))
      .map((f) => f.slot)
  )
  const out = new Map()
  if (!altFields.size) return out
  for (const block of each(kit?.blocks))
    for (const list of each(block?.lists))
      for (const slots of rowsOf(list)) {
        const alt = slots.find((s) => altFields.has(s?.id))
        if (!alt) continue
        for (const s of slots)
          if (s?.type === 'image' && typeof s.id === 'string' && !out.has(s.id)) out.set(s.id, alt.id)
      }
  return out
}

/** The fault with `altSlot`, the slot its picture's alt sits in, when it is an alt fault the kit keeps apart. */
export function withAltSlot(fault, altSlots, contentMap = null) {
  const altSlot =
    fault.kind === 'wrong-alt' && fault.slot
      ? (altSlots?.get?.(fault.slot) ?? altSlots?.get?.(fault.slot.replace(/^module-/, 'block-')))
      : null
  const blocked = unsupportedAlt(fault, { altSlots, contentMap })
  return blocked ? { ...fault, altBlocked: blocked.reason } : altSlot ? { ...fault, altSlot } : fault
}

/** A mapped image without a separate gallery alt or supported record alt has no independent alt write door.
 * Unknown/missing mappings preserve the legacy agent path; only an exact image storage declaration blocks dispatch.
 */
export function unsupportedAlt(fault, { altSlots, contentMap } = {}) {
  if (fault.kind !== 'wrong-alt' || !fault.slot) return null
  const key = fault.slot.replace(/^block-/, 'module-')
  const gallery = altSlots?.get?.(fault.slot) ?? altSlots?.get?.(key.replace(/^module-/, 'block-'))
  if (gallery || fault.altSlot) return null
  const slot = each(contentMap?.slots).find((s) => s?.key === key)
  if (
    slot?.type !== 'image' ||
    !/^[a-z]+-\d+$/.test(String(slot.entity ?? '')) ||
    typeof slot.column !== 'string' ||
    !slot.column ||
    recordAltPlace(slot)
  )
    return null
  return {
    code: 'unsupported-alt-target',
    reason: `The mapped picture ${fault.slot} has no independent alt slot or supported record alt write door; its alt remains blocking.`
  }
}
