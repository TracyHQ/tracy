// The "reuse" cut of a gallery tile (gallery-tiles.js, ADR 0043 section 4): an owner photo already shown on the tile's
// page, cut again to a clearly different region. The region has the frame's shape, shares at most REUSE_MAX_OVERLAP of
// the smaller area with every other cut of the photo, never runs through a head (each head lies wholly inside or wholly
// outside it), and is written like any cut: at the demo aspect, enlarged at most MAX_ENLARGE times, through the
// sharpness gate. Among the regions that qualify, the largest wins; at one size, the one holding the most whole heads,
// then the most of the labelled subject. The last rung of a gallery tile ("any-photo") asks only for a cut that is not
// the very cut of another tile (`maxOverlap` 1, `distinct`): heads stay whole all the same.

import { MAX_ENLARGE, outputSizeFor, sizeOf, writeRect } from './cut-photo.js'
import { cropOverlap, REUSE_MAX_OVERLAP } from './gallery-tiles.js'
import { headBoxesOf } from './head-boxes.js'

/** The region sizes tried, as shares of the largest box of the frame's shape. */
const SCALES = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.42, 0.35]
/** Positions tried along each free side. */
const STEPS = 12
/**
 * The share of the labelled subject box a reused region must hold. Half: a tall subject cannot always sit whole in a
 * landscape tile, but a region with less than half of it shows a part nobody would call the subject.
 */
export const SUBJECT_KEPT = 0.5
/**
 * The share of the photo a region must cover when the photo has no detected subject. Most of the photo (more than
 * half is not asked, the largest square of a 1:2 photo is exactly half): with nothing labelled, a small window onto the
 * photo is as likely to be a bush or a fence as the subject.
 */
export const NO_SUBJECT_COVER = 0.5

const toPixels = ([x, y, w, h], size) => ({
  x: x * size.width,
  y: y * size.height,
  width: w * size.width,
  height: h * size.height
})
const inside = (h, r) =>
  h.x >= r.x && h.y >= r.y && h.x + h.width <= r.x + r.width && h.y + h.height <= r.y + r.height
const kept = (box, r) => {
  const w = Math.min(box.x + box.width, r.x + r.width) - Math.max(box.x, r.x)
  const h = Math.min(box.y + box.height, r.y + r.height) - Math.max(box.y, r.y)
  return w > 0 && h > 0 ? (w * h) / (box.width * box.height) : 0
}
const apart = (h, r) => cropOverlap(h, r) === 0
// Scores compared in order: the first that differs decides.
const same = (a, b) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
const better = (a, b) => {
  const k = a.findIndex((v, i) => v !== b[i])
  return k >= 0 && a[k] > b[k]
}

/**
 * The region of a photo of `size` for a frame of `shape` that keeps clear of `avoid`, or null.
 * @param {{width: number, height: number}} size the photo as shown
 * @param {{width: number, height: number}} shape the demo file (or display box)
 * @param {{x: number, y: number, width: number, height: number}[]} avoid the other cuts of the photo, in pixels
 * @param {{ heads: number[][], subject: number[] | null, minWidth: number, maxOverlap?: number, distinct?: boolean }}
 *   labels heads and subject as fractions; `minWidth` the narrowest region the size limit allows; `maxOverlap` the most
 *   a region may share with a cut to avoid (REUSE_MAX_OVERLAP by default); `distinct` the region is never one of them;
 *   `keepSubject` the region holds the subject (SUBJECT_KEPT of its box, or a whole head), or, when no subject is
 *   labelled, covers NO_SUBJECT_COVER of the photo: a region that shows only background is never offered
 */
export function reuseRegion(
  size,
  shape,
  avoid,
  { heads, subject, minWidth, maxOverlap = REUSE_MAX_OVERLAP, distinct = false, keepSubject = false }
) {
  const aspect = shape.width / shape.height
  const maxW = Math.min(size.width, size.height * aspect)
  const headPx = heads.map((h) => toPixels(h, size))
  const subjectPx = subject ? toPixels(subject, size) : null
  const photo = size.width * size.height
  const showsSubject = (r) =>
    subjectPx || headPx.length
      ? (subjectPx && kept(subjectPx, r) >= SUBJECT_KEPT) || headPx.some((h) => inside(h, r))
      : r.width * r.height >= NO_SUBJECT_COVER * photo
  for (const scale of SCALES) {
    const width = Math.floor(maxW * scale)
    const height = Math.round(width / aspect)
    if (width < minWidth) return null
    if (height > size.height || height < 1) continue
    let best = null
    for (let i = 0; i <= STEPS; i++)
      for (let j = 0; j <= STEPS; j++) {
        const r = {
          x: Math.round(((size.width - width) * i) / STEPS),
          y: Math.round(((size.height - height) * j) / STEPS),
          width,
          height
        }
        if (avoid.some((a) => cropOverlap(r, a) > maxOverlap)) continue
        if (distinct && avoid.some((a) => same(r, a))) continue
        if (!headPx.every((h) => inside(h, r) || apart(h, r))) continue
        if (keepSubject && !showsSubject(r)) continue
        const score = [
          headPx.filter((h) => inside(h, r)).length,
          subjectPx ? cropOverlap(r, subjectPx) : 0,
          -Math.max(0, ...avoid.map((a) => cropOverlap(r, a)))
        ]
        if (!best || better(score, best.score)) best = { r, score }
      }
    if (best) return best.r
  }
  return null
}

/**
 * Cut an owner photo already shown on the page again for a gallery tile, clear of its other cuts.
 * @param {Uint8Array} bytes
 * @param {object} asset the brief asset's labels
 * @param {{width: number, height: number}} frame the kit frame
 * @param {{width: number, height: number} | null} demo
 * @param {{x: number, y: number, width: number, height: number}[]} avoid the photo's other cuts on the tile's pages
 * @param {{ maxOverlap?: number, distinct?: boolean }} [opts] reuseRegion's, for the last rung; the subject is always kept
 * @returns {Promise<object>} cut-photo.js's result, with `overlap`: the most the cut shares with another cut
 */
export async function cutPhotoAway(bytes, asset, frame, demo, avoid, { maxOverlap, distinct } = {}) {
  const size = await sizeOf(bytes)
  if (!size.width || !size.height) return { ok: false, refused: 'unreadable' }
  const box = { width: Number(frame.width), height: Number(frame.height), minWidth: frame.minWidth }
  const shape = demo ?? box
  // The narrowest region the size limit lets through: its written width over its own width is at most MAX_ENLARGE,
  // and never narrower than the kit's minimum file width (card AI).
  const minWidth = Math.max(
    Math.ceil(outputSizeFor(demo, box, 1).width / MAX_ENLARGE),
    Number.isInteger(frame.minWidth) ? frame.minWidth : 0
  )
  const r = reuseRegion(size, shape, avoid, {
    heads: headBoxesOf(asset),
    subject: Array.isArray(asset.subjectBox) ? asset.subjectBox : null,
    minWidth,
    maxOverlap,
    distinct,
    keepSubject: true
  })
  if (!r) return { ok: false, refused: 'no-clear-region' }
  const cut = await writeRect(
    bytes,
    { left: r.x, top: r.y, width: r.width, height: r.height },
    frame,
    demo,
    asset.quality === 'low'
  )
  if (!cut.ok) return cut
  const overlap = Math.max(0, ...avoid.map((a) => cropOverlap(cut.crop, a)))
  return { ...cut, overlap: Number(overlap.toFixed(3)) }
}
