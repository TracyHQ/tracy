// Indexes the plan, the kit and the brief for the picture check rules (ADR 0043). Reads tolerantly: a missing or
// oddly shaped part yields an empty index and never throws. Nothing here modifies an input.
import { contentMapKey } from '../../lib/content-map-key.js'
import { galleryIndex } from '../gallery-tiles.js'

const arr = (x) => (Array.isArray(x) ? x : [])
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)
const isSize = (x) => Number.isInteger(x) && x > 0

// The demo file size of a content map slot: fit.source, else the width and height the sample's image URL carries
// (`...?width=1920&height=960`). Both are the size of the file the site holds today.
function demoFileSize(slot) {
  const src = slot?.fit?.source
  if (isSize(src?.width) && isSize(src?.height)) return { width: src.width, height: src.height }
  const q = /[?&]width=(\d+)&height=(\d+)/.exec(String(slot?.sample ?? ''))
  return q ? { width: Number(q[1]), height: Number(q[2]) } : null
}

const pathOnly = (p) => String(p ?? '').split('#')[0]

function indexKit(kit) {
  const frames = new Map()
  const twinsOf = new Map()
  for (const b of arr(kit?.blocks)) {
    if (!isObject(b)) continue
    for (const f of arr(b.frames))
      if (isObject(f) && typeof f.id === 'string' && !frames.has(f.id))
        frames.set(f.id, { ...f, blockId: b.id })
  }
  for (const f of frames.values())
    if (typeof f.twinOf === 'string' && f.twinOf)
      twinsOf.set(f.twinOf, [...(twinsOf.get(f.twinOf) ?? []), f.id])
  const demoPaths = new Set([...frames.values()].map((f) => pathOnly(f.picture)).filter((p) => p !== ''))
  const demoHashes = new Map()
  for (const f of frames.values())
    if (typeof f.pictureSha256 === 'string') demoHashes.set(f.pictureSha256.toLowerCase(), f.id)
  const slots = new Map(
    arr(kit?.contentMap?.slots)
      .filter((s) => isObject(s) && typeof s.key === 'string')
      .map((s) => [s.key, s])
  )
  // The narrowest file the write door takes for a frame (the slot's fit.minWidth, SlotFit checkPicture): carried on the
  // frame, so every cut and every drawing for it is written at least that wide (card AI).
  for (const [id, f] of frames) {
    const fit = slots.get(contentMapKey(id))?.fit
    const min = fit?.minWidth
    // A photo frame can still require alpha (for example a customer-avatar strip). Its classification alone does
    // not describe what the native slot accepts; retain the contract's requirement before choosing a JPEG cut.
    frames.set(id, {
      ...f,
      ...(isSize(min) ? { minWidth: min } : {}),
      ...(fit?.transparent === true ? { transparent: true } : {})
    })
  }
  const demoSize = (frameId) => {
    const s = slots.get(contentMapKey(frameId))
    return s ? demoFileSize(s) : null
  }
  // The picture lists a frame sits in (gallery-tiles.js): its block, list and row.
  const galleries = galleryIndex(kit)
  const gallery = (frameId) => galleries.get(frameId) ?? null
  // A frame written through a kit setting slot (`site.settingSlots`, e.g. the T4 page background) has no content map
  // slot: it goes in siteSettings like a frame the kit marks not writable, and the write step sets it through the slot.
  const settingSlotIds = new Set(
    arr(kit?.site?.settingSlots)
      .filter((s) => isObject(s) && typeof s.id === 'string')
      .map((s) => s.id)
  )
  /** The manifest list a frame of the kit goes in: `siteSettings` or `frames`. */
  const listOf = (frame) =>
    frame?.writable === false || settingSlotIds.has(frame?.slotId) ? 'siteSettings' : 'frames'
  return { frames, twinsOf, demoPaths, demoHashes, demoSize, gallery, listOf }
}

// Every picture wish of the plan, with the pages it shows on. A shared block shows on every kept page.
function indexPlan(plan) {
  const kept = arr(plan?.pages).filter(
    (p) => isObject(p) && p.decision === 'keep' && typeof p.id === 'string'
  )
  const allPages = kept.map((p) => p.id)
  const wishes = new Map()
  const duplicates = []
  const visit = (d, pages) => {
    if (!isObject(d) || d.decision === 'hide') return
    const pics = [
      ...arr(d.pictures),
      ...arr(d.lists).flatMap((l) => arr(l?.items).flatMap((i) => arr(i?.pictures)))
    ]
    for (const p of pics) {
      if (!isObject(p) || typeof p.frame !== 'string') continue
      const known = wishes.get(p.frame)
      if (known) {
        for (const pg of pages) known.pages.add(pg)
        duplicates.push(p.frame)
      } else wishes.set(p.frame, { ...p, pages: new Set(pages) })
    }
  }
  for (const d of arr(plan?.sharedBlocks)) visit(d, allPages)
  for (const p of kept) for (const d of arr(p.blocks)) visit(d, [p.id])
  return { wishes, pages: allPages }
}

// The ids a brief person fact goes by: the fact id itself and any id the fact names for its person.
function personIds(brief, factId) {
  const ids = new Set([factId])
  const fact = arr(brief?.facts).find((f) => isObject(f) && f.id === factId)
  for (const id of [fact?.personId, fact?.person, fact?.value?.id])
    if (typeof id === 'string' && id) ids.add(id)
  return ids
}

// The files the picture step wrote: a function path -> { sha256, width, height } | null, a Map or a plain object.
function fileReader(files) {
  if (typeof files === 'function') return (p) => files(p) ?? null
  if (files instanceof Map) return (p) => files.get(p) ?? null
  if (isObject(files)) return (p) => (Object.hasOwn(files, p) ? files[p] : null)
  return () => null
}

export function indexInputs({ plan, kit, brief, files, icons }) {
  const kitIndex = indexKit(kit)
  const planIndex = indexPlan(plan)
  const assets = new Map(
    arr(brief?.assets)
      .filter((a) => isObject(a) && typeof a.id === 'string')
      .map((a) => [a.id, a])
  )
  return {
    ...kitIndex,
    ...planIndex,
    /** A gallery tile: a real-photo wish or business gallery role in a picture list; never hidden alone. */
    galleryTile: (frameId) =>
      planIndex.wishes.get(frameId)?.match === 'any-real' ||
      kitIndex.frames.get(frameId)?.role === 'business.gallery_image'
        ? kitIndex.gallery(frameId)
        : null,
    // The kit's business gallery role, a real-photo request and a photo grounded in observations or an original post
    // document the business. A planner's specific wish cannot turn its gallery into an illustration.
    // A cutout can remain a generic illustration; it does not claim to be a portrait of its staff.
    documentaryFrame: (frameId) => {
      const wish = planIndex.wishes.get(frameId)
      if (kitIndex.frames.get(frameId)?.role === 'business.gallery_image') return true
      if (wish?.match === 'any-real') return true
      if (kitIndex.frames.get(frameId)?.kind !== 'photo') return false
      return arr(wish?.factIds).some((id) =>
        arr(brief?.facts).some((f) => f.id === id && (f.sourceKind === 'observed' || f.field === 'posts'))
      )
    },
    assets,
    personIds: (factId) => personIds(brief, factId),
    readFile: fileReader(files),
    icons: Array.isArray(icons) || icons instanceof Set ? new Set(icons) : null
  }
}
