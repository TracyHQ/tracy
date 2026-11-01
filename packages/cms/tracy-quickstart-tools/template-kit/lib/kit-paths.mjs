// Page addresses of a Joomla site in one canonical form, so the crawl never captures one page twice.
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

/** The address to request for a canonical path (this site has no URL rewrite: pages live under /index.php). */
export function urlOfPath(path, siteUrl) {
  const base = new URL(siteUrl)
  const [p, q] = path.split('?')
  const tail = p === '/' ? '' : p
  return new URL(`/index.php${tail}${q ? `?${q}` : ''}`, base).href
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
