/**
 * Ported from the brief build branch (feat/brief-build-own-site) for the picture bench (#340); the measurement half is
 * photo-sharpness-measure.js.
 *
 * Whether an owner photo stays sharp in the slot it is cut for (spec TracyHQ/tracy#189, sharpness gate). The picture
 * pipeline checked only a photo's pixel size; a social-media photo that is wide enough on paper can still be soft once it
 * is cropped and enlarged to a wide slot on a retina screen. This module looks at the pixels themselves.
 *
 *   measure  the cut photo is rendered at the slot's shown width at 1x and at 2x (a retina screen), the way the browser
 *            shows it; on each render the finest detail (what a 1 px blur takes away) is compared with the detail one
 *            octave coarser (between a 1 px and a 3 px blur). The share is content-normalised: a busy photo and a calm one
 *            score alike when both are sharp, and enlarging or blurring a photo drains the finest band first. The JPEG
 *            blockiness (steps on the 8 px grid against steps elsewhere) is read on the cut and on its source photo,
 *            whose grid the cut resamples away while the blocks stay visible. A blurred, stretched band at an edge
 *            (`blurredBand`) is read too.
 *   judge    a cut enlarged past its class's limit, with a blurred band, or with heavy blocks fails as it is; one that is
 *            soft or mildly blocky gets a light correction (a 3 px median against blocks, a mild unsharp mask) and is
 *            measured again: it passes corrected, or the photo loses this slot. Never an AI upscale: that invents detail
 *            the owner never shot.
 *
 * 🔒 Calibration (29/10/2026), on 17 owner photo cuts of a local brief build (social posts, 360 to 567 px wide, every
 * one enlarged about 1.24x at 1x and 2.5x at 2x by its slot) and on generated pictures, each judged by eye at 1:1:
 *   - enlargement: the soft-looking wide court scene was a 567 px cut in a 704 px card (1.24x at 1x, 2.48x at 2x); the
 *     same factors read acceptable in 448 px tiles and 344 px thumbnails, and its own photo cut 480 px for a 448 px tile
 *     read fine. Hence a large slot allows 1.1x / 2.2x, a medium one 1.3x / 2.6x, a small one 1.5x / 3x.
 *   - 1x share: soft by eye (motion blur, posters) 0.39 to 0.46; acceptable 0.49 to 0.67; crisp 0.77 to 1.05. A crisp
 *     generated picture shown below its own size scores 0.7 to 0.83; blurred (sigma 3) 0.21 to 0.28; drawn at a third of
 *     its size and enlarged 3x 0.44 to 0.59 at 704 px. A large slot asks 0.62, a medium 0.45, a small 0.4.
 *   - 2x share: 0.28 to 0.34 for every owner cut enlarged about 2.5x, 0.40 to 0.47 for the ones shown near their own
 *     size, 0.6 to 0.87 for a crisp generated picture, 0.2 to 0.25 blurred. The bars (0.22 to 0.26) catch blur, not the
 *     enlargement, which the factors above judge.
 *   - blockiness: clean 1.0 to 1.3; two owner photos 1.54 and 1.56 (visible blocks); JPEG quality 4 1.8 to 3.4. Over
 *     1.35 is blocky, over 1.6 too heavy to correct.
 *   - the correction lifts a share by about 0.03 to 0.08, so it rescues a photo just under its bar, never a soft one.
 * Small slots tolerate more than large ones. A full-width hero background carries the page's words under a dark
 * overlay (the overlay dims its contrast, the eye reads the words, not the picture's detail), so it tolerates the most:
 * the small slot's bars. The Slot fit names no overlay yet, so a hero picture whose desktop box is at least
 * `BACKGROUND_MIN_WIDTH` CSS pixels wide is taken for a background; an older fit's upload minimum first loses
 * its 1.5x density factor. This changes the measured display size, never the blur or blockiness limits.
 *
 * 🔒 A HERO BACKGROUND IS THE LARGEST FRAME OF THE SITE (owner review of 01/11/2026): the overlay forgives contrast, not
 * a photo too small for the band. A background asks a cut at least `BACKGROUND_MIN_OWN_WIDTH` real pixels wide (the cut
 * is never enlarged, so its own width is the photo's), and sharp at its own size (`ownShare1x`): a small photo enlarged
 * into a large file passes every pixel count and still reads soft across the screen. Calibration (01/11/2026): a hero cut
 * served 2160 px wide from a photo about 1150 px wide scored 0.46 at its own size and 0.78 once brought back to its
 * real width; generated scenes enlarged 2x score 0.49 to 0.53, 1.5x 0.64 to 0.70, crisp 1.06 to 1.11; owner cuts shown
 * at or below their own size 0.72 to 0.94. Neither failure is corrected: the photo loses the hero and stays free for a
 * smaller frame, where the bars of its own class judge it.
 */
