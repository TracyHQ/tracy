// The eyes of the sharpness gate (photo-sharpness.js, ported from the brief build branch, spec TracyHQ/tracy#189): a
// picture rendered at a display width at 1x and 2x, its finest detail against the next octave, its JPEG blockiness and
// any blurred, stretched band at an edge. Pure measurement; the verdicts and their calibration live in
// photo-sharpness.js.
import sharp from 'sharp'

const MAX_PIXELS = 100_000_000
/** A cut that keeps at least this share of the source's scale keeps its blocks visible: the source's grid is read. */
const BLOCKS_SURVIVE_SCALE = 0.5
/** Under this coarse detail (grey levels) a picture is flat: nothing in it can look blurred. */
const FLAT_DETAIL = 0.6
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
export async function blockiness(bytes) {
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
 * @param {{source?: Uint8Array | null, scale?: number, ownSize?: boolean}} [opts] - the source photo the cut was taken from, and the cut's
 *   scale against it (output width over crop width), and whether to measure the detail at the cut's own width too
 */
export async function measureSharpness(bytes, width, { source = null, scale = 1, ownSize = false } = {}) {
  const meta = await open(bytes).metadata()
  const own = meta.width ?? 0
  const one = detailShare(await render(bytes, Math.round(width)))
  const two = detailShare(await render(bytes, Math.round(width * 2)))
  return {
    // The real pixels across the cut: a cut shrunk from its source (scale under 1) had more of them.
    ownWidth: Math.round(own / Math.min(1, scale > 0 ? scale : 1)),
    ...(ownSize && own > 0 ? { shareOwn: await ownShare(source ?? bytes) } : {}),
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

export const round = (/** @type {number} */ n) => Number(n.toFixed(3))

/**
 * The detail of a photo at its own pixels: what an enlargement baked into the file has already taken away. Read on the
 * source photo when there is one, since shrinking the cut to its frame would hide it.
 */
export async function ownShare(/** @type {Uint8Array} */ bytes) {
  const width = (await open(bytes).metadata()).width ?? 0
  return width > 0 ? round(detailShare(await render(bytes, width)).share) : 0
}
