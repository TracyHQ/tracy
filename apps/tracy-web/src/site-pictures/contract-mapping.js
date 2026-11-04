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
import { contentMapKey } from '../site-writer/contract-mapping.js'
import { readPictures } from './manifest-shape.js'
import { paintKindOf } from './paint.js'

export { contentMapKey }

/**
 * @param {{ pictures: object, contract: string, revision: string, kit?: object }} input
 * @returns {{
 *   mapping: { contract: string, revision: string, changes: Record<string,string>, evidence: {}, pending: [], emptyLinks: [] },
 *   uploads: { sitePath: string, file: string, sha256: string, width: number, height: number }[],
 *   hidden: { frame: string, key: string, reason: string }[],
 *   painted: { frame: string, key: string, kind: 'initials' | 'icon', paint: object, holds: 'light' | 'dark' | null,
 *     draw: { letters: string } | { icon: string, set: string, weight: string }, width: number, height: number,
 *     preview: { sitePath: string, file: string, sha256: string, width: number, height: number },
 *     previewDark: object | null }[],
 *   siteSettings: object[],
 *   problems: { where: string, detail: string }[]
 * }}
 */
export function exportPictureMapping({ pictures, contract, revision, kit }) {
  const { view, problems } = readPictures(pictures)
  const frames = new Map(view.entries.filter((e) => e.list === 'frames').map((e) => [e.frame, e]))
  const imageSlots = kit?.contentMap?.slots
    ? new Set(kit.contentMap.slots.filter((s) => s.type === 'image').map((s) => s.key))
    : null
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
    const key = contentMapKey(e.frame)
    if (e.source === 'hide') {
      hidden.push({ frame: e.frame, key, reason: e.reason })
      continue
    }
    const p = placement(e)
    if (!p) continue
    if (p.hide) {
      hidden.push({
        frame: e.frame,
        key,
        reason: p.returned ? 'source returned' : `its source ${p.hide.frame} is hidden`
      })
      continue
    }
    if (imageSlots && !imageSlots.has(key)) {
      bad(e.frame, `the kit has no image slot ${key}`)
      continue
    }
    if (e.paint) {
      const p = paintedOf(e, key)
      if (p) painted.push(p)
      continue
    }
    changes[key] = e.sitePath
    if (!placedFiles.has(e.sha256))
      placedFiles.set(e.sha256, {
        sitePath: e.sitePath,
        file: e.file,
        sha256: e.sha256,
        width: e.width,
        height: e.height
      })
  }
  const siteSettings = view.entries
    .filter((e) => e.list === 'siteSettings')
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
    problems
  }
}
