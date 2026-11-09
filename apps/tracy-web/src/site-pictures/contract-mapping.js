// Exports a site-pictures/1 manifest (ADR 0043) as what the Joomla content contract write door accepts
// (`applyJoomlaContract`): { contract, revision, changes: { <content map key>: <media path> }, evidence, pending,
// emptyLinks }, plus the files to upload first (`media.upload`, the path is `images/tracy-content/<sha256>.<ext>`).
// Pure: no I/O, no network, no site. Nothing is uploaded or written; the write step decides what to do with it.
//
// The door has no way to hide a picture slot (`emptyLinks` takes link slots only, and `pending` makes it refuse the
// whole mapping), so a hidden frame is left out of `changes` and listed in `hidden` for the write step.
//
// A painted frame (initials, an icon, a twin of one) is not final either: its colours are roles (paint.js) and its file
// a preview in a neutral palette. It is left out of `changes` and `uploads` and listed in `painted` with all the write
// step needs to finish it from data alone: where the slot takes HTML, markup that uses the Design system accent
// variable; where it only takes an image path, a file drawn in the brand's colours (and recorded so it is drawn again
// when the Design system changes). This export does not choose; `painted` is the one place a frame is said to be painted.
// A drawn cut-out with a backdrop (the disc and bands its demo has behind the figure) is placed as it is, the figure
// alone, and also listed in `painted` (kind `backdrop`) with the recipe: step 9 paints the backdrop behind the figure
// in the brand's colours (a file of both, or the backdrop behind the slot), and its preview is only for review.
//
// The alt of every placed picture or painted initials frame comes from the picture step, by frame.
//
// A frame the manifest returns (the plan wants it filled and the step left it without a picture) is a problem of the
// package, never silently left out: only the logo frame, which the brand step fills, is not.
import { contentMapKey } from '../lib/content-map-key.js'
import { paintKindOf } from '../lib/picture-paint/paint.js'
import { ANY_PHOTO_MAX_OVERLAP, cropOverlap } from './gallery-tiles.js'
import { retainedRejectionProblem } from './looker-call.js'
import { readPictures } from './manifest-shape.js'
import { paintKindOf } from '../lib/picture-paint/paint.js'
import { indexInputs } from './picture-check/inputs-index.js'
import { documentarySourceProblem } from './picture-check/rules-sources.js'

/**
 * A return that is not the picture step's to fill: the brand step places the logo, and a frame the kit marks not
 * writable (module chrome, a twin a template setting paints) has no slot to write to.
 */
const NOT_OURS = /^(a logo frame belongs to the brand step|the kit marks this frame not writable)/
/**
 * The check of a file's width against its content map slot's `fit.minWidth` (the write door's SlotFit checkPicture):
 * `(key, width)` gives the problem sentence, or null when the slot takes it. Shared with the write step's package check.
 * @param {{ slots?: object[] } | null | undefined} contentMap
 */
export function narrowerThanSlot(contentMap) {
  const mins = new Map(
    (Array.isArray(contentMap?.slots) ? contentMap.slots : [])
      .filter((s) => Number.isInteger(s?.fit?.minWidth) && s.fit.minWidth > 0)
      .map((s) => [s.key, s.fit.minWidth])
  )
  return (key, width) => {
    const min = mins.get(key)
    return min && Number(width) < min
      ? `its file is ${width} px wide; the kit slot ${key} takes at least ${min}`
      : null
  }
}

/** The opening of the problem that names a frame the plan wants filled and the picture step left without a picture. */
export const LEFT_EMPTY = 'the plan wants a picture here and the picture step left it without one'

export { contentMapKey }

