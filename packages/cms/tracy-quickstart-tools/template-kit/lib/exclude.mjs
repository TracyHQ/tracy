// Pages that are not the template's and must never be in a kit. A site restored for capture carries accounts
// the quickstart does not ship (the account the restore created to sign in, a tester): their account pages,
// and list pages that show nothing but them, are test data. The rule needs no name: an account page whose
// account the content map does not declare, and which links to no content of its own, is left out; so is
// any page that matches an `--exclude-path` pattern. Pages reached only through a left-out page go too.
const ACCOUNT = /(?:^|\/)(?:author|authors|user|users|profile|profiles|member|members)\/([^/?]+)$/

/** One spelling for an account name: lower case, spaces, `_` and `-` alike. */
export const accountKey = (s) =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '_')

/** The account a page belongs to, or null when the path is not an account page (or is a declared route). */
export function accountOfPath(path, routes = new Set()) {
  const base = String(path).split('?')[0]
  if (routes.has(base)) return null
  const m = base.match(ACCOUNT)
  return m ? accountKey(m[1]) : null
}

/** Every account the content map declares, by user name and display name. */
export function knownAccounts(map) {
  const keys = new Set()
  const users = new Set()
  for (const e of map.entities ?? []) {
    if (!/^(user|author|member)$/.test(e.kind)) continue
    users.add(e.key)
    for (const v of Object.values(e.identity ?? {})) if (typeof v === 'string') keys.add(accountKey(v))
  }
  for (const s of map.slots ?? [])
    if (users.has(s.entity) && /^(name|username)$/.test(s.column ?? '')) keys.add(accountKey(s.sample))
  keys.delete('')
  return keys
}

/** A `--exclude-path` pattern as a test on a canonical path: `*` is any run of characters. */
export function pathPattern(glob) {
  const body = String(glob)
    .split('*')
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  const re = new RegExp(`^${body}$`, 'i')
  return (path) => re.test(path)
}

const baseOf = (path) => String(path).split('?')[0]

/**
 * Which crawled pages to leave out, and why. Pages carry `links` (canonical paths they link to) and `refs`
 * (every page that links to them); `routes` are the content map's own page paths.
 * @param {{pages: {path: string, aliases?: string[], links?: string[], refs?: string[]}[], map: object, routes: Set<string>, patterns?: string[]}} o
 * @returns {Map<string, string>} path -> reason
 */
export function decideExclusions({ pages, map, routes, patterns = [] }) {
  const tests = patterns.filter(Boolean).map(pathPattern)
  const known = knownAccounts(map)
  // The site chrome: links nearly every page carries (header, footer). Not the front page's own links: it
  // features content, and content linked from the front page is still the content of its author.
  const seen = new Map()
  for (const p of pages) for (const l of new Set(p.links ?? [])) seen.set(l, (seen.get(l) ?? 0) + 1)
  const chrome = new Set([...seen].filter(([, n]) => n >= Math.ceil(pages.length * 0.8)).map(([l]) => l))
  // A page's own links: not the site chrome every page carries, not the page itself or its list positions.
  const own = (p) => (p.links ?? []).filter((l) => !chrome.has(l) && baseOf(l) !== baseOf(p.path))
  const out = new Map()
  for (const p of pages) {
    if ([p.path, ...(p.aliases ?? [])].some((x) => tests.some((t) => t(x))))
      out.set(p.path, 'matches an --exclude-path pattern')
    else {
      const account = accountOfPath(p.path, routes)
      if (account && !known.has(account) && !own(p).length)
        out.set(p.path, 'account page of an account the quickstart does not ship, with no content of its own')
    }
  }
  for (let changed = true; changed; ) {
    changed = false
    for (const p of pages) {
      if (out.has(p.path) || p.path === '/') continue
      const mine = own(p)
      if (mine.length && mine.every((l) => out.has(l))) out.set(p.path, 'lists only left-out pages')
      else if (p.refs?.length && p.refs.every((r) => out.has(r)))
        out.set(p.path, 'reached only through left-out pages')
      else continue
      changed = true
    }
  }
  return out
}

/**
 * Runs INSIDE the page: remove every link to a left-out page, with the row that holds it (the nearest
 * ancestor that has a sibling of its own shape, or that is the only link holder up to there).
 */
export function dropLinksTo({ paths, hosts }) {
  const want = new Set(paths)
  const okHost = new Set([location.host, ...hosts].map((h) => h.toLowerCase()))
  const norm = (href) => {
    try {
      const u = new URL(href, location.href)
      if (!okHost.has(u.host.toLowerCase())) return null
      const p = decodeURIComponent(u.pathname)
        .replace(/\/{2,}/g, '/')
        .replace(/^(\/index\.php)+(?=\/|$)/i, '')
        .replace(/\/+$/, '')
      const start = Number(u.searchParams.get('start') ?? u.searchParams.get('limitstart'))
      return (p || '/').toLowerCase() + (start > 0 ? `?start=${start}` : '')
    } catch {
      return null
    }
  }
  const sig = (el) => `${el.tagName}.${[...el.classList].sort().join('.')}`
  const dropped = (a) => want.has(norm(a.getAttribute('href')))
  let removed = 0
  for (const a of document.querySelectorAll('a[href]')) {
    if (!a.isConnected || !dropped(a)) continue
    let el = a
    for (let i = 0; i < 8 && el.parentElement && el.parentElement !== document.body; i++) {
      const parent = el.parentElement
      if ([...parent.children].some((c) => c !== el && sig(c) === sig(el))) break
      if ([...parent.querySelectorAll('a[href]')].some((x) => !dropped(x))) break
      el = parent
    }
    el.remove()
    removed++
  }
  return removed
}
