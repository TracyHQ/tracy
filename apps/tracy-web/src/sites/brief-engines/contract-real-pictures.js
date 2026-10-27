/** Image-only phase for the two contract CMSs. Selection/crop is shared; each engine supplies its existing writer. */

import { uploadPictures } from './pictures.js'
import { contentMapOf, keptPages, pictureReport, shapeReal } from './real-pictures.js'

const fail = (code) => Object.assign(new Error(code), { code })

/** Joomla returns slot records; WordPress returns current values keyed by the released slot name. */
function inspectedSlots(state, contentMap) {
  if (Array.isArray(state.slots)) return state.slots
  if (!state.slots || typeof state.slots !== 'object') throw fail('PICTURE_SLOTS_UNREADABLE')
  return contentMap.slots
    .filter((slot) => Object.hasOwn(state.slots, slot.key))
    .map((slot) => ({ ...slot, current: state.slots[slot.key] }))
}

export async function writeContractPictures({
  ctx,
  real,
  realPictures,
  apply,
  siteFile,
  siteReader,
  inspect,
  write,
  contentMap = contentMapOf(ctx.contract),
  bound = {}
}) {
  if (!real || !siteFile) return null
  ctx.signal?.throwIfAborted()
  const initial = await inspect()
  if (!initial?.ok || initial.contract !== ctx.contract.id) throw fail('PICTURE_CONTRACT_CHANGED')
  const shaped = await shapeReal({
    real,
    contentMap,
    cms: ctx.platform,
    pages: keptPages(ctx.brief?.pages),
    siteFile: siteFile(ctx.siteKey),
    siteBytes: async (file) => (await siteReader?.(ctx.siteKey))?.bytes(file) ?? null,
    realPictures,
    note: ctx.note,
    time: ctx.time,
    signal: ctx.signal,
    // This phase only places collected photos and neutral placeholders. It never draws.
    drawDoor: null,
    bound
  })
  const slots = new Map(inspectedSlots(initial, contentMap).map((s) => [s.key, s]))
  for (const item of shaped.shaped)
    for (const binding of item.group.slots) {
      const slot = slots.get(binding.key)
      if (
        !slot ||
        slot.type !== 'image' ||
        slot.requiresEvidence ||
        (slot.current !== undefined &&
          slot.current !== slot.sample &&
          slot.current !== real.receipts?.[item.group.sample]?.path)
      )
        throw fail('PICTURE_EDITOR_CHANGED')
    }
  ctx.signal?.throwIfAborted()
  const art = await uploadPictures({
    shaped: shaped.shaped,
    platform: ctx.platform,
    apply,
    siteKey: ctx.siteKey,
    note: ctx.note
  })
  // Inspect again after uploads, using the current revision; an editor change is never accepted as a new baseline.
  const state = await inspect()
  if (!state?.ok || state.contract !== initial.contract) throw fail('PICTURE_CONTRACT_CHANGED')
  const live = new Map(inspectedSlots(state, contentMap).map((s) => [s.key, s]))
  const changes = {}
  for (const [key, value] of Object.entries(art.values)) {
    const before = slots.get(key),
      after = live.get(key)
    if (!after || (after.current ?? after.sample) !== (before.current ?? before.sample))
      throw fail('PICTURE_EDITOR_CHANGED')
    if ((after.current ?? after.sample) !== value) changes[key] = value
  }
  // Persist uploaded paths and before-images before the first contract mutation, including split Joomla writes.
  const intended = pictureReport({ shaped, values: art.values, refused: new Set(), readback: null })
  for (const item of shaped.shaped) {
    const receipt = intended.receipts[item.group.sample]
    receipt.state = art.values[item.group.slots[0]?.key] ? 'uploaded' : 'refused'
    receipt.before =
      real.receipts?.[item.group.sample]?.before ??
      Object.fromEntries(
        item.group.slots.map((s) => [s.key, slots.get(s.key)?.current ?? slots.get(s.key)?.sample ?? null])
      )
  }
  intended.report.verified = 0
  await realPictures.recordOutcome(real.buildId, intended)
  ctx.signal?.throwIfAborted()
  const refused = Object.keys(changes).length ? await write({ state, changes, contentMap }) : new Set()
  const after = await inspect()
  if (!after?.ok || after.contract !== initial.contract) throw fail('PICTURE_READBACK_FAILED')
  const readback = new Map(
    inspectedSlots(after, contentMap).map((s) => [s.key, String(s.current ?? s.sample ?? '')])
  )
  const html = await (await siteReader?.(ctx.siteKey))?.text('/').catch(() => null)
  const outcome = pictureReport({ shaped, values: art.values, refused, readback, homeHtml: html ?? null })
  for (const [key, receipt] of Object.entries(outcome.receipts))
    receipt.before = intended.receipts[key]?.before
  await realPictures.recordOutcome(real.buildId, outcome)
  ctx.time('picturesPlaced', outcome.report.photos)
  ctx.time('picturePlaceholders', outcome.report.placeholders)
  if (
    outcome.report.demoLeft.length ||
    outcome.report.demoOutside.length ||
    Object.values(outcome.receipts).some((r) => r.state !== 'verified')
  )
    ctx.note('picture replacement needs attention; see the build picture report')
  return { ...outcome, values: art.values }
}
