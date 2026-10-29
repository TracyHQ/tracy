/**
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
 * `BACKGROUND_MIN_WIDTH` wide is taken for a background.
 */
import sharp from 'sharp'

export const SHARPNESS_VERSION = 'photo-sharpness/1'

const MAX_PIXELS = 100_000_000
const JPEG = { quality: 84, mozjpeg: false }
/** A desktop box at least this wide on a hero picture is a full-width background band. */
export const BACKGROUND_MIN_WIDTH = 1200
/**
 * What a slot class asks of a cut photo: the most it may be enlarged at 1x and at 2x (a retina screen), and the least
 * fine-detail share at 1x and at 2x.
 */
export const BARS = Object.freeze({
  small: { max: 400, upscale1x: 1.5, upscale2x: 3, share1x: 0.4, share2x: 0.22 },
  medium: { max: 600, upscale1x: 1.3, upscale2x: 2.6, share1x: 0.45, share2x: 0.24 },
  large: { max: Infinity, upscale1x: 1.1, upscale2x: 2.2, share1x: 0.62, share2x: 0.26 },
  background: { max: Infinity, upscale1x: 1.5, upscale2x: 3, share1x: 0.4, share2x: 0.22 }
})
/** Steps on the JPEG grid this many times stronger than elsewhere are visible blocks. */
export const MAX_BLOCKINESS = 1.35
/** Past this the blocks are flat 8 px tiles a light denoise does not remove: no correction is tried. */
export const HEAVY_BLOCKINESS = 1.6
/** A cut that keeps at least this share of the source's scale keeps its blocks visible: the source's grid is read. */
const BLOCKS_SURVIVE_SCALE = 0.5
/** Under this coarse detail (grey levels) a picture is flat: nothing in it can look blurred. */
const FLAT_DETAIL = 0.6
/** The correction: a 3 px median for blocks, then a mild unsharp mask. */
const MEDIAN = 3
const SHARPEN = { sigma: 0.8, m1: 0.6, m2: 1.2 }
/** The widest render measured: a 2x render past it is measured on a centre window of this many pixels. */
const MEASURE_PIXELS = 4_200_000
/** A blurred band: strips across each axis, how many at an edge in a row, how soft against the picture's median strip. */
const STRIPS = 20
const BAND_STRIPS = 3
const BAND_SHARE = 0.55
/** Past a blurred row band the next strip must jump back to this share: depth of field ramps, a pad steps. */
const BAND_STEP = 0.85
/** A row band thicker than this many strips is a far background (depth of field), not a pad. */
const ROW_BAND_MAX = 5
const BAND_WIDTH = 512

const open = (/** @type {Uint8Array} */ bytes) =>
  sharp(Buffer.from(bytes), { limitInputPixels: MAX_PIXELS, failOn: 'none' })

/**
 * The class of the slots a photo is cut for, and the width it is shown at: the widest shown width decides.
 * @param {Array<{role?: string | null, fit?: any}>} slots
 * @param {(slot: any) => number} shownWidthOf - the fill plan's shown width of a slot (`fill-plan.mjs`)
 * @returns {{kind: 'small' | 'medium' | 'large' | 'background', width: number} | null}
 */
export function slotClassOf(slots, shownWidthOf) {
  const width = Math.max(0, ...slots.map((s) => Number(shownWidthOf(s)) || 0))
  if (!(width > 0)) return null
  const background = slots.some(
    (s) =>
      s.role === 'business.hero_image' &&
      s.fit?.kind !== 'cutout' &&
      Number(s.fit?.boxes?.desktop?.width) >= BACKGROUND_MIN_WIDTH
  )
  if (background) return { kind: 'background', width }
  const kind = width <= BARS.small.max ? 'small' : width <= BARS.medium.max ? 'medium' : 'large'
  return { kind, width }
}

/** A separable Gaussian blur of a float grey picture. */
function blur(/** @type {Float32Array} */ src, w, h, sigma) {
  const r = Math.ceil(sigma * 3)
  const k = new Float32Array(2 * r + 1)
  let total = 0
  for (let i = -r; i <= r; i += 1) total += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma))
  for (let i = 0; i < k.length; i += 1) k[i] /= total
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      let a = 0
      for (let i = -r; i <= r; i += 1) a += k[i + r] * src[y * w + Math.min(w - 1, Math.max(0, x + i))]
      tmp[y * w + x] = a
    }
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      let a = 0
      for (let i = -r; i <= r; i += 1) a += k[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x]
      out[y * w + x] = a
    }
  return out
}

