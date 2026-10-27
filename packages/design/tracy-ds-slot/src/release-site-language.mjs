/**
 * The site's installed copy of a template language file an overlay replaces.
 *
 * Joomla installs a template's language files twice: under the template
 * (`templates/<tpl>/language/<tag>/<tag>.tpl_<tpl>.ini`) and into the site's own language folder
 * (`language/<tag>/<tag>.tpl_<tpl>.ini`). It loads the site's copy first and reads the template's only when
 * that one is missing, so an overlay that adds a key to the template's file alone shows the raw key on every
 * page (JA Fresco 1.0.3, 20/10/2026: `aria-label="TPL_JA_FRESCO_CLOSE"`). release-joomla.mjs lays the
 * overlay's file over the installed copy too, when the release has one and the overlay does not bring it.
 * PURE.
 */

const TEMPLATE_LANGUAGE = /^templates\/[^/]+\/language\/([^/]+)\/([^/]+\.ini)$/

/**
 * @param {string[]} overlaid paths the overlay replaced, relative to the site root
 * @param {(path: string) => boolean} exists whether a path exists in the release's site
 * @returns {{ from: string, to: string }[]} each overlay file and the installed copy it also replaces
 */
export function siteLanguageTwins(overlaid, exists) {
  const brought = new Set(overlaid)
  const twins = []
  for (const from of overlaid) {
    const m = TEMPLATE_LANGUAGE.exec(from)
    if (!m) continue
    const to = `language/${m[1]}/${m[2]}`
    if (!brought.has(to) && exists(to)) twins.push({ from, to })
  }
  return twins
}
