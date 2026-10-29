/**
 * The owner's MARK read out of a logo picture (spec TracyHQ/tracy#189): its drawing as the owner made it, never redrawn.
 *
 *   readMark     the drawing trimmed of its transparent margin; when it sits on a solid TILE (a square of one colour, a
 *                white box, a gradient of one hue, as an app icon or a social avatar is exported), the tile is keyed out by
 *                colour distance and the drawing's edge pixels are freed of the tile's colour; plus its shape, its colours
 *                and whether it is flat (one colour, safe to recolour)
 *   recoloured   a flat drawing in another colour, its alpha kept
 *
 * 🔒 IMAGE PROCESSING ONLY. Nothing here asks a model to cut the background: the tile is found by the colour of the picture's
 * own border ring, and a picture whose ring is not one colour has no tile to take away.
 */
import sharp from 'sharp'
import { swatchesOf } from './logo-colours.js'

/** Pixels on the longest edge the mark is read at: four times a 56-px frame at 2x, enough for any logo spot. */
const READ_EDGE = 900
/** Pixels on the longest edge of the small copy the drawn box is found on. */
const PEEK_EDGE = 1200
/** A pixel this transparent is margin. */
const MARGIN_ALPHA = 16
/** The ring read for a tile: this share of the shorter side, from the edge inward. */
const RING = 0.03
/** A ring is a tile when this share of it is opaque and this close (RGB distance) to the ring's median colour. */
const TILE_OPAQUE = 0.95
const TILE_NEAR = 60
const TILE_SHARE = 0.9
/** Keying: at most the ring's own spread (its 98th percentile distance) is tile; this much further is fully the drawing. */
const KEY_SOFT = 48
/** A row or column with fewer drawn pixels than this share of the other side is a speck, not the drawing. */
const SPECK = 0.006
/** A cut that leaves less of the picture than this is no mark (the "tile" was the drawing). */
const MIN_INK = 0.01
/** A drawing is flat when one colour (after twins merge) covers this share of its pixels. */
const FLAT_SHARE = 0.85

/** @typedef {{r: number, g: number, b: number}} Rgb */

/**
 * Decode as RGBA, cut to the drawn box first (found on a small copy, then taken from the full picture with a pixel to
 * spare), then scaled to at most `READ_EDGE` long: a square logo padded into a wide canvas is read at its own size.
 */
async function rgbaOf(/** @type {Uint8Array} */ bytes) {
  const source = sharp(Buffer.from(bytes), { failOn: 'none' }).rotate()
  const { data, info } = await source
    .clone()
    .resize(PEEK_EDGE, PEEK_EDGE, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const meta = await sharp(await source.clone().png().toBuffer()).metadata()
  const full = { width: meta.width ?? info.width, height: meta.height ?? info.height }
  const peek = inkBox({ data, width: info.width, height: info.height })
  if (!peek) return null
  const k = full.width / info.width
  const left = Math.max(0, Math.floor((peek.left - 1) * k))
  const top = Math.max(0, Math.floor((peek.top - 1) * k))
  const right = Math.min(full.width, Math.ceil((peek.left + peek.width + 1) * k))
  const bottom = Math.min(full.height, Math.ceil((peek.top + peek.height + 1) * k))
  const out = await source
    .clone()
    .extract({ left, top, width: right - left, height: bottom - top })
    .resize(READ_EDGE, READ_EDGE, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data: Buffer.from(out.data), width: out.info.width, height: out.info.height }
}

/** The box of pixels whose alpha passes `MARGIN_ALPHA`, or null. */
function inkBox({ data, width, height }) {
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      if (data[(y * width + x) * 4 + 3] > MARGIN_ALPHA) {
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
  return right < 0 ? null : { left, top, width: right - left + 1, height: bottom - top + 1 }
}

/**
 * The box of a keyed picture's drawing: a row or column counts when enough of its pixels are mostly opaque, so a speck of
 * the tile's gradient left past the key does not widen the mark.
 */
function denseBox({ data, width, height }) {
  const cols = Array.from({ length: width }, () => 0)
  const rows = Array.from({ length: height }, () => 0)
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      if (data[(y * width + x) * 4 + 3] > 128) {
        cols[x] += 1
        rows[y] += 1
      }
  const span = (/** @type {number[]} */ counts, /** @type {number} */ need) => {
    const first = counts.findIndex((n) => n >= need)
    if (first < 0) return null
    let last = counts.length - 1
    while (counts[last] < need) last -= 1
    return [first, last]
  }
  const xs = span(cols, Math.max(2, Math.round(height * SPECK)))
  const ys = span(rows, Math.max(2, Math.round(width * SPECK)))
  if (!xs || !ys) return null
  return { left: xs[0], top: ys[0], width: xs[1] - xs[0] + 1, height: ys[1] - ys[0] + 1 }
}

/** A raw RGBA crop as a PNG. */
const pngOf = (/** @type {Buffer} */ data, /** @type {number} */ width, /** @type {number} */ height) =>
  sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer()

/** The ring's tile colour and spread, or null when the ring is not one solid colour. */
function tileOf({ data, width, height }) {
  const band = Math.max(2, Math.round(Math.min(width, height) * RING))
  /** @type {number[][]} */
  const ring = []
  let opaque = 0
  let seen = 0
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      if (x >= band && x < width - band && y >= band && y < height - band) continue
      // The outermost pixel is left out: a picture scaled to read it blends that edge with the transparency around it.
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) continue
      const o = (y * width + x) * 4
      seen += 1
      if (data[o + 3] < 240) continue
      opaque += 1
      ring.push([data[o], data[o + 1], data[o + 2]])
    }
  if (!seen || opaque / seen < TILE_OPAQUE) return null
  const median = [0, 1, 2].map((c) => ring.map((p) => p[c]).sort((a, b) => a - b)[ring.length >> 1])
  const distances = ring
    .map((p) => Math.hypot(p[0] - median[0], p[1] - median[1], p[2] - median[2]))
    .sort((a, b) => a - b)
  if (distances.filter((d) => d <= TILE_NEAR).length / distances.length < TILE_SHARE) return null
  return {
    colour: { r: median[0], g: median[1], b: median[2] },
    spread: Math.max(12, distances[Math.floor(distances.length * 0.98)])
  }
}

