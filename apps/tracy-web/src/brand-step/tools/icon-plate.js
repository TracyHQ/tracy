// Plate fallback of make_icon: a two-colour icon that came back in ONE colour is put, by code and with no new
// drawing, on a filled plate of the missing colour. Ported from the approved lab's icon-quantize (decision 20).
import { contrastHex, parseHexColour, PLATE_MIN_RATIO } from '../../lib/brand-accent/colour-math.js'
import { raw, sharp } from './common.js'
import { contentBox } from './icon-quantize.js'

export { PLATE_MIN_RATIO }
const S = 512
const PLATE = Math.round(S * 0.88)

/** Circle when the icon is compact (under 3% of its ink outside the circle around its box), else rounded square. */
function shapeOf(data, w, box) {
  const { x0, y0, x1, y1 } = box
  const bw = x1 - x0 + 1
  const bh = y1 - y0 + 1
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const R0 = Math.max(bw, bh) / 2
  let ink = 0
  let outside = 0
  let far = 0
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const A = data[(y * w + x) * 4 + 3] / 255
      if (!A) continue
      const d = Math.hypot(x - cx, y - cy)
      ink += A
      if (d > R0) outside += A
      if (A >= 0.5 && d > far) far = d
    }
  const outsideShare = ink ? outside / ink : 0
  return { bw, bh, cx, cy, far, outsideShare, shape: outsideShare < 0.03 ? 'circle' : 'rounded-square' }
}

/**
 * `png` is a quantized 512 icon whose ink is (almost) all one colour. The icon is drawn in one colour on a filled
 * plate of the other; every visible pixel is exactly one of the two colours. Colours: icon = the colour the model
 * drew, plate = the missing one; when that pair reads under 3:1 the roles are swapped (a swap cannot raise the
 * symmetric ratio; it is tried as decided and reported); still under: ok false, nothing made.
 */
export async function plateIcon(png, { present, missing }) {
  let iconColour = present
  let plateColour = missing
  let swapped = false
  let ratio = contrastHex(iconColour, plateColour)
  if (ratio < PLATE_MIN_RATIO) {
    ;[iconColour, plateColour] = [plateColour, iconColour]
    swapped = true
    ratio = contrastHex(iconColour, plateColour)
  }
  const base = { iconColour, plateColour, ratio, swapped, minRatio: PLATE_MIN_RATIO }
  if (ratio < PLATE_MIN_RATIO)
    return {
      ok: false,
      error: `plate fallback: the two colours read ${ratio}:1 against each other (minimum ${PLATE_MIN_RATIO}:1), also with the roles swapped`,
      ...base,
      shape: null
    }
  const { data, w, h } = await raw(png)
  const box = contentBox(data, w, h)
  const { bw, bh, cx, cy, far, outsideShare, shape } = shapeOf(data, w, box)
  const { x0, y0 } = box
  const off = (S - PLATE) / 2
  // icon size inside the plate: circle -> its farthest ink point at 74% of the plate radius; rounded square -> its
  // bounding box at 68% of the plate side
  const scale = shape === 'circle' ? (0.74 * PLATE) / 2 / Math.max(far, 1) : (0.68 * PLATE) / Math.max(bw, bh)
  const nw = Math.max(1, Math.round(bw * scale))
  const nh = Math.max(1, Math.round(bh * scale))
  const p = parseHexColour(iconColour)
  const solid = Buffer.alloc(bw * bh * 4)
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const i = ((y + y0) * w + (x + x0)) * 4
      solid.set([p.r, p.g, p.b, data[i + 3]], (y * bw + x) * 4)
    }
  const glyph = await sharp(solid, { raw: { width: bw, height: bh, channels: 4 } })
    .resize(nw, nh, { kernel: 'lanczos3' })
    .png()
    .toBuffer()
  const plateSvg =
    shape === 'circle'
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><circle cx="${S / 2}" cy="${S / 2}" r="${PLATE / 2}" fill="${plateColour}"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect x="${off}" y="${off}" width="${PLATE}" height="${PLATE}" rx="${Math.round(PLATE * 0.22)}" fill="${plateColour}"/></svg>`
  const left = Math.round(S / 2 - (cx - x0) * scale)
  const top = Math.round(S / 2 - (cy - y0) * scale)
  const buf = await sharp(Buffer.from(plateSvg))
    .composite([{ input: glyph, left, top }])
    .ensureAlpha()
    .raw()
    .toBuffer()
  const P = [parseHexColour(iconColour), parseHexColour(plateColour)]
  const share = [0, 0]
  for (let i = 0; i < S * S; i++) {
    if (buf[i * 4 + 3] < 4) {
      buf[i * 4] = buf[i * 4 + 1] = buf[i * 4 + 2] = buf[i * 4 + 3] = 0
      continue
    }
    const q = { r: buf[i * 4], g: buf[i * 4 + 1], b: buf[i * 4 + 2] }
    const near = (c) => Math.hypot(q.r - c.r, q.g - c.g, q.b - c.b)
    const k = near(P[0]) <= near(P[1]) ? 0 : 1
    buf[i * 4] = P[k].r
    buf[i * 4 + 1] = P[k].g
    buf[i * 4 + 2] = P[k].b
    share[k] += buf[i * 4 + 3] / 255
  }
  const out = await sharp(buf, { raw: { width: S, height: S, channels: 4 } })
    .png()
    .toBuffer()
  const tot = share[0] + share[1] || 1
  return {
    ok: true,
    ...base,
    shape,
    outsideCircleShare: +outsideShare.toFixed(3),
    shares: { [iconColour]: +(share[0] / tot).toFixed(3), [plateColour]: +(share[1] / tot).toFixed(3) },
    png: out
  }
}
