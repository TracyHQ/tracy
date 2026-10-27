/**
 * The Browser tab on the page's REAL address (27/09/2026;
 * `tasks/todo-comment-to-edit.md` §"Deep link on the browser's REAL URL").
 *
 * Someone copies Chrome's address bar into a chat, and a teammate must land on the same site page
 * in the same mode. So the page's own address carries three parameters of Tracy's:
 *
 *   ?open=browser&page=<path on the site>&mode=<interactive|edit>
 *
 * READ once on load (`readBrowserDeepLink`): the Browser tab is opened or moved to that page, in
 * that mode, and the three are taken off the address (`stripBrowserDeepLink`) — the same shape as
 * `?open=my-sites&team=&member=` (`@tracy/core/team` `readDeepLink`/`stripDeepLink`).
 * WRITTEN while the tab is open (`mirroredBrowserSearch`): the address follows the page and mode the
 * tab shows, so what Chrome shows is always a link that reopens it. `open=browser` is written too:
 * without it the reader would not recognise the address it copied.
 *
 * 🔒 `page` IS A PATH, NEVER AN ADDRESS. It is resolved against the site's own origin, so a link
 * cannot send someone's Browser tab to another host (`//evil.example`, `https://…`).
 *
 * Pure, so `test/browser-link.test.mjs` holds these rules without a browser.
 */

export const OPEN_PARAM = 'open'
export const OPEN_BROWSER = 'browser'
export const PAGE_PARAM = 'page'
export const MODE_PARAM = 'mode'
/** The alias host a link reached the site at; checked against the site's own hosts before use. */
export const HOST_PARAM = 'host'
/** The one-use ticket the Browser tab adds to its frame's address — never part of a link. */
const PREVIEW_TICKET_PARAM = 'tracy_preview'

/**
 * @typedef {'interactive' | 'edit'} BrowserMode
 *   the Browser tab's two modes. Declared here, not imported: a Tracy package does not reach into
 *   the side card's source, and these two words are the whole contract.
 * @typedef {{ page: string, mode: BrowserMode | null, host?: string }} BrowserDeepLink
 *   what a link asks for; `mode: null` = leave the tab's own mode; `host`: the alias the link
 *   reached the site at (the desktop app's link routing, `desktop-open.mjs`), used only when it is
 *   one of the site's own hosts.
 * @typedef {{ url: string, mode: BrowserMode }} BrowserViewState
 *   what the open Browser tab shows.
 */

/**
 * @param {unknown} value
 * @returns {BrowserMode | null}
 */
function readMode(value) {
  return value === 'edit' || value === 'interactive' ? value : null
}

/** @param {string} search */
function paramsOf(search) {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
}

/**
 * A path on the site: starts with one `/`, and names no host. Anything else reads as the home page.
 * @param {string | null} value
 * @returns {string}
 */
function readPage(value) {
  const page = value?.trim() ?? ''
  if (!page.startsWith('/') || page.startsWith('//') || page.includes('\\')) return '/'
  return page
}

/**
 * A bare host (`name[:port]`), lowercased, or null: no scheme, path, user or anything else.
 * @param {string | null} value
 * @returns {string | null}
 */
function readHost(value) {
  const host = value?.trim().toLowerCase() ?? ''
  return /^[a-z0-9-]+(?:\.[a-z0-9-]+)*(?::\d{1,5})?$/.test(host) ? host : null
}

/**
 * `URLSearchParams` escapes every `/`, `?`, `=` and `:`; a query value may carry them bare, and the
 * address reads far better with a path in plain sight. `&` and `#` stay escaped — they would end it.
 * @param {string} query
 */
function readable(query) {
  return query.replace(/%2F/gi, '/').replace(/%3F/gi, '?').replace(/%3D/gi, '=').replace(/%3A/gi, ':')
}

/**
 * @param {URLSearchParams} params
 * @returns {string} '' when empty, else starting with '?'.
 */
function searchOf(params) {
  const query = readable(params.toString())
  return query === '' ? '' : `?${query}`
}

/**
 * What an address asks of the Browser tab, or null when it asks nothing.
 * @param {string} search - `location.search`.
 * @returns {BrowserDeepLink | null}
 */
export function readBrowserDeepLink(search) {
  const params = paramsOf(search)
  if (params.get(OPEN_PARAM) !== OPEN_BROWSER) return null
  const link = { page: readPage(params.get(PAGE_PARAM)), mode: readMode(params.get(MODE_PARAM)) }
  const host = readHost(params.get(HOST_PARAM))
  return host === null ? link : { ...link, host }
}

/**
 * The same search with the three parameters removed, every other one kept in place.
 * @param {string} search - `location.search`.
 * @returns {string} '' when nothing is left, else starting with '?'.
 */
