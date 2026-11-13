// What the built site check hands Part 1's link check besides the pages (ticket #601): every link of every page read,
// already resolved, so a link the crawl does not follow is judged all the same. A link with a query string keeps it
// (`index.php?option=com_content&view=article&id=3` is not the home page), and a link to a file (a PDF, a picture) is
// named `asset` instead of being dropped. The link's words are never handed on: they may be the customer's.
import { ASSET, pagePathOf } from './site-pages.mjs'

const SCHEME = /^([a-z][a-z0-9+.-]*):/i

/**
 * One link resolved: `{href, url, path, query, hash, kind, menu}`. `kind` is `anchor` (a `#` link on the page), `scheme`
 * (mailto, tel and the like: `url` null), `other_site`, `asset` (a file under the base) or `page`.
 */
export function seamLinkOf(href, page, base) {
  const raw = String(href ?? '').trim()
  const scheme = SCHEME.exec(raw)?.[1]?.toLowerCase()
  if (raw.startsWith('#'))
    return { href: raw, url: null, path: page.path, query: '', hash: raw.slice(1), kind: 'anchor' }
  if (scheme && scheme !== 'http' && scheme !== 'https')
    return { href: raw, url: null, path: null, query: '', hash: '', kind: 'scheme', scheme }
  let url
  try {
    url = new URL(raw, page.abs)
  } catch {
    return { href: raw, url: null, path: null, query: '', hash: '', kind: 'unreadable' }
  }
  const same = url.origin === base.origin
  const kind = !same ? 'other_site' : ASSET.test(url.pathname) ? 'asset' : 'page'
  return {
    href: raw,
    url: url.href,
    path: same ? pagePathOf(url.pathname, base.pathname) : null,
    query: url.search.replace(/^\?/, ''),
    hash: url.hash.replace(/^#/, ''),
    kind
  }
}

/** Every link of every page read, each with the page it is on and whether it sits in a menu. */
export const seamLinksOf = (pages, base) =>
  pages.flatMap((p) =>
    (p.links ?? []).map((l) => ({ page: p.path, ...seamLinkOf(l.href, p, base), menu: l.menu }))
  )
