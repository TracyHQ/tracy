/**
 * Which site a page is open on — ONE rule for every plugin's client.
 *
 * The address names the site first (`/<siteKey>/…`: a site key is a hostname, so the segment has
 * a dot). Once dsh writes the session into the path the page may sit at a mount that names none,
 * and tracy-web's `tracy_site` pointer cookie (thirty days, planted by every request that names a
 * site) is the fallback.
 *
 * 🔒 THE CREATION WORKSPACE NAMES NO SITE (`/new/`, `apps/tracy-web/src/workspace/scope.js`).
 * tracy-web never plants the pointer there, so on `/new/` the cookie only ever names the LAST site
 * this browser visited. Read as "the site in hand", it bound that old site to the creation screen:
 * measured 01/10/2026 on cowork.tracy.site, `/new/` opened a Browser tab of the previous site
 * (`tracy-my-sites`' preload) and the Design inspiration tab took its key, so the address read
 * `?tab=tracy:design-inspiration&site=<old site>`. `tracy-sidebar` and `tracy-mode-picker` had
 * this guard already; six other copies of the rule did not, which is why it lives here now.
 */

/** The mount tracy-web serves a signed-in viewer's creation workspace under. */
export const CREATION_MOUNT = '/new'

/** A site key in a path's first segment: a hostname, so it has a dot (`scope.js` SITE_PATH). */
const SITE_SEGMENT = /^\/([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)(?:\/|$)/

/** dsh's own root files that share a site key's shape (`scope.js` DSH_ROOT_FILES). */
const DSH_ROOT_FILES = new Set(['manifest.webmanifest', 'favicon.svg'])

/**
 * Whether a page is the creation workspace: its `<base href>` is `/new/`, or (before a base is
 * known) its path sits under `/new`.
 * @param {{ pathname: string, basePathname?: string }} page
 * @returns {boolean}
 */
export function inCreationWorkspace({ pathname, basePathname = '' }) {
  if (
    basePathname === '/widget/native/' ||
    pathname === '/widget/native' ||
    pathname.startsWith('/widget/native/')
  )
    return true
  if (basePathname === `${CREATION_MOUNT}/`) return true
  return pathname === CREATION_MOUNT || pathname.startsWith(`${CREATION_MOUNT}/`)
}

/**
 * The site a page is open on, or null.
 * @param {{ pathname: string, basePathname?: string, cookie: string }} page - `location.pathname`,
 *   the `<base href>` pathname when known, and `document.cookie`.
 * @returns {string | null}
 */
export function siteKeyOfPage({ pathname, basePathname = '', cookie }) {
  if (inCreationWorkspace({ pathname, basePathname })) return null
  const named = SITE_SEGMENT.exec(pathname)
  if (named?.[1] && !DSH_ROOT_FILES.has(named[1])) return named[1]
  const pointer = /(?:^|;\s*)tracy_site=([^;]+)/.exec(cookie)
  if (!pointer?.[1]) return null
  try {
    return decodeURIComponent(pointer[1]).trim() || null
  } catch {
    return null
  }
}

/**
 * {@link siteKeyOfPage} for the page this code runs on; null outside a browser.
 * @returns {string | null}
 */
export function siteKeyHere() {
  const location = globalThis.location
  const document = globalThis.document
  if (location === undefined || document === undefined) return null
  let basePathname = ''
  try {
    const base = document.querySelector?.('base[href]')?.getAttribute('href')
    if (base) basePathname = new URL(base, location.href).pathname
  } catch {
    basePathname = ''
  }
  return siteKeyOfPage({ pathname: location.pathname ?? '', basePathname, cookie: document.cookie ?? '' })
}

/*
 * WHAT A SITE IS CALLED vs WHAT IT IS (bug 03/10/2026). A site key never changes; Settings › Site
 * URL changes the site's NAME (`/api/sites` row: `displayName`, every name it ever had in
 * `aliases`, its current `copyUrl`). Code keys by `siteKey` and shows `siteNameFor` — a label
 * written from the key showed the address the owner had just changed away from (tab chips, the
 * tab header's picker, the `site=` parameter). The rows are the shared `/api/sites` answer every
 * plugin already reads, so a rename reaches every label the next time it is read.
 */

/**
 * @typedef {{ siteKey?: unknown, displayName?: unknown, aliases?: unknown, copyUrl?: unknown }} NamedSiteRow
 *   the part of one `/api/sites` row that names a site.
 */

/**
 * The row of the site `name` names — its key or any of its names, case aside — or null.
 * @param {readonly NamedSiteRow[] | null | undefined} rows
 * @param {string | null | undefined} name
 * @returns {NamedSiteRow | null}
 */
export function siteRowFor(rows, name) {
  const wanted = typeof name === 'string' ? name.trim().toLowerCase() : ''
  if (wanted === '' || !Array.isArray(rows)) return null
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const names = [row.siteKey, row.displayName, ...(Array.isArray(row.aliases) ? row.aliases : [])]
    if (names.some((value) => typeof value === 'string' && value.trim().toLowerCase() === wanted)) return row
  }
  return null
}

/**
 * What to SHOW for a site: its current name; `name` itself while the list does not know it.
 * @param {readonly NamedSiteRow[] | null | undefined} rows
 * @param {string} name - a site key or any name of the site.
 * @returns {string}
 */
export function siteNameFor(rows, name) {
  const shown = siteRowFor(rows, name)?.displayName
  return typeof shown === 'string' && shown !== '' ? shown : name
}

/**
 * What to KEY a site by: its immutable key, or null while the list does not know the name.
 * @param {readonly NamedSiteRow[] | null | undefined} rows
 * @param {string | null | undefined} name
 * @returns {string | null}
 */
export function siteKeyFor(rows, name) {
  const key = siteRowFor(rows, name)?.siteKey
  return typeof key === 'string' && key !== '' ? key : null
}

/**
 * Where a page on a site's OLD host now lives: the same path, query and hash on the host the site
 * answers at (`copyUrl`). Null when `url` is already there, or is not on any name of a listed site.
 * @param {string} url - a Browser tab's address.
 * @param {readonly NamedSiteRow[] | null | undefined} rows
 * @returns {string | null}
 */
export function followedAddress(url, rows) {
  let page
  try {
    page = new URL(url)
  } catch {
    return null
  }
  const row = siteRowFor(rows, page.hostname)
  if (row === null || typeof row.copyUrl !== 'string') return null
  let home
  try {
    home = new URL(row.copyUrl)
  } catch {
    return null
  }
  if (home.host === page.host && home.protocol === page.protocol) return null
  return new URL(`${page.pathname}${page.search}${page.hash}`, home.origin).href
}