/**
 * @param {{ pictures: object, contract: string, revision: string, kit?: object, plan?: object, brief?: object }} input
 * @returns {{
 *   mapping: { contract: string, revision: string, changes: Record<string,string>, evidence: {}, pending: [], emptyLinks: [] },
 *   uploads: { sitePath: string, file: string, sha256: string, width: number, height: number }[],
 *   hidden: { frame: string, key: string, reason: string }[],
 *   painted: { frame: string, key: string, kind: 'initials' | 'icon' | 'backdrop', paint: object,
 *     holds: 'light' | 'dark' | null, draw: { letters: string } | { icon: string, set: string, weight: string }
 *     | { backdrop: object, figure: string }, width: number, height: number,
 *     preview: { sitePath: string, file: string, sha256: string, width: number, height: number },
 *     previewDark: object | null }[],
 *   siteSettings: object[],
 *   alts: Record<string, string>,
 *   problems: { where: string, detail: string }[]
 * }}
 */
export function exportPictureMapping({ pictures, contract, revision, kit, plan, brief }) {
  const { view, problems } = readPictures(pictures)
  const entries = new Map(view.entries.map((e) => [e.frame, e]))
  const frames = new Map(view.entries.filter((e) => e.list === 'frames').map((e) => [e.frame, e]))
  const idx = indexInputs({ kit, plan, brief })
  const knownContext = Array.isArray(kit?.blocks) && Array.isArray(plan?.pages) && Array.isArray(brief?.facts)
  // The plan check's existing match enum; a sameAs twin inherits the root's established purpose.
  const knownWish = (wish) =>
    ['any-real', 'specific', 'person'].includes(wish?.match) ||
    (typeof wish?.sameAs === 'string' &&
      ['any-real', 'specific', 'person'].includes(idx.wishes.get(wish.sameAs)?.match))
  const factIds = new Set((Array.isArray(brief?.facts) ? brief.facts : []).map((f) => f.id))
  // A failed or historical manifest still goes through this boundary. A retained hard rejection
  // and its twins cannot be uploaded. Generated documentary substitutes also remain refused;
  // missing original inputs cannot establish an illustrative purpose.
  const sourceProblem = (entry) => {
    let root = entry
    const seen = new Set()
    while (root.source === 'twin' && !seen.has(root.frame)) {
      seen.add(root.frame)
      root = entries.get(root.twinOf) ?? root
    }
    const rejection = retainedRejectionProblem(entry) ?? retainedRejectionProblem(root)
    if (rejection) return rejection
    if (!['drawn', 'owner-photo-extended'].includes(root.source)) return null
    const wishes = [entry, root].map((e) => idx.wishes.get(e.frame))
    if (
      !knownContext ||
      [entry, root].some((e) => !idx.frames.has(e.frame)) ||
      wishes.some(
        (wish) =>
          !knownWish(wish) || (Array.isArray(wish?.factIds) && wish.factIds.some((id) => !factIds.has(id)))
      )
    )
      return 'generated picture provenance is unknown without its original kit, plan wish and brief facts'
    return (
      documentarySourceProblem(idx, { ...entry, source: root.source }) ?? documentarySourceProblem(idx, root)
    )
  }
  const imageSlots = kit?.contentMap?.slots
    ? new Set(kit.contentMap.slots.filter((s) => s.type === 'image').map((s) => s.key))
    : null
  const tooNarrow = narrowerThanSlot(kit?.contentMap)
  const transparentSlots = new Set(
    (Array.isArray(kit?.contentMap?.slots) ? kit.contentMap.slots : [])
      .filter((s) => s?.fit?.transparent === true)
      .map((s) => s.key)
  )
  // The kit block of each frame, and the cuts of each owner photo already placed in each block: two cuts of one photo
  // in one block share at most ANY_PHOTO_MAX_OVERLAP (card AK: a near duplicate reads as the same picture twice).
  const blockOf = new Map()
  // A frame a T4 layout paints behind the blocks writes the layout's own slots (`writesTo`, every layout section showing
  // that picture); any other frame writes the slot of its own id.
  const writesOf = new Map()
  for (const b of Array.isArray(kit?.blocks) ? kit.blocks : [])
    for (const f of Array.isArray(b?.frames) ? b.frames : []) {
      if (!f?.id) continue
      blockOf.set(f.id, b.id)
      if (Array.isArray(f.writesTo) && f.writesTo.length) writesOf.set(f.id, f.writesTo.map(String))
    }
  const shownIn = new Map()
  const bad = (where, detail) => {
    problems.push({ where, detail })
  }
  // No image slot of the JA Boxing content map (1.0.10) sets requiresEvidence, so `evidence` can stay empty.
  const changes = {}
  const placedFiles = new Map() // sitePath -> upload record, one per file
  // The Joomla door cannot hide a picture slot, so a hidden frame is only listed here, never written. The write step
  // must hide the row itself, or the frame silently keeps its demo picture.
  const hidden = []
  const painted = []
  const alts = {}
  const altOf = (e) => {
    if (typeof e.alt === 'string' && e.alt) alts[e.frame] = e.alt
  }
  const previewOf = (f) => ({
    sitePath: f.sitePath,
    file: f.file,
    sha256: f.sha256,
    width: f.width,
    height: f.height
  })
  // What step 9 needs to draw a painted frame again: the letters, or the icon's name, set and weight (a twin's are its
  // root source's).
  function paintedOf(e, key) {
    let root = e
    for (const seen = new Set(); root.source === 'twin' && !seen.has(root.frame); ) {
      seen.add(root.frame)
      root = frames.get(root.twinOf) ?? root
    }
    const kind = paintKindOf(e.paint)
    const draw =
      root.source === 'initials'
        ? { letters: root.letters }
        : root.source === 'icon'
          ? { icon: root.icon.light, set: root.icon.set, weight: root.icon.weight }
          : null
    if (!draw) return bad(e.frame, `painted twin ${e.frame} has no initials or icon source`) ?? null
    const { holds = null, ...paint } = e.paint
    return {
      frame: e.frame,
      key,
      kind,
      paint,
      holds: kind === 'icon' ? (holds ?? 'light') : null,
      draw,
      width: e.width,
      height: e.height,
      preview: previewOf(e),
      previewDark: e.source === 'icon' && e.dark ? previewOf(e.dark) : null
    }
  }

  // The file a frame places, or null with a problem. A twin holds its source's file; an icon twin may hold the
  // source's light or its dark file (P11), and nothing else.
  function placement(e, seen = new Set()) {
    if (e.source !== 'twin') return { file: e }
    const src = frames.get(e.twinOf)
    // A source with no entry was returned to the planner; its twin is hidden too (ADR 0043, P11).
    if (!src) return { hide: { frame: e.twinOf }, returned: true }
    if (src.source === 'hide') return { hide: src }
    // A twin of a twin follows the chain: it is hidden when the root source is hidden.
    if (src.source === 'twin') {
      const up = seen.has(src.frame) ? null : placement(src, new Set([...seen, e.frame]))
      if (!up) return bad(e.frame, `twin chain from ${e.frame} has no placed source`) ?? null
      if (up.hide) return up
    }
    const allowed = [src, ...(src.source === 'icon' && src.dark ? [src.dark] : [])]
    if (!allowed.some((f) => f.sha256 === e.sha256))
      return bad(e.frame, `twin holds another file than ${e.twinOf}, its source`) ?? null
    return { file: e }
  }

  for (const e of frames.values()) {
    const keys = writesOf.get(e.frame) ?? [contentMapKey(e.frame)]
    const key = keys[0]
    const provenance = sourceProblem(e)
    if (provenance) {
      bad(e.frame, provenance)
      continue
    }
    // shortcut: layout hide/paint stays refused until downstream stages address every bound slot.
    if (writesOf.has(e.frame) && (e.source === 'hide' || e.paint || e.backdrop)) {
      bad(
        e.frame,
        'layout backgrounds support file placement only; hide and painted writes are not supported'
      )
      continue
    }
    if (e.source === 'hide') {
      hidden.push({ frame: e.frame, key, reason: e.reason })
      continue
    }
    const p = placement(e)
    if (!p) continue
    if (p.hide && writesOf.has(e.frame)) {
      bad(
        e.frame,
        'layout backgrounds support file placement only; hiding a source cannot hide its layout twin'
      )
      continue
    }
    if (p.hide) {
      const reason = p.returned ? 'source returned' : `its source ${p.hide.frame} is hidden`
      hidden.push({ frame: e.frame, key, reason })
      continue
    }
    const missing = imageSlots ? keys.find((k) => !imageSlots.has(k)) : null
    if (missing) {
      bad(e.frame, `the kit has no image slot ${missing}`)
      continue
    }
    // Historical manifests and twins can still carry an opaque photo. JPEG has no alpha; refuse it before upload
    // instead of waiting for SLOT_IMAGE_OPAQUE after the rest of the site has been written. Native validation also
    // checks alpha-capable formats against their actual bytes.
    const opaqueIn = keys.find((k) => transparentSlots.has(k))
    if (opaqueIn && /\.jpe?g$/i.test(String(e.file))) {
      bad(e.frame, `the kit slot ${opaqueIn} requires transparency; its JPEG file is opaque`)
      continue
    }
    if (e.paint) {
      const p = paintedOf(e, key)
      if (p) painted.push(p)
      if (p?.kind === 'initials') altOf(e)
      continue
    }
    const block = blockOf.get(e.frame)
    if (block && e.source === 'owner-photo' && e.asset) {
      const key = `${block} ${e.asset}`
      const near = e.crop
        ? (shownIn.get(key) ?? []).find(
            (o) => o.crop && cropOverlap(o.crop, e.crop) > ANY_PHOTO_MAX_OVERLAP + 1e-9
          )
        : null
      if (near) {
        const share = Math.round(cropOverlap(near.crop, e.crop) * 100)
        bad(
          e.frame,
          `owner photo ${e.asset} is already shown in ${near.frame} of the same block ${block}, the two cuts sharing ${share}% (at most ${ANY_PHOTO_MAX_OVERLAP * 100}%)`
        )
        continue
      }
      shownIn.set(key, [...(shownIn.get(key) ?? []), { frame: e.frame, crop: e.crop }])
    }
    // A file narrower than the slot's minimum is refused by the write door and the demo picture stays (card AI).
    const narrow = keys.map((k) => tooNarrow(k, e.width)).find(Boolean)
    if (narrow) {
      bad(e.frame, narrow)
      continue
    }
    for (const k of keys) changes[k] = e.sitePath
    altOf(e)
    if (e.backdrop)
      painted.push({
        frame: e.frame,
        key,
        kind: 'backdrop',
        paint: e.backdrop.paint,
        holds: null,
        draw: { backdrop: e.backdrop.shape, figure: e.sitePath },
        width: e.width,
        height: e.height,
        preview: e.backdrop.preview,
        previewDark: null
      })
    if (!placedFiles.has(e.sha256))
      placedFiles.set(e.sha256, {
        sitePath: e.sitePath,
        file: e.file,
        sha256: e.sha256,
        width: e.width,
        height: e.height
      })
  }
  // A frame the plan wants filled that the step returned keeps its demo picture unless someone acts: never silent
  // (card AJ). Each is a problem of the package, which step 9 reports as refused instead of "no owner".
  for (const r of view.returns)
    if (!NOT_OURS.test(r.reason) && !frames.has(r.frame)) bad(r.frame, `${LEFT_EMPTY}: ${r.reason}`)
  const siteSettings = view.entries
    .filter((e) => e.list === 'siteSettings')
    .filter((e) => {
      const provenance = sourceProblem(e)
      if (provenance) bad(e.frame, provenance)
      return !provenance
    })
    .map((e) => ({
      frame: e.frame,
      writeDoor: 'none',
      source: e.source,
      file: e.file,
      width: e.width,
      height: e.height,
      sha256: e.sha256,
      sitePath: e.sitePath,
      darkened: e.darkened,
      paint: e.paint,
      preview: e.preview,
      reason: e.reason
    }))
  return {
    mapping: { contract, revision, changes, evidence: {}, pending: [], emptyLinks: [] },
    uploads: [...placedFiles.values()],
    hidden,
    painted,
    siteSettings,
    alts,
    problems
  }
}
