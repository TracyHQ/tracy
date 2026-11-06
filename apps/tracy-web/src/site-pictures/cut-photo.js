// One owner photo cut for one kit frame (#340, ADR 0043 section 3): the largest box of the frame's shape, placed
// around the photo's subject and never through a head (the fill plan's subjectCrop, website-opportunities
// pictures/subject-crop.mjs, given the heads of head-boxes.js as the boxes it keeps whole), written at EXACTLY the aspect of the demo file the site holds for the frame (the content
// map slot's fit.source; the write door compares with it) and at least the frame's display box on both sides.
//
// 🔒 NEVER NARROWER THAN THE KIT'S MINIMUM (card AI). A frame whose content map slot sets `fit.minWidth` (the write
// door refuses a narrower file, SLOT_IMAGE_TOO_SMALL) is written at least that wide, and an owner photo region narrower
// than it is refused (`narrower-than-min-width`): it is never enlarged to reach it, so the next rung takes over.
//
// 🔒 ENLARGED AT MOST MAX_ENLARGE (1.5) TIMES, AND ONLY THROUGH THE SHARPNESS GATE. A crop smaller than the size it must
// be written at is judged first at its own pixels for the frame's display width (lib/photo-sharpness.js judgePhoto):
// it passes as it is, passes after the gate's light correction (those bytes are used), or the photo loses the frame.
// A low quality photo always goes through the gate, and only into a small frame. Never an AI upscale.
import sharp from 'sharp'
import { subjectCrop } from 'website-opportunities/domain/pictures/subject-crop.mjs'
import { judgePhoto, SHARPNESS_VERSION } from '../lib/photo-sharpness.js'
import { sha256Hex } from './file-store.js'
import { headBoxesOf } from './head-boxes.js'
import { MAX_ENLARGE, SMALL_FRAME_MAX } from './picture-check/rules-files.js'

export { MAX_ENLARGE, SMALL_FRAME_MAX }

const MAX_PIXELS = 100_000_000
const JPEG = { quality: 84, mozjpeg: false }
/** The crop at its own pixels, before the gate looks at it: near lossless, so the gate judges the photo, not us. */
const OWN_JPEG = { quality: 95, mozjpeg: false }
/** A frame at least this many times wider than tall is a wide band: a subject crop may cut more of the photo. */
const WIDE_ASPECT = 2
/** The gate's slot classes by display width (photo-sharpness.js BARS), and a full width background band. */
const BACKGROUND_MIN_WIDTH = 1200

const open = (bytes) => sharp(Buffer.from(bytes), { limitInputPixels: MAX_PIXELS, failOn: 'none' })

/**
 * The size a picture for a frame is written at: the demo file's aspect (or the display box's when the site holds no
 * demo file for it), at least the display box on both sides, and from `natural` (the crop's own width, never past the
 * demo file's width, or twice the display width when there is no demo file) when that is already enough. Whole
 * pixels; the aspect is off by less than one pixel's worth.
 * @param {{width: number, height: number} | null} demo
 * @param {{width: number, height: number, minWidth?: number}} box the frame's display box, and the kit's minimum file
 *   width when its slot sets one (never written narrower)
 * @param {number} natural the width the crop has of its own
 */
export function outputSizeFor(demo, box, natural) {
  const shape = demo ?? box
  const aspect = shape.width / shape.height
  const most = demo?.width ?? 2 * box.width
  const floor = Number.isInteger(box.minWidth) && box.minWidth > 0 ? box.minWidth : 0
  let width = Math.max(box.width, floor, Math.ceil(box.height * aspect), Math.min(natural, most))
  let height = Math.round(width / aspect)
  while (height < box.height) {
    width += 1
    height = Math.round(width / aspect)
  }
  return { width, height }
}

/** The sharpness gate's slot class for a frame: small, medium, large by display width, or a wide background. */
export function slotClassOfFrame(frame) {
  const width = Number(frame.width) || 0
  if (frame.shownAs === 'background' && width >= BACKGROUND_MIN_WIDTH) return { kind: 'background', width }
  return { kind: width <= 400 ? 'small' : width <= 600 ? 'medium' : 'large', width }
}

/** The photo's pixel size as shown (EXIF turned). */
export async function sizeOf(bytes) {
  const meta = await open(bytes).metadata()
  const turned = (meta.orientation ?? 1) >= 5
  return { width: turned ? meta.height : meta.width, height: turned ? meta.width : meta.height }
}

