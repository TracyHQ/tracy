/**
 * The colours of a logo Tracy makes (spec TracyHQ/tracy#189): read from a palette, then made readable on the ground each
 * variant goes to.
 *
 *   swatchesOf     the colours of a picture's opaque pixels, most used first (a 4-bit-per-channel histogram)
 *   paletteOf      swatches as a palette: its accent (the most used colourful swatch) and its colours in order of use
 *   logoColours    THE ONE CHOICE: from a palette, on a light ground and on a dark one, the name's colour (the ground's
 *                  strong text colour: near-black, near-white), the descriptor's (the accent, 4.5:1, WCAG text), the
 *                  mark's when it is recoloured (3:1, WCAG non-text), and the badge a drawn symbol sits in (the accent at
 *                  3:1 on both grounds, so both variants share it, and the symbol's ink inside it); a candidate that does
 *                  not reach the bar is darkened or lightened in its own hue until it does, so a colour always comes back
 *
 * 🔒 WHOSE PALETTE IS DECIDED BY THE CALLER, NOT HERE (COO, 29/10/2026): the owner's logo when the brief has one, the
 * template's own logo colours when it has none. A later colour system can hand its palette to `logoColours` unchanged.
 */
import sharp from 'sharp'
import { DARK_GROUND, LIGHT_GROUND, luminance } from './brand-joomla-logo-contrast.js'

/** @typedef {{r: number, g: number, b: number}} Rgb */
/** @typedef {Rgb & {share: number}} Swatch */
/** @typedef {{accent: Rgb | null, colours: Rgb[]}} Palette */

/** WCAG text contrast and non-text contrast. */
export const TEXT_CONTRAST = 4.5
export const MARK_CONTRAST = 3
/** A swatch used by less than this share of the pixels is noise (antialiasing, a speck). */
const MIN_SHARE = 0.03
/** The least saturation (HSL) a swatch needs to be an accent. */
const MIN_ACCENT_SATURATION = 0.35
/** ...and this much between its strongest and weakest channel: a near-black with a trace of red is no accent. */
const MIN_ACCENT_CHROMA = 60

const contrast = (/** @type {Rgb} */ a, /** @type {Rgb} */ b) => {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** HSL saturation of a colour, 0 to 1. @param {Rgb} c */
export function saturationOf({ r, g, b }) {
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  const l = (max + min) / 2
  if (max === min) return 0
  return (max - min) / (1 - Math.abs(2 * l - 1))
}

/**
 * The colours of a picture's opaque pixels, most used first, each the mean of its histogram bucket.
 * @param {Uint8Array} bytes @param {{minAlpha?: number}} [options]
 * @returns {Promise<Swatch[]>}
 */
export async function swatchesOf(bytes, { minAlpha = 200 } = {}) {
  const { data, info } = await sharp(Buffer.from(bytes), { failOn: 'none' })
    .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  /** @type {Map<number, {r: number, g: number, b: number, n: number}>} */
  const buckets = new Map()
  let total = 0
  for (let o = 0; o < info.width * info.height * 4; o += 4) {
    if (data[o + 3] < minAlpha) continue
    const key = ((data[o] >> 4) << 8) | ((data[o + 1] >> 4) << 4) | (data[o + 2] >> 4)
    const b = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 }
    b.r += data[o]
    b.g += data[o + 1]
    b.b += data[o + 2]
    b.n += 1
    buckets.set(key, b)
    total += 1
  }
  return [...buckets.values()]
    .map((b) => ({
      r: Math.round(b.r / b.n),
      g: Math.round(b.g / b.n),
      b: Math.round(b.b / b.n),
      share: total ? b.n / total : 0
    }))
    .sort((a, b) => b.share - a.share)
}

/**
 * Swatches (of one or several pictures, already merged) as a palette: noise left out, near twins merged into the first.
 * @param {Swatch[]} swatches @returns {Palette}
 */
export function paletteOf(swatches) {
  /** @type {Swatch[]} */
  const kept = []
  for (const s of [...swatches].sort((a, b) => b.share - a.share)) {
    const twin = kept.find((k) => Math.hypot(k.r - s.r, k.g - s.g, k.b - s.b) < 40)
    if (twin) twin.share += s.share
    else kept.push({ ...s })
  }
  const colours = kept.filter((s) => s.share >= MIN_SHARE).sort((a, b) => b.share - a.share)
  const accent =
    colours.find(
      (s) =>
        saturationOf(s) >= MIN_ACCENT_SATURATION &&
        Math.max(s.r, s.g, s.b) - Math.min(s.r, s.g, s.b) >= MIN_ACCENT_CHROMA
    ) ?? null
  const plain = (/** @type {Swatch} */ s) => ({ r: s.r, g: s.g, b: s.b })
  return { accent: accent ? plain(accent) : null, colours: colours.map(plain) }
}

