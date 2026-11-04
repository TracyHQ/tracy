// Read by the drawing modules beside it, shared by the picture and write steps, so it is in lib/ (module-graph.test.mjs).
// Colour maths and the ink colour of a demo icon (ported from the brief build branch, #189; spec #345).
import sharp from 'sharp'

/** WCAG relative luminance of an sRGB colour given as three 0..255 numbers. */
export function luminance(r, g, b) {
  const lin = (/** @type {number} */ v) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast of two luminances. */
export const contrast = (/** @type {number} */ a, /** @type {number} */ b) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/** `#rrggbb` of a colour. @param {{r: number, g: number, b: number}} c */
export const hexOf = ({ r, g, b }) =>
  `#${[r, g, b]
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`

/** A `#rrggbb` colour as numbers; null when it is not one. */
export function rgbOf(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex ?? ''))
  if (!m) return null
  const n = Number.parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/** Luminance of a `#rrggbb` colour; null when it is not one. */
export function luminanceOfHex(hex) {
  const c = rgbOf(hex)
  return c ? luminance(c.r, c.g, c.b) : null
}

/**
 * The colour moved toward white (on a dark ground) or black (on a light one) until it reaches 3:1 against the ground.
 * @param {{r: number, g: number, b: number}} c @param {number} behind - the ground's luminance
 */
export function towardContrast(c, behind) {
  const to = behind < 0.18 ? 255 : 0
  for (let t = 0.05; t <= 1; t += 0.05) {
    const mixed = { r: c.r + (to - c.r) * t, g: c.g + (to - c.g) * t, b: c.b + (to - c.b) * t }
    if (contrast(luminance(mixed.r, mixed.g, mixed.b), behind) >= 3) return mixed
  }
  return { r: to, g: to, b: to }
}

const lumOf = (/** @type {{r: number, g: number, b: number}} */ c) => luminance(c.r, c.g, c.b)

/**
 * The colour a demo icon is drawn in, as `#rrggbb`; null when it cannot be read.
 *
 * 🔒 THE INK, NOT THE AVERAGE. A demo icon may carry its own ground: a filled disc or tile behind a line glyph (a black
 * disc under red strokes for a dark section). The average of all its pixels is then the ground's colour more than the
 * glyph's, and a glyph drawn in it disappears on the section the demo was made for (measured on a local brief build: red
 * strokes on a black disc gave #231515, a near-black glyph on a dark band). So: when one colour fills most of the icon's
 * box (a ground), the ink is the other colour that contrasts most with it, held to 3:1 against that ground; without a
 * ground, the mean of the opaque pixels.
 * @param {Uint8Array | null} bytes
 */
export async function iconColourOf(bytes) {
  if (!bytes) return null
  try {
    const { data, info } = await sharp(Buffer.from(bytes), { failOn: 'none' })
      .ensureAlpha()
      .resize(48, 48, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    /** @type {Map<string, {r: number, g: number, b: number, n: number, x0: number, x1: number, y0: number, y1: number}>} */
    const clusters = new Map()
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let i = 0, p = 0; i < data.length; i += info.channels, p += 1) {
      if (data[i + 3] < 128) continue
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
      n += 1
      const key = `${data[i] >> 5},${data[i + 1] >> 5},${data[i + 2] >> 5}`
      const x = p % info.width
      const y = Math.floor(p / info.width)
      const c = clusters.get(key) ?? { r: 0, g: 0, b: 0, n: 0, x0: x, x1: x, y0: y, y1: y }
      c.r += data[i]
      c.g += data[i + 1]
      c.b += data[i + 2]
      c.n += 1
      c.x0 = Math.min(c.x0, x)
      c.x1 = Math.max(c.x1, x)
      c.y0 = Math.min(c.y0, y)
      c.y1 = Math.max(c.y1, y)
      clusters.set(key, c)
    }
    if (n === 0) return null
    const colourOf = (/** @type {{r: number, g: number, b: number, n: number}} */ c) => ({
      r: c.r / c.n,
      g: c.g / c.n,
      b: c.b / c.n
    })
    const ranked = [...clusters.values()].sort((a, z) => z.n - a.n)
    const top = ranked[0]
    const area = info.width * info.height
    // A ground: one colour over a third of the box, spanning most of it both ways.
    const ground =
      top.n >= area / 3 && top.x1 - top.x0 + 1 >= info.width * 0.7 && top.y1 - top.y0 + 1 >= info.height * 0.7
        ? colourOf(top)
        : null
    if (!ground) return hexOf({ r: r / n, g: g / n, b: b / n })
    const behind = lumOf(ground)
    // The ink: the pixels that stand apart from the ground, averaged; the ones reaching 3:1 when there are enough of them,
    // so the glyph's anti-aliased edge does not dull it.
    const inkOver = (/** @type {number} */ bar) => {
      const ink = { r: 0, g: 0, b: 0, n: 0 }
      for (const c of ranked.slice(1))
        if (contrast(lumOf(colourOf(c)), behind) >= bar) {
          ink.r += c.r
          ink.g += c.g
          ink.b += c.b
          ink.n += c.n
        }
      return ink.n >= n * 0.03 ? ink : null
    }
    const ink = inkOver(3) ?? inkOver(1.5) ?? inkOver(0)
    if (!ink) return hexOf({ r: r / n, g: g / n, b: b / n })
    const colour = colourOf(ink)
    return hexOf(contrast(lumOf(colour), behind) >= 3 ? colour : towardContrast(colour, behind))
  } catch {
    return null
  }
}
