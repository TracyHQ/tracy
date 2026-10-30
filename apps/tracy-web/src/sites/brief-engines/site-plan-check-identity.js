/**
 * The identity rules of the site plan (COO rules "no demo text or demo picture is left", debts of tickets
 * TracyHQ/tracy#237 and #239), read by the default plan (`site-plan-defaults.js`), the plan check (`site-plan-check.js`)
 * and the picture stage (`site-plan-pictures.js`):
 *   - a logo slot (role `business.logo`) shows the brief's logo, or the business name as a wordmark where the template
 *     supports one (`site-plan-identity.mjs` decides which); never a photo, a drawing or the template's own picture. The
 *     plan says `picture: {logo: true}` there, and the check refuses anything else;
 *   - a demo post of the template (a section whose lines carry post roles: the build keeps such posts as the template wrote
 *     them and never writes them) is never kept by a plan: by default it is hidden, and a plan keeping it is refused, so
 *     neither its demo words nor its demo pictures stay.
 * Rules by slot role only, never by template, trade or business. Pure.
 */

/** The role of a logo slot. */
export const LOGO_ROLE = 'business.logo'
/** The post roles of a demo article, as `site-plan-identity.mjs` reads them (`demoPostsOf`). */
const POST_ROLES = new Set(['article.title', 'article.lead', 'article.image', 'article.date'])

const list = (/** @type {unknown} */ v) => (Array.isArray(v) ? v : [])

/** Whether an inventory element is a logo picture slot. */
export const isLogoPicture = (/** @type {any} */ e) => e?.kind === 'picture' && e.role === LOGO_ROLE

/** Whether a plan decision puts the logo in its slot. */
export const showsLogo = (/** @type {any} */ d) => d?.decision === 'keep' && d?.picture?.logo === true

/**
 * The sections of the inventory that are demo posts of the template.
 * @param {Iterable<any>} elements - the inventory elements
 * @returns {Set<string>}
 */
export function demoPostSections(elements) {
  const out = new Set()
  for (const e of elements) if (e?.section && POST_ROLES.has(e.role)) out.add(String(e.section))
  return out
}

/**
 * The reasons a plan breaks the identity rules.
 * @param {{plan: any, elements: Map<string, any>, decided: Map<string, any>, off: (e: any) => boolean}} input
 */
export function identityReasons({ plan, elements, decided, off }) {
  const out = []
  for (const e of elements.values()) {
    if (!isLogoPicture(e) || off(e)) continue
    const d = decided.get(e.id)
    if (d && !showsLogo(d))
      out.push({
        rule: 'logo-slot',
        element: e.id,
        message: `${e.id} is a logo slot: it shows the brief's logo or the business name, never a photo, a drawing or the template's picture; decide it {"decision": "keep", "picture": {"logo": true}}`
      })
  }
  for (const entry of list(plan?.photos))
    if (entry?.decision === 'use')
      for (const slot of list(entry.slots).map(String))
        if (isLogoPicture(elements.get(slot)))
          out.push({
            rule: 'logo-slot',
            element: slot,
            message: `${entry.photo} is placed in ${slot}, a logo slot: a photo never stands in for the logo`
          })
  for (const id of demoPostSections(elements.values())) {
    const section = elements.get(id)
    if (!section || off(section) || decided.get(id)?.decision !== 'keep') continue
    out.push({
      rule: 'demo-post-kept',
      element: id,
      message: `${id} is a demo post of the template, which the build never writes: hide it, or its demo words and pictures would stay`
    })
  }
  return out
}
