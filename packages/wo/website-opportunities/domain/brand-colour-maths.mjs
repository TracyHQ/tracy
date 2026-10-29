// Colour maths for the brand colours a brief build takes from the logo (`brand-colours.mjs`, ADR 0023 amended 29/10/2026):
// parsing CSS colour values, WCAG luminance and contrast, HSL, and moving a colour in lightness with its hue kept.
// Pure: no site, no clock.

/** @typedef {{r: number, g: number, b: number, a?: number}} Rgb */

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** A CSS colour (`#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`) as channels, or null. @returns {Rgb | null} */
export function rgbOf(value) {
  const text = String(value ?? '').trim()
  const hex = HEX.exec(text)
  if (hex) {
    let h = hex[1].toLowerCase()
    if (h.length <= 4) h = [...h].map((c) => c + c).join('')
    const n = (i) => Number.parseInt(h.slice(i, i + 2), 16)
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? Math.round((n(6) / 255) * 1000) / 1000 : 1 }
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/i.exec(text)
  if (!fn) return null
  const alpha = fn[4] === undefined ? 1 : fn[4].endsWith('%') ? Number.parseFloat(fn[4]) / 100 : Number(fn[4])
  const [r, g, b] = [fn[1], fn[2], fn[3]].map((v) => Math.min(255, Math.max(0, Math.round(Number(v)))))
  return { r, g, b, a: alpha }
}

/** `#rrggbb` of a colour (alpha dropped). @param {Rgb} c */
export const hexOf = ({ r, g, b }) =>
  `#${[r, g, b]
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`

/** A colour written back as CSS: `#rrggbb` when opaque, else `rgba()` with its own alpha. @param {Rgb} c */
export const cssOf = (c) =>
  (c.a ?? 1) >= 1 ? hexOf(c) : `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${c.a})`

/** WCAG relative luminance. @param {Rgb} c */
export function luminanceOf({ r, g, b }) {
  const lin = (v) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast of two colours (CSS strings or channels), 1 to 21. */
export function contrastOf(a, b) {
  const [x, y] = [a, b].map((c) => luminanceOf(typeof c === 'string' ? /** @type {Rgb} */ (rgbOf(c)) : c))
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** Hue (degrees), saturation and lightness (0 to 1). @param {Rgb} c */
export function hslOf({ r, g, b }) {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  return { h: (h * 60 + 360) % 360, s, l }
}

/** The colour of a hue, saturation and lightness. @returns {Rgb} */
export function rgbOfHsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x]
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) }
}

/** How coloured a colour is, 0 (grey) to 1: the spread of its channels. @param {Rgb} c */
export const chromaOf = ({ r, g, b }) => (Math.max(r, g, b) - Math.min(r, g, b)) / 255

/** The shortest distance between two hues, in degrees. */
export function hueGapOf(a, b) {
  const d = Math.abs(hslOf(a).h - hslOf(b).h) % 360
  return Math.min(d, 360 - d)
}

/** `c` moved `share` of the way to `toward`, alpha kept. @param {Rgb} c @param {Rgb} toward */
export const mixOf = (c, toward, share) => ({
  r: c.r + (toward.r - c.r) * share,
  g: c.g + (toward.g - c.g) * share,
  b: c.b + (toward.b - c.b) * share,
  a: c.a ?? 1
})

const STEPS = 400

/**
 * The colour with its hue and saturation kept and its lightness moved the least that makes `ok` true; when no lightness
 * does, the one that `score` rates highest. The colour itself when it already passes.
 * @param {Rgb} c @param {(c: Rgb) => boolean} ok @param {(c: Rgb) => number} score
 * @returns {Rgb}
 */
export function toneOf(c, ok, score) {
  if (ok(c)) return { r: c.r, g: c.g, b: c.b }
  const { h, s, l } = hslOf(c)
  let best = null
  let gap = Number.POSITIVE_INFINITY
  let top = null
  let topScore = Number.NEGATIVE_INFINITY
  for (let i = 0; i <= STEPS; i += 1) {
    const L = i / STEPS
    const t = rgbOfHsl(h, s, L)
    if (ok(t) && Math.abs(L - l) < gap) {
      best = t
      gap = Math.abs(L - l)
    }
    const v = score(t)
    if (v > topScore) {
      top = t
      topScore = v
    }
  }
  return /** @type {Rgb} */ (best ?? top)
}

/** The colour at the lightness whose luminance is nearest `target`, hue and saturation kept. @param {Rgb} c */
export function atLuminance(c, target) {
  const { h, s } = hslOf(c)
  let best = c
  let gap = Number.POSITIVE_INFINITY
  for (let i = 0; i <= STEPS; i += 1) {
    const t = rgbOfHsl(h, s, i / STEPS)
    const d = Math.abs(luminanceOf(t) - target)
    if (d < gap) {
      best = t
      gap = d
    }
  }
  return best
}
