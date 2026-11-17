// The frame a picture must have before it is uploaded (ticket #597, gate run 7): an image slot of the blank site
// contract that declares its shape (`fit` with an `aspect`, and `transparent` for a clear ground) is refused any other
// picture by the plugin (`SLOT_IMAGE_INVALID`, `SLOT_IMAGE_OPAQUE`), and a refusal stopped the whole write. The plan
// names, on each picture upload, the declared frame of every contract slot the picture goes to (`slotFit`), and
// whether those places may be left out: a place is optional when the block that owns its record declares what it
// does with no data (`noData.rule` `hide` or `fallback`, the block store), required otherwise; a site setting no block
// places answers by the block that shows it (`shownBy`, `draft-write-plan-facts.mjs`). The write step fits
// the picture to that frame (`step-chain-draft-picture-fit.js`). One picture sent to slots of two shapes cannot be
// one file: the op says so (`slotFitConflict`) and the run stops typed for those places. Pure; part of `opsOf`.
import { slotAspectOf } from './write-order-memory-image.mjs'

const OPTIONAL_RULES = new Set(['hide', 'fallback'])
/** Two aspects closer than this (0.5%) are one shape: what rounding a height to whole pixels moves. */
const SAME_ASPECT = 0.005

/** The declared frame of an image slot: `{slot, width, height, aspect, tolerance, minWidth, transparent, kind}`. */
function frameOf(slot) {
  const fit = slot.fit
  const aspect = slotAspectOf(fit)
  const width = Number(fit.source?.width) || Math.max(Number(fit.minWidth) || 0, 1)
  return {
    slot: slot.key,
    width,
    height: Number(fit.source?.height) || Math.max(1, Math.round(width / aspect)),
    aspect,
    tolerance: Number(fit.tolerance ?? 0.02),
    minWidth: Number(fit.minWidth ?? 0),
    transparent: fit.transparent === true,
    kind: fit.kind ?? null
  }
}

/** Whether the block owning a record may be left out when it has no picture, by its own declaration. */
const optionalOf = (state, record) =>
  OPTIONAL_RULES.has(
    state.kit.store.get(record.block ?? state.kit.ownerOf.get(record.entity) ?? record.shownBy)?.noData?.rule
  )

/**
 * The frames every picture of the plan goes to through the contract, by picture id.
 * @returns {Map<string, {frames: object[], optional: boolean}>}
 */
export function pictureFitsOf(state) {
  const out = new Map()
  for (const record of state.sink.records.values()) {
    if (record.kind !== 'store') continue
    for (const { loc, value } of record.values.values()) {
      const ref = String(value?.ref ?? '')
      const slot = loc.slot ? state.kit.slots.get(loc.slot) : null
      if (!ref.startsWith('picture:') || slot?.type !== 'image' || !slot.fit?.aspect) continue
      const id = ref.slice('picture:'.length)
      const held = out.get(id) ?? { frames: [], optional: true }
      held.frames.push(frameOf(slot))
      held.optional &&= optionalOf(state, record)
      out.set(id, held)
    }
  }
  return out
}

/** The keys a picture upload op carries for its declared frame (none when it goes to no fitted slot). */
export function slotFitKeysOf(fits) {
  if (!fits?.frames.length) return {}
  const [first] = fits.frames
  const same = fits.frames.every((f) => Math.abs(f.aspect / first.aspect - 1) <= SAME_ASPECT)
  const transparent = fits.frames.some((f) => f.transparent)
  return {
    slotFit: { ...first, transparent, slots: fits.frames.map((f) => f.slot) },
    slotOptional: fits.optional,
    ...(same ? {} : { slotFitConflict: fits.frames.map((f) => f.slot) })
  }
}
