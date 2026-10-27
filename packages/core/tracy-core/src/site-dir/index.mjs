/**
 * The site folder a plugin's HTTP door works in, when one dsh serves every site of a host.
 *
 * WHY THIS EXISTS. Until ADR 0014 a dsh stood INSIDE its one site's folder, so `process.cwd()` was
 * the site and every door — brand engine, design inspiration — simply wrote beside itself. The
 * host dsh stands at the sites ROOT (`/site`), and a door reached over plain HTTP has no session to
 * ask for a cwd. Measured 14/09/2026 on the dev stand: `POST /api/tracy-brand-engine/extract` died
 * with `EACCES mkdir /site/Brand`, and had it succeeded, `sync-brands.sh` would never have looked
 * there — it walks `/site/<label>/Brand`.
 *
 * WHO SAYS WHICH SITE. The gate (`vendor/tracy/dsh-passwords`) stamps the caller's granted folders
 * on every request it forwards, as `x-dsh-allowed-folders` — a JSON array, whatever the client
 * sent replaced. A seat is granted exactly one folder, the site's own, so the first entry is the
 * site. Nothing here trusts the header's SHAPE: a value that is not a JSON array of absolute paths
 * is ignored, and the door behaves as it always did.
 *
 * ORDER. `config.siteDir` first — a dev profile pins one and must keep working; then the gate's
 * header; then where dsh stands, the pre-0014 rule, which is still right for a lane-shaped dsh and
 * for the master account (an admin holds the whole machine, and the gate stamps nothing for one).
 *
 * Host-side only: Node, no DOM. Both plugins bundle this into their `lib/index.js`.
 */

import path from 'node:path'

/** The header the gate stamps; named once here and in the gate itself. */
export const ALLOWED_FOLDERS_HEADER = 'x-dsh-allowed-folders'

/**
 * @param {string | string[] | undefined} raw the header as Node hands it over
 * @returns {string | null} the first granted folder, or null when the header names none
 */
export function firstGrantedFolder(raw) {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string' || value === '') return null
  let parsed
  try {
    parsed = JSON.parse(value)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  const first = parsed[0]
  return typeof first === 'string' && path.isAbsolute(first) ? first : null
}

/**
 * @param {{siteDir?: string}} config the plugin's own config row
 * @param {{headers?: Record<string, string | string[] | undefined>}} req the incoming request
 * @returns {string} the folder this request's reads and writes belong to
 */
export function siteDirFor(config, req) {
  if (config.siteDir) return config.siteDir
  return firstGrantedFolder(req.headers?.[ALLOWED_FOLDERS_HEADER]) ?? path.resolve('.')
}
