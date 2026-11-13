// What the look record reads from the template kit (ticket #616): the themes the template has, the grounds of each
// theme, and the colour words take on an accent button. Shared by the no hue rule (`brand-look-accent.mjs`) and the
// adjusted logo colour (`brand-look-adjust.mjs`, D44), so both hold an accent to the same 3:1 checks. Pure.
import { MIN_RATIO, contrastRatioOf, hexOf } from './brand-hue.mjs'

/** Plain text for an accent button when no text colour of the template reads on it. */
const PLAIN_WORDS = Object.freeze(['#ffffff', '#000000'])
const list = (value) => (Array.isArray(value) ? value : [])

/** The template's colours of the kit: the step chain's kit value `{ref, doc}` or the kit document itself. */
export const brandColoursOf = (kit) => kit?.doc?.site?.brandColours ?? kit?.site?.brandColours ?? null

/** The themes the template has, by the ground of each of its sides; both when the kit names no side. */
export function themesOf(kit) {
  const sides = list(brandColoursOf(kit)?.sides)
  const found = ['light', 'dark'].filter((theme) => sides.some((s) => s?.groundSide === theme))
  return found.length ? found : ['light', 'dark']
}

/** The sides of a theme: a side whose ground is not light is a dark side. */
export const sidesOf = (kit, theme) =>
  list(brandColoursOf(kit)?.sides).filter((s) => (s?.groundSide === 'light' ? 'light' : 'dark') === theme)

/** The grounds (`#rrggbb`) an accent of this theme must read on. */
export const groundsOf = (kit, theme) =>
  sidesOf(kit, theme)
    .map((s) => hexOf(s?.ground))
    .filter(Boolean)

/**
 * The colour words take on an accent button: the template's own text colour for its accent (`primary.wordsOn`) that
 * reads `minRatio` on it, else plain white or black, whichever reads; undefined when none does.
 */
export function wordsOnAccentOf(kit, accent, minRatio = MIN_RATIO) {
  const wordsOn = list(brandColoursOf(kit)?.primary?.wordsOn).map(hexOf).filter(Boolean)
  return [...wordsOn, ...PLAIN_WORDS].find((w) => contrastRatioOf(w, accent) >= minRatio)
}
