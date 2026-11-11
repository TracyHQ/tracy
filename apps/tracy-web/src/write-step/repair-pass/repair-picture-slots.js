// Bind demo-picture repairs only to an exact image declared by both the measured kit and native contract.
// The native fit governs writes; a kit frame describes presentation and may have a different aspect.
const each = (value) => (Array.isArray(value) ? value : [])
const nativeKey = (key) => String(key ?? '').replace(/^block-/, 'module-')
const picturePath = (value) => {
  if (typeof value !== 'string') return null
  const path = value.split('#')[0].replace(/^\//, '')
  return /^images\/[^\s?#]+$/.test(path) ? path : null
}

/** A unique verified picture slot, never a guessed record field or a permission to bypass a refusal. */
export function withPictureSlot(fault, kit, contentMap) {
  if (fault.kind !== 'demo-picture') return fault
  const page = each(kit?.pages).find((p) => p.path === fault.page)
  if (!page) return fault
  const visible = new Set(Object.values(page.blocks ?? {}).flatMap(each))
  const declared = each(contentMap?.slots).filter((s) => s?.type === 'image')
  const path = picturePath(fault.measured)
  const matches = []
  for (const block of each(kit?.blocks)) {
    if (!visible.has(block.id)) continue
    if (fault.block && nativeKey(fault.block) !== nativeKey(block.id)) continue
    for (const frame of each(block.frames)) {
      const key = nativeKey(frame.id)
      const slots = declared.filter((s) => s.key === key)
      if (slots.length !== 1) continue
      const slot = slots[0]
      if (fault.slot) {
        if (nativeKey(fault.slot) !== key) continue
      } else if (!path || picturePath(slot.sample) !== path || picturePath(frame.picture) !== path) continue
      const fit = slot.fit
      if (fit?.measured !== true || !Number.isFinite(fit.aspect) || fit.aspect <= 0) continue
      if (!Number.isFinite(fit.tolerance) || fit.tolerance < 0) continue
      if (!Number.isFinite(fit.minWidth) || fit.minWidth <= 0) continue
      matches.push({
        ...fault,
        slot: frame.id,
        block: block.id,
        pictureSlot: {
          key,
          canHide: frame.canHide === true,
          aspect: fit.aspect,
          tolerance: fit.tolerance,
          minWidth: fit.minWidth
        }
      })
    }
  }
  return matches.length === 1 ? matches[0] : fault
}

/** The exact replacement door and its native geometry, before any attempt at a generic record update. */
export function pictureInstruction(fault) {
  const slot = fault.pictureSlot
  if (!slot) return null
  return `This still shows a picture of the template demo. Replace it with an existing business picture through content.contract operation apply for exact image slot ${slot.key}, using the writable next from a fresh content.read or contract inspect and its expected_revision. Prepare the image to the native slot fit: aspect ${slot.aspect}, tolerance ${slot.tolerance}, minimum width ${slot.minWidth}px. Do not use the kit frame aspect or patch the whole module params for this mapped picture. ${slot.canHide ? 'If no suitable business picture exists, hide only through a supported slot operation that the fresh read permits.' : 'This frame cannot be hidden: preserve it and report the picture unresolved if no suitable business asset exists.'}`
}