import sharp from 'sharp'
import { measureSharpness, round } from './photo-sharpness-measure.js'

export { blurredBand, measureSharpness } from './photo-sharpness-measure.js'

export const SHARPNESS_VERSION = 'photo-sharpness/3'

const JPEG = { quality: 84, mozjpeg: false }
/** A desktop box at least this wide on a hero picture is a full-width background band. */
export const BACKGROUND_MIN_WIDTH = 1200
/** The fewest real pixels across a cut shown as a full-width hero background. */
export const BACKGROUND_MIN_OWN_WIDTH = 1600
/** Slot fit's upload minimum is 1.5 times the widest CSS box (content-map-fit.mjs), not a display measurement. */
const UPLOAD_DENSITY = 1.5
/**
 * What a slot class asks of a cut photo: the most it may be enlarged at 1x and at 2x (a retina screen), and the least
 * fine-detail share at 1x and at 2x.
 */
export const BARS = Object.freeze({
  small: { max: 400, upscale1x: 1.5, upscale2x: 3, share1x: 0.4, share2x: 0.22 },
  medium: { max: 600, upscale1x: 1.3, upscale2x: 2.6, share1x: 0.45, share2x: 0.24 },
  large: { max: Infinity, upscale1x: 1.1, upscale2x: 2.2, share1x: 0.62, share2x: 0.26 },
  background: {
    max: Infinity,
    upscale1x: 1.5,
    upscale2x: 3,
    share1x: 0.4,
    share2x: 0.22,
    minOwnWidth: BACKGROUND_MIN_OWN_WIDTH,
    ownShare1x: 0.6
  }
})
/** Steps on the JPEG grid this many times stronger than elsewhere are visible blocks. */
export const MAX_BLOCKINESS = 1.35
/** Past this the blocks are flat 8 px tiles a light denoise does not remove: no correction is tried. */
export const HEAVY_BLOCKINESS = 1.6
/** The correction: a 3 px median for blocks, then a mild unsharp mask. */
const MEDIAN = 3
const SHARPEN = { sigma: 0.8, m1: 0.6, m2: 1.2 }
const MAX_PIXELS = 100_000_000
const open = (/** @type {Uint8Array} */ bytes) =>
  sharp(Buffer.from(bytes), { limitInputPixels: MAX_PIXELS, failOn: 'none' })

/**
 * The class of the slots a photo is cut for: the widest measured CSS box decides, across responsive layouts.
 * Older fits with only an upload minimum recover the CSS width from its declared 1.5x density. The uploaded
 * asset still meets that minimum later; judging at its pixel width here would count density twice.
 * @param {Array<{role?: string | null, fit?: any}>} slots
 * @param {(slot: any) => number} shownWidthOf - the fill plan's shown width of a slot (`fill-plan.mjs`)
 * @returns {{kind: 'small' | 'medium' | 'large' | 'background', width: number} | null}
 */
export function slotClassOf(slots, shownWidthOf) {
  const displayWidth = (slot) => {
    const measured = Object.values(slot?.fit?.boxes ?? {})
      .map((box) => Number(box?.width))
      .filter((width) => Number.isFinite(width) && width > 0)
    if (measured.length) return Math.max(...measured)
    const minimum = Number(slot?.fit?.minWidth)
    if (Number.isFinite(minimum) && minimum > 0) return minimum / UPLOAD_DENSITY
    return Number(shownWidthOf(slot)) || 0
  }
  const width = Math.max(0, ...slots.map(displayWidth))
  if (!(width > 0)) return null
  const background = slots.some(
    (s) =>
      s.role === 'business.hero_image' && s.fit?.kind !== 'cutout' && displayWidth(s) >= BACKGROUND_MIN_WIDTH
  )
  if (background) return { kind: 'background', width }
  const kind = width <= BARS.small.max ? 'small' : width <= BARS.medium.max ? 'medium' : 'large'
  return { kind, width }
}

