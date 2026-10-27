/**
 * Type the page CONTENT writes inline, in the template's own faces by name: a design export's blocks
 * (`data-dc-tpl`) carry `style="font-family: Newsreader, serif; font-size: clamp(26px, 3vw, 36px)"`,
 * which no stylesheet rule outranks. Tracy Business WordPress's /services "What we offer" heading and
 * its six card titles kept Newsreader under every system, the heading at 36px beside the 43px of the
 * theme's own section headings (15/10/2026).
 *
 * The contract names the template's faces and the role each one is (`inlineFaces`):
 *
 *   "inlineFaces": {
 *     "scope": "[data-dc-tpl]",                        the content elements it applies to
 *     "faces": { "Newsreader": "heading", "Archivo": "body" },
 *     "headingSize": ["main h2[data-dc-tpl]…"]         section headings: the heading size role too
 *   }
 *
 * Each element of the scope whose inline style names a face takes that role's face (a heading also its
 * weight), and a `headingSize` element the section heading's size, face, weight and tracking, exactly
 * as the theme's own section headings wear them. `!important` is the only way past an inline style;
 * the selectors match the template's own face names, so an editor's other inline choice stays. Only
 * what the system states is written: a silent system keeps the template's type.
 */
import { stated } from './tokens56.mjs'

const FAMILY = /^[A-Za-z0-9][A-Za-z0-9 -]{0,63}$/
const ROLES = new Set(['heading', 'body'])
// an attribute selector, as narrow as a contract writes one: no rule or comment can be closed from it
const SCOPE = /^[\w\s\-[\]="'*^$.:(),>#]*$/
const unsafe = (s) => /[{};<\\]|\/\*/.test(s)

/** The inline-style forms of one family, first in its stack, with or without the space a browser writes. */
const familyForms = (scope, family) =>
  ['font-family:', 'font-family: '].map((lead) => `${scope}[style*="${lead}${family}" i]`)

/**
 * @param {any} spec  the contract's `inlineFaces`
 * @param {any} profile  a `tracy-ds-profile/v1`
 * @param {Record<string, string>} tokens  the worn 56 tokens (`--font-body`)
 * @param {Record<string, string>} sv  slotVars
 * @param {(list: string | string[]) => string} scoped
 * @param {(selector: string, decls: Record<string, any>) => string} rule
 * @returns {string[]}
 */
export function inlineFaceRules(spec, profile, tokens, sv, scoped, rule) {
  if (!spec || typeof spec !== 'object') return []
  const scope =
    typeof spec.scope === 'string' && SCOPE.test(spec.scope) && !unsafe(spec.scope) ? spec.scope : ''
  if (!scope) return []
  const imp = (v) => (v === null || v === undefined ? null : `${v}!important`)
  // the faces and weights the theme's own headings take (wordpress.mjs: headingsAll, then the section heading)
  const headingsFace = sv['--ds-font-headings'] ?? sv['--ds-font-display']
  const headingsWeight = sv['--ds-weight-headings'] ?? sv['--ds-weight-heading']
  const value = {
    heading: { 'font-family': imp(headingsFace), 'font-weight': imp(headingsWeight) },
    body: { 'font-family': imp(stated(profile?.fonts?.body) ? tokens['--font-body'] : null) }
  }
  const out = []
  for (const [family, role] of Object.entries(spec.faces ?? {})) {
    if (!FAMILY.test(family) || !ROLES.has(role)) continue
    out.push(rule(scoped(familyForms(scope, family)), value[role]))
  }
  const sized = (Array.isArray(spec.headingSize) ? spec.headingSize : []).filter(
    (s) => typeof s === 'string' && s && !unsafe(s)
  )
  if (sized.length) {
    const sectionFace =
      sv['--ds-font-heading'] ?? (sv['--ds-font-headings'] ? sv['--ds-font-display'] : null) ?? headingsFace
    const sectionWeight = sv['--ds-font-headings'] ? sv['--ds-weight-heading'] : headingsWeight
    out.push(
      rule(scoped(sized), {
        'font-size': imp(sv['--ds-size-heading']),
        'font-family': imp(sectionFace),
        'font-weight': imp(sectionWeight),
        'letter-spacing': imp(sv['--ds-tracking-heading']),
        'text-wrap-style': sv['--ds-size-heading'] ? 'balance' : null
      })
    )
    if (sv['--ds-size-heading-phone'])
      out.push(
        `@media (max-width:639px){${rule(scoped(sized), { 'font-size': imp(sv['--ds-size-heading-phone']) })}}`
      )
  }
  return out.filter(Boolean)
}
