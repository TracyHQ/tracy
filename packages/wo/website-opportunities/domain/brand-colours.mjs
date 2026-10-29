// The brand colours a brief build takes from the business's logo (spec TracyHQ/tracy#189, ADR 0023 amended 29/10/2026).
//
//   brandPaletteOf  the logo's palette from the brief: a primary, and a secondary when the logo clearly holds another colour
//   planColours     the site plan's decision: the logo's colours, or the template's own (with the reason)
//   colourRoles     the roles one brand colour plays on a site, each moved in lightness (hue kept) until it reads on the
//                   ground it sits on: fill, its hover and pressed tones, the words on it, a soft tint, text, lines
//   brandInkOf      the colour a picture drawn in the template's brand colour (an icon) takes instead
//   colourWords     a colour said in plain words, for a drawing prompt
//
// 🔒 ONLY A LOGO OF THE BRIEF GIVES COLOURS. No logo in the brief (Tracy draws one, or the name shows as text), colours read
// from photographs, or a logo of greys only: the site keeps every colour of the template.
// 🔒 GREYS ARE NOT BRAND COLOURS. Near white, near black and grey (the paper a logo is printed on, its outline) never
// become a brand role; the template's grounds, neutral text and greys stay its own.
// Pure and deterministic: no site, no clock.
import {
  atLuminance,
  chromaOf,
  contrastOf,
  hexOf,
  hslOf,
  hueGapOf,
  luminanceOf,
  mixOf,
  rgbOf,
  toneOf
} from './brand-colour-maths.mjs'

/** Reason codes of the colour decision, with the sentence a report shows for each. */
export const COLOUR_REASONS = Object.freeze({
  'logo-colours':
    'the brief holds the business’s logo, so the template’s brand colours take the logo’s colours',
  'no-brief-logo': 'the brief holds no logo of the business, so the template keeps its own colours',
  'no-logo-colours': 'the logo holds no colour beyond greys, so the template keeps its own colours'
})

/** WCAG AA: normal text, and large text or a part of the interface (a button against the page). */
const TEXT = 4.5
const UI = 3
const WHITE = { r: 255, g: 255, b: 255 }
const BLACK = { r: 0, g: 0, b: 0 }

/** Whether a colour is a grey, near white or near black: never a brand role. @param {import('./brand-colour-maths.mjs').Rgb} c */
export function isNeutral(c) {
  // By saturation, not by channel spread: a very dark green (#0b1a0f) is still green, a slate (#6d7b8a) still blue-grey.
  const { s, l } = hslOf(c)
  return s < 0.1 || chromaOf(c) < 0.04 || l > 0.96 || l < 0.03
}

/**
 * The logo's palette, or null when the brief holds no logo or the logo gave no colour.
 * @param {any} brief
 * @returns {null | {primary: string, secondary?: string}}
 */
export function brandPaletteOf(brief) {
  const brand = brief?.brand
  if (typeof brand?.logo !== 'string' || brand.logo.trim() === '' || brand.colorsFrom !== 'logo') return null
  const colors = Array.isArray(brand.colors) ? brand.colors : []
  const rank = (role) => (role === 'primary' ? 0 : role === 'accent' || role === 'secondary' ? 1 : 2)
  const listed = colors
    .filter((c) => c?.role !== 'neutral' && typeof c?.hex === 'string')
    .sort((a, b) => rank(a.role) - rank(b.role))
    .map((c) => c.hex)
  if (brand.accent?.source === 'logo' && typeof brand.accent.hex === 'string') listed.push(brand.accent.hex)
  const seen = new Set()
  const usable = []
  for (const value of listed) {
    const c = rgbOf(value)
    if (!c || isNeutral(c) || seen.has(hexOf(c))) continue
    seen.add(hexOf(c))
    usable.push(c)
  }
  if (!usable.length) return null
  const [primary, ...rest] = usable
  // Clearly another colour: another hue, or the same hue much lighter or darker (a gold beside a dark green).
  const other = rest.find(
    (c) => hueGapOf(c, primary) >= 20 || Math.abs(hslOf(c).l - hslOf(primary).l) >= 0.25
  )
  return other ? { primary: hexOf(primary), secondary: hexOf(other) } : { primary: hexOf(primary) }
}

/**
 * The site plan's colour decision.
 * @param {any} brief
 * @returns {{decision: 'logo-colours', reason: 'logo-colours', palette: {primary: string, secondary?: string}} |
 *   {decision: 'template', reason: 'no-brief-logo' | 'no-logo-colours'}}
 */
export function planColours(brief) {
  const logo = brief?.brand?.logo
  if (typeof logo !== 'string' || logo.trim() === '') return { decision: 'template', reason: 'no-brief-logo' }
  const palette = brandPaletteOf(brief)
  if (!palette) return { decision: 'template', reason: 'no-logo-colours' }
  return { decision: 'logo-colours', reason: 'logo-colours', palette }
}