/** The grey pixels of a picture rendered `width` wide (lanczos, as the browser and `meetSlotFit` enlarge it). */
async function render(bytes, width) {
  const meta = await open(bytes).metadata()
  const height = Math.max(1, Math.round((width * (meta.height ?? 1)) / (meta.width ?? 1)))
  let image = open(bytes).flatten({ background: '#808080' }).resize(width, height, {
    fit: 'fill',
    kernel: 'lanczos3'
  })
  if (width * height > MEASURE_PIXELS) {
    const side = Math.sqrt(MEASURE_PIXELS / (width * height))
    const w = Math.floor(width * side)
    const h = Math.floor(height * side)
    image = sharp(await image.toBuffer()).extract({
      left: Math.floor((width - w) / 2),
      top: Math.floor((height - h) / 2),
      width: w,
      height: h
    })
  }
  const { data, info } = await image.greyscale().raw().toBuffer({ resolveWithObject: true })
  return { grey: Float32Array.from(data), w: info.width, h: info.height }
}

/** The finest band's share of the next band, and the coarse band's strength. */
function detailShare({ grey, w, h }) {
  const b1 = blur(grey, w, h, 1)
  const b3 = blur(grey, w, h, 3)
  let fine = 0
  let mid = 0
  for (let i = 0; i < grey.length; i += 1) {
    fine += Math.abs(grey[i] - b1[i])
    mid += Math.abs(b1[i] - b3[i])
  }
  fine /= grey.length
  mid /= grey.length
  return { share: mid > 0 ? fine / mid : 0, mid }
}

/**
 * Steps across the JPEG 8 px grid against steps elsewhere, the worse of columns and rows. The grid's offset in a cut is
 * not known, so every offset is tried and the strongest taken: a clean photo has none stronger than the rest.
 */
async function blockiness(bytes) {
  const { data, info } = await open(bytes).greyscale().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  if (w < 32 || h < 32) return 1
  const col = new Float64Array(8)
  const row = new Float64Array(8)
  for (let y = 0; y < h - 1; y += 1)
    for (let x = 0; x < w - 1; x += 1) {
      const at = y * w + x
      col[x % 8] += Math.abs(data[at] - data[at + 1])
      row[y % 8] += Math.abs(data[at] - data[at + w])
    }
  const worst = (/** @type {Float64Array} */ steps) => {
    const sorted = [...steps].sort((a, b) => a - b)
    const typical = (sorted[3] + sorted[4]) / 2
    return typical > 0 ? sorted[7] / typical : 1
  }
  return Math.max(worst(col), worst(row))
}

/**
 * The edge of a picture padded with a blurred, stretched copy of itself (an image model filling a wide frame, or a canvas
 * widened with its own blurred source): a run of at least `BAND_STRIPS` of 20 strips from one edge whose fine detail
 * share is under `BAND_SHARE` of the picture's median strip, where the strip has content (a dark plain wall is not
 * blurred, it is plain). Columns: any such run. Rows: only a thin run (`ROW_BAND_MAX`) that steps straight back to
 * sharp, since a real photo's depth of field softens its far rows gradually and over a large part of the frame.
 * Calibrated (29/10/2026) on 15 drawings and 17 owner photos of a local brief build: the one padded drawing had its left
 * 4 strips at 0.35 to 0.48 then 0.93; no other picture had a column strip under 0.66; depth of field reached 0.24 on
 * rows but ramped (0.51, 0.82, 1.04).
 * @param {Uint8Array} bytes
 * @returns {Promise<{edge: 'left' | 'right' | 'top' | 'bottom', share: number, strips: number} | null>}
 */
