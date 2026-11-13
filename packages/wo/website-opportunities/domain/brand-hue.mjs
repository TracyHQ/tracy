// The two colour measures the look record needs (ticket #616): whether a colour has a visible hue (OKLCH chroma at or
// over 0.03, the brand step's own threshold) and the WCAG contrast of two colours. The brand step keeps its frozen copy
// in apps/tracy-web/src/lib/brand-accent/colour-math.js, and the design system slot its twin in
// packages/design/tracy-ds-slot/src/colour.mjs; neither package can be imported from here, so this is the same maths
// again, held to the same values by its test (#042515 has chroma 0.0495, #1a1a1a none). Pure.

/** OKLCH chroma under this = black, grey or white (no hue a visitor can see). */
export const NEUTRAL_CHROMA = 0.03
/** The contrast text and buttons need (hard rule). */
export const MIN_RATIO = 3

function rgbOf(hex) {
  // As the brand step reads a colour (`parseHexColour`): six hex digits, with or without the `#`.
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''))
  if (!m) return null
  const n = Number.parseInt(m[1], 16)
  return { r: n >> 16, g: (n >> 8) & 255, b: n & 255 }
}

const oklabLinear = (c) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/** OKLCH chroma of a #rrggbb colour (or rrggbb), or null when it is not one. */
export function chromaOf(hex) {
  const c = rgbOf(hex)
  if (!c) return null
  const [r, g, b] = [c.r, c.g, c.b].map(oklabLinear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return +Math.hypot(A, B).toFixed(4)
}

/** Whether a #rrggbb colour is black, grey or white: no visible hue. */
export const isNeutral = (hex) => {
  const chroma = chromaOf(hex)
  return chroma !== null && chroma < NEUTRAL_CHROMA
}

const wcagLinear = (c) => {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const luminance = ({ r, g, b }) => 0.2126 * wcagLinear(r) + 0.7152 * wcagLinear(g) + 0.0722 * wcagLinear(b)

/** WCAG contrast ratio of two #rrggbb colours, two decimals; null when either is not one. */
export function contrastOf(a, b) {
  const A = rgbOf(a)
  const B = rgbOf(b)
  if (!A || !B) return null
  const [hi, lo] = [luminance(A), luminance(B)].sort((x, y) => y - x)
  return +((hi + 0.05) / (lo + 0.05)).toFixed(2)
}

/** A colour as `#rrggbb` in lower case, from `#rrggbb` or `rrggbb`; null when it is not one. */
export const hexOf = (value) => (rgbOf(value) ? `#${String(value).replace(/^#/, '').toLowerCase()}` : null)

const LAB_RAD = 180 / Math.PI

/** OKLCH lightness (0..1), chroma and hue (degrees, 0..360) of a #rrggbb colour, unrounded; null when not one. */
export function oklchOf(hex) {
  const c = rgbOf(hex)
  if (!c) return null
  const [r, g, b] = [c.r, c.g, c.b].map(oklabLinear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.7936285972 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { L, C: Math.hypot(A, B), h: (Math.atan2(B, A) * LAB_RAD + 360) % 360 }
}

/** The shortest distance between two hues, in degrees (0..180). */
export const hueDistance = (a, b) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

const encode = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

/** Linear sRGB of an OKLCH colour, each channel unclamped (outside 0..1 when out of gamut). */
function linearOf(L, C, h) {
  const a = C * Math.cos(h / LAB_RAD)
  const b = C * Math.sin(h / LAB_RAD)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ]
}
const inGamut = (L, C, h) => linearOf(L, C, h).every((v) => v >= -1e-6 && v <= 1 + 1e-6)

/**
 * The #rrggbb colour of an OKLCH lightness, chroma and hue. A chroma the sRGB colours cannot show at that lightness is
 * lowered only as far as needed (the hue and the lightness stay).
 */
export function hexOfOklch(L, C, h) {
  let c = C
  if (!inGamut(L, c, h)) {
    let [lo, hi] = [0, C]
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (inGamut(L, mid, h)) lo = mid
      else hi = mid
    }
    c = lo
  }
  const channels = linearOf(L, c, h).map((v) =>
    Math.round(Math.min(1, Math.max(0, encode(Math.max(0, v)))) * 255)
  )
  return `#${channels.map((n) => n.toString(16).padStart(2, '0')).join('')}`
}
