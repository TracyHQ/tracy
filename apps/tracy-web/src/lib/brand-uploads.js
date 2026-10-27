/**
 * Whether "Customize your site" may ask for a logo and a favicon on this deployment.
 *
 * Lives in `lib/` so every domain that needs the answer reads the ONE test: the brand-files door
 * (`sites/brand-files.js`, which re-exports both names), the customer questions door, and the /ops
 * preview of those questions (`ops/quickstarts.js`). A domain may not import another domain
 * (`test/module-graph.test.mjs`), so a copy in `ops/` would have been a second rule that drifts.
 */

/** The UI switch that shows the logo and favicon questions and opens the brand-files door. */
export const BRAND_SWITCH = 'site-brand-uploads'

/**
 * Whether brand uploads are on for this deployment: an artifact store to keep the bytes, and the switch shown.
 * @param {{ artifactStore?: object | null }} config
 * @param {string[]} hidden - `readUiHidden(pool)`
 */
export function brandUploadsAvailable(config, hidden) {
  return Boolean(config?.artifactStore) && !(Array.isArray(hidden) && hidden.includes(BRAND_SWITCH))
}