export async function blurredBand(bytes) {
  const meta = await open(bytes).metadata()
  const width = Math.min(BAND_WIDTH, meta.width ?? 0)
  if (width < STRIPS * 4) return null
  const { grey, w, h } = await render(bytes, width)
  if (h < STRIPS * 4) return null
  const b1 = blur(grey, w, h, 1)
  const b3 = blur(grey, w, h, 3)
  const strips = (/** @type {'cols' | 'rows'} */ axis) => {
    const fine = new Float64Array(STRIPS)
    const mid = new Float64Array(STRIPS)
    for (let y = 0; y < h; y += 1)
      for (let x = 0; x < w; x += 1) {
        const s = axis === 'cols' ? Math.floor((x * STRIPS) / w) : Math.floor((y * STRIPS) / h)
        const at = y * w + x
        fine[s] += Math.abs(grey[at] - b1[at])
        mid[s] += Math.abs(b1[at] - b3[at])
      }
    const median = (/** @type {number[]} */ a) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)]
    const share = [...fine].map((f, i) => (mid[i] > 0 ? f / mid[i] : 0))
    const typicalShare = median(share)
    const typicalMid = median([...mid])
    // A strip with almost no structure (a plain wall, a clear sky) says nothing about blur: it counts as sharp.
    return share.map((v, i) => (mid[i] < typicalMid * 0.35 || typicalShare <= 0 ? 1 : v / typicalShare))
  }
  for (const axis of /** @type {const} */ (['cols', 'rows'])) {
    const rel = strips(axis)
    for (const fromEnd of [false, true]) {
      const seq = fromEnd ? [...rel].reverse() : rel
      let run = 0
      while (run < seq.length && seq[run] < BAND_SHARE) run += 1
      if (run < BAND_STRIPS || run > STRIPS / 2) continue
      if (axis === 'rows' && (run > ROW_BAND_MAX || !(seq[run] >= BAND_STEP))) continue
      const edge = axis === 'cols' ? (fromEnd ? 'right' : 'left') : fromEnd ? 'bottom' : 'top'
      return { edge, share: round(Math.max(...seq.slice(0, run))), strips: run }
    }
  }
  return null
}

/**
 * What a cut photo looks like in a slot shown `width` CSS px wide.
 * @param {Uint8Array} bytes - the photo cut for the slot, at its own pixels (before any enlargement)
 * @param {number} width - the slot's shown width
 * @param {{source?: Uint8Array | null, scale?: number}} [opts] - the source photo the cut was taken from, and the cut's
 *   scale against it (output width over crop width)
 */
export async function measureSharpness(bytes, width, { source = null, scale = 1 } = {}) {
  const meta = await open(bytes).metadata()
  const own = meta.width ?? 0
  const one = detailShare(await render(bytes, Math.round(width)))
  const two = detailShare(await render(bytes, Math.round(width * 2)))
  return {
    share1x: round(one.share),
    share2x: round(two.share),
    upscale1x: round(width / own),
    upscale2x: round((2 * width) / own),
    // A cut resamples the source's 8 px grid away while its blocks stay visible: the source photo is read too.
    blockiness: round(
      Math.max(
        await blockiness(bytes),
        source && scale >= BLOCKS_SURVIVE_SCALE ? await blockiness(source).catch(() => 1) : 1
      )
    ),
    band: await blurredBand(bytes),
    flat: one.mid < FLAT_DETAIL
  }
}

const round = (/** @type {number} */ n) => Number(n.toFixed(3))

/** The score of a measure against a bar: 1 or more passes. */
function scoreOf(m, bar) {
  if (m.flat) return 1
  return round(Math.min(m.share1x / bar.share1x, m.share2x / bar.share2x))
}

/** Why a measure fails its bar, or null. */
function failureOf(m, bar) {
  if (m.band) return 'blurred-region'
  if (m.flat) return null
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
  const first = await measureSharpness(bytes, slot.width, { source, scale })
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
  if (firstWhy === 'enlarged-too-far' || firstWhy === 'blurred-region' || first.blockiness > HEAVY_BLOCKINESS)
    return {
      ...base,
      verdict: 'fail',
      step: 'refused',
      score: scoreOf(first, bar),
      measured: first,
      reason: firstWhy
    }
  const corrected = await correctPhoto(bytes, { blocky: first.blockiness > MAX_BLOCKINESS })
  const again = await measureSharpness(corrected, slot.width)
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
