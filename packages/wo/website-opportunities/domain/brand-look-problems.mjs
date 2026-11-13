// The look check of a plan (ticket #616): a plan never shows the template's accent colour or logo for approval, except
// the template's accent for a business with no logo (the product owner's rule of 13/11), recorded as such. The plan
// gate runs it on every composed plan (`plan-gate.mjs`), so a line the model writes is held to it too. Pure.
import {
  ACCENT_FROM_LOGO,
  ACCENT_LOGO_ADJUSTED,
  ACCENT_LOGO_UNREADABLE,
  ACCENT_LOGO_WITHOUT_HUE,
  ACCENT_NO_LOGO,
  NO_HUE_ACCENT
} from './brand-look-accent.mjs'
import { isNeutral } from './brand-hue.mjs'
import { LOGO_MADE } from './brand-before-site.mjs'
import { templateLookWordsOf } from './brand-look-said.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const lower = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')
/** The black and white accents a logo with no hue may give: one theme (black or white), or both. */
const NO_HUE_PAIRS = [
  [NO_HUE_ACCENT.light, ''],
  [NO_HUE_ACCENT.dark, ''],
  [NO_HUE_ACCENT.light, NO_HUE_ACCENT.dark]
]

/**
 * Every problem of the plan's look:
 * - `template_accent`: the template's accent while the recorded source is neither the no logo case nor the logo whose
 *   own colour it is;
 * - `neutral_accent`: a black, grey or white accent whose source is not a logo without hue (or a logo whose hue reads
 *   at no lightness, D44), or not black on light and white on dark (a no logo plan keeps the template's own accent, neutral or not);
 * - `template_logo`: the template's logo, or a logo whose kind disagrees with its recorded source;
 * - `template_look_said`: a line naming the template's (or demo's) logo, or its colour or accent value outside the no
 *   logo case (`brand-look-said.mjs`); the value may be named when it is the business's own colour (`sameAsTemplate`).
 * @param {{plan: object, template: {slug?: string, name?: string, accent?: string},
 *   lookSources?: {accent?: {from: string}, logo?: {from: string}}}} input `lookSources` as `composePlan` returns them;
 *   without them the template's accent and a black or white accent are problems
 * @returns {Array<{code: string, at: string, message: string}>}
 */
export function lookProblemsOf({ plan, template, lookSources }) {
  const problems = []
  const add = (code, at, message) => problems.push({ code, at, message })
  const look = plan?.look ?? {}
  const accent = lower(look.accent)
  const accentDark = lower(look.accentDark)
  const templateAccent = lower(template?.accent)
  const from = lookSources?.accent?.from
  const noLogo = from === ACCENT_NO_LOGO
  // A logo whose own colour (as measured, or adjusted to read, D44) is the template's accent wears it as the business's
  // colour, recorded as such.
  const ownColour =
    (from === ACCENT_FROM_LOGO || from === ACCENT_LOGO_ADJUSTED) &&
    lookSources?.accent?.sameAsTemplate === true
  if (templateAccent && [accent, accentDark].includes(templateAccent) && !noLogo && !ownColour)
    add(
      'template_accent',
      'look.accent',
      `the accent is the template's own ${templateAccent}, not the logo's`
    )
  const keptNoLogo = noLogo && accent === templateAccent && !accentDark
  if ((isNeutral(accent) || isNeutral(accentDark)) && !keptNoLogo) {
    const pair = NO_HUE_PAIRS.some(([a, d]) => a === accent && d === accentDark)
    if ((from !== ACCENT_LOGO_WITHOUT_HUE && from !== ACCENT_LOGO_UNREADABLE) || !pair)
      add(
        'neutral_accent',
        'look.accent',
        'a black, grey or white accent comes only from a logo without hue: black on light, white on dark'
      )
  }
  const logoNames = [lower(template?.name), lower(template?.slug)].filter(Boolean)
  const logoFrom = lookSources?.logo?.from
  if (look.logo?.kind === 'own' && (logoFrom === 'template' || logoNames.includes(lower(look.logo.source))))
    add('template_logo', 'look.logo', "the logo is the template's own")
  else if (logoFrom && (look.logo?.kind === 'text') !== (logoFrom === LOGO_MADE))
    add('template_logo', 'look.logo', `a ${look.logo?.kind} logo cannot come from ${logoFrom}`)
  const says = templateLookWordsOf(template)
  list(plan?.assumptions).forEach((assumption, i) => {
    const said = String(assumption?.said ?? '')
    // The business's own colour that is the template's accent may be named; the template's words never.
    const namesColour = (says.value(said) && !ownColour) || says.colour(said)
    if (says.logo(said) || (namesColour && !noLogo))
      add(
        'template_look_said',
        `assumptions[${assumption?.id ?? i}]`,
        "a line names the template's colour or logo: say where the business's own look came from"
      )
  })
  return problems
}
