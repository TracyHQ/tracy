/**
 * Design systems are closed on IMPORTED sites (15/10/2026): a site the customer brought into Tracy
 * (`origin = 'migrated'`, the Import existing site branch of `POST /api/sites {origin: 'import'}`) runs a
 * template Tracy did not seal, so a design system cannot reliably land the way the customer wants it. Only a
 * site created from a Tracy template or quickstart (`fleet_born`) may pick, preview or apply one.
 *
 * 🔒 THE SIGNAL IS THE SITE ROW'S `origin`, the one `sites/content-profile.js` `siteAuthority` already reads
 * for the same split: it is written once, when the name is claimed (`sites/route.js`, `claimOwnership`), and
 * no later write may change it (`sites/store.js`). A row with any other origin, or none, is not imported.
 *
 * 🔒 STAFF ARE BLOCKED TOO. The reason is technical (the template is not one Tracy sealed), not a
 * permission, so unlike the customer lock (`design-system-customer-lock.js`) a `tracy_admin` seat does not pass.
 *
 * Like the customer lock, only a NEW look is refused: the undo door and the Template default press (which takes
 * a worn system off) stay open, so a site that somehow wears one can still go back. The doors that refuse:
 *   - `GET  /api/sites/:key/design-system`          `supported: false`, `reason: SITE_IMPORTED`, `imported: true`,
 *                                                    `locked: true` (no container read)
 *   - `GET  /api/sites/:key/design-system/preview`  403 `DS_IMPORTED_SITE` for every system (the Template default
 *                                                    page still shows)
 *   - `POST /api/sites/:key/design-system`          403 `DS_IMPORTED_SITE` (the press and the chat route)
 */

/** The refusal code of a door closed on an imported site. */
export const DS_IMPORTED_SITE = 'DS_IMPORTED_SITE'

/** The `reason` the Design system read says for an imported site. */
export const IMPORTED_REASON = 'SITE_IMPORTED'

/**
 * Whether `site` was imported into Tracy rather than created from a Tracy template.
 * @param {{ origin?: string | null } | null | undefined} site - the `site` row.
 */
export function isImportedSite(site) {
  return site?.origin === 'migrated'
}
