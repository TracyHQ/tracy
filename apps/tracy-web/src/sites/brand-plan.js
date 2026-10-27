/**
 * What a `brand:<host>` press builds (ADR 0023, "brand on WordPress").
 *
 * A brand is a look the brand engine extracted into `Brand/<host>/` of a site folder, not a
 * design system of the registry and not a template card, so neither `resolveDesignPlan` (Joomla
 * only) nor `templateRelease` answers for it. Until 30/09/2026 the create door therefore refused
 * it (`UNSUPPORTED_DESIGN`) and the wizard's fallback made the site without it: the brand was lost
 * before the Build could wear it.
 *
 * 🔒 A BRAND ON WORDPRESS IS BUILT THE WAY EVERY CATALOGUE LOOK ON WORDPRESS IS: a fresh
 * WordPress, dressed by the Build with the released `tracy` theme, whose `style` stage makes the
 * brand into one more style variation (`uploads/tracy/styles/`). No quickstart is installed, and
 * nothing is sent to the fleet about the design: the fleet resolves Joomla designs only.
 *
 * 🔒 THE SAME RULE AS THE BUTTON. The Design inspiration dialog lights "Create with WordPress" for a
 * brand only while a WordPress template card wears a catalogue system (`brandPlatforms` in
 * `packages/design/tracy-design-inspiration/src/host/templates.mjs`). This door refuses exactly
 * where that button is grey, so the two never disagree. `BRAND_BUILDS` is a copy of the plugin's
 * list (this image imports no plugin); a CMS joins both in the change that teaches its build to
 * wear a brand.
 */

/** The CMSes whose build turns a brand into a look — `BRAND_BUILDS` of `tracy-design-inspiration`. */
export const BRAND_BUILDS = Object.freeze(['wordpress'])

/** The theme a brand is worn on — the Build's generic WordPress road installs its released package. */
const BRAND_THEME = 'tracy'

/**
 * The hostname shape the brand engine accepts as a directory name (`SAFE_HOST` of
 * `tracy-design-inspiration/src/host/gallery.mjs`), lower case only. The id reaches paths
 * (`Brand/<host>/`) downstream, so nothing else passes: no slash, no `..`, no bare IP.
 */
const SAFE_HOST =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

/**
 * The host a `brand:<host>` id names, or null for any other id or an unsafe host.
 * @param {unknown} id
 * @returns {string | null}
 */
export function brandHostOf(id) {
  if (typeof id !== 'string' || !id.startsWith('brand:')) return null
  const host = id.slice('brand:'.length)
  return SAFE_HOST.test(host) && !/^[0-9.]+$/.test(host) ? host : null
}

/**
 * Whether a template card on `platform` wears a catalogue system — the button's rule.
 * @param {{ platforms?: { platform?: unknown }[], design?: { source?: unknown } | null }[]} cards rows from `templateCards`
 * @param {string} platform
 */
function canWearBrand(cards, platform) {
  return cards.some(
    (card) =>
      card?.design?.source === 'catalog' &&
      Array.isArray(card.platforms) &&
      card.platforms.some((p) => p?.platform === platform)
  )
}

/**
 * The plan for a brand press, a refusal code, or null when this is not a brand press this module
 * answers (not a `brand:` id, or a CMS whose build cannot wear a brand — the doors keep their own
 * answer there).
 * @param {unknown} id the design the caller named
 * @param {string} platform
 * @param {Parameters<typeof canWearBrand>[0]} cards rows from `templateCards`
 * @returns {{ plan: object } | { refused: 'UNKNOWN_DESIGN' | 'UNSUPPORTED_DESIGN' } | null}
 */
export function brandPlan(id, platform, cards) {
  if (typeof id !== 'string' || !id.startsWith('brand:')) return null
  if (!BRAND_BUILDS.includes(platform)) return null
  const host = brandHostOf(id)
  if (host === null) return { refused: 'UNKNOWN_DESIGN' }
  if (!canWearBrand(cards, platform)) return { refused: 'UNSUPPORTED_DESIGN' }
  return {
    plan: {
      requestedDesign: id,
      effectiveDesign: id,
      effectiveDesignName: host,
      baseQuickstart: null,
      contractProfile: null,
      workflow: 'brand',
      theme: BRAND_THEME,
      fallback: false,
      // Not a registry revision: a brand plan depends on no registry. A constant, so a form that
      // asked for a template plan and then pressed a brand is answered with this plan (409).
      registryRevision: 'brand',
      design: { id, source: 'brand' }
    }
  }
}
