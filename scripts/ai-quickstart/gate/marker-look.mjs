// The accent of the marker build (#586, #587 triage of run 4). The kit's accent may write a second value on the dark
// side (`look.accent.sides.values.dark: "accentDark"`); a real build gives it the brand colour made readable there
// (`brand-look-adjust.mjs` `adjustedAccentOf`), so the marker build does the same with the marker colour and the
// template kit's grounds. With no dark side value, or no template kit to read the grounds from, the one accent is kept
// (and the template quality measurement says what that costs). Pure.
import { adjustedAccentOf } from '../../../packages/wo/website-opportunities/domain/brand-look-adjust.mjs'

/**
 * @param {object | null} look the kit mapping's `look`
 * @param {object | null} templateKit the template kit (`contracts/<slug>/<cms>/<version>/template-kit.json`)
 * @param {string} accent the marker colour
 * @returns {{accent: string, accentDark?: string}}
 */
export function markerLookOf(look, templateKit, accent) {
  if (look?.accent?.sides?.values?.dark !== 'accentDark' || !templateKit) return { accent }
  const adjusted = adjustedAccentOf(accent, templateKit)
  if (!adjusted?.accents?.dark) return { accent }
  return { accent: adjusted.accents.light ?? accent, accentDark: adjusted.accents.dark }
}
