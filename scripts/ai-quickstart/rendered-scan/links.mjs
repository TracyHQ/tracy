// The link check of the release gate (tickets #585, #586): a link to a page that does not answer (`missing_page`), a
// `#` link whose target is not on the page (`anchor_missing`), and a link to a page the plan does not have, a demo page
// left over (`demo_page`). Pure given the pages; `probe(url)` is called only when the caller passes one.
import { anchorsOf, observationsFromHtml } from './observations.mjs'

/** At most this many addresses are read again through `probe`. */
export const PROBE_MAX = 300
const SCHEME = /^([a-z][a-z0-9+.-]*):/i
const ASSET = /\.(?:avif|css|docx?|gif|ico|jpe?g|js|json|mp3|mp4|pdf|png|svg|txt|webm|webp|xlsx?|xml|zip)$/i

/** One spelling for a page path: escapes read, case folded, no `/index.php`, no trailing slash. */
export function foldPath(path) {
  let p = String(path ?? '/')
  try {
    p = decodeURIComponent(p)
  } catch {
    // A broken escape stays as it is written.
  }
  p = p
    .toLowerCase()
    .replace(/^\/?index\.php(?=\/|$)/, '')
    .replace(/\/+$/, '')
  return p.startsWith('/') ? p || '/' : `/${p}`
}

/** The links of the pages, resolved, when the caller gave none (the built site check gives its own). */
function linksOfPages(pages, base) {
  const root = new URL(base)
  const out = []
  for (const page of pages) {
    if (typeof page?.html !== 'string') continue
    const at = new URL(String(page.url ?? page.path ?? '').replace(/^\//, ''), root)
    for (const o of observationsFromHtml(page.html)) {
      if (o.kind !== 'href') continue
      const raw = o.value
      const menu = Boolean(o.place.menu)
      const scheme = SCHEME.exec(raw)?.[1]?.toLowerCase()
      if (raw.startsWith('#')) {
        out.push({
          page: page.path,
          href: raw,
          path: page.path,
          query: '',
          hash: raw.slice(1),
          kind: 'anchor',
          menu
        })
        continue
      }
      if (scheme && scheme !== 'http' && scheme !== 'https') continue
      let url
      try {
        url = new URL(raw, at)
      } catch {
        continue
      }
      if (url.origin !== root.origin) continue
      const rest = url.pathname.startsWith(root.pathname)
        ? url.pathname.slice(root.pathname.length - 1)
        : url.pathname
      out.push({
        page: page.path,
        href: raw,
        url: url.href,
        path: rest,
        query: url.search.replace(/^\?/, ''),
        hash: url.hash.replace(/^#/, ''),
        kind: ASSET.test(url.pathname) ? 'asset' : 'page',
        menu
      })
    }
  }
  return out
}

/** A `#` target a browser handles itself, or a script's, never an element id. */
const ownHash = (hash) => !hash || hash === 'top' || /^[!/]/.test(hash)

/**
 * The link findings of a set of rendered pages: `{kind, page, place, href}`.
 * @param {{pages: Array<{path: string, url?: string, status: number, html?: string}>, base: string,
 *   expected?: {paths?: string[]}, links?: object[] | null, probe?: ((url: string) => Promise<{status: number}>) | null,
 *   demoRoutes?: string[]}} input `links`: resolved links (`{page, href, url, path, query, hash, kind, menu}`); read
 *   from the pages when not given. `demoRoutes`: the template's demo page routes, a link to one is `demo_page`.
 */
export async function linkCheck({
  pages,
  base,
  expected = null,
  links = null,
  probe = null,
  demoRoutes = []
}) {
  const list = Array.isArray(pages) ? pages : []
  const byPath = new Map(list.map((p) => [foldPath(p.path), p]))
  const wanted =
    Array.isArray(expected?.paths) && expected.paths.length ? new Set(expected.paths.map(foldPath)) : null
  const demo = new Set((demoRoutes ?? []).map(foldPath))
  const anchors = new Map()
  const anchorsAt = (page) => {
    if (!anchors.has(page.path)) anchors.set(page.path, anchorsOf(page.html))
    return anchors.get(page.path)
  }
  const probed = new Map()
  const answers = async (link) => {
    if (!probe || !link.url) return null
    if (!probed.has(link.url)) {
      if (probed.size >= PROBE_MAX) return null
      probed.set(
        link.url,
        Promise.resolve(probe(link.url)).catch(() => ({ status: 0 }))
      )
    }
    const status = (await probed.get(link.url))?.status
    return typeof status === 'number' ? status : null
  }
  const broken = (status) => status !== null && (status === 0 || status >= 400)

  const out = []
  const seen = new Set()
  const push = (kind, link, extra = {}) => {
    const key = `${kind}\u0000${link.page}\u0000${link.href}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({
      kind,
      page: link.page,
      place: { element: 'a', ...(link.menu ? { menu: true } : {}), ...extra },
      href: link.href
    })
  }
  for (const link of Array.isArray(links) && links.length ? links : linksOfPages(list, base)) {
    const target = link.path ? byPath.get(foldPath(link.path)) : null
    if ((link.kind === 'anchor' || link.kind === 'page') && link.hash && !ownHash(link.hash)) {
      // The page the anchor lands on: this page for a `#` link, the linked page (when read) for any other.
      const on = link.kind === 'anchor' ? byPath.get(foldPath(link.page)) : link.query ? null : target
      if (on && typeof on.html === 'string' && !anchorsAt(on).has(link.hash)) {
        let decoded = link.hash
        try {
          decoded = decodeURIComponent(link.hash)
        } catch {
          // A broken escape stays as it is written.
        }
        if (!anchorsAt(on).has(decoded)) push('anchor_missing', link, { anchor: decoded.slice(0, 40) })
      }
    }
    if (link.kind === 'asset') {
      if (broken(await answers(link))) push('missing_page', link)
      continue
    }
    if (link.kind !== 'page') continue
    const folded = foldPath(link.path)
    const planned = !link.query && wanted?.has(folded)
    if (!planned && !link.query && demo.has(folded)) {
      push('demo_page', link)
      continue
    }
    const status = target && !link.query ? target.status : await answers(link)
    if (broken(status)) push('missing_page', link)
    else if (wanted && !planned) push('demo_page', link)
  }
  return out
}
