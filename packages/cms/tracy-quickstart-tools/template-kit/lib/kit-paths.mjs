// Page addresses of a site (Joomla or WordPress) in one canonical form, so the crawl never captures one page twice.
// A page is named by its path without the `/index.php` prefix, without a trailing slash, lower case,
// and with only the list position (`?start=N`) kept from its query: `/`, `/classes`, `/blogs?start=6`.

const NOT_A_PAGE =
  /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|zip|rar|gz|mp4|webm|mp3|wav|docx?|xlsx?|pptx?|css|js|json|xml|txt)$/i
const NOT_PUBLIC = /^\/(administrator|component\/(users|mailto|ajax|banners)|api)(\/|$)|logout/i
// A link with one of these query keys is an action or another format of a page, never a page of its own.
const ACTION_KEYS = new Set(['task', 'format', 'tmpl', 'print', 'return', 'type', 'filter_tag'])
const POSITION_KEYS = ['start', 'limitstart']

/**
 * The canonical path of a same-site link, or null when the link is not a page of this site.
 * @param {string} href the link as written in the page
 * @param {string} siteUrl the address the site is reached at
 * @param {string[]} [aliasHosts] other host names the site answers to (the Host header it is served under)
 */
export function canonicalPath(href, siteUrl, aliasHosts = []) {
  if (!href) return null
  const raw = String(href).trim().replace(/&amp;/g, '&')
  if (/^(#|mailto:|tel:|javascript:|data:)/i.test(raw)) return null
  let u
  let base
  try {
    base = new URL(siteUrl)
    u = new URL(raw, base)
  } catch {
    return null
  }
  if (!/^https?:$/.test(u.protocol)) return null
  const hosts = new Set([base.host, ...aliasHosts.map((h) => h.toLowerCase())])
  if (!hosts.has(u.host.toLowerCase()) && !hosts.has(u.hostname.toLowerCase())) return null
  let path
  try {
    path = decodeURIComponent(u.pathname)
  } catch {
    path = u.pathname
  }
  path = path.replace(/\/{2,}/g, '/').replace(/^(\/index\.php)+(?=\/|$)/i, '')
  path = path.replace(/\/+$/, '') || '/'
  if (NOT_A_PAGE.test(path) || NOT_PUBLIC.test(path)) return null
  for (const k of u.searchParams.keys()) if (ACTION_KEYS.has(k.toLowerCase())) return null
  let query = ''
  for (const k of POSITION_KEYS) {
    const v = u.searchParams.get(k)
    if (v && /^\d+$/.test(v) && Number(v) > 0) {
      query = `?start=${Number(v)}`
      break
    }
  }
  return path.toLowerCase() + query
}

/**
 * An address of the site that runs a task rather than showing a page (`?task=askquestion`, a print or component
 * view): its path and query, without the `/index.php` prefix, for a link that opens that action. Null for anything
 * else (a page, an outside address, a #fragment).
 */
export function actionAddress(href, siteUrl, aliasHosts = []) {
  const raw = String(href ?? '')
    .trim()
    .replace(/&amp;/g, '&')
  if (!raw || /^(#|mailto:|tel:|javascript:|data:)/i.test(raw)) return null
  let u
  let base
  try {
    base = new URL(siteUrl)
    u = new URL(raw, base)
  } catch {
    return null
  }
  const hosts = new Set([base.host, ...aliasHosts.map((h) => h.toLowerCase())])
  if (
    !/^https?:$/.test(u.protocol) ||
    (!hosts.has(u.host.toLowerCase()) && !hosts.has(u.hostname.toLowerCase()))
  )
    return null
  if (![...u.searchParams.keys()].some((k) => ACTION_KEYS.has(k.toLowerCase()))) return null
  const path = u.pathname.replace(/\/{2,}/g, '/').replace(/^(\/index\.php)+(?=\/|$)/i, '') || '/'
  return path + u.search
}

/**
 * A same-site address as a path with its query, the host it was read on left out, or null when the address is not of
 * this site. A template that prints its own addresses absolute (a shop's form actions, a product picture link) would
 * otherwise carry the capture machine's host into the kit.
 * @param {string} href the address as written in the page
 * @param {string} siteUrl the address the site is reached at
 * @param {string[]} [aliasHosts] other host names the site answers to
 */
export function siteAddress(href, siteUrl, aliasHosts = []) {
  const raw = String(href ?? '')
    .trim()
    .replace(/&amp;/g, '&')
  if (!raw || /^(#|mailto:|tel:|javascript:|data:)/i.test(raw)) return null
  let u
  let base
  try {
    base = new URL(siteUrl)
    u = new URL(raw, base)
  } catch {
    return null
  }
  const hosts = new Set([base.host, ...aliasHosts.map((h) => h.toLowerCase())])
  if (
    !/^https?:$/.test(u.protocol) ||
    (!hosts.has(u.host.toLowerCase()) && !hosts.has(u.hostname.toLowerCase()))
  )
    return null
  return u.pathname.replace(/\/{2,}/g, '/') + u.search
}

/**
 * How the site spells a page address: `index-php` (Joomla with no URL rewrite: pages live under /index.php) or
 * `pretty-slash` (WordPress pretty permalinks, `/%postname%/`: a page answers at its path with a trailing slash, and
 * any other spelling redirects to the site's own address, which a site served under a Host header cannot follow).
 * Set once per run from the contract's platform (`usePlatform` in lib/site/adapters/index.mjs).
 */
let urlStyle = 'index-php'
/** @param {'index-php'|'pretty-slash'} style */
export function setUrlStyle(style) {
  if (style !== 'index-php' && style !== 'pretty-slash') throw new Error(`unknown url style ${style}`)
  urlStyle = style
}

/** The address to request for a canonical path, in the site's own spelling (`setUrlStyle`). */
export function urlOfPath(path, siteUrl) {
  const base = new URL(siteUrl)
  const [p, q] = path.split('?')
  const query = q ? `?${q}` : ''
  if (urlStyle === 'pretty-slash') {
    // A file (`/feed.xml`) or the front page keeps its spelling; every other page path ends in a slash.
    const tail = p === '/' || /\.[a-z0-9]+$/i.test(p) ? p : `${p.replace(/\/+$/, '')}/`
    return new URL(`${tail}${query}`, base).href
  }
  const tail = p === '/' ? '' : p
  return new URL(`/index.php${tail}${query}`, base).href
}

/** The canonical path of a content map menu route (`home` is the front page). */
export const pathOfRoute = (route) => (!route || route === 'home' ? '/' : `/${String(route).toLowerCase()}`)

/** A file-name-safe name for a page: `home`, `classes`, `blogs--start-6`. */
export function slugOfPath(path) {
  if (path === '/') return 'home'
  return path
    .replace(/^\//, '')
    .replace(/\?start=(\d+)/, '--start-$1')
    .replace(/[^a-z0-9-]+/gi, '_')
    .toLowerCase()
}

/** Page 1 of a further result page's path (`?start=6`, `?page=2`, `/page/2`), or null when it is page 1. */
export function firstPageOf(path) {
  const [base, query = ''] = String(path).split('?')
  const rest = query
    .split('&')
    .filter((kv) => kv && !/^(start|limitstart|page|paged|p)=\d+$/i.test(kv))
    .join('&')
  const trimmed = base.replace(/\/page\/\d+\/?$/, '') || '/'
  const first = rest ? `${trimmed}?${rest}` : trimmed
  return first === path ? null : first
}
