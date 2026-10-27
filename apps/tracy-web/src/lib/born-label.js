/**
 * Born addresses — what the fleet calls a site nobody named. Lives in `lib/` because both the claim
 * door (`sites/route.js`) and the inventory (`inventory/prepare.js`) name sites with it, and
 * `test/module-graph.test.mjs` lets `inventory/` reach `lib/` but not `sites/`.
 */

/** The short name of each CMS in a born address (22/09/2026). */
const PLATFORM_SHORT = { joomla: 'j', wordpress: 'wp', emdash: 'ed' }

/**
 * The address the fleet makes up for a site nobody named: `<cms>-` and six characters nobody typed
 * (`j-35m9pa`, `wp-35m9pa`, `ed-35m9pa`), with `inv-` in front for a stock instance
 * (`inv-j-35m9pa`). One table for both, so the claim door and the inventory cannot drift apart.
 *
 * Not for a name the customer typed — that is judged by `siteLabelRefusal` and used as given — and
 * not for an imported site, which keeps the customer's own domain (`fleetLabel` in `sites/label.js`). The deployment's
 * `siteAddressPrefix` is the caller's to add, as it is for a typed name.
 *
 * SIX characters, not eight: a tail of eight could come out all-hex and read as `looks_imported`
 * when the press sends the label back to `POST /api/sites`. An unknown platform keeps the old
 * `site-` rather than inventing a short name.
 *
 * @param {string | undefined} platform
 * @param {{stock?: boolean, random?: () => number}} [options]
 * @returns {string}
 */
export function bornLabel(platform, { stock = false, random = Math.random } = {}) {
  const tail = random().toString(36).slice(2, 8).padEnd(6, '0')
  const cms = PLATFORM_SHORT[/** @type {keyof typeof PLATFORM_SHORT} */ (platform)] ?? 'site'
  return `${stock ? 'inv-' : ''}${cms}-${tail}`
}
