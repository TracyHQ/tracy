import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * A quickstart contract's reviewed showcase-navigation map (`showcase-nav-map.json`): the template's showcase entries
 * (style variants, layout kits, sample pages) that provisioning takes out of the site's navigation. The pages themselves
 * stay published and their URLs keep working; only the menu entries, links and modules that lead to them are put away.
 *
 * This is the one list of what the showcase is: Apply reads it so that no later step puts an entry back in a menu or drafts
 * a page the map only took out of navigation. A map that is missing, unreadable or not `checked` says nothing.
 */

/** @type {Map<string, any | null>} a contract's map, read once: a release never changes. */
const maps = new Map()

/**
 * @param {string | null | undefined} dir - the contract's folder
 * @returns {{ operations: any[] } | null}
 */
export function showcaseNavMap(dir) {
  if (!dir) return null
  if (maps.has(dir)) return maps.get(dir)
  let map = null
  try {
    const read = JSON.parse(readFileSync(path.join(dir, 'showcase-nav-map.json'), 'utf8'))
    if (read?.status === 'checked' && Array.isArray(read.operations))
      map = { ...read, placeholderHost: placeholderHost(dir) }
  } catch {
    map = null
  }
  maps.set(dir, map)
  return map
}

/**
 * The host the release's own links are written with (the manifest's `placeholderUrl`, `quickstart.invalid`): the map is
 * built from the release, so an absolute link on that host leads into the site. Null when the manifest names none.
 * @param {string} dir
 * @returns {string | null}
 */
function placeholderHost(dir) {
  try {
    const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
    return new URL(String(manifest?.quickstart?.placeholderUrl ?? manifest?.placeholderUrl)).host || null
  } catch {
    return null
  }
}

/**
 * The ids of the WordPress pages the map takes out of navigation: each removed link's page and the pages of its submenu.
 *
 * A link removed from a template part (`templatePart.removeBlock`, JA Kinetic's header mega menu) is a custom link: its
 * `pageId` is null, and the page behind it is named only by the address the block carries (`block.contains`, `<a href=…>`).
 * Those addresses are resolved against `pages`, the site's pages with the path each lives at; with no pages given, only the
 * ids the map names are returned. Only a link into the site counts: a relative one, or one on the release's placeholder
 * host (`placeholderHost`); a link to another site names none of this site's pages, whatever its path.
 * @param {{ operations: any[], placeholderHost?: string | null } | null} map
 * @param {Array<{ id: number, path: string }>} [pages]
 * @returns {Set<number>}
 */
export function showcasePageIds(map, pages = []) {
  /** @type {Set<number>} */
  const ids = new Set()
  /** @type {Set<string>} */
  const paths = new Set()
  for (const op of map?.operations ?? []) {
    if (op?.op !== 'navigation.removeLink' && op?.op !== 'templatePart.removeBlock') continue
    const link = op.op === 'navigation.removeLink' ? op.link : op.block
    for (const id of [link?.pageId, ...(op.contains ?? []).map((/** @type {any} */ c) => c?.pageId)]) {
      const n = Number(id)
      if (Number.isInteger(n) && n > 0) ids.add(n)
    }
    if (op.op !== 'templatePart.removeBlock') continue
    for (const [, href] of String(link?.contains ?? '').matchAll(/href="([^"]*)"/g)) {
      const at = placeOfHref(href, map?.placeholderHost ?? null)
      if (at !== null) paths.add(at)
    }
  }
  for (const page of pages) if (paths.has(trimPath(page.path))) ids.add(page.id)
  return ids
}

/** @param {string} at */
const trimPath = (at) => String(at ?? '').replace(/^\/+|\/+$/g, '')

/** Base a relative link is read against: a host no link of a release is written with. */
const RELATIVE = 'http://relative.invalid'

/**
 * The path a removed block's link leads to, trimmed of its slashes; null for a fragment, the home page, an unreadable link
 * or one that leads to another host than the site's own (`host`, the release's placeholder host).
 * @param {string} href
 * @param {string | null} host
 * @returns {string | null}
 */
function placeOfHref(href, host) {
  if (href === '' || href.startsWith('#')) return null
  try {
    const url = new URL(href, RELATIVE)
    // Relative by its spelling, not by the origin it resolves to: an absolute link on the base's own host is still absolute.
    const absolute = /^[a-z][a-z0-9+.-]*:|^\/\//i.test(href)
    if (absolute && url.host !== host) return null
    const at = trimPath(url.pathname)
    return at === '' ? null : at
  } catch {
    return null
  }
}

/**
 * The ids of the Joomla menu items the map hides from navigation (`menu_show` 0). Their pages stay published and their URLs
 * keep answering, so Apply never unpublishes one: it is already put away. A content-map key is `menuItem-<id of the
 * release>`, the id the site keeps (`presentation-lock.json` is keyed the same way).
 * @param {{ operations: any[] } | null} map
 * @returns {Set<number>}
 */
export function navHiddenMenuIds(map) {
  /** @type {Set<number>} */
  const ids = new Set()
  for (const op of map?.operations ?? []) {
    if (op?.op !== 'menuItem.param' || op.path !== 'menu_show' || String(op.to) !== '0') continue
    const id = Number(/^menuItem-(\d+)$/.exec(String(op.key ?? ''))?.[1])
    if (Number.isInteger(id) && id > 0) ids.add(id)
  }
  return ids
}