/** The picture with its tile keyed out (alpha by distance to the tile colour, edges freed of it), in place. */
function keyOut({ data, width, height }, /** @type {{colour: Rgb, spread: number}} */ tile) {
  const { r: tr, g: tg, b: tb } = tile.colour
  let ink = 0
  for (let o = 0; o < width * height * 4; o += 4) {
    const d = Math.hypot(data[o] - tr, data[o + 1] - tg, data[o + 2] - tb)
    const a = Math.max(0, Math.min(1, (d - tile.spread) / KEY_SOFT))
    if (a > 0 && a < 1) {
      // The pixel was a blend of the drawing and the tile: the drawing's own colour is what is left once the tile is taken out.
      data[o] = Math.max(0, Math.min(255, Math.round(tr + (data[o] - tr) / a)))
      data[o + 1] = Math.max(0, Math.min(255, Math.round(tg + (data[o + 1] - tg) / a)))
      data[o + 2] = Math.max(0, Math.min(255, Math.round(tb + (data[o + 2] - tb) / a)))
    }
    data[o + 3] = Math.round(data[o + 3] * a)
    if (a > 0.5) ink += 1
  }
  return ink / (width * height)
}

/** A crop of raw RGBA. */
function crop(
  { data, width },
  /** @type {{left: number, top: number, width: number, height: number}} */ box
) {
  const out = Buffer.alloc(box.width * box.height * 4)
  for (let y = 0; y < box.height; y += 1)
    data.copy(
      out,
      y * box.width * 4,
      ((box.top + y) * width + box.left) * 4,
      ((box.top + y) * width + box.left + box.width) * 4
    )
  return { data: out, width: box.width, height: box.height }
}

/**
 * @param {Uint8Array} bytes - the logo as the owner gave it
 * @returns {Promise<{mark: Buffer, tiled: Buffer | null, tile: Rgb | null, aspect: number, flat: boolean,
 *   swatches: Array<Rgb & {share: number}>} | null>} null for a picture with nothing drawn
 */