/**
 * The tones one brand colour takes on a site whose page grounds are `grounds`, every one same hue as the colour:
 *   fill      a button or block: at least 3:1 against every ground, its words at least 4.5:1 on it
 *   on        the words on the fill: the template's own (`on`) when they read, else white or black
 *   hover, active   the fill a step and two steps further from its words (or nearer, when further loses the ground)
 *   soft      a tint of the fill on the first ground (an accent band behind text)
 *   text, textHover   words and links: at least 4.5:1 against every ground
 *   line      a rule, border or icon stroke: at least 3:1 against every ground
 * The colour keeps its own lightness wherever it already reads; a tone that cannot read on every ground is the one that
 * reads best.
 * @param {string} hex
 *
 * `others`: the grounds of the template's other sides (a dark template's light mode). Words in the brand colour often sit
 * on a band that keeps its look on every side (a photograph under a hero title), so the text tone also reaches 3:1 (large
 * text) on those grounds whenever a tone can; it always reaches 4.5:1 on its own side.
 * @param {{grounds?: string[], on?: string | null, others?: string[]}} [where]
 */
export function colourRoles(hex, { grounds = [], on = null, others = [] } = {}) {
  const c = /** @type {any} */ (rgbOf(hex))
  const G = (grounds.length ? grounds : ['#ffffff']).map((g) => /** @type {any} */ (rgbOf(g))).filter(Boolean)
  const wanted = on ? rgbOf(on) : null
  const reads = (t, bar) => Math.min(...G.map((g) => contrastOf(t, g))) >= bar
  const bestOn = (t) => (contrastOf(t, WHITE) >= contrastOf(t, BLACK) ? WHITE : BLACK)
  const score = (t) => Math.min(...G.map((g) => contrastOf(t, g))) / UI
  let fill = wanted
    ? toneOf(
        c,
        (t) => reads(t, UI) && contrastOf(t, wanted) >= TEXT,
        () => -1
      )
    : null
  if (!fill || !(reads(fill, UI) && contrastOf(fill, /** @type {any} */ (wanted)) >= TEXT))
    fill = toneOf(
      c,
      (t) => reads(t, UI) && contrastOf(t, bestOn(t)) >= TEXT,
      (t) => (contrastOf(t, bestOn(t)) >= TEXT ? score(t) : -1)
    )
  const onText = wanted && contrastOf(fill, wanted) >= TEXT ? wanted : bestOn(fill)
  const away = luminanceOf(onText) > 0.5 ? BLACK : WHITE
  const state = (share) =>
    [mixOf(fill, away, share), mixOf(fill, onText, share)].find(
      (t) => contrastOf(t, onText) >= TEXT && reads(t, UI)
    ) ?? fill
  const O = others.map((g) => rgbOf(g)).filter(Boolean)
  const alsoReads = (t) => O.every((g) => contrastOf(t, /** @type {any} */ (g)) >= UI)
  const both = toneOf(
    c,
    (t) => reads(t, TEXT) && alsoReads(t),
    () => -1
  )
  const text = reads(both, TEXT) && alsoReads(both) ? both : toneOf(c, (t) => reads(t, TEXT), score)
  const fromGround = luminanceOf(G[0]) < 0.18 ? WHITE : BLACK
  const lifted = mixOf(text, fromGround, 0.15)
  const line = toneOf(c, (t) => reads(t, UI), score)
  return {
    fill: hexOf(fill),
    on: hexOf(onText),
    hover: hexOf(state(0.12)),
    active: hexOf(state(0.22)),
    soft: hexOf(mixOf(fill, G[0], 0.88)),
    text: hexOf(text),
    textHover: hexOf(reads(lifted, TEXT) && (alsoReads(lifted) || !alsoReads(text)) ? lifted : text),
    line: hexOf(line)
  }
}

/**
 * The colour a picture drawn in the template's brand colour takes: the palette's primary at the SAME luminance, so it
 * stands out from whatever ground the demo picture was made for exactly as much as the demo did (contrast is a matter of
 * luminance alone). A grey, black or white picture keeps its colour; no palette keeps it too.
 * @param {string | null | undefined} ink - the demo picture's colour, `#rrggbb`
 * @param {{primary: string} | null | undefined} palette
 * @returns {string | null}
 */
export function brandInkOf(ink, palette) {
  if (!ink) return null
  const c = rgbOf(ink)
  if (!c || !palette?.primary || isNeutral(c)) return ink
  return hexOf(atLuminance(/** @type {any} */ (rgbOf(palette.primary)), luminanceOf(c)))
}

const HUES = [
  [15, 'red'],
  [40, 'orange'],
  [70, 'yellow'],
  [165, 'green'],
  [195, 'teal'],
  [255, 'blue'],
  [290, 'purple'],
  [335, 'pink'],
  [360, 'red']
]

/** A colour in plain words (`dark green`, `light blue`, `grey`), for a drawing prompt. @param {string} hex */
export function colourWords(hex) {
  const c = rgbOf(hex)
  if (!c) return ''
  const { h, l } = hslOf(c)
  if (chromaOf(c) < 0.08) return l < 0.2 ? 'black' : l > 0.85 ? 'white' : 'grey'
  const hue = /** @type {string} */ (HUES.find(([top]) => h < /** @type {number} */ (top))?.[1] ?? 'red')
  return `${l < 0.3 ? 'dark ' : l > 0.75 ? 'light ' : ''}${hue}`
}
