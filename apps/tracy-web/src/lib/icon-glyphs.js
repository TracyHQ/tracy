/**
 * An item icon of a brief build (spec TracyHQ/tracy#189, ticket #195), rendered from Phosphor Icons (`phosphor-icons.js`):
 * the decor plan names the icon (`website-opportunities/domain/icon-choice.mjs`), the demo icon's measured style names its
 * weight (`icon-style.js`), and `iconPicture` renders it as a transparent PNG of the demo icon's size, in the demo icon's
 * own colour, so a dark and a light icon of one item stay a pair.
 *
 * Phosphor replaced Tracy's own hand-drawn glyphs (COO 29/10/2026): a curated table of a few dozen glyphs could not cover
 * any trade, nor match a template whose icons are filled, bold or two-tone.
 */
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { hasPhosphorIcon, phosphorSvg } from './phosphor-icons.js'

/** The icon drawn when a name is not in the set: the decor plan's first neutral mark. */
export const FALLBACK_ICON = 'check-circle'

/**
 * An icon as a transparent PNG.
 * @param {{glyph: string, weight?: string, width: number, height: number, colour?: string}} input
 * @returns {Promise<{bytes: Buffer, ext: 'png', width: number, height: number, sha256: string}>}
 */
export async function iconPicture({ glyph, weight = 'regular', width, height, colour = '#222222' }) {
  const source = await phosphorSvg(hasPhosphorIcon(glyph) ? glyph : FALLBACK_ICON, weight)
  // The icon fills the box as the demo's icons do; its one colour is the demo's (a duotone's tint is that colour at 20%).
  const svg = source
    .replace('<svg ', `<svg width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" `)
    .replaceAll('currentColor', colour)
  const bytes = await sharp(Buffer.from(svg))
    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  return { bytes, ext: 'png', width, height, sha256: createHash('sha256').update(bytes).digest('hex') }
}

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
    const behind = luminance(ground)
    // The ink: the pixels that stand apart from the ground, averaged; the ones reaching 3:1 when there are enough of them,
    // so the glyph's anti-aliased edge does not dull it.
    const inkOver = (/** @type {number} */ bar) => {
      const ink = { r: 0, g: 0, b: 0, n: 0 }
      for (const c of ranked.slice(1))
        if (contrast(luminance(colourOf(c)), behind) >= bar) {
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
    return hexOf(contrast(luminance(colour), behind) >= 3 ? colour : towardContrast(colour, behind))
  } catch {
    return null
  }
}

/** `#rrggbb` of a colour. @param {{r: number, g: number, b: number}} c */
const hexOf = ({ r, g, b }) =>
  `#${[r, g, b]
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`

/** WCAG relative luminance. @param {{r: number, g: number, b: number}} c */
function luminance({ r, g, b }) {
  const lin = (/** @type {number} */ v) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast of two luminances. */
const contrast = (/** @type {number} */ a, /** @type {number} */ b) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/**
 * The colour moved toward white (on a dark ground) or black (on a light one) until it reaches 3:1 against the ground.
 * @param {{r: number, g: number, b: number}} c @param {number} behind - the ground's luminance
 */
function towardContrast(c, behind) {
  const to = behind < 0.18 ? 255 : 0
  for (let t = 0.05; t <= 1; t += 0.05) {
    const mixed = { r: c.r + (to - c.r) * t, g: c.g + (to - c.g) * t, b: c.b + (to - c.b) * t }
    if (contrast(luminance(mixed), behind) >= 3) return mixed
  }
  return { r: to, g: to, b: to }
}
