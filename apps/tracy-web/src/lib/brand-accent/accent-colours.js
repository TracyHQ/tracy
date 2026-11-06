// Shared: the brand step, the write step and the site check read it, so it lives in lib/ (module-graph.test.mjs).
// Which colours in a stylesheet value belong to the template's accent, and how to swap them. Pure.
import { hslToHex, parseHexColour } from './colour-math.js'

/** OKLab distance within which a colour is the accent itself written slightly differently (a hand-typed near twin). */
export const NEAR_ACCENT = 0.025
/** A state's colour counts as a shade of the accent when its hue is this close, in degrees, and it keeps this share of the chroma. */
const SHADE_HUE = 20
const SHADE_CHROMA = 0.5

const toLinear = (c) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/** OKLab of a #rrggbb colour. */
export function oklab(hex) {
  const c = parseHexColour(hex)
  const [r, g, b] = [toLinear(c.r), toLinear(c.g), toLinear(c.b)]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    L: 0.2104542553 * l + 0.7936285972 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  }
}

export function distance(hexA, hexB) {
  const x = oklab(hexA)
  const y = oklab(hexB)
  return Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b)
}

const hueOf = ({ a, b }) => (Math.atan2(b, a) * 180) / Math.PI
const hueGap = (x, y) => {
  const d = Math.abs(hueOf(x) - hueOf(y)) % 360
  return d > 180 ? 360 - d : d
}

/** The same colour family: near the accent, or (for a state of a rule that paints the accent) a darker or lighter shade of it. */
export function isShade(hex, seed) {
  const x = oklab(hex)
  const y = oklab(seed)
  return hueGap(x, y) <= SHADE_HUE && Math.hypot(x.a, x.b) >= SHADE_CHROMA * Math.hypot(y.a, y.b)
}

const byte = (n) => Number(n).toString(16).padStart(2, '0')
const fullHex = (h) =>
  h.length <= 5 ? `#${h.slice(1, 4).replace(/./g, '$&$&').toLowerCase()}` : `#${h.slice(1, 7).toLowerCase()}`
const alphaOfHex = (h) => {
  if (h.length === 5) return parseInt(h[4] + h[4], 16) / 255
  return h.length === 9 ? parseInt(h.slice(7), 16) / 255 : 1
}
const alphaNumber = (a) => {
  if (a === undefined) return 1
  return a.endsWith('%') ? Number.parseFloat(a) / 100 : Number(a)
}

const LITERAL =
  /(?<!url\()(#|%23)([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})(?![0-9a-z_-])|rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*(?:[,/]\s*([\d.]+%?)\s*)?\)|hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*(?:[,/]\s*([\d.]+%?)\s*)?\)/gi

/**
 * Every colour written in a value, as #rrggbb with its alpha and where it sits.
 * @returns {{ text: string, index: number, hex: string, alpha: number, encoded: boolean }[]}
 */
export function coloursIn(value) {
  const found = []
  for (const m of String(value).matchAll(LITERAL)) {
    if (m[2]) {
      const h = `#${m[2]}`
      found.push({
        text: m[0],
        index: m.index,
        hex: fullHex(h),
        alpha: alphaOfHex(h),
        encoded: m[1] === '%23'
      })
    } else if (m[3] !== undefined) {
      found.push({
        text: m[0],
        index: m.index,
        hex: `#${byte(m[3])}${byte(m[4])}${byte(m[5])}`,
        alpha: alphaNumber(m[6]),
        encoded: false
      })
    } else {
      found.push({
        text: m[0],
        index: m.index,
        hex: hslToHex(Number(m[7]), Number(m[8]) / 100, Number(m[9]) / 100),
        alpha: alphaNumber(m[10]),
        encoded: false
      })
    }
  }
  return found
}

/** The accent or its near twin. */
export const isAccent = (hex, seed) => hex === seed || distance(hex, seed) <= NEAR_ACCENT

/** The r,g,b triple a template keeps in a variable for `rgba(var(--x-rgb), .5)`, as #rrggbb, or null. */
export function tripleIn(value) {
  const m = /^\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*$/.exec(String(value))
  return m ? `#${byte(m[1])}${byte(m[2])}${byte(m[3])}` : null
}

export const tripleOf = (hex) => {
  const c = parseHexColour(hex)
  return `${c.r},${c.g},${c.b}`
}

const percent = (alpha) => `${+(alpha * 100).toFixed(2)}%`

/** A paint for a brand variable at the alpha a literal had, and at the lightness step a shade had from the accent. */
export function paintFor(variable, { hex, alpha }, seed) {
  const step = hex === seed ? 0 : oklab(hex).L - oklab(seed).L
  const tone =
    Math.abs(step) < 0.03
      ? `var(${variable})`
      : `color-mix(in oklab,var(${variable}) ${percent(1 - Math.min(0.9, Math.abs(step)))},${step < 0 ? 'black' : 'white'})`
  return alpha >= 1 ? tone : `color-mix(in srgb,${tone} ${percent(alpha)},transparent)`
}

/** The colour forms a browser's computed style prints. */
export const COMPUTED_COLOUR = /rgba?\([^)]*\)|color\(srgb[^)]*\)|oklab\([^)]*\)|oklch\([^)]*\)/g

const unlinear = (v) => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, c)) * 255)
}

function hexOfOklab(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return `#${[
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ]
    .map((v) => byte(unlinear(v)))
    .join('')}`
}

/** One computed colour as #rrggbb and alpha, or null. */
export function colourOfComputed(text) {
  const numbers = (String(text).match(/-?[\d.]+(?:e-?\d+)?%?/g) ?? []).map((n) =>
    n.endsWith('%') ? Number.parseFloat(n) / 100 : Number(n)
  )
  if (/^rgba?\(/.test(text)) {
    const [r, g, b, a = 1] = numbers
    return { hex: `#${byte(Math.round(r))}${byte(Math.round(g))}${byte(Math.round(b))}`, alpha: a }
  }
  if (String(text).startsWith('color(srgb')) {
    const [r, g, b, a = 1] = numbers
    return { hex: `#${[r, g, b].map((v) => byte(Math.round(v * 255))).join('')}`, alpha: a }
  }
  if (String(text).startsWith('oklab(')) {
    const [L, A, B, a = 1] = numbers
    return { hex: hexOfOklab(L, A, B), alpha: a }
  }
  if (String(text).startsWith('oklch(')) {
    const [L, C, H, a = 1] = numbers
    const rad = (H * Math.PI) / 180
    return { hex: hexOfOklab(L, C * Math.cos(rad), C * Math.sin(rad)), alpha: a }
  }
  return null
}
