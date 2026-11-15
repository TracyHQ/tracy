/**
 * A link-in-bio page (Linktree, Beacons… `link-platforms.mjs`) is where many small businesses keep their real links:
 * the social pages, the booking link and the menu its social bio or its website points at. This reads such a page
 * once and sorts what it lists, so research reaches them; it never follows a link further (one hop).
 *
 * 🔒 ONLY WHAT THE PAGE LISTS. Every link kept is one the fetched page carries, with that page as its source
 * (`sourceUrl`, `via`); nothing is guessed from a handle or a platform. A page that cannot be read adds nothing.
 * 🔒 BOUNDED. At most `BIO_PAGES_MAX` pages per source read, each at most `BIO_PAGE_BYTES` within
 * `BIO_PAGE_TIMEOUT_MS`, at most `BIO_LINKS_MAX` links kept from each; every fetch goes through the public-URL guard
 * (`fetchLimited`).
 */
import { fetchLimited } from './fetch-limited.mjs'
import { isListingUrl } from './link-kinds.mjs'
import { bookingPlatformOf, isLinkInBioHost, linkInBioOf, unwrapRedirect } from './link-platforms.mjs'
import { decodeEntities, isMenuLink, profileSocial } from './website-crawler.mjs'

/** Link-in-bio pages read for one source read. */
export const BIO_PAGES_MAX = 2
/** Links kept from one page. */
export const BIO_LINKS_MAX = 50
const BIO_PAGE_BYTES = 2 * 1024 * 1024
const BIO_PAGE_TIMEOUT_MS = 10_000
/** Nodes of a page's embedded data walked at most. */
const DATA_NODES_MAX = 20_000
const TEXT_MAX = 200
/** Files a link-in-bio page shows (its pictures, styles, scripts, fonts), never links it lists. */
const ASSET = /\.(?:jpe?g|png|gif|webp|avif|svg|ico|css|js|mjs|json|woff2?|ttf|otf|map)$/i