export function stripBrowserDeepLink(search) {
  const params = paramsOf(search)
  for (const key of [OPEN_PARAM, PAGE_PARAM, MODE_PARAM, HOST_PARAM]) params.delete(key)
  return searchOf(params)
}

/**
 * The address to open the Browser tab at: the link's page on the site's origin, with the mode as the
 * tab itself reads it from an opened address (`?mode=`, taken off before anything loads).
 * @param {string | null | undefined} siteAddress - the address the site is served at (`copyUrl`).
 * @param {BrowserDeepLink} link
 * @returns {string | null} null when the site has no usable address.
 */
export function browserTargetOf(siteAddress, link) {
  let origin
  try {
    origin = new URL(String(siteAddress ?? '')).origin
  } catch {
    return null
  }
  if (origin === 'null') return null
  const target = new URL(readPage(link.page), origin)
  if (target.origin !== origin) return null
  if (link.mode !== null) target.searchParams.set(MODE_PARAM, link.mode)
  return target.href
}

/**
 * {@link browserTargetOf}, on the alias the link names when it is one of the site's own hosts: a
 * site switch made by the desktop app's link routing (`desktop-open.mjs`) keeps the host it was
 * reached at — another host is another cookie jar. Any other `host` is ignored, so a link still
 * cannot send someone's Browser tab to a host that is not the site's.
 * @param {string | null | undefined} siteAddress - the address the site is served at (`copyUrl`).
 * @param {BrowserDeepLink} link
 * @param {ReadonlySet<string>} hosts - lowercased hostnames the site answers at (`hostsOfSite`).
 * @returns {string | null} null when the site has no usable address.
 */
export function browserTargetOnHost(siteAddress, link, hosts) {
  const target = browserTargetOf(siteAddress, link)
  const named = typeof link.host === 'string' ? readHost(link.host) : null
  if (target === null || named === null || !hosts.has(named.replace(/:\d+$/, ''))) return target
  const url = new URL(target)
  return `${url.protocol}//${named}${url.pathname}${url.search}${url.hash}`
}

/**
 * The page an address shows on the site — its path and the site's own query — or null when the
 * address is not on the site. The frame's ticket and the tab's own `?mode=` never ride along.
 * @param {string | null | undefined} url - the address the Browser tab shows.
 * @param {ReadonlySet<string>} hosts - lowercased hostnames the site answers at (`hostsOfSite`).
 * @returns {string | null}
 */
export function sitePageOf(url, hosts) {
  if (typeof url !== 'string' || url === '') return null
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (!hosts.has(parsed.hostname.toLowerCase())) return null
  if (parsed.search === '') return parsed.pathname
  const params = new URLSearchParams(parsed.search)
  params.delete(PREVIEW_TICKET_PARAM)
  const kept = params.getAll(MODE_PARAM).filter((value) => readMode(value) === null)
  params.delete(MODE_PARAM)
  for (const value of kept) params.append(MODE_PARAM, value)
  const query = params.toString()
  return query === '' ? parsed.pathname : `${parsed.pathname}?${query}`
}

/**
 * The page's search once it mirrors the Browser tab: the three parameters rewritten after every
 * other one, or removed when there is no tab (closed) or it shows a page off the site.
 * @param {string} search - `location.search`.
 * @param {BrowserViewState | null} view - what the tab shows; null = no Browser tab.
 * @param {ReadonlySet<string>} hosts - lowercased hostnames the site answers at.
 * @returns {string} '' when nothing is left, else starting with '?'.
 */
export function mirroredBrowserSearch(search, view, hosts) {
  const params = paramsOf(search)
  for (const key of [OPEN_PARAM, PAGE_PARAM, MODE_PARAM, HOST_PARAM]) params.delete(key)
  const page = view === null ? null : sitePageOf(view.url, hosts)
  const mode = view === null ? null : readMode(view.mode)
  if (page !== null && mode !== null) {
    params.set(OPEN_PARAM, OPEN_BROWSER)
    params.set(PAGE_PARAM, page)
    params.set(MODE_PARAM, mode)
  }
  return searchOf(params)
}

/**
 * The site a page's PATH names (`/<siteKey>/…` — a site key is a hostname, so it has a dot), or
 * null: the creation workspace (`/new/…`) and the bare root are not site pages, and a cookie is not
 * the address — only the address is mirrored.
 * @param {string} pathname - `location.pathname`.
 * @returns {string | null}
 */
export function sitePathKey(pathname) {
  const match = /^\/([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)(?:\/|$)/i.exec(pathname)
  return match ? match[1].toLowerCase() : null
}