/** Failures no light correction brings back: the photo does not have the pixels or the detail. */
const NOT_CORRECTED = new Set(['enlarged-too-far', 'blurred-region', 'too-narrow', 'soft-at-own-size'])

/** The score of a measure against a bar: 1 or more passes. */
function scoreOf(m, bar) {
  if (m.flat) return 1
  return round(Math.min(m.share1x / bar.share1x, m.share2x / bar.share2x))
}

/** Why a measure fails its bar, or null. */
function failureOf(m, bar) {
  if (m.band) return 'blurred-region'
  if (m.flat) return null
  if (bar.minOwnWidth && m.ownWidth < bar.minOwnWidth) return 'too-narrow'
  if (bar.ownShare1x && typeof m.shareOwn === 'number' && m.shareOwn < bar.ownShare1x)
    return 'soft-at-own-size'
  if (m.upscale1x > bar.upscale1x || m.upscale2x > bar.upscale2x) return 'enlarged-too-far'
  if (m.blockiness > MAX_BLOCKINESS) return 'blocky'
  if (scoreOf(m, bar) < 1) return 'soft'
  return null
}

/**
 * The light correction: a median against JPEG blocks when the photo is blocky, then a mild unsharp mask. Never an
 * upscale and never a model: it only tidies what the photo has.
 * @param {Uint8Array} bytes
 * @param {{blocky?: boolean}} [opts]
 */
export async function correctPhoto(bytes, { blocky = false } = {}) {
  let image = open(bytes)
  if (blocky) image = sharp(await image.median(MEDIAN).toBuffer())
  return image.sharpen(SHARPEN).jpeg(JPEG).toBuffer()
}

/**
 * The verdict on one cut photo for a slot class: `pass` as it is, `corrected` after the light correction (the bytes to
 * write are given), or `fail` (the photo loses this slot).
 * @param {Uint8Array} bytes - the cut photo
 * @param {{kind: keyof typeof BARS, width: number}} slot
 * @param {{source?: Uint8Array | null, scale?: number}} [opts] - the source photo and the cut's scale (`measureSharpness`)
 * @returns {Promise<{verdict: 'pass' | 'corrected' | 'fail', step: string, score: number, threshold: number,
 *   bar: string, width: number, measured: object, reason: string | null, corrected?: Buffer}>}
 */
export async function judgePhoto(bytes, slot, { source = null, scale = 1 } = {}) {
  const bar = BARS[slot.kind]
  const ownSize = Boolean(bar.ownShare1x)
  const first = await measureSharpness(bytes, slot.width, { source, scale, ownSize })
  const base = { bar: slot.kind, width: slot.width, threshold: 1 }
  const firstWhy = failureOf(first, bar)
  if (!firstWhy)
    return {
      ...base,
      verdict: 'pass',
      step: 'kept',
      score: scoreOf(first, bar),
      measured: first,
      reason: null
    }
  // Enlarged past the class's limit, or a part of it blurred: no correction brings back what the photo does not have.
  if (NOT_CORRECTED.has(firstWhy) || first.blockiness > HEAVY_BLOCKINESS)
    return {
      ...base,
      verdict: 'fail',
      step: 'refused',
      score: scoreOf(first, bar),
      measured: first,
      reason: firstWhy
    }
  const corrected = await correctPhoto(bytes, { blocky: first.blockiness > MAX_BLOCKINESS })
  // The correction tidies the cut, never the photo's own pixels: its real width and own detail stay as first read.
  const again = {
    ...(await measureSharpness(corrected, slot.width)),
    ownWidth: first.ownWidth,
    ...(ownSize ? { shareOwn: first.shareOwn } : {})
  }
  const why = failureOf(again, bar)
  if (!why)
    return {
      ...base,
      verdict: 'corrected',
      step: 'corrected',
      score: scoreOf(again, bar),
      measured: again,
      before: first,
      reason: firstWhy,
      corrected
    }
  return {
    ...base,
    verdict: 'fail',
    step: 'refused',
    score: scoreOf(again, bar),
    measured: again,
    before: first,
    reason: why
  }
}
