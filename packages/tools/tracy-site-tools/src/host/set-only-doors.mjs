/**
 * Doors that write only on `operation: "set"` — one reading for the agent's tiers, the preview's
 * "did this call change the site", and the first-write seal wait.
 */

/**
 * The doors the component writes through on `operation: "set"` alone: Claude Cowork for Joomla
 * `Engine.php` takes its write lock for these three only on `set`, and `read` is their default
 * operation. tracy-web's apply door reads the same set (`SET_ONLY_WRITES`, `sites/route.js`).
 */
export const SET_ONLY_WRITE_ACTIONS = Object.freeze(
  new Set(['site.identity', 'template.siteSettings', 'template.languageOverrides'])
)

/**
 * Whether one call of a set-only door writes, read from the call as the agent SENT it (16/10/2026).
 * Counted as a write until 16/10, the agent's read of the site name before renaming it (DL14) made
 * its first step wait for the webroot seal and reloaded the customer's preview for nothing.
 *
 * 🔒 NARROW ON THE READ SIDE. The agent's call is read before `normalizeSiteCall`, which turns
 * `site.identity {fields:{…}}` with no operation into a set (J-5). So a call reads only when it says
 * `read`, or names no operation and carries no new values (no object holding keys); any other
 * operation counts as a write — a write missed here would land before the seal, out of Undo's reach.
 * @param {Record<string, unknown>} params - `params` of a canonical call.
 * @returns {boolean}
 */
export function setOnlyDoorWrites(params) {
  const op = typeof params?.operation === 'string' ? params.operation.trim() : ''
  if (op === 'read') return false
  if (op !== '') return true
  return Object.values(params ?? {}).some(
    (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0
  )
}
