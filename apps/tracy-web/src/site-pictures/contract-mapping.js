// Exports a site-pictures/1 manifest (ADR 0043) as what the Joomla content contract write door accepts
// (`applyJoomlaContract`): { contract, revision, changes: { <content map key>: <media path> }, evidence, pending,
// emptyLinks }, plus the files to upload first (`media.upload`, the path is `images/tracy-content/<sha256>.<ext>`).
// Pure: no I/O, no network, no site. Nothing is uploaded or written; the write step decides what to do with it.
//
// The door has no way to hide a picture slot (`emptyLinks` takes link slots only, and `pending` makes it refuse the
// whole mapping), so a hidden frame is left out of `changes` and listed in `hidden` for the write step.
import { contentMapKey } from '../site-writer/contract-mapping.js'
import { readPictures } from './manifest-shape.js'

export { contentMapKey }

/**
 * @param {{ pictures: object, contract: string, revision: string, kit?: object }} input
 * @returns {{
 *   mapping: { contract: string, revision: string, changes: Record<string,string>, evidence: {}, pending: [], emptyLinks: [] },
 *   uploads: { sitePath: string, file: string, sha256: string, width: number, height: number }[],
 *   hidden: { frame: string, key: string, reason: string }[],
 *   recolourable: string[],
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
  const changes = {}
  const placedFiles = new Map() // sitePath -> upload record, one per file
  const hidden = []
  const recolourable = []

  // The file a frame places, or null with a problem. A twin holds its source's file; an icon twin may hold the
  // source's light or its dark file (P11), and nothing else.
  function placement(e) {
    if (e.source !== 'twin') return { file: e }
    const src = frames.get(e.twinOf)
    if (!src) return bad(e.frame, `twin follows ${e.twinOf}, which has no entry`) ?? null
    if (src.source === 'hide') return { hide: src }
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
      hidden.push({ frame: e.frame, key, reason: `its source ${p.hide.frame} is hidden` })
      continue
    }
    if (imageSlots && !imageSlots.has(key)) {
      bad(e.frame, `the kit has no image slot ${key}`)
      continue
    }
    changes[key] = e.sitePath
    if (e.recolourable) recolourable.push(key)
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
      reason: e.reason
    }))
  return {
    mapping: { contract, revision, changes, evidence: {}, pending: [], emptyLinks: [] },
    uploads: [...placedFiles.values()],
    hidden,
    recolourable,
    siteSettings,
    problems
  }
}
