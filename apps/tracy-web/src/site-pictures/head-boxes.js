// The heads a cut of an owner photo must keep whole (ADR 0043 section 3), from the brief's labels. The fill plan's
// subjectCrop (website-opportunities pictures/subject-crop.mjs, shared) keeps every box it is given as a face whole, so
// the picture step hands it heads, not faces:
//
// - A labelled face box is tight, brow to chin, and often a little low: a crop flush with it takes off the forehead,
//   the hair or the cap. Each face box grows to a head box: HEAD_ABOVE face heights above it, HEAD_BELOW below, and
//   HEAD_SIDE face widths on each side.
// - A person the labels count (peopleCount) but give no face box (seen from behind, turned away, or missed) has a head
//   nobody marked. People stand with their heads at the top of the subject, so when more people are counted than faces
//   are labelled, the top of the subject box (UNLABELLED_BAND of its height, from UNLABELLED_MARGIN above it) is kept
//   whole as well.
//
// When no crop of the frame's shape holds every one of these, subjectCrop refuses the photo (`cuts-a-face`) and the
// frame takes another photo: a head is never cut to fill a frame. A head lying low in the subject with no face label
// is not seen here; the looker's "face cut" fault is the net for it.

/** Face heights a head reaches above a labelled face box (forehead, hair, a cap). */
export const HEAD_ABOVE = 1.2
/** Face heights a head reaches below a labelled face box (the chin and neck). */
export const HEAD_BELOW = 0.3
/** Face widths a head reaches on each side of a labelled face box (hair, ears). */
export const HEAD_SIDE = 0.3
/** The share of the subject box, from its top, that holds the heads of people with no face label. */
export const UNLABELLED_BAND = 0.3
/** How far above the subject box a head with no face label may start, as a share of the photo. */
export const UNLABELLED_MARGIN = 0.05

// Corners clamped to the photo, as `[x, y, width, height]`; null when nothing is left.
const clampBox = (x0, y0, x1, y1) => {
  const [l, t, r, b] = [Math.max(0, x0), Math.max(0, y0), Math.min(1, x1), Math.min(1, y1)]
  return r > l && b > t ? [l, t, r - l, b - t].map((v) => Number(v.toFixed(4))) : null
}

/** A box `[x, y, width, height]` of finite positive numbers, or null. */
function boxOf(v) {
  if (!Array.isArray(v) || v.length !== 4) return null
  const b = v.map(Number)
  return b.every(Number.isFinite) && b[2] > 0 && b[3] > 0 ? b : null
}

/**
 * The boxes a cut must keep whole, as `[x, y, width, height]` fractions of the photo: one head per labelled face, and
 * the top of the subject when more people are counted than faces are labelled.
 * @param {{subjectBox?: number[], faceBoxes?: number[][], peopleCount?: number | null}} asset the brief asset's labels
 * @returns {number[][]}
 */
export function headBoxesOf(asset) {
  const faces = (Array.isArray(asset?.faceBoxes) ? asset.faceBoxes : []).map(boxOf).filter(Boolean)
  const heads = faces
    .map(([x, y, w, h]) =>
      clampBox(x - HEAD_SIDE * w, y - HEAD_ABOVE * h, x + w + HEAD_SIDE * w, y + h + HEAD_BELOW * h)
    )
    .filter(Boolean)
  const people = Number.isInteger(asset?.peopleCount) ? asset.peopleCount : 0
  const subject = boxOf(asset?.subjectBox)
  if (people > faces.length && subject) {
    const [x, y, w, h] = subject
    const band = clampBox(x, y - UNLABELLED_MARGIN, x + w, y + UNLABELLED_BAND * h)
    if (band) heads.push(band)
  }
  return heads
}
