/** Image-only phase for the two contract CMSs. Selection/crop is shared; each engine supplies its existing writer. */

import { uploadPictures } from './pictures.js'
import { contentMapOf, keptPages, pictureReport, shapeReal } from './real-pictures.js'
import { meetSlotFit } from './picture-slot-fit.js'
import { takenOffPicturePaths } from './cutout-css.js'
import { markGalleryRemovals } from './gallery-picture-removals.js'

const fail = (code) => Object.assign(new Error(code), { code })

/** Joomla returns slot records; WordPress returns current values keyed by the released slot name. */
function inspectedSlots(state, contentMap) {
  if (Array.isArray(state.slots)) return state.slots
  if (!state.slots || typeof state.slots !== 'object') throw fail('PICTURE_SLOTS_UNREADABLE')
  return contentMap.slots
    .filter((slot) => Object.hasOwn(state.slots, slot.key))
    .map((slot) => ({ ...slot, current: state.slots[slot.key] }))
}

/**
 * The `replace_kept` words of a write: each changed slot whose Slot fit says the template keeps its picture, mapped to the
 * words its decor decision carries. A slot no decision asks for is left out, and the site refuses it as before.
 * @param {Array<{group: {slots: Array<{key: string, asked?: string}>}}>} shaped
 * @param {Record<string, string>} changes
 * @param {(key: string) => any} slotOf - the slot as the site lists it
 * @param {{slots?: any[]}} contentMap
 * @returns {Record<string, string>}
 */
export function keptAsks(shaped, changes, slotOf, contentMap) {
  const mapped = new Map((contentMap?.slots ?? []).map((s) => [s.key, s]))
  /** @type {Record<string, string>} */
  const out = {}
  for (const item of shaped)
    for (const binding of item.group?.slots ?? []) {
      if (typeof binding.asked !== 'string' || !binding.asked || !(binding.key in changes)) continue
      const fit = slotOf(binding.key)?.fit ?? mapped.get(binding.key)?.fit
      if (fit?.replace === 'keep') out[binding.key] = binding.asked
    }
  return out
}

/** Read/plan/draw only. The caller bounds this work before the CMS write clock begins. */
export async function prepareContractPictures({
  ctx,
  real,
  realPictures,
  siteFile,
  siteReader,
  contentMap = contentMapOf(ctx.contract),
  bound = {},
  copy = null,
  drawDoor = null,
  declared = [],
  cardNames = null,
  textModel = null,
  written = null
}) {
  if (!real || !siteFile) return null
  ctx.signal?.throwIfAborted()
  return shapeReal({
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
    // A slot no photo fits is drawn from the owner's photos when a picture model is set (#194); the icons and cut-outs
    // that carry the demo's subject follow the business (#195), read from the slots the profile only declares.
    drawDoor,
    bound,
    copy,
    declared,
    cardNames,
    // The text model reads each item icon's meaning (#189); without it the icons follow their keywords.
    textModel,
    // Copy first, then pictures (#189): the words already planned for the page choose and describe its pictures.
    written
  })
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
  bound = {},
  copy = null,
  drawDoor = null,
  declared = [],
  cardNames = null,
  textModel = null,
  written = null,
  shaped: suppliedShape
}) {
  if (!real || !siteFile) return null
  ctx.signal?.throwIfAborted()
  const initial = await inspect()
  if (!initial?.ok || initial.contract !== ctx.contract.id) throw fail('PICTURE_CONTRACT_CHANGED')
  const shaped =
    suppliedShape ??
    (await prepareContractPictures({
      ctx,
      real,
      realPictures,
      siteFile,
      siteReader,
      contentMap,
      bound,
      copy,
      drawDoor,
      declared,
      cardNames,
      textModel,
      written
    }))
  const slots = new Map(inspectedSlots(initial, contentMap).map((s) => [s.key, s]))
  // An icon or a cut-out the site's inspection does not list is left as shipped, never a reason to stop (#195).
  shaped.shaped = shaped.shaped.filter((item) => {
    if (!item.decor) return true
    const missing = item.group.slots.filter((b) => !slots.has(b.key))
    if (missing.length)
      ctx.note(`the site does not list ${missing[0].key}, so its decorative picture stays as shipped`)
    return missing.length === 0
  })
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
  // The plugin refuses a picture narrower than its slot's `fit.minWidth`: each is brought up to it first.
  shaped.shaped = await meetSlotFit(shaped.shaped, contentMap)
  shaped.shaped = await markGalleryRemovals(shaped.shaped)
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
  // A picture the template keeps (Slot fit `replace: "keep"`: its icons, its figures) is taken by the site only with the
  // words that ask for it (`replace_kept`). Without them every icon of a brief build was refused (SLOT_PICTURE_KEPT) and
  // stayed the demo's (local stand, 29/10/2026: 24 icons uploaded, none written).
  const replaceKept = keptAsks(shaped.shaped, changes, (key) => live.get(key) ?? slots.get(key), contentMap)
  const refused = Object.keys(changes).length
    ? await write({ state, changes, contentMap, ...(Object.keys(replaceKept).length ? { replaceKept } : {}) })
    : new Set()
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
  return {
    ...outcome,
    values: art.values,
    hiddenPictures: takenOffPicturePaths(shaped, art.values, refused),
    removedGalleryPictures: shaped.shaped
      .filter((item) => item.hide && item.group.role === 'gallery')
      .flatMap((item) =>
        item.group.slots
          .filter((slot) => art.values[slot.key] && !refused.has(slot.key))
          .map((slot) => ({ path: art.values[slot.key], routes: item.group.routes ?? [] }))
      )
  }
}
