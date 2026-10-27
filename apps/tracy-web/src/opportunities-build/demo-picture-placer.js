/**
 * Shared, deterministic picture proposals for the agent plan and residue sweep (#1739, Hano 26/10/2026).
 * Pure: frames still holding template pictures in; one proposal per frame out. It never writes or claims QA passed.
 */
import { BACKGROUND_UNFIT, visionLabelOf } from './demo-photo-labels.js'

export const PICTURE_PLACER_VERSION = 'picture-placer/2'
const positive = (n) => Number.isFinite(n) && n > 0
const lexical = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * @param {{frames: {frameId: string, page: string, width: number, height: number, kind?: string,
 *   underWords?: boolean, subject?: string, target?: object}[], media: any[]}} input
 */
export function placePictures({ frames, media }) {
  const usage = new Map()
  const assigned = new Map()
  // Constrained frames get first choice, then stable frame ids. Output still follows the caller's frame order.
  const ordered = [...frames].sort(
    (a, b) =>
      Number(b.underWords === true || b.kind === 'background') -
        Number(a.underWords === true || a.kind === 'background') ||
      lexical(a.page, b.page) ||
      lexical(a.frameId, b.frameId)
  )
  for (const frame of ordered) {
    const result = {
      frameId: frame.frameId,
      page: frame.page,
      target: frame.target ?? null,
      mapping: frame.target ? 'mapped' : 'unmapped',
      identity: 'unverified',
      photo: null,
      crop: null,
      tone: null,
      reason: '',
      fallback: null,
      alternatives: []
    }
    assigned.set(frame.frameId, result)
    if (!positive(frame.width) || !positive(frame.height)) {
      result.reason = 'Frame dimensions are missing; read the rendered frame before choosing a crop.'
      result.fallback = { code: 'FRAME_SIZE_UNKNOWN', action: 'measure-frame' }
      continue
    }
    const aspect = frame.width / frame.height
    const behind = frame.underWords === true || frame.kind === 'background'
    const candidates = []
    for (const photo of media) {
      if (!photo?.id || !positive(photo.width) || !positive(photo.height)) continue
      const label = visionLabelOf(photo)
      // Unknown suitability is unresolved. A good aspect ratio cannot make an unlabelled photo safe behind words.
      if (
        !label?.subject ||
        label.quality === 'blurry' ||
        label.quality === 'poor' ||
        label.isCollage === true ||
        label.hasTextOverlay === true
      )
        continue
      if (behind && (BACKGROUND_UNFIT.includes(label.subject) || photo.cutout === true)) continue
      if (frame.kind !== 'logo' && label.subject === 'logo') continue
      if (frame.kind === 'logo' && label.subject !== 'logo') continue
      if (frame.subject && frame.subject !== label.subject) continue
      const width = Math.floor(Math.min(photo.width, photo.height * aspect))
      const height = Math.floor(width / aspect)
      if (width < frame.width || height < frame.height) continue
      const used = usage.get(frame.page)?.get(photo.sha256 ?? photo.id) ?? 0
      const fit = Math.abs(Math.log(photo.width / photo.height / aspect))
      candidates.push({
        photo,
        crop: {
          aspect,
          source: { width: photo.width, height: photo.height },
          output: { width: Math.round(frame.width), height: Math.round(frame.height) },
          strategy: 'centre'
        },
        hero: behind && label.heroWorthy === true ? 1 : 0,
        used,
        fit
      })
    }
    candidates.sort(
      (a, b) => b.hero - a.hero || a.used - b.used || a.fit - b.fit || lexical(a.photo.id, b.photo.id)
    )
    const chosen = candidates[0]
    if (!chosen) {
      result.reason = 'No labelled research photo fits this frame safely at its rendered size.'
      result.fallback = {
        code: 'NO_SUITABLE_PHOTO',
        action: 'review-frame-and-research',
        keepTemplate: false
      }
      continue
    }
    result.photo = chosen.photo.id
    result.crop = chosen.crop
    result.reason = `${behind ? 'Labelled photo suitable behind words' : 'Labelled photo with a compatible broad subject and size'}; ${chosen.used ? 'reused because stronger candidates are already used' : 'not yet used on this page'}; product/person/location identity unverified; centre crop, subject position unverified; tone awaits rendered contrast measurement.`
    result.alternatives = candidates
      .slice(1, 4)
      .map((c) => ({ photo: c.photo.id, crop: c.crop, tone: null, identity: 'unverified' }))
    result.fallback = result.alternatives.length
      ? { code: 'TRY_ALTERNATIVE', photo: result.alternatives[0].photo }
      : { code: 'NO_ALTERNATIVE', action: 'review-frame-and-research' }
    const byPhoto = usage.get(frame.page) ?? new Map()
    byPhoto.set(chosen.photo.sha256 ?? chosen.photo.id, chosen.used + 1)
    usage.set(frame.page, byPhoto)
  }
  return { version: PICTURE_PLACER_VERSION, proposals: frames.map((f) => assigned.get(f.frameId)) }
}