// Where the crop sits on the photo: around the subject (the share subjectCrop gives), or where sharp's attention
// strategy puts it when nothing is labelled.
async function rectOf(bytes, size, crop) {
  const { width, height } = crop.source
  if (crop.strategy === 'subject')
    return {
      left: Math.round((size.width - width) * crop.at.x),
      top: Math.round((size.height - height) * crop.at.y),
      width,
      height
    }
  const { info } = await open(bytes)
    .rotate()
    .resize(width, height, { fit: 'cover', position: sharp.strategy.attention })
    .toBuffer({ resolveWithObject: true })
  return { left: -(info.cropOffsetLeft ?? 0), top: -(info.cropOffsetTop ?? 0), width, height }
}

/**
 * Cut one owner photo for one frame.
 * @param {Uint8Array} bytes the owner photo, its hash already checked
 * @param {{subjectBox?: number[], faceBoxes?: number[][], peopleCount?: number | null, quality?: string}} asset the
 *   brief asset's labels
 * @param {{width: number, height: number, shownAs?: string}} frame the kit frame (its display box)
 * @param {{width: number, height: number} | null} demo the demo file size the site holds for the frame
 * @param {{matches?: boolean, anyReal?: boolean}} [options] `matches`: the photo shows the frame's own offering or
 *   person; `anyReal`: the frame takes any real owner photo (spec #336), so the cut may lose as much of the photo as a
 *   wide band may (subjectCrop's WIDE_MAX_LOSS), only when the labelled subject and every head stay whole
 * @returns {Promise<{ok: true, bytes: Buffer, ext: 'jpg', width: number, height: number, sha256: string,
 *   crop: {x: number, y: number, width: number, height: number}, enlarge: number, sharpness: object | null}
 *   | {ok: false, refused: string, sharpness?: object}>}
 */
export async function cutPhoto(bytes, asset, frame, demo, { matches = false, anyReal = false } = {}) {
  const size = await sizeOf(bytes)
  if (!size.width || !size.height) return { ok: false, refused: 'unreadable' }
  const box = { width: Number(frame.width), height: Number(frame.height) }
  const shape = demo ?? box
  const low = asset.quality === 'low'
  if (low && Math.max(box.width, box.height) > SMALL_FRAME_MAX)
    return { ok: false, refused: 'low-quality-in-a-large-frame' }
  const placed = subjectCrop(
    // Heads, not the tight face boxes: a crop flush with a face box takes off the forehead (head-boxes.js).
    { ...size, subjectBox: asset.subjectBox, faceBoxes: headBoxesOf(asset) },
    shape,
    // min 1: the size limit is this module's own (MAX_ENLARGE, through the gate), not the fill plan's.
    { min: 1, matches, wide: anyReal || shape.width / shape.height >= WIDE_ASPECT }
  )
  if (placed.refused) return { ok: false, refused: placed.refused }
  const rect = await rectOf(bytes, size, placed.crop)
  return writeRect(bytes, rect, frame, demo, low)
}

/**
 * Write one rectangle of an owner photo for a frame: at the demo file's aspect and at least the display box, enlarged at
 * most MAX_ENLARGE times and only through the sharpness gate (a low quality photo always goes through it).
 * @param {Uint8Array} bytes the owner photo
 * @param {{left: number, top: number, width: number, height: number}} rect on the photo as shown (EXIF turned)
 * @param {{width: number, height: number, minWidth?: number}} frame the kit frame (its display box, its minimum width)
 * @param {{width: number, height: number} | null} demo
 * @param {boolean} low the photo is labelled low quality
 */
export async function writeRect(bytes, rect, frame, demo, low) {
  const box = { width: Number(frame.width), height: Number(frame.height), minWidth: frame.minWidth }
  if (Number.isInteger(frame.minWidth) && rect.width < frame.minWidth)
    return { ok: false, refused: 'narrower-than-min-width' }
  const out = outputSizeFor(demo, box, rect.width)
  const enlarge = Number((out.width / rect.width).toFixed(4))
  if (enlarge > MAX_ENLARGE) return { ok: false, refused: 'too-small' }
  let cut = await open(bytes).rotate().extract(rect).jpeg(OWN_JPEG).toBuffer()
  let sharpness = null
  if (enlarge > 1 || low) {
    const judged = await judgePhoto(cut, slotClassOfFrame(frame), { source: bytes, scale: 1 })
    sharpness = {
      passed: judged.verdict !== 'fail',
      verdict: judged.verdict,
      score: judged.score,
      bar: judged.bar,
      width: judged.width,
      reason: judged.reason,
      version: SHARPNESS_VERSION
    }
    if (!sharpness.passed) return { ok: false, refused: 'unsharp', sharpness }
    if (judged.corrected) cut = judged.corrected
  }
  const written = await open(cut)
    .resize(out.width, out.height, { fit: 'fill', kernel: 'lanczos3' })
    .jpeg(JPEG)
    .toBuffer()
  return {
    ok: true,
    bytes: written,
    ext: 'jpg',
    width: out.width,
    height: out.height,
    sha256: sha256Hex(written),
    crop: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    enlarge,
    sharpness
  }
}
