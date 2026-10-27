/**
 * The colours an SVG picture is drawn in, read from its text (no browser), and whether it is a
 * one-hue drawing in the template's brand colour: the kind of icon a worn design system cannot
 * recolour when it is shown as a picture (`<img src="….svg">`, a CSS `background` url). Rule PIC-1.
 *
 * A paint is every colour the file names for `fill`, `stroke`, `stop-color`, `flood-color` and
 * `color`, as an attribute, in a `style` attribute or in a `<style>` element. `none`, `currentColor`,
 * `transparent` and a gradient reference (`url(#g)`, judged by its stops) are not colours. A colour is
 * chromatic when its HSL chroma is at least `CHROMATIC`; greys, black, white and faint tints never
 * make a drawing the brand's.
 *
 * Pure: text in, facts out. Node built-ins only.
 */

/** HSL chroma (max - min of the channels, 0..1) from which a colour has a hue worth comparing. */
export const CHROMATIC = 0.15
/** Degrees within which a picture's hue is the brand colour's (as the probe's accent-leak `hueNear`). */
export const HUE_NEAR = 15

const NAMED = /** @type {Record<string, string>} */ ({
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  lime: '#00ff00',
  blue: '#0000ff',
  yellow: '#ffff00',
  orange: '#ffa500',
  purple: '#800080',
  gray: '#808080',
  grey: '#808080',
  navy: '#000080',
  teal: '#008080',
  olive: '#808000',
  maroon: '#800000',
  fuchsia: '#ff00ff',
  aqua: '#00ffff',
  silver: '#c0c0c0'
})

/**
 * @typedef {{ r: number, g: number, b: number, a: number }} Rgba
 */

/**
 * One CSS colour as RGBA (0..255, alpha 0..1), or null for anything that is not a plain colour.
 * @param {string} value
 * @returns {Rgba | null}
 */
export function colourOf(value) {
  const v = String(value ?? '')
    .trim()
    .toLowerCase()
  if (!v) return null
  const named = NAMED[v]
  if (named) return colourOf(named)
  const hex = /^#([0-9a-f]{3,8})$/.exec(v)
  if (hex) {
    let h = hex[1]
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('')
    if (h.length !== 6 && h.length !== 8) return null
    const n = (i) => Number.parseInt(h.slice(i, i + 2), 16)
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 }
  }
  const rgb = /^rgba?\(\s*([\d.]+)%?[\s,]+([\d.]+)%?[\s,]+([\d.]+)%?(?:[\s,/]+([\d.]+)(%?))?\s*\)$/.exec(v)
  if (rgb) {
    const pct = v.includes('%')
    const ch = (s) => Math.round(pct ? (Number(s) * 255) / 100 : Number(s))
    const a = rgb[4] === undefined ? 1 : rgb[5] ? Number(rgb[4]) / 100 : Number(rgb[4])
    return { r: ch(rgb[1]), g: ch(rgb[2]), b: ch(rgb[3]), a }
  }
  return null
}

/**
 * Hue (degrees), chroma and lightness (0..1) of a colour.
 * @param {Rgba} c
 */
export function hslOf(c) {
  const r = c.r / 255
  const g = c.g / 255
  const b = c.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const chroma = max - min
  let hue = 0
  if (chroma > 0) {
    if (max === r) hue = ((g - b) / chroma) % 6
    else if (max === g) hue = (b - r) / chroma + 2
    else hue = (r - g) / chroma + 4
    hue *= 60
    if (hue < 0) hue += 360
  }
  return { hue, chroma, light: (max + min) / 2 }
}

/** Degrees between two hues, 0..180. */
export const hueGap = (/** @type {number} */ a, /** @type {number} */ b) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/** `#rrggbb` of a colour. */
export const hexOf = (/** @type {Rgba} */ c) =>
  `#${[c.r, c.g, c.b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('')}`

