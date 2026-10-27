import { fetchLimited } from './fetch-limited.mjs'
import { assertPublicUrl } from './url-guard.mjs'
import { socialNetworkOf } from './discovery-osm.mjs'
import { SCHEMA_BUSINESS_TYPES } from './trades.mjs'

const DEFAULT_MAX_PAGES = 40
const TEXT_CAP = 5000
const PAGE_BYTES = 2 * 1024 * 1024
const SITEMAP_BYTES = 5 * 1024 * 1024
const MAX_CHILD_SITEMAPS = 5
const MAX_SITEMAP_URLS = 500
// A page that is itself the menu, and where a guest books a table.
const MENU_PAGE = /(^|[/_-])(menu|menus|thuc-don|carte|speisekarte)([/_.-]|$)|\b(menu|thực đơn)\b/i
const BOOKING_PAGE =
  /(^|[/_-])(book|booking|book-online|reserv|reservation|reservations|dat-ban)([/_.-]|$)|\b(book (a|your) table|book online|reservations?|đặt bàn)\b/i
const BOOKING_HOSTS = [
  'opentable.',
  'resy.com',
  'sevenrooms.com',
  'tablecheck.com',
  'quandoo.',
  'chope.co',
  'eatigo.com',
  'thefork.',
  'bookatable.',
  'tock.com',
  'yelp.com/reservations',
  'pasaca.'
]
/** Words a title segment carries that are a page, not a business ("Home | Acme", "Welcome to Acme"). */
const GENERIC_TITLE = /^(?:home(?:\s*page)?|welcome|official\s+(?:web)?site|index|main)$/i

/**
 * The business name in a home page's `<title>` when nothing better states it: the first segment before a title
 * separator that is not a page word. "Taco Corner No. 7 | Taquerias in New York City" is "Taco Corner No. 7"; a title
 * with no separator is kept whole (pilot 24/10/2026: the whole SEO title became the name every page had to show).
 * @param {string | null | undefined} title
 * @returns {string | undefined}
 */
export function nameFromTitle(title) {
  if (typeof title !== 'string' || !title.trim()) return undefined
  const parts = title
    .split(/\s+[|\u2013\u2014\u00b7\u2022:-]+\s+/)
    .map((part) => part.replace(/^welcome\s+to\s+/i, '').trim())
    .filter((part) => part && !GENERIC_TITLE.test(part))
  return parts[0] ?? title.trim()
}

export function isBookingUrl(url) {
  return BOOKING_HOSTS.some((h) => url.toLowerCase().includes(h))
}

const SKIP_EXT =
  /\.(jpe?g|png|gif|webp|avif|svg|ico|bmp|tiff?|mp4|webm|mov|m4v|mp3|wav|zip|rar|gz|css|js|json|xml|txt|docx?|xlsx?|pptx?)$/i
// The schema.org types a business states about itself: the LocalBusiness subtypes `trades.mjs` places in a trade
// (Find's food places and Add site's Build from my business), and the bare LocalBusiness.
const BUSINESS_TYPES = new Set(SCHEMA_BUSINESS_TYPES)
// The general types, kept only when nothing more specific is said.
const GENERAL_TYPES = new Set(['LocalBusiness', 'ProfessionalService', 'Store', 'MedicalOrganization'])
const NOT_A_PROFILE = {
  facebook: /^\/(sharer|share|dialog|plugins|tr|login|l\.php)/i,
  instagram: /^\/(p|reel|reels|explore|accounts)\//i,
  tiktok: /^\/(share|embed)/i,
  youtube: /^\/(watch|embed|shorts|results|share)/i
}

// ---------- tiny HTML helpers (no dependencies) ----------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

function parseAttrs(tag) {
  const attrs = {}
  const inner = tag.replace(/^<\s*[\w:-]+/, '').replace(/\/?>$/, '')
  const re = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
  let m
  while ((m = re.exec(inner))) attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '')
  return attrs
}

function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((m) => parseAttrs(m[0]))
}