export async function readMark(bytes) {
  const raw = await rgbaOf(bytes)
  if (!raw) return null
  const box = inkBox(raw)
  if (!box) return null
  const trimmed = crop(raw, box)
  const tile = tileOf(trimmed)
  let mark = trimmed
  let tiled = null
  if (tile) {
    const keyed = { ...trimmed, data: Buffer.from(trimmed.data) }
    const ink = keyOut(keyed, tile)
    const inner = ink >= MIN_INK ? denseBox(keyed) : null
    if (inner) {
      tiled = await pngOf(trimmed.data, trimmed.width, trimmed.height)
      mark = crop(keyed, inner)
    }
  }
  const png = await pngOf(mark.data, mark.width, mark.height)
  const swatches = await swatchesOf(png)
  const merged = swatches.filter((s) => {
    const top = swatches[0]
    return Math.hypot(s.r - top.r, s.g - top.g, s.b - top.b) < 40
  })
  const flat = merged.reduce((sum, s) => sum + s.share, 0) >= FLAT_SHARE
  return {
    mark: png,
    tiled,
    tile: tiled && tile ? tile.colour : null,
    aspect: mark.width / mark.height,
    flat,
    swatches
  }
}

/**
 * A flat drawing in one colour, its alpha (antialiasing included) kept.
 * @param {Uint8Array} bytes @param {Rgb} colour @returns {Promise<Buffer>}
 */
export async function recoloured(bytes, colour) {
  const { data, info } = await sharp(Buffer.from(bytes))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const out = Buffer.from(data)
  for (let o = 0; o < out.length; o += 4) {
    out[o] = colour.r
    out[o + 1] = colour.g
    out[o + 2] = colour.b
  }
  return pngOf(out, info.width, info.height)
}

/** WCAG relative luminance of 8-bit channels. */
const lum = (/** @type {number} */ r, /** @type {number} */ g, /** @type {number} */ b) => {
  const lin = (/** @type {number} */ v) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
/** The most a toned drawing's inner tones move away from the target colour (toward the ground's side), as a mix share. */
const TONE_SPAN = 0.45
/** A toned drawing reads when this share of its pixels reaches this contrast with the ground (as `logosByContrast`). */
const TONE_BAR = 3
const TONE_SHARE = 0.9

/**
 * The drawing in one colour family that reads on `ground`, its inner lightness pattern kept: each pixel's lightness within the
 * drawing (darkest 0, lightest 1) is mapped onto `colour`, the part of the drawing farthest from the ground taking `colour`
 * itself and the rest moving toward white (on a light ground, from the darkest) or black (on a dark ground) by at most
 * `TONE_SPAN`. The span shrinks until the drawing reads, so details stay as long as they can.
 * @param {Uint8Array} bytes - the cut-free drawing
 * @param {Rgb} colour - the target, already reaching 3:1 on the ground (`logoColours` `.mark`)
 * @param {Rgb} ground
 * @returns {Promise<Buffer>}
 */
export async function toned(bytes, colour, ground) {
  const { data, info } = await sharp(Buffer.from(bytes))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let lo = 1
  let hi = 0
  for (let o = 0; o < data.length; o += 4) {
    if (data[o + 3] < 128) continue
    const l = lum(data[o], data[o + 1], data[o + 2])
    if (l < lo) lo = l
    if (l > hi) hi = l
  }
  const lightGround = lum(ground.r, ground.g, ground.b) > 0.18
  const lg = lum(ground.r, ground.g, ground.b)
  const toward = lightGround ? 255 : 0
  const span = hi - lo || 1
  let out = Buffer.from(data)
  for (let k = TONE_SPAN; k >= 0; k -= 0.05) {
    out = Buffer.from(data)
    let opaque = 0
    let readable = 0
    for (let o = 0; o < out.length; o += 4) {
      const t = (lum(data[o], data[o + 1], data[o + 2]) - lo) / span
      // On a light ground the darkest part is the target and lighter parts lift toward white; on a dark ground the reverse.
      const away = (lightGround ? t : 1 - t) * k
      out[o] = Math.round(colour.r + (toward - colour.r) * away)
      out[o + 1] = Math.round(colour.g + (toward - colour.g) * away)
      out[o + 2] = Math.round(colour.b + (toward - colour.b) * away)
      if (out[o + 3] < 128) continue
      opaque += 1
      const l = lum(out[o], out[o + 1], out[o + 2])
      if ((Math.max(l, lg) + 0.05) / (Math.min(l, lg) + 0.05) >= TONE_BAR) readable += 1
    }
    if (!opaque || readable / opaque >= TONE_SHARE) break
  }
  return pngOf(out, info.width, info.height)
}
