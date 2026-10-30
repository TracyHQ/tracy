// The crop of a brief photo for one slot of the fill plan (spec TracyHQ/tracy#132, ticket #136): the largest box of the
// slot's shape, placed around the photo's subject box and never through a face box.
//
// 🔒 THE FRAME NEVER CHANGES SHAPE: the box always has the slot's aspect (`cropBox`), and the output is written at it.
// 🔒 A FACE IS NEVER CUT: every face box lies whole inside the crop, or the photo is refused for the slot (`cuts-a-face`).
// 🔒 PEOPLE ARE NEVER CUT (#189, criterion 3.6): a photo with people in it keeps its whole subject box in the crop, so a
//    head turned away (no face box) is not cut off at the frame's edge; a subject that cannot fit the slot's shape refuses
//    the photo (`cuts-the-subject`) and the next photo is met.
// 🔒 A MATCH LOOSENS ONLY THE LOSS LIMIT: a photo the brief links to the slot's own offering or person may lose more of
//    itself (`MATCH_MAX_LOSS`) than one that does not (`CROP_MAX_LOSS`, today's limit). The size limit is the same for
//    both: a crop that would be enlarged past `MAX_SCALE` to reach the slot's minimum is refused (`too-small-after-crop`).
import { CROP_MAX_LOSS, MAX_SCALE, cropBox, outputSize } from './placement.mjs'

/** The most of a photo a crop may cut away when the photo matches the slot's role and offering (or person). */
export const MATCH_MAX_LOSS = 0.75
/**
 * The most a wide general slot (a hero band) may cut away when the alternative is keeping the template's demo picture:
 * only with a labelled subject box, and only when the subject and every face stay whole in the crop (#141).
 */
export const WIDE_MAX_LOSS = 0.7

/** Why a crop is refused, each a code a report can name. */
export const CROP_REFUSALS = Object.freeze({
  'crop-loss': 'the crop would cut away too much of the photo',
  'too-small-after-crop': "the photo is below the slot's minimum size after cropping",
  'cuts-a-face': 'every crop of the slot shape would cut through a face',
  'cuts-the-subject': 'every crop of the slot shape would cut through the people the photo shows'
})

/** A box `[x, y, width, height]` in fractions of the photo, or null when it is not one. */
function boxOf(v) {
  if (!Array.isArray(v) || v.length !== 4) return null
  const [x, y, w, h] = v.map(Number)
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null
  return [Math.max(0, x), Math.max(0, y), Math.min(1, x + w), Math.min(1, y + h)]
}

/**
 * Where a crop of `span` pixels starts along one side of `full` pixels: centred on the subject (from `centre`, a fraction,
 * null to centre on the photo), moved the least needed to hold every face whole. Null when the faces do not fit in `span`.
 * @param {number} full
 * @param {number} span
 * @param {number | null} centre
 * @param {Array<[number, number]>} faces - each face's start and end along this side, in fractions
 */
function startAlong(full, span, centre, faces) {
  const free = full - span
  let lo = 0
  let hi = free
  for (const [a, b] of faces) {
    lo = Math.max(lo, Math.ceil(b * full) - span)
    hi = Math.min(hi, Math.floor(a * full))
  }
  if (lo > hi) return null
  const wanted = Math.round((centre ?? 0.5) * full - span / 2)
  return Math.min(hi, Math.max(lo, wanted))
}

/**
 * The crop of a photo of `size` for a slot whose frame is `frame`, or why there is none.
 * @param {{width: number, height: number, subjectBox?: number[], faceBoxes?: number[][]}} photo
 * @param {{width: number, height: number}} frame - the demo picture's size (the slot's shape)
 * @param {{min: number, matches?: boolean, wide?: boolean, maxWidth?: number | null}} opts - `min`: the slot's minimum
 *   width; `maxWidth`: the widest the picture is written (`weightCapOf`, criterion 9.2); `matches`: the photo
 *   is linked to the slot's own offering or person; `wide`: a wide general slot may cut up to `WIDE_MAX_LOSS` of a photo
 *   whose subject box stays whole (the crop then says `loosened: true`)
 * @returns {{crop: {aspect: number, source: {width: number, height: number}, output: {width: number, height: number},
 *   strategy: 'subject' | 'attention', at?: {x: number, y: number}}} | {refused: keyof typeof CROP_REFUSALS}}
 */
export function subjectCrop(photo, frame, { min, matches = false, wide = false, maxWidth = null }) {
  const aspect = frame.width / frame.height
  const box = cropBox(photo.width, photo.height, aspect)
  const limit = matches ? MATCH_MAX_LOSS : CROP_MAX_LOSS
  // Past the usual limit, a wide slot keeps a crop only around a labelled subject it holds whole.
  const loosened = box.loss > limit && wide && box.loss <= WIDE_MAX_LOSS && Boolean(boxOf(photo.subjectBox))
  if (box.loss > limit && !loosened) return { refused: 'crop-loss' }
  if (Math.min(frame.width, min) / box.width > MAX_SCALE) return { refused: 'too-small-after-crop' }
  const output = outputSize(
    box,
    aspect,
    Number(maxWidth) > 0 ? Math.min(frame.width, Number(maxWidth)) : frame.width
  )
  if (!output) return { refused: 'too-small-after-crop' }
  const base = { aspect: Number(aspect.toFixed(6)), source: { width: box.width, height: box.height }, output }
  const subject = boxOf(photo.subjectBox)
  const faces = (photo.faceBoxes ?? []).map(boxOf).filter(Boolean)
  // A loosened crop must hold the whole subject, as it holds every face; so must a crop of a photo with people in it.
  const people = faces.length > 0 || Number(photo.peopleCount) > 0
  const whole = (loosened || people) && subject ? [...faces, subject] : faces
  // Nothing labelled: the cutter finds the subject by attention, as it always did.
  if (!subject && !faces.length) return { crop: { ...base, strategy: 'attention' } }
  const centre = (axis) => (subject ? (subject[axis] + subject[axis + 2]) / 2 : null)
  const left = startAlong(
    photo.width,
    box.width,
    centre(0),
    whole.map((f) => [f[0], f[2]])
  )
  const top = startAlong(
    photo.height,
    box.height,
    centre(1),
    whole.map((f) => [f[1], f[3]])
  )
  if (left === null || top === null) {
    if (loosened) return { refused: 'crop-loss' }
    // Faces alone would fit: it is the people's whole figure the shape cannot hold.
    const facesFit = (axis, full, span) =>
      startAlong(
        full,
        span,
        centre(axis),
        faces.map((f) => [f[axis], f[axis + 2]])
      ) !== null
    const facesOnly = facesFit(0, photo.width, box.width) && facesFit(1, photo.height, box.height)
    return { refused: whole.length > faces.length && facesOnly ? 'cuts-the-subject' : 'cuts-a-face' }
  }
  // The start as a share of the free room: the cutter places the box the same way on a copy of another size.
  const share = (start, free) => (free > 0 ? Number((start / free).toFixed(6)) : 0.5)
  const at = { x: share(left, photo.width - box.width), y: share(top, photo.height - box.height) }
  return { crop: { ...base, strategy: 'subject', at, ...(loosened ? { loosened: true } : {}) } }
}
