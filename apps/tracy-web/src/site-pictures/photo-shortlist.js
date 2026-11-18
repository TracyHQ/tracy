// The code shortlist of owner photos (#340, ADR 0043 section 3): which brief photos a frame may take at all, and in
// which order code tries them for a frame where any real photo will do. Pure. Size and sharpness are judged when a
// photo is cut (cut-photo.js); here only the brief's labels and pixel sizes.
//
// A photo is out when it is not a still the business could show: a video or something that is not a photograph
// (unlabelledReason), lettering or a watermark, another business, a blurry label, a graphic; or when a label that
// decides it is unknown (the picture check fails an unlabelled photo, P09). Low quality photos only for small frames.
import { SMALL_FRAME_MAX } from './cut-photo.js'

const SKIPPED_UNLABELLED = new Set(['video', 'not_a_photograph'])
const QUALITY_RANK = { high: 0, medium: 1, unknown: 2, low: 3 }

const bool = (x) => (typeof x === 'boolean' ? x : null)

/**
 * Lettering or a watermark (P09, ADR 0043 section 2): the brief label `hasTextOrWatermark` (words, a logo, a stamp or a
 * watermark written on the photo itself, not signs that are part of the scene), else the vision label names. Words
 * added on top of the photo always count.
 *
 * 🔒 SCENE TEXT IS NOT LETTERING. From 11/11/2026 any `textPresence: present` refused the photo; on the measured Central
 * Padel build (12/11/2026) that refused 239 of the business's 245 photos (its name on shirts, court banners, racket
 * prints), left 8 for 37 frames and 10 frames to step 9b as template pictures. The looker reads the same rule
 * (looker-prompt.md "stray lettering"), so a photo admitted here is not turned away there.
 */
export function letteringOf(a) {
  if (a.hasTextOverlay === true) return true
  const own = bool(a.hasTextOrWatermark)
  if (own !== null) return own
  const vision = [
    a.textPresence === 'present' ? true : a.textPresence === 'absent' ? false : null,
    bool(a.hasTextOverlay)
  ].filter((x) => x !== null)
  return vision.length ? vision.includes(true) : null
}
export const otherBusinessOf = (a) => bool(a.showsOtherBusiness) ?? bool(a.otherBusiness)

/**
 * Whether the photo is blurry. The measured sharpness gate is primary: its record (`{passed, verdict, ...}`, written by
 * cut-photo.js writeRect from lib/photo-sharpness.js judgePhoto) decides when present. The vision model's `isBlurry` is a
 * second opinion, read only when no measurement exists, so a photo the machine measured sharp is never refused for it.
 */
export function blurryOf(a) {
  const measured = a?.sharpness
  if (measured && typeof measured === 'object' && typeof measured.passed === 'boolean')
    return !measured.passed
  return a?.isBlurry === true
}

/** Why a brief asset can never fill a picture frame, or null when it may. */
export function photoRefusal(a) {
  if (a?.kind !== 'image') return 'not a still image'
  if (SKIPPED_UNLABELLED.has(a.unlabelledReason)) return `unlabelled: ${a.unlabelledReason}`
  if (a.isGraphic === true || a.content === 'logo' || a.content === 'text-graphic') return 'a graphic'
  const text = letteringOf(a)
  const other = otherBusinessOf(a)
  if (text === true) return 'lettering or a watermark'
  if (other === true) return 'another business'
  if (text === null || other === null) return 'a label that decides it is unknown'
  if (blurryOf(a)) return 'blurry'
  return null
}

/** The photos of the brief code may use, by id, each with its photo; `refused` says why the others are out. */
export function usablePhotos(brief, photoBytes) {
  const usable = []
  const refused = []
  for (const a of Array.isArray(brief?.assets) ? brief.assets : []) {
    if (!a || typeof a.id !== 'string') continue
    const why = photoRefusal(a) ?? (photoBytes.has(a.id) ? null : 'no bytes with its hash')
    if (why) refused.push({ asset: a.id, reason: why })
    else usable.push(a)
  }
  return { usable, refused }
}

const portraitIdOf = (a) => {
  const p = a?.portraitOf
  return typeof p === 'string' ? p : typeof p?.id === 'string' ? p.id : null
}
const depictsIdOf = (a) => (typeof a?.depicts === 'string' ? a.depicts : (a?.depicts?.id ?? null))

/** Whether a photo shows the wish's own offering: its depicts id is one of the facts the wish cites. */
export const sameService = (a, wish) => {
  const id = depictsIdOf(a)
  return Boolean(id) && Array.isArray(wish.factIds) && wish.factIds.includes(id)
}

/** The photos labelled as a portrait of one of `personIds` (never by face recognition). */
export const portraitsOf = (photos, personIds) =>
  photos.filter((a) => {
    const id = portraitIdOf(a)
    return id !== null && personIds.has(id)
  })

/**
 * The order code tries photos in for an any-real frame: the wish's own offering first, then the photo used least
 * across the site, then the better quality, then the larger, ties by id. A low quality photo only for a small frame;
 * a portrait of someone is never used as an any-real picture.
 */
export function rankForFrame(photos, wish, frame, usage) {
  const longest = Math.max(Number(frame.width) || 0, Number(frame.height) || 0)
  const area = (a) => (Number(a.width) || 0) * (Number(a.height) || 0)
  return photos
    .filter((a) => portraitIdOf(a) === null)
    .filter((a) => a.quality !== 'low' || longest <= SMALL_FRAME_MAX)
    .map((a) => ({ a, same: sameService(a, wish), used: usage.get(a.id) ?? 0 }))
    .sort(
      (x, y) =>
        Number(y.same) - Number(x.same) ||
        x.used - y.used ||
        (QUALITY_RANK[x.a.quality] ?? 2) - (QUALITY_RANK[y.a.quality] ?? 2) ||
        area(y.a) - area(x.a) ||
        (x.a.id < y.a.id ? -1 : x.a.id > y.a.id ? 1 : 0)
    )
}
