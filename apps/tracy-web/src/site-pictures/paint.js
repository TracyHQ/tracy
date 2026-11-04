// Colour roles of the pictures code draws (initials tiles, icons and the backdrop behind a cut-out figure), ADR 0043 section "Colour roles". The picture
// step never bakes a brand colour into them: it runs beside the brand step and only knows the template's accent, and a
// baked colour goes wrong as soon as the customer changes the Design system. So an initials or icon entry carries a
// `paint` recipe of ROLES, never a hex value, and its file is only a PREVIEW drawn in a neutral stand-in palette. The
// write step (step 9) resolves the roles from the Design system when it writes the site.
import { contrast, luminanceOfHex, rgbOf } from './icons/icon-ink.js'

/**
 * The role vocabulary, the smallest that covers what the template's demo icons and initials tiles use:
 * - `accent`: the Design system accent (the brand's main colour)
 * - `on-accent`: the colour words take on the accent (black or white, whichever reads)
 * - `text`: the dark neutral of body text on a light ground
 * - `on-dark`: the light neutral of words on a dark ground
 * - `surface`: the dark surface of the Design system, the ground of its dark sections (a cut-out's backdrop disc)
 */
export const PAINT_ROLES = Object.freeze(['accent', 'on-accent', 'text', 'on-dark', 'surface'])

/**
 * The neutral stand-in palette previews are drawn in. Neutral on purpose: a preview in the template accent (or any
 * brand-like colour) reads as a decision on the reading page and could be shipped by mistake; a slate tile cannot be
 * taken for the customer's brand.
 */
export const PREVIEW_PALETTE = Object.freeze({
  accent: '#6b7480',
  'on-accent': '#ffffff',
  text: '#222222',
  'on-dark': '#f2f2f2',
  surface: '#2a2c30'
})

/** The preview colour of a role. */
export const previewColour = (role) => PREVIEW_PALETTE[role] ?? PREVIEW_PALETTE.text

/** The paint of an initials tile: the ground in the accent, the letters in the colour that reads on it. */
export const INITIALS_PAINT = Object.freeze({ background: 'accent', foreground: 'on-accent' })

/**
 * The role a measured colour (a demo icon's ink or plate) plays: the accent when it is the template accent or close to
 * it, else the dark or the light neutral by its luminance. A colour that is neither (a template's second colour) falls
 * to the neutral of its lightness: the vocabulary stays small, and the icon still reads on its ground.
 * @param {string | null} hex @param {string | null | undefined} accent the template accent
 */
export function roleOf(hex, accent) {
  const c = rgbOf(hex)
  if (!c) return accent ? 'accent' : 'text'
  const a = rgbOf(accent)
  if (a) {
    const near = Math.max(Math.abs(c.r - a.r), Math.abs(c.g - a.g), Math.abs(c.b - a.b)) <= 48
    if (near && contrast(luminanceOfHex(hex), luminanceOfHex(accent)) < 1.5) return 'accent'
  }
  return luminanceOfHex(hex) <= 0.35 ? 'text' : 'on-dark'
}

/** The role of the same icon for the other theme: a neutral flips, the accent stays (step 9 keeps it readable). */
export const counterpartRole = (role) => ({ text: 'on-dark', 'on-dark': 'text' })[role] ?? role

const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)
const roleProblem = (where, v) =>
  PAINT_ROLES.includes(v)
    ? null
    : `${where} must be a colour role (${PAINT_ROLES.join(', ')}), never a colour value; found ${JSON.stringify(v)}`

// One icon variant: { glyph: role, plate: null | { role, opacity, radius, box, glyph } }.
function variantProblem(where, v) {
  if (!isObject(v)) return `${where} must be { glyph, plate }`
  const g = roleProblem(`${where}.glyph`, v.glyph)
  if (g) return g
  if (v.plate == null) return null
  if (!isObject(v.plate)) return `${where}.plate must be null or an object`
  if ('colour' in v.plate) return `${where}.plate must name a role, never a colour`
  return roleProblem(`${where}.plate.role`, v.plate.role)
}

/**
 * The problem with an entry's paint recipe, or null. `kind` is the drawn kind: `initials` or `icon`. An icon twin's
 * paint names the variant it holds in `holds`.
 * @param {unknown} paint @param {'initials' | 'icon'} kind @param {{ twin?: boolean }} [opts]
 */
export function paintProblem(paint, kind, { twin = false } = {}) {
  if (!isObject(paint)) return `${kind} needs "paint", its colour roles`
  if (kind === 'initials')
    return (
      roleProblem('paint.background', paint.background) ?? roleProblem('paint.foreground', paint.foreground)
    )
  const p = variantProblem('paint.light', paint.light) ?? variantProblem('paint.dark', paint.dark)
  if (p) return p
  if (twin && !['light', 'dark'].includes(paint.holds))
    return 'an icon twin paint needs "holds": light or dark'
  return null
}

/** The kind a paint recipe is for: icon recipes have light and dark variants. */
export const paintKindOf = (paint) => (isObject(paint) && 'light' in paint ? 'icon' : 'initials')

const isFraction = (v, max = 1) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max
const isOffset = (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 4

/**
 * The problem with a cut-out's `backdrop` (cutout-backdrop.js), or null: `{ shape: { circle, stripes }, paint: { circle,
 * stripes }, preview }`, the disc and bands in shape units and colour roles, never a colour, and `preview` the review
 * composite (figure over the backdrop) marked `preview: true`.
 */
export function backdropProblem(b) {
  if (!isObject(b) || !isObject(b.shape) || !isObject(b.paint))
    return 'backdrop must be { shape, paint, preview }'
  const c = b.shape.circle
  if (!(isObject(c) && isFraction(c.x) && isFraction(c.y) && isFraction(c.r) && c.r > 0))
    return 'backdrop.shape.circle must be { x, y, r }, fractions of the picture'
  const p = roleProblem('backdrop.paint.circle', b.paint.circle)
  if (p) return p
  const s = b.shape.stripes
  if (s == null) {
    if (b.paint.stripes != null) return 'backdrop.paint.stripes must be null when there are no stripes'
  } else {
    const ok =
      isObject(s) &&
      s.pattern === 'chevron' &&
      typeof s.angle === 'number' &&
      s.angle > 0 &&
      s.angle < 90 &&
      isObject(s.apex) &&
      isOffset(s.apex.x) &&
      isOffset(s.apex.y) &&
      isFraction(s.band, 2) &&
      s.band > 0 &&
      isFraction(s.gap, 2) &&
      Number.isInteger(s.count) &&
      s.count > 0 &&
      (s.texture == null ||
        (isObject(s.texture) &&
          s.texture.kind === 'speckle' &&
          isFraction(s.texture.share) &&
          isFraction(s.texture.shade)))
    if (!ok)
      return 'backdrop.shape.stripes must be null or { pattern: "chevron", angle, apex: { x, y }, band, gap, count, texture }'
    const q = roleProblem('backdrop.paint.stripes', b.paint.stripes)
    if (q) return q
  }
  const v = b.preview
  if (
    !isObject(v) ||
    v.preview !== true ||
    typeof v.file !== 'string' ||
    !/^[0-9a-f]{64}$/.test(String(v.sha256))
  )
    return 'backdrop.preview must be the review file { file, width, height, sha256, preview: true }'
  return null
}