/** `c` mixed toward `to` by `t` (0 to 1). */
const mix = (/** @type {Rgb} */ c, /** @type {Rgb} */ to, /** @type {number} */ t) => ({
  r: Math.round(c.r + (to.r - c.r) * t),
  g: Math.round(c.g + (to.g - c.g) * t),
  b: Math.round(c.b + (to.b - c.b) * t)
})

/**
 * The first candidate reaching `bar` on `ground`; none does, the first candidate darkened (light ground) or lightened (dark
 * ground) step by step until it does.
 * @param {Rgb[]} candidates @param {Rgb} ground @param {number} bar @returns {Rgb}
 */
export function inkFor(candidates, ground, bar) {
  const found = candidates.find((c) => contrast(c, ground) >= bar)
  if (found) return found
  const lightGround = luminance(ground) > 0.18
  const toward = lightGround ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 }
  const start = candidates[0] ?? (lightGround ? { r: 31, g: 31, b: 31 } : { r: 245, g: 245, b: 245 })
  for (let t = 0.05; t <= 1; t += 0.05) {
    const tried = mix(start, toward, t)
    if (contrast(tried, ground) >= bar) return tried
  }
  return toward
}

/** A colour as `#rrggbb`. */
export const hexOf = (/** @type {Rgb} */ { r, g, b }) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`

/** The name's colour on each ground: the ground's strong text colour (COO 29/10/2026). */
export const NAME_ON_LIGHT = Object.freeze({ r: 20, g: 20, b: 20 })
export const NAME_ON_DARK = Object.freeze({ r: 246, g: 246, b: 246 })
const WHITE = { r: 255, g: 255, b: 255 }

/**
 * The shade of `colour` nearest to it that reaches `bar` on every ground, mixed toward black, else toward white, in steps;
 * null when none does.
 * @param {Rgb} colour @param {Rgb[]} grounds @param {number} bar @returns {Rgb | null}
 */
export function shadeForAll(colour, grounds, bar) {
  for (let t = 0; t <= 1; t += 0.05)
    for (const toward of [{ r: 0, g: 0, b: 0 }, WHITE]) {
      const tried = mix(colour, toward, t)
      if (grounds.every((g) => contrast(tried, g) >= bar)) return tried
    }
  return null
}

/**
 * The colours of a made logo on each ground: the name's (`text`), the descriptor's (`accent`), the mark's when it is
 * recoloured (`mark`), and the badge a drawn symbol sits in (`badge`: its fill and the symbol's ink).
 * The descriptor and the badge prefer the accent; the mark prefers the accent then the palette's colours in order of use.
 * @param {Palette} palette
 * @returns {{light: {text: Rgb, accent: Rgb, mark: Rgb, badge: {fill: Rgb, ink: Rgb}},
 *   dark: {text: Rgb, accent: Rgb, mark: Rgb, badge: {fill: Rgb, ink: Rgb}}}}
 */
export function logoColours(palette) {
  const colours = palette?.colours ?? []
  const accent = palette?.accent ?? null
  const markFirst = accent ? [accent, ...colours] : colours
  const lead = markFirst[0] ?? null
  // One badge for both variants when a shade of the accent reaches 3:1 on both grounds; else each ground its own.
  const shared = lead ? shadeForAll(lead, [LIGHT_GROUND, DARK_GROUND], MARK_CONTRAST) : null
  const badgeOn = (/** @type {Rgb} */ ground) => {
    const fill = shared ?? inkFor(markFirst, ground, MARK_CONTRAST)
    const ink = contrast(WHITE, fill) >= MARK_CONTRAST ? WHITE : NAME_ON_LIGHT
    return { fill, ink }
  }
  const on = (/** @type {Rgb} */ ground, /** @type {Rgb} */ text) => ({
    text,
    accent: inkFor(lead ? [lead] : [], ground, TEXT_CONTRAST),
    mark: inkFor(markFirst, ground, MARK_CONTRAST),
    badge: badgeOn(ground)
  })
  return { light: on(LIGHT_GROUND, NAME_ON_LIGHT), dark: on(DARK_GROUND, NAME_ON_DARK) }
}
