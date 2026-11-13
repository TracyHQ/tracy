// The accent of the look record, read from the brand step's brand file (ticket #616). The locked brand step decides
// the accent of a logo with a hue (`new-accent`, lifted by code when dark or pale). When it keeps the template's accent
// (`kept-template`), the product owner's rules of 13/11 decide here, in code around the locked step, never in its prompt:
//   - no logo at all: the template's own accent stays (the drawn icon wears it too), recorded as `ACCENT_NO_LOGO`;
//   - a logo in black, white or grey only (no colour of it has a hue): black on the light theme and white on the dark
//     theme, recorded as `ACCENT_LOGO_WITHOUT_HUE`, never the template's accent;
//   - any other kept accent (a logo with a hue the step could not wear, or a logo whose colours were never measured) is
//     not covered by a rule: `ACCENT_UNSETTLED`, and no plan is composed from it.
// `accentOfBrandFile` is the one place these rules live.
import { MIN_RATIO, contrastOf, isNeutral } from './brand-hue.mjs'

export const ACCENT_FROM_LOGO = 'logo'
export const ACCENT_LOGO_WITHOUT_HUE = 'logo-without-hue'
export const ACCENT_NO_LOGO = 'template-accent-no-logo'
export const ACCENT_UNSETTLED = 'unsettled-kept-template'
/** The accent of a logo with no hue, per theme. */
export const NO_HUE_ACCENT = Object.freeze({ light: '#000000', dark: '#ffffff' })

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const list = (value) => (Array.isArray(value) ? value : [])
const hexOf = (value) => (HEX_COLOUR.test(value ?? '') ? value.toLowerCase() : null)

/** The colours measured from the business's logo, as the brief holds them; empty when they were not measured. */
function logoColoursOf(brief) {
  const brand = brief?.brand
  if (brand?.colorsFrom !== 'logo') return []
  return [...list(brand.colors).map((c) => c?.hex), brand.accent?.hex].map(hexOf).filter(Boolean)
}

/**
 * The colour words take on the accent, per theme, from the template's own colours for text on its accent
 * (`site.brandColours.primary.wordsOn` of the kit), and the 3:1 checks of the black and white accent: on every side's
 * ground of the template (black on a light ground, white on a dark one) and under the words of an accent button.
 * @returns {{onAccent: {light: string, dark: string}} | {problem: string}}
 */
function noHueChecksOf(kit) {
  const colours = kit?.doc?.site?.brandColours ?? kit?.site?.brandColours
  const wordsOn = list(colours?.primary?.wordsOn).map(hexOf).filter(Boolean)
  const on = (accent) => wordsOn.find((w) => contrastOf(w, accent) >= MIN_RATIO) ?? null
  const onAccent = { light: on(NO_HUE_ACCENT.light), dark: on(NO_HUE_ACCENT.dark) }
  for (const theme of ['light', 'dark'])
    if (!onAccent[theme])
      return { problem: `no text colour of the template reads ${MIN_RATIO}:1 on the ${theme} theme accent` }
  for (const side of list(colours?.sides)) {
    const accent = side?.groundSide === 'light' ? NO_HUE_ACCENT.light : NO_HUE_ACCENT.dark
    const ratio = contrastOf(accent, side?.ground)
    if (ratio !== null && ratio < MIN_RATIO)
      return {
        problem: `the accent ${accent} reads ${ratio}:1 on the ground ${side.ground} of ${side.marker}`
      }
  }
  return { onAccent }
}

/**
 * The accent of one brand file.
 * @param {{brandFile: object, brief: object, kit?: object}} input `kit`: the template kit the brand step ran on (the
 *   step chain's kit value `{ref, doc}` or the kit document); with it the black and white accent is checked and given
 *   the template's own text colour for its buttons
 * @returns {{hex: string | null, dark?: string, onAccent?: {light: string, dark: string}, from: string,
 *   brandColour: string | null, say: string | null, why: string | null} | {problem: string}}
 */
export function accentOfBrandFile({ brandFile, brief, kit }) {
  const colours = brandFile?.colours ?? {}
  const why = isText(colours.why) ? colours.why : null
  if (colours.decision === 'new-accent') {
    if (!hexOf(colours.accent)) return { problem: 'a new accent without a #rrggbb colours.accent' }
    return {
      hex: hexOf(colours.accent),
      from: ACCENT_FROM_LOGO,
      brandColour: hexOf(colours.brandColour),
      say: isText(colours.lift?.say) ? colours.lift.say.trim() : null,
      why
    }
  }
  if (colours.decision !== 'kept-template')
    return { problem: `colours.decision ${JSON.stringify(colours.decision)}` }
  const material = brandFile?.logo?.material
  if (!material) {
    if (!hexOf(colours.accent)) return { problem: 'a kept accent without a #rrggbb colours.accent' }
    return { hex: hexOf(colours.accent), from: ACCENT_NO_LOGO, brandColour: null, say: null, why }
  }
  const measured = logoColoursOf(brief)
  if (measured.length > 0 && measured.every(isNeutral)) {
    const checks = kit ? noHueChecksOf(kit) : {}
    if (checks.problem) return { problem: checks.problem }
    return {
      hex: NO_HUE_ACCENT.light,
      dark: NO_HUE_ACCENT.dark,
      ...(checks.onAccent ? { onAccent: checks.onAccent } : {}),
      from: ACCENT_LOGO_WITHOUT_HUE,
      brandColour: null,
      say: null,
      why
    }
  }
  return { hex: null, from: ACCENT_UNSETTLED, brandColour: null, say: null, why }
}
