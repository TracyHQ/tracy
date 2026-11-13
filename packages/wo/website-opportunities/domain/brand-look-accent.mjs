// The accent of the look record, read from the brand step's brand file (ticket #616). The locked brand step decides
// the accent of a logo with a hue (`new-accent`, lifted by code when dark or pale). When it keeps the template's accent
// (`kept-template`), the product owner's rules of 13/11 decide here, in code around the locked step, never in its prompt:
//   - no logo at all: the template's own accent stays (the drawn icon wears it too), recorded as `ACCENT_NO_LOGO`;
//   - a logo in black, white or grey only (no colour of it has a hue): black on a light theme and white on a dark theme,
//     for the themes the template has, recorded as `ACCENT_LOGO_WITHOUT_HUE`, never the template's accent;
//   - the kept accent is itself a colour measured from the logo: the business's own colour, `ACCENT_FROM_LOGO`;
//   - a logo with a hue the step could not wear (D44): the logo colour with its hue kept and its lightness moved until
//     buttons read on every theme (`brand-look-adjust.mjs`), `ACCENT_LOGO_ADJUSTED`; when no lightness reads, black on
//     light and white on dark as for a logo with no hue, `ACCENT_LOGO_UNREADABLE`; never the template's accent;
//   - a logo whose colours were never measured: `ACCENT_LOGO_UNMEASURED`, and no plan is composed from it.
// `accentOfBrandFile` is the one place these rules live.
import { MIN_RATIO, contrastOf, hexOf, isNeutral } from './brand-hue.mjs'
import { adjustedAccentOf, adjustedSaid, logoColourOf } from './brand-look-adjust.mjs'
import { brandColoursOf, themesOf, wordsOnAccentOf } from './brand-look-kit.mjs'

export { themesOf }

export const ACCENT_FROM_LOGO = 'logo'
export const ACCENT_LOGO_WITHOUT_HUE = 'logo-without-hue'
export const ACCENT_NO_LOGO = 'template-accent-no-logo'
export const ACCENT_LOGO_ADJUSTED = 'logo-adjusted'
export const ACCENT_LOGO_UNREADABLE = 'logo-hue-unreadable'
export const ACCENT_LOGO_UNMEASURED = 'logo-colours-unmeasured'
/** The accent of a logo with no hue, per theme. */
export const NO_HUE_ACCENT = Object.freeze({ light: '#000000', dark: '#ffffff' })

const isText = (value) => typeof value === 'string' && value.trim() !== ''
const list = (value) => (Array.isArray(value) ? value : [])

/** The colours measured from the business's logo, as the brief holds them; empty when they were not measured. */
function logoColoursOf(brief) {
  const brand = brief?.brand
  if (brand?.colorsFrom !== 'logo') return []
  return [...list(brand.colors).map((c) => c?.hex), brand.accent?.hex].map(hexOf).filter(Boolean)
}

/**
 * The black and white accent for the themes the template has: the accent of each theme, the colour words take on an
 * accent button (the template's own text colour for its accent, `primary.wordsOn`, that reads 3:1; else plain white or
 * black, whichever reads), and the 3:1 check of the accent on every ground of that theme.
 * @returns {{themes: string[], onAccent: Record<string, string>} | {problem: string}}
 */
function noHueOf(kit) {
  const colours = brandColoursOf(kit)
  const themes = themesOf(kit)
  const onAccent = {}
  for (const theme of themes) onAccent[theme] = wordsOnAccentOf(kit, NO_HUE_ACCENT[theme])
  for (const side of list(colours?.sides)) {
    const accent = NO_HUE_ACCENT[side?.groundSide === 'light' ? 'light' : 'dark']
    const ratio = contrastOf(accent, side?.ground)
    if (ratio !== null && ratio < MIN_RATIO)
      return {
        problem: `the accent ${accent} reads ${ratio}:1 on the ground ${side.ground} of ${side.marker}`
      }
  }
  return { themes, onAccent }
}

/** Black on light and white on dark, for the themes the template has (the no hue rule), recorded as `from`. */
function noHueAccentOf(kit, from, brandColour, why) {
  if (!kit)
    return { problem: 'the template kit is needed for a logo with no hue (its themes and button text)' }
  const noHue = noHueOf(kit)
  if (noHue.problem) return { problem: noHue.problem }
  const [first, second] = noHue.themes
  const dark = second ? { dark: NO_HUE_ACCENT[second] } : {}
  return { hex: NO_HUE_ACCENT[first], ...dark, onAccent: noHue.onAccent, from, brandColour, say: null, why }
}

/**
 * The accent of one brand file.
 * @param {{brandFile: object, brief: object, kit: object}} input `kit`: the template kit the brand step ran on (the
 *   step chain's kit value `{ref, doc}` or the kit document); required when the logo has no hue or its colour is
 *   adjusted. `minRatio` (3:1) only to test the fallback of an adjusted colour
 * @returns {{hex: string | null, dark?: string, onAccent?: Record<string, string>, from: string,
 *   brandColour: string | null, say: string | null, why: string | null} | {problem: string}}
 */
export function accentOfBrandFile({ brandFile, brief, kit, minRatio = MIN_RATIO }) {
  const colours = brandFile?.colours ?? {}
  const why = isText(colours.why) ? colours.why : null
  const plain = (hex, from, extra = {}) => ({ hex, ...extra, from, brandColour: null, say: null, why })
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
  const kept = hexOf(colours.accent)
  if (!brandFile?.logo?.material) {
    if (!kept) return { problem: 'a kept accent without a #rrggbb colours.accent' }
    return plain(kept, ACCENT_NO_LOGO)
  }
  const measured = logoColoursOf(brief)
  if (measured.length > 0 && measured.every(isNeutral))
    return noHueAccentOf(kit, ACCENT_LOGO_WITHOUT_HUE, null, why)
  // The step keeps the template's accent when the brand colour is that accent (the gate's own rule): the colour is the
  // business's all the same.
  if (kept && measured.includes(kept)) return plain(kept, ACCENT_FROM_LOGO)
  const logoColour = logoColourOf(brief)
  if (!logoColour) return plain(null, ACCENT_LOGO_UNMEASURED)
  if (!kit)
    return { problem: 'the template kit is needed to adjust the logo colour (its themes and button text)' }
  const adjusted = adjustedAccentOf(logoColour, kit, { minRatio })
  if (!adjusted) return noHueAccentOf(kit, ACCENT_LOGO_UNREADABLE, logoColour, why)
  const [first, second] = adjusted.themes
  return {
    hex: adjusted.accents[first],
    ...(second ? { dark: adjusted.accents[second] } : {}),
    onAccent: adjusted.onAccent,
    from: ACCENT_LOGO_ADJUSTED,
    brandColour: logoColour,
    say: adjustedSaid(adjusted),
    why
  }
}