const clean = (s) =>
  decodeEntities(String(s ?? '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TEXT_MAX)

/** An absolute http(s) link out of the page, its redirect wrapper and fragment dropped; null for anything else. */
function outbound(raw, pageUrl) {
  let u
  try {
    u = new URL(unwrapRedirect(new URL(String(raw ?? '').trim(), pageUrl).href))
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (isLinkInBioHost(u.hostname) || ASSET.test(u.pathname)) return null
  u.hash = ''
  return u.href
}

/** The `{url, title}` objects a page's embedded app data holds (Linktree and Beacons pages are Next.js apps). */
function dataLinks(html) {
  const out = []
  for (const m of String(html).matchAll(
    /<script\b[^>]*\bid\s*=\s*["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script\s*>/gi
  )) {
    let data
    try {
      data = JSON.parse(m[1])
    } catch {
      continue
    }
    const stack = [data]
    let seen = 0
    while (stack.length && seen < DATA_NODES_MAX) {
      const node = stack.pop()
      seen += 1
      if (Array.isArray(node)) {
        for (let i = node.length - 1; i >= 0; i -= 1) stack.push(node[i])
        continue
      }
      if (!node || typeof node !== 'object') continue
      if (typeof node.url === 'string' && /^https?:\/\//i.test(node.url.trim()))
        out.push({
          url: node.url,
          text: [node.title, node.label, node.text, node.type].find((t) => typeof t === 'string') ?? ''
        })
      for (const value of Object.values(node).reverse())
        if (value && typeof value === 'object') stack.push(value)
    }
  }
  return out
}

/**
 * The links a link-in-bio page lists, in page order: its anchors, then the links of its embedded app data. The
 * platform's own links (its sign-up, its CDN) and page assets are not kept; at most `BIO_LINKS_MAX`.
 * @param {string} html @param {string} pageUrl
 * @returns {{url: string, text: string}[]}
 */
export function bioPageLinks(html, pageUrl) {
  const found = []
  const body = String(html ?? '')
  for (const m of body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[1])
    if (href) found.push({ url: decodeEntities(href[1] ?? href[2] ?? href[3]), text: m[2] })
  }
  found.push(...dataLinks(body))
  const out = []
  const seen = new Set()
  for (const link of found) {
    if (out.length >= BIO_LINKS_MAX) break
    const url = outbound(link.url, pageUrl)
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push({ url, text: clean(link.text) })
  }
  return out
}

/** A failed read's reason, in the crawler's words (`website-crawler.mjs failureReason`). */
function reasonOf(err, status) {
  if (err?.code === 'URL_BLOCKED') return 'url_blocked'
  if (err?.code === 'TIMEOUT') return 'timeout'
  if (err?.code === 'MIME_REJECTED') return 'not_html'
  if (status === 404 || status === 410) return 'not_found'
  if (status === 429) return 'rate_limited'
  return 'fetch_failed'
}

/**
 * Reads one link-in-bio page. Never throws: a page that cannot be read is `failed` with its reason, and one that
 * redirects off its platform (a handle that now forwards to a website) is `not_a_bio_page`.
 * @param {string} url
 * @param {{fetch?: Function, resolve?: Function, timeoutMs?: number}} [deps] - `timeoutMs`: below the default only
 * @returns {Promise<{url: string, status: 'complete'|'failed', reason?: string, links?: {url: string, text: string}[]}>}
 */
export async function readBioPage(url, deps = {}) {
  let res
  try {
    res = await fetchLimited(url, {
      fetch: deps.fetch,
      resolve: deps.resolve,
      maxBytes: BIO_PAGE_BYTES,
      timeoutMs: Math.min(BIO_PAGE_TIMEOUT_MS, deps.timeoutMs ?? BIO_PAGE_TIMEOUT_MS),
      accept: ['text/html']
    })
  } catch (err) {
    return { url, status: 'failed', reason: reasonOf(err) }
  }
  if (res.status !== 200) return { url, status: 'failed', reason: reasonOf(null, res.status) }
  if (!linkInBioOf(res.url)) return { url, status: 'failed', reason: 'not_a_bio_page' }
  return {
    url: res.url,
    status: 'complete',
    links: bioPageLinks(new TextDecoder().decode(res.bytes), res.url)
  }
}

/**
 * What a read page's links are: the business's social pages (the first of each network), its booking links and its
 * menus or price lists (a link whose address or label says so, `isMenuLink`, never a listing site's page). Each keeps
 * the page it was listed on.
 * @param {{url: string, text: string}[]} links @param {string} pageUrl
 */
export function sortBioLinks(links, pageUrl) {
  const socials = {}
  const bookings = []
  const menus = []
  for (const { url, text } of links ?? []) {
    let network = null
    try {
      network = profileSocial(url)
    } catch {
      network = null
    }
    if (network) {
      socials[network] ??= url
      continue
    }
    const platform = bookingPlatformOf(url)
    if (platform) bookings.push({ url, sourceUrl: pageUrl, via: pageUrl, platform })
    else if (isMenuLink(url, text) && !isListingUrl(url))
      menus.push({ url, sourceUrl: pageUrl, via: pageUrl })
  }
  return { socials, bookings, menus }
}

/**
 * The link-in-bio pages and booking link a source read points at. The website: the link-in-bio pages its pages link
 * (`bioLinks`, kept by the crawler and the rendered readers). A social page: its bio link (`profile.website`), read
 * when it is a link-in-bio page and kept as a booking link when it is one itself.
 */
function pointersOf(result, source, ref) {
  const pages = []
  const bookings = []
  if (source === 'website') {
    for (const b of result.bioLinks ?? []) if (linkInBioOf(b?.url)) pages.push(b)
    return { pages, bookings }
  }
  const raw = result.profile?.website
  if (typeof raw !== 'string' || !raw.trim()) return { pages, bookings }
  const link = unwrapRedirect(raw.trim())
  const from = typeof result.profile?.url === 'string' ? result.profile.url : ref
  const platform = bookingPlatformOf(link)
  if (linkInBioOf(link)) pages.push({ url: link, sourceUrl: from })
  else if (platform) bookings.push({ url: link, sourceUrl: from, platform })
  return { pages, bookings }
}

/**
 * A source read with the link-in-bio pages it points at read and sorted into it: `bookings` and `menus` gain what
 * those pages list, `profile.links` (and, for the website, `socials`) the social pages, and `bioPages` keeps each page
 * read with every link it listed. A social page's bio link that is itself a booking link is a booking. A read with
 * nothing to follow is returned as it is, the same object.
 * @template {Record<string, any>} T
 * @param {T} result - a source read in the crawler's shape (`website-crawler.mjs`) or a social profile's
 * @param {{source: string, ref?: string | null}} at - the source and its address
 * @param {{fetch?: Function, resolve?: Function}} [deps]
 * @returns {Promise<T>}
 */
export async function expandLinkPages(result, { source, ref = null }, deps = {}) {
  if (!result || !['complete', 'partial'].includes(result.status)) return result
  const { pages, bookings } = pointersOf(result, source, ref)
  if (!pages.length && !bookings.length) return result
  const read = []
  const menus = []
  const socials = {}
  for (const page of pages.slice(0, BIO_PAGES_MAX)) {
    const got = await readBioPage(page.url, deps)
    read.push({
      ...got,
      sourceUrl: page.sourceUrl ?? null,
      ...(got.url !== page.url ? { asked: page.url } : {})
    })
    if (got.status !== 'complete') continue
    const sorted = sortBioLinks(got.links, got.url)
    bookings.push(...sorted.bookings)
    menus.push(...sorted.menus)
    for (const [network, url] of Object.entries(sorted.socials)) socials[network] ??= url
  }
  const socialUrls = Object.values(socials)
  return {
    ...result,
    ...(bookings.length ? { bookings: [...(result.bookings ?? []), ...bookings] } : {}),
    ...(menus.length ? { menus: [...(result.menus ?? []), ...menus] } : {}),
    ...(source === 'website' && socialUrls.length ? { socials: { ...socials, ...result.socials } } : {}),
    ...(socialUrls.length
      ? {
          profile: {
            ...result.profile,
            links: [...new Set([...(result.profile?.links ?? []), ...socialUrls])]
          }
        }
      : {}),
    ...(read.length ? { bioPages: [...(result.bioPages ?? []), ...read] } : {})
  }
}
