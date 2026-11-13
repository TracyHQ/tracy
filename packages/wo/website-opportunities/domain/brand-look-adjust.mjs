// The adjusted logo colour (ticket #616, the product owner's decision D44): a logo with a hue the locked brand step could
// not wear as the accent keeps that hue, and only its lightness moves (its chroma only as far as the sRGB colours need)
// until the accent reads 3:1 on every ground of a theme and the words on an accent button read 3:1 on it, the same checks
// as the no hue rule (`brand-look-kit.mjs`). The light and the dark theme are adjusted each on its own. The lightness
// kept is the one closest to the logo's own. The brand step's own lift (apps/tracy-web/src/lib/brand-accent,
// `liftAccent`) cannot be mirrored exactly: it moves HSL lightness for one accent on the opening ground only and never
// checks the button words, so this moves OKLCH lightness per theme, where the hue a visitor sees stays put. Pure.
import {
  MIN_RATIO,
  NEUTRAL_CHROMA,
  chromaOf,
  contrastRatioOf,
  hexOf,
  hexOfOklch,
  hueDistance,
  isNeutral,
  oklchOf
} from './brand-hue.mjs'
import { groundsOf, themesOf, wordsOnAccentOf } from './brand-look-kit.mjs'

/** The largest hue move (degrees, OKLCH) an adjusted accent may show after rounding to #rrggbb. */
export const HUE_TOLERANCE = 3
/** The lightness steps tried, from black to white. */
const STEPS = 400
const list = (value) => (Array.isArray(value) ? value : [])

/**
 * The logo colour to adjust, from the colours measured from the logo: the one the brief marks as the brand's accent
 * (`brand.accent`, or a colour with `role: 'accent'`) when it has a hue, else the most chromatic one. Null when the
 * colours were not measured from the logo or none has a hue.
 */
export function logoColourOf(brief) {
  const brand = brief?.brand
  if (brand?.colorsFrom !== 'logo') return null
  const colours = list(brand.colors)
  const marked = [brand.accent?.hex, colours.find((c) => c?.role === 'accent')?.hex]
    .map(hexOf)
    .find((hex) => hex && !isNeutral(hex))
  if (marked) return marked
  const hued = colours.map((c) => hexOf(c?.hex)).filter((hex) => hex && !isNeutral(hex))
  return hued.sort((a, b) => chromaOf(b) - chromaOf(a))[0] ?? null
}

/** Whether an accent passes every check of a theme: its grounds and the words on it. */
function readsOn(kit, theme, hex, minRatio) {
  const words = wordsOnAccentOf(kit, hex, minRatio)
  if (!words) return null
  return groundsOf(kit, theme).every((g) => contrastRatioOf(hex, g) >= minRatio) ? words : null
}

/** The colours of the logo's hue, the logo's own first, then every lightness, as `#rrggbb` that keep the hue. */
function candidatesOf(hex) {
  const { L, C, h } = oklchOf(hex)
  const seen = new Set()
  const out = []
  for (const x of [hex, ...Array.from({ length: STEPS + 1 }, (_, i) => hexOfOklch(i / STEPS, C, h))]) {
    if (seen.has(x)) continue
    seen.add(x)
    const got = oklchOf(x)
    if (got.C < NEUTRAL_CHROMA || hueDistance(got.h, h) >= HUE_TOLERANCE) continue
    out.push({ hex: x, move: Math.abs(got.L - L), C: got.C, direction: got.L < L ? 'darker' : 'lighter' })
  }
  return out.sort((a, b) => a.move - b.move || b.C - a.C)
}

/**
 * The logo colour adjusted for every theme the template has, or null when no lightness of its hue reads on some theme.
 * @param {string} hex the logo colour (`logoColourOf`)
 * @param {object} kit the template kit (`brand-look-kit.mjs`)
 * @param {{minRatio?: number}} [options] the contrast to reach (3:1; another value only to test the fallback)
 * @returns {{themes: string[], accents: Record<string, string>, onAccent: Record<string, string>,
 *   moved: Record<string, 'darker' | 'lighter' | null>} | null}
 */
export function adjustedAccentOf(hex, kit, { minRatio = MIN_RATIO } = {}) {
  const from = hexOf(hex)
  if (!from || isNeutral(from)) return null
  const candidates = candidatesOf(from)
  const themes = themesOf(kit)
  const accents = {}
  const onAccent = {}
  const moved = {}
  for (const theme of themes) {
    const found = candidates.find((c) => readsOn(kit, theme, c.hex, minRatio))
    if (!found) return null
    accents[theme] = found.hex
    onAccent[theme] = readsOn(kit, theme, found.hex, minRatio)
    moved[theme] = found.hex === from ? null : found.direction
  }
  return { themes, accents, onAccent, moved }
}

/** What the customer reads about an adjusted logo colour, per the themes it was made darker or lighter on. */
export function adjustedSaid({ themes, moved }) {
  const changed = themes.filter((t) => moved[t])
  if (!changed.length) return 'Buttons and links use the colour of your logo.'
  const same = changed.every((t) => moved[t] === moved[changed[0]])
  const how =
    same && changed.length === themes.length
      ? moved[changed[0]]
      : changed.map((t) => `${moved[t]} on the ${t} theme`).join(' and ')
  return `Buttons and links use the colour of your logo, made ${how} so they stay readable.`
}

/** What the customer reads when no lightness of the logo's hue reads: the black and white of the no hue rule. */
export function unreadableSaid(accent, accentDark) {
  const what = accentDark
    ? 'black on the light theme and white on the dark theme'
    : accent === '#ffffff'
      ? 'white'
      : 'black'
  return `The colour of your logo does not stay readable on buttons at any lightness, so buttons and links are ${what}.`
}
