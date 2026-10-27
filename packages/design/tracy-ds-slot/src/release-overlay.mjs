/**
 * Overlays for a batch of releases rebuilt from fixed template sources. PURE.
 *
 * release-joomla.mjs lays an overlay folder over a release's webroot before it tokenizes (`--overlay`).
 * A fix made at the source of several templates (TEXT-1 batch 2, 21/10/2026: eight JA templates) needs one
 * overlay per release; release-batch.mjs took `--overlay` for one slug only, so each release was built
 * on its own. A `{slug}` in the overlay path names one folder per slug, and the batch builds them all.
 */

/** The placeholder an overlay path names its slug with. */
export const SLUG_MARK = '{slug}'

/**
 * Why an overlay path cannot serve this many slugs, or null.
 * @param {string | null} overlay
 * @param {number} slugs
 */
export function overlayProblem(overlay, slugs) {
  if (!overlay || slugs === 1 || overlay.includes(SLUG_MARK)) return null
  return `--overlay names one folder for ${slugs} releases: put ${SLUG_MARK} in its path, one folder per slug`
}

/**
 * The overlay folder of one slug.
 * @param {string} overlay
 * @param {string} slug
 */
export const overlayOf = (overlay, slug) => overlay.split(SLUG_MARK).join(slug)

/**
 * The webroot path an overlay gives each changed file of a template's source folder: a JA template's
 * `source/` holds what Joomla installs as `templates/<element>/`.
 * @param {string[]} changed  paths relative to the products checkout
 *   (`products/joomlart/paid-templates/ja_seven/source/css/template.css`)
 * @param {string} element  the template element (`ja_seven`)
 * @returns {{ from: string, to: string }[]}
 */
export function sourceOverlay(changed, element) {
  const prefix = new RegExp(`(^|/)${element.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/source/(.+)$`)
  return changed.flatMap((from) => {
    const m = prefix.exec(from)
    return m ? [{ from, to: `templates/${element}/${m[2]}` }] : []
  })
}
