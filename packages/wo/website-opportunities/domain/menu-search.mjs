// Menu links found by a Google search ("menu-links" capability group, `capabilities.mjs`) for a place whose
// website names none, or when the operator puts a search before the website. A link found this way may be
// another branch's menu, so the host keeps dishes read from it unverified.
import { socialNetworkOf } from './discovery-osm.mjs'
import { nameMatches } from './social-search.mjs'

// Delivery and listing sites whose restaurant pages carry a menu.
const MENU_HOSTS =
  /(^|\.)(zomato\.com|talabat\.com|deliveroo\.[a-z.]+|ubereats\.com|careem\.com|noon\.com|menu\.[a-z.]+)$/i

/** `"Name" Locality menu`: the quoted name keeps other restaurants out of the top results. */
export function menuSearchQuery(place) {
  return [`"${place.name}"`, place.locality, 'menu'].filter(Boolean).join(' ')
}

/** The results that look like this place's menu: a menu path, a PDF or a menu site, and the place's name. */
export function menuLinksFromResults(place, rows, provider) {
  const seen = new Set()
  const out = []
  for (const r of Array.isArray(rows) ? rows : []) {
    let u
    try {
      u = new URL(r?.url)
    } catch {
      continue
    }
    if (!/^https?:$/.test(u.protocol) || socialNetworkOf(u.href) || seen.has(u.href)) continue
    const menuish = /menu/i.test(u.pathname) || /\.pdf$/i.test(u.pathname) || MENU_HOSTS.test(u.hostname)
    const named =
      nameMatches(place.name, r.title) ||
      nameMatches(place.name, `${u.hostname} ${u.pathname}`.replace(/[^a-z0-9]+/gi, ' '))
    if (!menuish || !named) continue
    seen.add(u.href)
    out.push({ url: u.href, source: 'search', provider })
  }
  return out
}

const FALLS_THROUGH = new Set([
  'CREDENTIAL_MISSING',
  'CREDENTIAL_INVALID',
  'QUOTA',
  'TIMEOUT',
  'PROVIDER_ERROR'
])

/**
 * Walks the operator's menu-links order. `website` answers with the menus the crawl found (no call);
 * a search provider answers with the menu links its results name. A provider without a searcher (no key)
 * is skipped; a key, quota, timeout or provider error falls to the next; `rethrow(error)` stops the walk.
 * @returns {Promise<{menus: object[], provider: string | null}>}
 */
export async function findMenuLinks(
  place,
  { order = [], websiteMenus = [], searchers = {}, rethrow = () => false } = {}
) {
  for (const id of order) {
    if (id === 'website') {
      if (websiteMenus.length) return { menus: websiteMenus, provider: 'website' }
      continue
    }
    const search = searchers[id]
    if (typeof search !== 'function') continue
    let rows
    try {
      rows = await search(menuSearchQuery(place))
    } catch (error) {
      if (rethrow(error) || !FALLS_THROUGH.has(error?.code)) throw error
      continue
    }
    const menus = menuLinksFromResults(place, rows, id)
    if (menus.length) return { menus, provider: id }
  }
  return { menus: [], provider: null }
}
