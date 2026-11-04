// Dark frames (#344, ADR 0043 section 1 `darkened`): a frame whose heading or text sits over its picture (the kit shows
// it as a background, or marks it `textOver`) needs a picture dark enough for light text. Code prefers darker photos
// when it chooses one for such a frame (fill-frames.js, ladder-step.js); a picture still too bright gets a dark overlay
// baked in, and its entry says `darkened: true` with the overlay's strength in `overlay`. A frame whose template already
// paints an overlay at least OVERLAY_COVERS strong over its picture (frame-surface/, ADR 0043 section 3e) is never
// darkened again and never prefers dark photos: the template's own overlay carries the text.
import sharp from 'sharp'
import { sha256Hex } from './file-store.js'
import { overlayCovers } from './frame-surface/surface.js'

/** A picture whose mean luminance (0 black, 1 white) is at most this carries light text without an overlay. */
export const DARK_ENOUGH = 0.42
/** The overlay's opacity is kept between these, rounded up to OVERLAY_STEP. */
export const OVERLAY_MIN = 0.15
export const OVERLAY_MAX = 0.6
const OVERLAY_STEP = 0.05
const JPEG = { quality: 84, mozjpeg: false }

/** Whether a kit frame has text over its picture. */
export const hasTextOver = (frame) => frame?.shownAs === 'background' || frame?.textOver === true

/** Whether a picture of this frame must be dark enough for light text: text over it and no template overlay doing it. */
export const wantsDark = (frame) => hasTextOver(frame) && !overlayCovers(frame)

/** The mean luminance of a picture, 0 to 1, rounded to three places. */
export async function luminanceOf(bytes) {
  const small = await sharp(Buffer.from(bytes), { failOn: 'none' })
    .rotate()
    .resize(96, 96, { fit: 'inside' })
    .greyscale()
    .raw()
    .toBuffer()
  let sum = 0
  for (const v of small) sum += v
  return Math.round((sum / small.length / 255) * 1000) / 1000
}

/** The overlay opacity that brings a mean luminance down to DARK_ENOUGH, within OVERLAY_MIN and OVERLAY_MAX. */
export function overlayFor(luminance) {
  const need = 1 - DARK_ENOUGH / luminance
  const stepped = Math.ceil(need / OVERLAY_STEP - 1e-9) * OVERLAY_STEP
  return Math.round(Math.min(OVERLAY_MAX, Math.max(OVERLAY_MIN, stepped)) * 100) / 100
}

/**
 * A picture for a dark frame: null when it is already dark enough, else the same picture (same size, JPEG) with a
 * black overlay baked in, its hash and the overlay record.
 * @returns {Promise<null | { bytes: Buffer, ext: 'jpg', sha256: string, width: number, height: number,
 *   overlay: { colour: string, strength: number, before: number, after: number } }>}
 */
export async function darkenPicture(bytes) {
  const before = await luminanceOf(bytes)
  if (before <= DARK_ENOUGH) return null
  const strength = overlayFor(before)
  const img = sharp(Buffer.from(bytes), { failOn: 'none' }).rotate()
  const { width, height } = await sharp(await img.clone().toBuffer()).metadata()
  const veil = await sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: strength } }
  })
    .png()
    .toBuffer()
  const out = await img
    .composite([{ input: veil }])
    .flatten({ background: '#000000' })
    .jpeg(JPEG)
    .toBuffer()
  return {
    bytes: out,
    ext: 'jpg',
    sha256: sha256Hex(out),
    width,
    height,
    overlay: { colour: '#000000', strength, before, after: await luminanceOf(out) }
  }
}

/**
 * The photos in the order code tries them, with the dark enough ones first for a dark frame (each group keeps its
 * order); unchanged for any other frame. `cache` keeps each photo's luminance by asset id.
 * @param {object[]} assets brief assets, already ranked
 * @param {Map<string, Buffer>} photoBytes
 */
export async function darkerFirst(assets, frame, photoBytes, cache = new Map()) {
  if (!wantsDark(frame)) return assets
  const dark = []
  const light = []
  for (const a of assets) {
    if (!cache.has(a.id)) cache.set(a.id, await luminanceOf(photoBytes.get(a.id)))
    ;(cache.get(a.id) <= DARK_ENOUGH ? dark : light).push(a)
  }
  return [...dark, ...light]
}
