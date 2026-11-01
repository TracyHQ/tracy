// Colour maths for the site part of the template kit: parsing CSS colour values, WCAG luminance and contrast, hue,
// how coloured a colour is, and the distance between two colours. Pure: no site, no clock.

/** @typedef {{r: number, g: number, b: number, a?: number}} Rgb */

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const FN = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/i

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
  const fn = FN.exec(text)
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

/** How coloured a colour is, 0 (grey) to 1: the spread of its channels. @param {Rgb} c */
export const chromaOf = ({ r, g, b }) => (Math.max(r, g, b) - Math.min(r, g, b)) / 255

/** The shortest distance between two hues, in degrees. @param {Rgb} a @param {Rgb} b */
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

/** The straight distance of two colours in RGB, 0 to about 441. @param {Rgb} a @param {Rgb} b */
export const distanceOf = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b)

/** `light` or `dark`: the side a ground colour belongs to (luminance under 0.18 reads as dark). */
export const sideOfGround = (value) => {
  const c = typeof value === 'string' ? rgbOf(value) : value
  return c ? (luminanceOf(c) < 0.18 ? 'dark' : 'light') : null
}

const COLOUR = /#[0-9a-f]{3,8}\b|rgba?\([^()]*\)/gi

/** Every colour written in a CSS value, in order. @returns {Rgb[]} */
export const coloursIn = (value) =>
  [...String(value).matchAll(COLOUR)].map((m) => rgbOf(m[0])).filter((c) => c !== null)

/** A colour written back as CSS: `#rrggbb` when opaque, else `rgba()` with its own alpha. @param {Rgb} c */
export const cssOfColour = (c) =>
  (c.a ?? 1) >= 1 ? hexOf(c) : `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${c.a})`