function stripBlocks(html, names) {
  let out = html.replace(/<!--[\s\S]*?-->/g, ' ')
  for (const n of names) out = out.replace(new RegExp(`<${n}\\b[^>]*>[\\s\\S]*?<\\/${n}\\s*>`, 'gi'), ' ')
  return out
}

function toText(fragment) {
  return decodeEntities(fragment.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function abs(href, base) {
  if (!href || /^(data|javascript|mailto|tel|blob):/i.test(href.trim())) return null
  try {
    const u = new URL(href.trim(), base)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    u.hash = ''
    return u.href
  } catch {
    return null
  }
}

function largestFromSrcset(srcset) {
  let best = null
  for (const part of srcset.split(/,\s+/)) {
    const [url, desc = '1x'] = part.trim().split(/\s+/)
    if (!url) continue
    const n = parseFloat(desc) * (desc.endsWith('w') ? 1 : 1000)
    if (!best || n > best.n) best = { url, n }
  }
  return best?.url ?? null
}

/**
 * The full-size picture behind an image host's resized copy, or null when the URL is not a resized copy of a
 * host whose pattern is documented. Per image host, never per site or template; unknown hosts stay as seen.
 * - Wix: `static.wixstatic.com/media/<file>/v1/<fit|fill|crop>/<params>/<name>` is a transform of
 *   `static.wixstatic.com/media/<file>`, which serves the uploaded original (Wix Media "image transformation" URLs).
 * - WordPress: an intermediate size under `/wp-content/uploads/` is the upload's name plus `-<w>x<h>` before the
 *   extension (`WP_Image_Editor::generate_filename`); the uploaded file keeps the name without it.
 * - Shopify: `cdn.shopify.com` and a shop's `/cdn/shop/(files|products|t)/` path size a file with a `_<w>x<h>` suffix
 *   (optionally `_crop_<pos>` and `@<n>x`) or `width`/`height`/`crop` query parameters; without them the CDN serves
 *   the original. The `/cdn/shop/` path is matched on any host on purpose: Shopify stores serve it on their own
 *   custom domains, the common case, so a hostname check would miss most shops. A wrong guess costs one failed GET,
 *   after which the downloader uses the copy as seen (`fallbackUrl`).
 */
export function originalImageUrl(url) {
  let u
  try {
    u = new URL(url)
  } catch {
    return null
  }
  const before = u.href
  if (u.hostname === 'static.wixstatic.com') {
    const m = /^(\/media\/[^/]+\.[a-z0-9]+)\/v1\//i.exec(u.pathname)
    if (!m) return null
    u.pathname = m[1]
    u.search = ''
  } else if (/\/wp-content\/uploads\//.test(u.pathname)) {
    u.pathname = u.pathname.replace(/-\d{2,5}x\d{2,5}(\.(?:jpe?g|png|webp|gif|avif))$/i, '$1')
  } else if (u.hostname === 'cdn.shopify.com' || /^\/cdn\/shop\/(?:files|products|t)\//.test(u.pathname)) {
    u.pathname = u.pathname.replace(/_(?:\d+x\d*|x\d+)(?:_crop_[a-z]+)?(?:@\d+x)?(\.[a-z0-9]+)$/i, '$1')
    for (const key of ['width', 'height', 'crop']) u.searchParams.delete(key)
  } else return null
  return u.href === before ? null : u.href
}

/** The width a resized copy's URL encodes (Wix `w_<n>`, WordPress `-<w>x<h>`, Shopify `_<w>x` or `width=`), else null. */
function copyWidth(url) {
  const m =
    /\/v1\/[a-z]+\/(?:[^/]*,)?w_(\d+)/i.exec(url) ??
    /-(\d{2,5})x\d{2,5}\.[a-z0-9]+(?:[?#]|$)/i.exec(url) ??
    /_(\d+)x\d*(?:_crop_[a-z]+)?(?:@\d+x)?\.[a-z0-9]+(?:[?#]|$)/i.exec(url) ??
    /[?&]width=(\d+)/i.exec(url)
  return m ? Number(m[1]) : null
}

/**
 * Another copy of an image already listed under its original: the item keeps the copy to fall back on that is
 * widest by the width its URL encodes, or its first copy when the widths are not both known. Mutates `image`.
 */
export function keepFallbackCopy(image, copy) {
  if (!copy || copy === image.url || copy === image.fallbackUrl) return
  if (!image.fallbackUrl) {
    image.fallbackUrl = copy
    return
  }
  const kept = copyWidth(image.fallbackUrl)
  const next = copyWidth(copy)
  if (kept !== null && next !== null && next > kept) image.fallbackUrl = copy
}

const arr = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v])

function addressString(a) {
  if (!a) return undefined
  if (typeof a === 'string') return a.trim() || undefined
  const parts = [
    a.streetAddress,
    a.addressLocality,
    a.addressRegion,
    a.postalCode,
    a.addressCountry?.name ?? a.addressCountry
  ]
  const s = parts.filter((p) => typeof p === 'string' && p.trim()).join(', ')
  return s || undefined
}

function hoursOf(node) {
  const out = arr(node.openingHours).filter((h) => typeof h === 'string')
  for (const spec of arr(node.openingHoursSpecification)) {
    const days = arr(spec?.dayOfWeek)
      .map((d) => String(d).replace(/^https?:\/\/schema\.org\//, ''))
      .join(',')
    if (spec?.opens && spec?.closes) out.push(`${days} ${spec.opens}-${spec.closes}`.trim())
  }
  return out
}

function flattenLd(data) {
  const out = []
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk)
    if (n && typeof n === 'object') {
      out.push(n)
      if (n['@graph']) walk(n['@graph'])
    }
  }
  walk(data)
  return out
}

/** The JSON-LD blocks of a page's source; malformed ones are skipped. */
export function ldBlocksOf(src) {
  const blocks = []
  for (const m of String(src ?? '').matchAll(
    /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      blocks.push(JSON.parse(m[1].trim()))
    } catch {
      // malformed JSON-LD is common; skip it
    }
  }
  return blocks
}

/**
 * The first JSON-LD node that is a business (a schema.org LocalBusiness type, never a bare Organization or
 * WebSite) with its business types, or null.
 * @returns {{ node: any, types: string[] } | null}
 */
export function businessNodeOf(blocks) {
  for (const node of blocks.flatMap(flattenLd)) {
    // `https://schema.org/Dentist` and `schema:Dentist` name the same type as `Dentist`.
    const types = arr(node['@type'])
      .map((t) => (typeof t === 'string' ? t.replace(/^(?:https?:\/\/schema\.org\/|schema:)/i, '') : t))
      .filter((t) => BUSINESS_TYPES.has(t))
    if (types.length) return { node, types }
  }
  return null
}

/** The facts a business's JSON-LD node states. Exported for the listing-page reader (`listing-page.mjs`). */
export function businessFromLd(blocks) {
  const found = businessNodeOf(blocks)
  if (found) {
    const { node, types } = found
    const menu = arr(node.hasMenu ?? node.menu)
      .map((m) => (typeof m === 'string' ? m : m?.url))
      .find(Boolean)
    return {
      type: types.find((t) => !GENERAL_TYPES.has(t)) ?? types[0],
      name: typeof node.name === 'string' ? node.name.trim() : undefined,
      telephone: typeof node.telephone === 'string' ? node.telephone.trim() : undefined,
      email:
        typeof node.email === 'string' && node.email.includes('@')
          ? node.email
              .trim()
              .replace(/^mailto:/i, '')
              .toLowerCase()
          : undefined,
      address: addressString(node.address),
      openingHours: hoursOf(node),
      menu,
      servesCuisine: arr(node.servesCuisine).filter((c) => typeof c === 'string'),
      priceRange: typeof node.priceRange === 'string' ? node.priceRange : undefined,
      sameAs: arr(node.sameAs).filter((s) => typeof s === 'string')
    }
  }
  return null
}

/** The network of a profile link; share, watch and login URLs on those hosts are not profiles. Throws on an invalid URL. */
export function profileSocial(url) {
  const net = socialNetworkOf(url)
  if (!net) return null
  const path = new URL(url).pathname
  if (path === '/' || NOT_A_PROFILE[net].test(path)) return null
  return net
}

const LOGO_WORD = /logo|brand|emblem|wordmark|logotype/i
/** Most to least trusted; the order a logo candidate list keeps. */
export const LOGO_VIA_ORDER = [
  'jsonld-logo',
  'header-img',
  'img-named',
  'apple-touch-icon',
  'og-image',
  'icon'
]
const LOGOS_PER_SITE = 12

/** The logo the page's JSON-LD names (`logo`: a URL or an ImageObject), on any node. */
function ldLogos(blocks) {
  const out = []
  for (const node of blocks.flatMap(flattenLd)) {
    for (const l of arr(node.logo)) {
      const u = typeof l === 'string' ? l : (l?.url ?? l?.contentUrl)
      if (typeof u === 'string') out.push(u)
    }
  }
  return out
}

/**
 * Where a page points at its logo, with how it said so: JSON-LD `logo`, the first picture of the header/nav, pictures
 * whose alt, class, id or file name say logo, the touch icon, og:image and the favicon. Hints only: the picture may be
 * none of those (a hero og:image, a partner's mark), which is for a reader of the picture to decide.
 */
function logoHints({ src, ldBlocks, meta, pageUrl }) {
  const found = []
  const add = (u, via, extra = {}) => {
    const seen = abs(u, pageUrl)
    if (!seen) return
    // As for pictures: the original first, the copy as seen kept for the downloader to fall back on.
    const original = originalImageUrl(seen)
    const url = original ?? seen
    if (!found.some((f) => f.url === url))
      found.push({ url, ...(original ? { fallbackUrl: seen } : {}), via, ...extra })
  }
  for (const u of ldLogos(ldBlocks)) add(u, 'jsonld-logo')
  const named = (a) =>
    LOGO_WORD.test(
      `${a.alt ?? ''} ${a.class ?? ''} ${a.id ?? ''} ${(a.src ?? a['data-src'] ?? '').split('?')[0].split('/').pop()}`
    )
  const pic = (a) =>
    a.src || a['data-src'] || a['data-lazy-src'] || largestFromSrcset(a.srcset || a['data-srcset'] || '')
  for (const block of src.matchAll(/<(header|nav)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)) {
    const first = tags(block[2], 'img')[0]
    if (first) add(pic(first), 'header-img', first.alt ? { alt: first.alt.trim() } : {})
  }
  for (const a of tags(stripBlocks(src, ['script', 'style', 'noscript', 'template', 'svg', 'iframe']), 'img'))
    if (named(a)) add(pic(a), 'img-named', a.alt ? { alt: a.alt.trim() } : {})
  const links = tags(src, 'link')
  for (const l of links) if (/apple-touch-icon/i.test(l.rel ?? '')) add(l.href, 'apple-touch-icon')
  const og = meta.find((m) => (m.property ?? m.name ?? '').toLowerCase() === 'og:image')?.content
  add(og, 'og-image')
  for (const l of links) if (/^(shortcut )?icon$/i.test((l.rel ?? '').trim())) add(l.href, 'icon')
  return found.sort((a, b) => LOGO_VIA_ORDER.indexOf(a.via) - LOGO_VIA_ORDER.indexOf(b.via))
}

/** Parses one HTML page. Every string returned is untrusted page data. */
export function extractPage(html, pageUrl) {
  const src = String(html ?? '')
  const title = toText(src.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
  const meta = tags(src, 'meta')
  const metaContent = (key) =>
    meta.find((m) => (m.property ?? m.name ?? '').toLowerCase() === key)?.content?.trim() || undefined

  const ldBlocks = ldBlocksOf(src)
  const business = businessFromLd(ldBlocks)

  const body = stripBlocks(src, ['script', 'style', 'noscript', 'template', 'svg', 'iframe'])
  const text = toText(stripBlocks(body, ['nav', 'header', 'footer', 'head'])).slice(0, TEXT_CAP)

  const images = []
  const seenImg = new Map()
  // The full-size original goes first and the copy as seen stays as `fallbackUrl`: the downloader tries both.
  const pushImg = (u, alt) => {
    const seen = abs(u, pageUrl)
    if (!seen) return
    const original = originalImageUrl(seen)
    const url = original ?? seen
    const listed = seenImg.get(url)
    if (listed) {
      keepFallbackCopy(listed, seen)
      return
    }
    const image = { url, ...(original ? { fallbackUrl: seen } : {}), ...(alt ? { alt } : {}) }
    seenImg.set(url, image)
    images.push(image)
  }
  pushImg(metaContent('og:image'))
  for (const a of tags(body, 'img')) {
    const srcset = a.srcset || a['data-srcset']
    pushImg(
      (srcset && largestFromSrcset(srcset)) || a.src || a['data-src'] || a['data-lazy-src'],
      a.alt?.trim()
    )
  }
  const videos = []
  const seenVid = new Set()
  for (const a of tags(body, 'video')) {
    const url = abs(a.src, pageUrl)
    if (url && !seenVid.has(url)) {
      seenVid.add(url)
      videos.push({ url })
    }
    if (a.poster) pushImg(a.poster)
  }
  for (const a of tags(body, 'source')) {
    const url = abs(a.src, pageUrl)
    if (
      url &&
      (/^video\//i.test(a.type ?? '') || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) &&
      !seenVid.has(url)
    ) {
      seenVid.add(url)
      videos.push({ url })
    }
  }

  const links = []
  const pdfs = []
  const phones = []
  const socials = {}
  for (const s of business?.sameAs ?? []) {
    const net = profileSocial(s)
    if (net && !socials[net]) socials[net] = s
  }
  for (const m of body.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi)) {
    const attrs = parseAttrs(m[0].match(/^<a\b[^>]*>/i)[0])
    const href = (attrs.href ?? '').trim()
    if (/^tel:/i.test(href)) {
      phones.push(decodeURIComponent(href.slice(4)).replace(/\s+/g, ''))
      continue
    }
    const url = abs(href, pageUrl)
    if (!url) continue
    const net = profileSocial(url)
    if (net) {
      socials[net] ??= url
      continue
    }
    if (/\.pdf(\?|$)/i.test(new URL(url).pathname)) {
      const label = toText(m[1])
      if (!pdfs.some((p) => p.url === url))
        pdfs.push({
          url,
          text: label,
          menu: /menu|thuc[\s_-]?don|thực đơn|carte|speisekarte/i.test(`${url} ${label}`)
        })
      continue
    }
    links.push(url)
  }
  const navLinks = []
  for (const block of src.matchAll(/<(nav|header)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)) {
    for (const a of tags(block[2], 'a')) {
      const url = abs(a.href, pageUrl)
      if (url) navLinks.push(url)
    }
  }

  return {
    url: pageUrl,
    title,
    description: metaContent('description') ?? metaContent('og:description'),
    siteName: metaContent('og:site_name'),
    text,
    business,
    images,
    logos: logoHints({ src, ldBlocks, meta, pageUrl }),
    videos,
    pdfs,
    socials,
    phones,
    links: [...new Set(links)],
    navLinks: [...new Set(navLinks)]
  }
}

// ---------- crawl ----------

const hostKey = (u) => new URL(u).hostname.toLowerCase().replace(/^www\./, '')

function locsOf(xmlText) {
  return [...xmlText.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)].map((m) =>
    decodeEntities(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '')).trim()
  )
}

async function readSitemap(origin, key, fetchOpts) {
  const out = []
  const get = async (url) => {
    try {
      const r = await fetchLimited(url, { ...fetchOpts, maxBytes: SITEMAP_BYTES })
      if (r.status !== 200 || r.mime === 'text/html') return ''
      return new TextDecoder().decode(r.bytes)
    } catch {
      return ''
    }
  }
  const root = await get(`${origin}/sitemap.xml`)
  const children = /<sitemapindex\b/i.test(root) ? locsOf(root).slice(0, MAX_CHILD_SITEMAPS) : []
  const bodies = children.length ? [] : [root]
  for (const child of children) {
    if (abs(child, origin) && hostKey(child) === key) bodies.push(await get(child))
  }
  for (const body of bodies) {
    for (const loc of locsOf(body)) {
      const url = abs(loc, origin)
      if (url && hostKey(url) === key && !SKIP_EXT.test(new URL(url).pathname)) out.push(url)
      if (out.length >= MAX_SITEMAP_URLS) return out
    }
  }
  return out
}

function failureReason(err, status) {
  // A domain that no longer resolves is a stale address, not a guard refusal.
  if (err?.code === 'URL_BLOCKED' && (err.reason === 'dns_failed' || err.reason === 'dns_empty'))
    return 'not_found'
  if (err?.code === 'URL_BLOCKED') return 'url_blocked'
  if (err?.code === 'TIMEOUT') return 'timeout'
  if (status === 404 || status === 410) return 'not_found'
  if (status === 429) return 'rate_limited'
  if (status === 401 || status === 403) return 'login_required'
  return 'fetch_failed'
}

/**
 * Crawls one website on its own host (ignoring a leading "www."; subdomains count as other hosts).
 * Each call returns only what it fetched; `cursor` ({host, queue, seen, fetched}) lets a paused crawl resume.
 */
export async function crawlWebsite(
  rootUrl,
  { maxPages = DEFAULT_MAX_PAGES, cursor = null, pageTimeoutMs = 15_000 } = {},
  deps = {}
) {
  const fetchOpts = { fetch: deps.fetch, resolve: deps.resolve, timeoutMs: pageTimeoutMs }
  const result = {
    source: 'website',
    status: 'complete',
    cursor: null,
    pages: [],
    media: [],
    logos: [],
    menus: [],
    bookings: [],
    socials: {},
    profile: {},
    coverage: { fetched: 0 }
  }

  let host
  let queue
  let seen
  let fetchedBefore = 0
  if (cursor && Array.isArray(cursor.queue)) {
    host = cursor.host
    queue = [...cursor.queue]
    seen = new Set(cursor.seen ?? cursor.queue)
    fetchedBefore = Number(cursor.fetched) || 0
  } else {
    let root
    try {
      root = await assertPublicUrl(rootUrl, { resolve: deps.resolve })
    } catch (err) {
      return { ...result, status: 'failed', reason: failureReason(err) }
    }
    root.hash = ''
    host = hostKey(root.href)
    queue = [root.href]
    seen = new Set(queue)
    for (const u of await readSitemap(root.origin, host, fetchOpts)) {
      if (!seen.has(u)) {
        seen.add(u)
        queue.push(u)
      }
    }
  }

  const seenMedia = new Set()
  const listedImages = new Map()
  const seenMenus = new Set()
  const links = new Set()
  const seenBookings = new Set()
  const addBooking = (url, from) => {
    if (url && !seenBookings.has(url)) {
      seenBookings.add(url)
      result.bookings.push({ url, sourceUrl: from })
    }
  }
  const addMenu = (url, from) => {
    if (url && !seenMenus.has(url)) {
      seenMenus.add(url)
      result.menus.push({ url, sourceUrl: from })
    }
  }
  let first = fetchedBefore === 0
  let stopReason = null

  while (queue.length && result.pages.length < maxPages) {
    const url = queue.shift()
    let res
    try {
      res = await fetchLimited(url, { ...fetchOpts, maxBytes: PAGE_BYTES })
    } catch (err) {
      if (err?.code === 'TIMEOUT') {
        queue.unshift(url)
        stopReason = 'timeout'
        break
      }
      if (first) return { ...result, status: 'failed', reason: failureReason(err) }
      continue
    }
    if (res.status === 429) {
      queue.unshift(url)
      stopReason = 'rate_limited'
      break
    }
    if (res.status !== 200 || res.mime !== 'text/html') {
      if (res.mime === 'application/pdf') addMenu(res.url, url)
      if (first) return { ...result, status: 'failed', reason: failureReason(null, res.status) }
      continue
    }
    if (first && hostKey(res.url) !== host) host = hostKey(res.url) // root redirected, e.g. to www or a new domain
    if (hostKey(res.url) !== host) continue

    const page = extractPage(new TextDecoder().decode(res.bytes), res.url)
    result.pages.push({ url: page.url, title: page.title, text: page.text })
    const path = new URL(page.url).pathname
    if (!first && (MENU_PAGE.test(path) || MENU_PAGE.test(page.title ?? ''))) addMenu(page.url, page.url)
    if (!first && (BOOKING_PAGE.test(path) || BOOKING_PAGE.test(page.title ?? '')))
      addBooking(page.url, page.url)
    for (const l of page.links) if (isBookingUrl(l)) addBooking(l, page.url)

    // The first page read is the home page: the logo the site presents lives there.
    if (first) result.logos = page.logos.slice(0, LOGOS_PER_SITE).map((l) => ({ ...l, sourceUrl: page.url }))
    if (first) {
      result.profile = {
        name: page.business?.name ?? page.siteName ?? nameFromTitle(page.title),
        bio: page.description
      }
    }
    const b = page.business
    if (b) {
      result.profile.name ??= b.name
      result.profile.phone ??= b.telephone
      result.profile.email ??= b.email
      result.profile.address ??= b.address
      if (b.openingHours.length && !result.profile.hours) result.profile.hours = b.openingHours
      if (b.servesCuisine.length && !result.profile.cuisine) result.profile.cuisine = b.servesCuisine
      if (b.priceRange) result.profile.priceRange ??= b.priceRange
      if (b.type) result.profile.businessType ??= b.type
      addMenu(abs(b.menu, page.url), page.url)
    }
    if (!result.profile.phone && page.phones[0]) result.profile.phone = page.phones[0]
    for (const [net, u] of Object.entries(page.socials)) {
      result.socials[net] ??= u
      links.add(u)
    }
    for (const p of page.pdfs) if (p.menu) addMenu(p.url, page.url)
    for (const img of page.images) {
      // The same original seen on another page may bring a wider copy to fall back on.
      if (seenMedia.has(img.url)) {
        const listed = listedImages.get(img.url)
        if (listed) keepFallbackCopy(listed, img.fallbackUrl)
        continue
      }
      seenMedia.add(img.url)
      const item = {
        url: img.url,
        ...(img.fallbackUrl ? { fallbackUrl: img.fallbackUrl } : {}),
        kind: 'image',
        sourceUrl: page.url,
        ...(img.alt ? { caption: img.alt } : {})
      }
      listedImages.set(img.url, item)
      result.media.push(item)
    }
    for (const v of page.videos) {
      if (seenMedia.has(v.url)) continue
      seenMedia.add(v.url)
      result.media.push({ url: v.url, kind: 'video', sourceUrl: page.url })
    }

    const next = first ? [...page.links, ...page.navLinks] : page.navLinks
    for (const u of next) {
      if (hostKey(u) !== host || seen.has(u) || SKIP_EXT.test(new URL(u).pathname)) continue
      seen.add(u)
      queue.push(u)
    }
    first = false
  }

  for (const l of links) (result.profile.links ??= []).push(l)
  result.profile = Object.fromEntries(Object.entries(result.profile).filter(([, v]) => v !== undefined))
  const fetched = fetchedBefore + result.pages.length
  result.coverage = { fetched, total: fetched + queue.length }
  if (queue.length) {
    result.status = 'partial'
    if (stopReason) result.reason = stopReason
    result.cursor = { host, queue, seen: [...seen], fetched }
  }
  return result
}
