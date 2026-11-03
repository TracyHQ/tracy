// Deterministic post-processing of an image-model icon (no model): ground to transparency, every remaining pixel to
// exactly one of the given colours (1 or 2), anti-aliased edges kept through alpha, crop to content, centred in a
// transparent 512 square (6% margin, same geometry as cut-mark and make-lettermark). Ported from the approved lab's
// icon-quantize; it takes and returns bytes (the run folder is the tool's business).
import { hex, parseHexColour } from '../colour-math.js'
import { dist, groundOf, raw, sharp } from './common.js'
import { labelPixels, relabelEdges, removeSpecks, STRAY_RES } from './icon-labels.js'

const S = 512
const INNER = Math.round(S * 0.88)
/** A 2-colour icon fails when a requested colour has under 3% of the icon's ink. */
export const MIN_SHARE = 0.03
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 }
const hexOf = (c) => hex(c.r, c.g, c.b)

/** Crop box of the pixels with alpha >= 8 in a raw RGBA buffer, or null when there are none. */
export function contentBox(buf, w, h) {
  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (buf[(y * w + x) * 4 + 3] >= 8) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  return x1 < 0 ? null : { x0, y0, x1, y1 }
}

/** Resampling mixes the colours where they touch: snap every pixel back to the nearest colour. Returns the ink. */
function snapToColours(sq, P) {
  const ink = P.map(() => 0)
  let total = 0
  let covered = 0
  for (let i = 0; i < S * S; i++) {
    const A = sq[i * 4 + 3]
    if (A < 4) {
      sq[i * 4] = sq[i * 4 + 1] = sq[i * 4 + 2] = sq[i * 4 + 3] = 0
      continue
    }
    const p = { r: sq[i * 4], g: sq[i * 4 + 1], b: sq[i * 4 + 2] }
    let k = 0
    let d = Number.POSITIVE_INFINITY
    P.forEach((c, j) => {
      const e = dist(p, c)
      if (e < d) {
        d = e
        k = j
      }
    })
    sq[i * 4] = P[k].r
    sq[i * 4 + 1] = P[k].g
    sq[i * 4 + 2] = P[k].b
    ink[k] += A / 255
    total += A / 255
    if (A >= 128) covered++
  }
  return { ink, total, covered }
}

/**
 * @param {Buffer} bytes the model's image (any format sharp reads)
 * @param {string[]} colours 1 or 2 `#rrggbb`
 * @returns {Promise<object>} the lab's measurement record, plus `png` (the transparent 512 icon) once one was made
 */
export async function quantizeIcon(bytes, colours) {
  const P = colours.map(parseHexColour)
  const img = await raw(bytes)
  const { data, w, h } = img
  const n = w * h
  const g0 = groundOf(img)
  const srcAlpha = g0.transparent
  const G = srcAlpha ? null : g0.colour
  if (G) {
    const near = Math.min(...P.map((c) => dist(c, G)))
    if (near < 60)
      return {
        ok: false,
        error: `the image ground (${hexOf(G)}) is too close to a requested colour to separate (${Math.round(near)})`
      }
  }
  const { O, label, alpha, res } = labelPixels({ data, w, h, P, G, srcAlpha })
  if (O.length > 1) relabelEdges({ label, alpha, w, h })
  const specks = removeSpecks({ alpha, w, h })
  // exact colours, alpha kept
  const outBuf = Buffer.alloc(n * 4)
  let solid = 0
  let stray = 0
  for (let i = 0; i < n; i++) {
    if (alpha[i] <= 0) continue
    const c = P[label[i]]
    outBuf[i * 4] = c.r
    outBuf[i * 4 + 1] = c.g
    outBuf[i * 4 + 2] = c.b
    outBuf[i * 4 + 3] = Math.round(alpha[i] * 255)
    if (alpha[i] >= 0.9) {
      solid++
      if (res[i] >= STRAY_RES) stray++
    }
  }
  const box = contentBox(outBuf, w, h)
  if (!box) return { ok: false, error: 'nothing left after removing the ground: the image is empty' }
  const { x0, y0, x1, y1 } = box
  const fitted = await sharp(outBuf, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
    .resize(INNER, INNER, { fit: 'contain', background: CLEAR })
    .png()
    .toBuffer()
  const sq = await sharp({ create: { width: S, height: S, channels: 4, background: CLEAR } })
    .composite([{ input: fitted, gravity: 'centre' }])
    .raw()
    .toBuffer()
  const { ink, total, covered } = snapToColours(sq, P)
  const png = await sharp(sq, { raw: { width: S, height: S, channels: 4 } })
    .png()
    .toBuffer()
  const shares = colours.map((hx, k) => ({
    colour: hx.toLowerCase(),
    share: total ? +(ink[k] / total).toFixed(3) : 0,
    observedInImage: hexOf(O[k])
  }))
  const coverage = +(covered / (S * S)).toFixed(3)
  const problems = []
  if (coverage < 0.02) problems.push(`almost empty: the icon covers ${coverage} of the square`)
  if (colours.length === 2)
    for (const s of shares)
      if (s.share < MIN_SHARE)
        problems.push(`colour ${s.colour} has almost no pixels (${s.share} of the ink, minimum ${MIN_SHARE})`)
  // exactly one of two colours missing on a non-empty icon: make_icon may put it on a plate of that colour
  const missing = colours.length === 2 && coverage >= 0.02 ? shares.filter((s) => s.share < MIN_SHARE) : []
  return {
    oneColourOnly:
      missing.length === 1
        ? { present: shares.find((s) => s.share >= MIN_SHARE).colour, missing: missing[0].colour }
        : null,
    ok: problems.length === 0,
    error: problems.length ? problems.join('; ') : undefined,
    ground: srcAlpha ? 'transparent (source alpha)' : hexOf(G),
    colours: shares,
    coverage,
    offPaletteShare: solid ? +(stray / solid).toFixed(3) : 0,
    specksRemoved: specks,
    sourceSize: [w, h],
    cropAtSource: { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 },
    png
  }
}