const PAINT_PROPS = ['fill', 'stroke', 'stop-color', 'flood-color', 'color']
const ATTR = new RegExp(`\\s(${PAINT_PROPS.join('|')})\\s*=\\s*("([^"]*)"|'([^']*)')`, 'gi')
const DECL = new RegExp(`(?:^|[;{\\s"'])(${PAINT_PROPS.join('|')})\\s*:\\s*([^;}"']+)`, 'gi')

/**
 * Every colour an SVG names for its paints, and whether it embeds a raster picture or foreign markup
 * (then it is a picture of something, not a drawing to judge).
 * @param {string} svg
 * @returns {{ paints: Rgba[], raster: boolean }}
 */
export function svgPaints(svg) {
  const text = String(svg ?? '')
  const raster = /<(image|foreignObject)\b/i.test(text)
  /** @type {Rgba[]} */
  const paints = []
  const add = (/** @type {string} */ raw) => {
    const c = colourOf(raw.replace(/!important/i, ''))
    if (c && c.a >= 0.3) paints.push(c)
  }
  for (const m of text.matchAll(ATTR)) add(m[3] ?? m[4] ?? '')
  for (const m of text.matchAll(DECL)) add(m[2])
  return { paints, raster }
}

/**
 * The template's brand colours worth comparing a picture with: the accent and its hover shade of the
 * template's light palette and of its dark one, when chromatic.
 * @param {Record<string, string>[]} palettes the slot's `palettes` (light first, then dark, then extra)
 * @param {boolean} hasDark whether the second palette is the template's dark one
 * @returns {{ hex: string, hue: number }[]}
 */
export function brandColoursOf(palettes, hasDark) {
  const own = palettes.slice(0, hasDark ? 2 : 1)
  const out = new Map()
  for (const p of own)
    for (const role of ['accent', 'accent-hover']) {
      const c = colourOf(p?.[role] ?? '')
      if (!c) continue
      const { hue, chroma } = hslOf(c)
      if (chroma >= CHROMATIC) out.set(hexOf(c), { hex: hexOf(c), hue })
    }
  return [...out.values()]
}

/**
 * The template's status colours (success, warn, danger, info) of every palette: a picture in one of
 * them is a state the slot tunes itself, not the brand (Bootstrap's valid-field tick in a green brand).
 * @param {Record<string, string>[]} palettes
 * @returns {Rgba[]}
 */
export function statusColoursOf(palettes) {
  const out = []
  for (const p of palettes)
    for (const role of ['success', 'warn', 'danger', 'info']) {
      const c = colourOf(p?.[role] ?? '')
      if (c) out.push(c)
    }
  return out
}

/** RGB distance under which two colours are the same paint. */
const SAME = 24
const near = (/** @type {Rgba} */ a, /** @type {Rgba} */ b) =>
  Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) < SAME

/**
 * Whether an SVG is a one-hue drawing in a brand colour: it names at least one chromatic paint and
 * every chromatic paint lies within `HUE_NEAR` degrees of one brand colour's hue. A drawing with a
 * second hue (an illustration, a flag, a multi-colour logo) or with an embedded raster is not.
 * A drawing in one of the template's status colours (`status`) is a state, not the brand.
 * @param {string} svg
 * @param {{ hex: string, hue: number }[]} brand
 * @param {Rgba[]} [status]
 * @returns {{ colour: string, brand: string } | null}
 */
export function brandDrawing(svg, brand, status = []) {
  if (!brand.length) return null
  const { paints, raster } = svgPaints(svg)
  if (raster) return null
  const chromatic = paints.filter((c) => hslOf(c).chroma >= CHROMATIC)
  if (!chromatic.length) return null
  // a status colour that is the brand's own accent (a green brand whose success is that green) says nothing
  const states = status.filter((st) => !brand.some((b) => near(st, /** @type {Rgba} */ (colourOf(b.hex)))))
  if (chromatic.some((c) => states.some((st) => near(c, st)))) return null
  for (const b of brand) {
    if (chromatic.every((c) => hueGap(hslOf(c).hue, b.hue) <= HUE_NEAR))
      return { colour: hexOf(chromatic[0]), brand: b.hex }
  }
  return null
}
