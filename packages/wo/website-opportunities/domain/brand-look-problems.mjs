// The look check of a plan (ticket #616): a plan never shows the template's accent colour or logo for approval, except
// the template's accent for a business with no logo (the product owner's rule of 13/11), recorded as such. Usable in
// tests and by the gate. Pure.
import { ACCENT_LOGO_WITHOUT_HUE, ACCENT_NO_LOGO, NO_HUE_ACCENT } from './brand-look-accent.mjs'
import { isNeutral } from './brand-hue.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const lower = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')
/** A sentence that names the template's colour or logo. */
const TEMPLATE_LOOK_WORDS =
  /\btemplate(?:'s)?\s+(?:accent|colou?rs?|logo)\b|\b(?:accent|colou?rs?|logo)\s+of\s+the\s+template\b/i

/**
 * Every problem of the plan's look:
 * - `template_accent`: the template's accent while the recorded source is not the no logo case;
 * - `neutral_accent`: a black, grey or white accent whose source is not a logo without hue, or one that is not black
 *   on the light theme and white on the dark theme (`accent`, `accentDark`);
 * - `template_logo`: the template's logo;
 * - `template_look_said`: an assumption line naming the template's colour or logo, or its accent value, outside the no
 *   logo case.
 * @param {{plan: object, template: {slug?: string, name?: string, accent?: string},
 *   lookSources?: {accent?: {from: string}, logo?: {from: string}}}} input `lookSources` as `composePlan` returns them;
 *   without them the template's accent and a black or white accent are problems
 * @returns {Array<{code: string, at: string, message: string}>}
 */
export function lookProblemsOf({ plan, template, lookSources }) {
  const problems = []
  const add = (code, at, message) => problems.push({ code, at, message })
  const look = plan?.look ?? {}
  const templateAccent = lower(template?.accent)
  const from = lookSources?.accent?.from
  const noLogo = from === ACCENT_NO_LOGO
  if (templateAccent && [lower(look.accent), lower(look.accentDark)].includes(templateAccent) && !noLogo)
    add(
      'template_accent',
      'look.accent',
      `the accent is the template's own ${templateAccent}, and the business has a logo`
    )
  if (isNeutral(lower(look.accent)) || isNeutral(lower(look.accentDark))) {
    const pair = lower(look.accent) === NO_HUE_ACCENT.light && lower(look.accentDark) === NO_HUE_ACCENT.dark
    if (from !== ACCENT_LOGO_WITHOUT_HUE || !pair)
      add(
        'neutral_accent',
        'look.accent',
        'a black, grey or white accent comes only from a logo without hue: black on light, white on dark'
      )
  }
  const logoNames = [lower(template?.name), lower(template?.slug)].filter(Boolean)
  if (
    look.logo?.kind === 'own' &&
    (lookSources?.logo?.from === 'template' || logoNames.includes(lower(look.logo.source)))
  )
    add('template_logo', 'look.logo', "the logo is the template's own")
  list(plan?.assumptions).forEach((assumption, i) => {
    const said = String(assumption?.said ?? '')
    const named =
      (templateAccent && said.toLowerCase().includes(templateAccent)) || TEMPLATE_LOOK_WORDS.test(said)
    if (named && !noLogo)
      add('template_look_said', `assumptions[${i}]`, "an assumption line names the template's colour or logo")
  })
  return problems
}
