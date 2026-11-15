// The old URL → new page map of a demo (10Web's "change your site without losing your Google rankings"): for each page
// of the business's current website that research read, the page of the demo its old address should lead to, why, and
// the title and meta description to carry over. Pure code over what is already kept: the website source row research
// wrote (`executor.js mergeCollected`: `collected.pages`) and the demo's own page list as its CMS lists it, kept on the
// build (`wo_build.built.pages`). No model call and no fetch.
//
// 🔒 A TARGET IS A PAGE THE DEMO HAS, OR NOTHING. A page with no match stays `unmatched`, with no target: never the home
// page by default (search engines treat an address sent to an unrelated home page as a page that is gone), never a page
// made up. Whether an unmatched address later leads home or answers "gone" is the seller's call when the redirects are
// applied; this map applies nothing.
// 🔒 NOTHING READ IS NOTHING SAID. A meta description research did not keep (every read before 15/11/2026) is null.

import { normaliseName } from './dedupe.mjs'
import { dropTracking, isListingUrl } from './link-kinds.mjs'
import { pageRole } from './page-plan.mjs'
import { oldSiteReadOf } from './trade-must-haves.mjs'
import { SKIP_EXT, TITLE_SEPARATOR } from './website-crawler.mjs'

export const URL_MAP_VERSION = 'old-url-map/1'

/**
 * Why an old page leads where it does, strongest first: the old home page to the demo's (`home`), the same last part
 * of the address (`same-slug`), the same title or first heading as a demo page's title (`same-title`), the same kind of
 * page by its address and title words (`same-topic`, `page-plan.mjs pageRole`: menu, contact, about, gallery…).
 */
export const URL_MAP_MATCHES = Object.freeze(['home', 'same-slug', 'same-title', 'same-topic'])

/**
 * Why an old page is not in the map: no address that parses (`invalid`), another host (`other-host`), a file
 * (`asset`), a login, cart, search, feed or admin address (`system`), a tag, author or date listing (`archive`), the
 * second or later page of a list (`pagination`), a page whose title says it is an error page (`not-found`), or the same
 * page under another address: tracking or display parameters, http/https, www, a trailing slash (`duplicate`, with
 * `sameAs`, the address kept).
 */
export const URL_MAP_SKIPS = Object.freeze([
  'invalid',
  'other-host',
  'asset',
  'system',
  'archive',
  'pagination',
  'not-found',
  'duplicate'
])

/**
 * Why there is no map: the place has no website of its own (`no-website`), research kept no page of it
 * (`old-site-not-read`), or the demo's pages were not read (`demo-not-read`, with the read's `reason` when one is kept).
 */
export const URL_MAP_STATES = Object.freeze(['ready', 'no-website', 'old-site-not-read', 'demo-not-read'])

const MAX_LISTED = 200
const INDEX_FILE = /\/index\.(?:html?|php|aspx?)$/i
const PAGE_EXT = /\.(?:html?|php|aspx?)$/i
/** A first path part that names a language (`/en/menu`, `/vi`, `/pt-br/`), not a page. */
const LANGUAGE_PART = /^[a-z]{2}(?:[-_][a-z]{2,4})?$/i
/** Parameters that show the same page another way: a reply form, a print or AMP copy, a sort order, a referrer. */
const VARIANT_PARAMS = /^(replytocom|amp|share|print|output|format|ref|sort|orderby|order)$/i
const PAGED_PATH = /\/page\/\d+\/?$/i
const PAGED_PARAMS = ['page', 'paged', 'pg', 'start', 'limitstart']
const SYSTEM_PART =
  /^(feed|rss|atom|wp-json|wp-admin|wp-login\.php|wp-content|wp-includes|xmlrpc\.php|administrator|cart|checkout|basket|my-account|account|login|log-in|signin|sign-in|logout|register|wishlist|search|trackback|comments)$/i
const SYSTEM_PARAMS = /^(s|searchword|add-to-cart)$/i
/** Joomla components that are a login, search or mail form, never a content page (`index.php?option=com_users`). */
const SYSTEM_COMPONENTS = /^com_(users|search|finder|mailto|ajax)$/i
const ARCHIVE_PART = /^(tag|tags|author)$/i
const NOT_FOUND_TITLE = /\b(404|page not found|not found|nothing found)\b/i
const ROLELESS = new Set(['other', 'sample', 'home'])

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const hostOf = (u) => u.hostname.toLowerCase().replace(/^www\./, '')

function decoded(path) {
  try {
    return decodeURI(path)
  } catch {
    return path
  }
}

/** The parts of a path a match reads: lower case, no index file, no extension on the last, no leading language. */
function partsOf(pathname) {
  const parts = decoded(pathname).toLowerCase().replace(INDEX_FILE, '/').split('/').filter(Boolean)
  if (parts.length) parts[parts.length - 1] = parts[parts.length - 1].replace(PAGE_EXT, '')
  const language = parts.length >= 1 && LANGUAGE_PART.test(parts[0])
  return { parts: language ? parts.slice(1) : parts, languageRoot: language && parts.length === 1 }
}

/** The query that names a page: tracking and display parameters taken out, the rest sorted. */
function pageQuery(u) {
  const query = new URLSearchParams(u.search)
  dropTracking(query)
  for (const key of Array.from(query.keys())) if (VARIANT_PARAMS.test(key)) query.delete(key)
  query.sort()
  return query
}

/** Why an old page is skipped before any match, or null. */
function skipOf(u, title, query) {
  const pathname = decoded(u.pathname)
  if (SKIP_EXT.test(pathname) || /\.pdf$/i.test(pathname)) return 'asset'
  const raw = pathname.toLowerCase().split('/').filter(Boolean)
  if (raw.some((p) => SYSTEM_PART.test(p))) return 'system'
  for (const [key, value] of query) {
    if (SYSTEM_PARAMS.test(key)) return 'system'
    if (key.toLowerCase() === 'option' && SYSTEM_COMPONENTS.test(value)) return 'system'
  }
  if (raw.some((p) => ARCHIVE_PART.test(p))) return 'archive'
  // A date listing (`/2024/`, `/2024/05/`, `/2024/05/12/`): numbers only, no post name after them.
  if (raw.length && raw.length <= 3 && /^\d{4}$/.test(raw[0]) && raw.every((p) => /^\d{1,4}$/.test(p)))
    return 'archive'
  if (PAGED_PATH.test(pathname)) return 'pagination'
  for (const key of PAGED_PARAMS) {
    const n = Number(query.get(key))
    if (Number.isInteger(n) && n > (key === 'start' || key === 'limitstart' ? 0 : 1)) return 'pagination'
  }
  if (title && NOT_FOUND_TITLE.test(title)) return 'not-found'
  return null
}

/** The title parts that name the site, not the page: a part at least two titles and half of them carry. */
function siteTitleParts(titles) {
  const seen = new Map()
  for (const title of titles) {
    const parts = new Set(String(title).split(TITLE_SEPARATOR).map(normaliseName).filter(Boolean))
    for (const part of parts) seen.set(part, (seen.get(part) ?? 0) + 1)
  }
  const least = Math.max(2, titles.length / 2)
  return new Set([...seen].filter(([, n]) => n >= least).map(([part]) => part))
}

/** A title's own words, the site's name taken out ("Our Menu | Pho Ba" → "our menu"). */
function titleWords(title, siteParts) {
  if (!title) return ''
  const parts = String(title)
    .split(TITLE_SEPARATOR)
    .map(normaliseName)
    .filter((p) => p && !siteParts.has(p))
  return parts.join(' ')
}

/** The demo's pages a map may lead to, each with what a match reads. Its pages only, when its CMS names any. */
function demoTargets(snapshot) {
  const listed = (Array.isArray(snapshot?.pages) ? snapshot.pages : []).filter(
    (p) => typeof p?.path === 'string' && p.path.startsWith('/')
  )
  const typed = listed.filter((p) => p.type === 'page')
  const out = []
  for (const p of typed.length ? typed : listed) {
    let u
    try {
      u = new URL(p.path, 'https://demo.invalid')
    } catch {
      continue
    }
    const query = pageQuery(u)
    if (skipOf(u, null, query)) continue
    const { parts } = partsOf(u.pathname)
    const home = parts.length === 0 && [...query].length === 0
    const title = str(p.title)
    const role = home ? 'home' : pageRole({ id: parts.join('/'), label: title ?? '' })
    // A template's own sample pages (typography, login, a 404 page) are never where a business's page leads.
    if (role === 'sample') continue
    out.push({
      path: p.path,
      title,
      home,
      slug: normaliseName(parts.at(-1) ?? ''),
      words: normaliseName(title ?? ''),
      role,
      depth: parts.length
    })
  }
  return out
}

/** The best of several demo pages for one match: the shallowest address, then the first listed. */
const best = (list) => list.reduce((a, b) => (b.depth < a.depth ? b : a), list[0])

/** Where one old page leads, and why; null when no demo page matches. */
function matchOf(old, targets) {
  const pages = targets.filter((t) => !t.home)
  if (old.home) {
    const home = targets.find((t) => t.home)
    return { to: { path: '/', title: home?.title ?? null }, match: 'home' }
  }
  const pick = (list, match) => {
    if (!list.length) return null
    const t = best(list)
    return { to: { path: t.path, title: t.title }, match }
  }
  return (
    (old.slug
      ? pick(
          pages.filter((t) => t.slug === old.slug),
          'same-slug'
        )
      : null) ??
    pick(
      pages.filter((t) => t.words && (t.words === old.words || t.words === old.heading)),
      'same-title'
    ) ??
    (ROLELESS.has(old.role)
      ? null
      : pick(
          pages.filter((t) => t.role === old.role),
          'same-topic'
        ))
  )
}

const emptyCounts = () => ({
  pages: 0,
  matched: 0,
  unmatched: 0,
  skipped: 0,
  byMatch: Object.fromEntries(URL_MAP_MATCHES.map((m) => [m, 0]))
})

/**
 * The map of one demo.
 * @param {{ website?: string | null, row?: any, demo?: any }} input `website` the business's own website (the website
 *   source row's `ref`, else the candidate's), `row` the website source row with its `status` and `collected`, `demo`
 *   the demo's pages as kept on its build: `{readAt, truncated?, pages: [{path, title, type}]}`, or `{reason}` / null
 *   when they were not read.
 * @returns {{ version: string, state: string, reason?: string, oldSite: {url: string | null, read: string, pages: number},
 *   demo: {readAt: string | null, pages: number, truncated: boolean} | null,
 *   pages: {from: string, path: string, title: string | null, description: string | null, heading: string | null,
 *     to: {path: string, title: string | null} | null, match: string, redirect: boolean}[],
 *   skipped: {url: string, reason: string, sameAs?: string}[],
 *   counts: {pages: number, matched: number, unmatched: number, skipped: number, byMatch: Record<string, number>}}}
 */
export function oldUrlMap({ website = null, row = null, demo = null } = {}) {
  const read = oldSiteReadOf(row)
  const base = {
    version: URL_MAP_VERSION,
    state: 'ready',
    oldSite: { url: str(website), read: read.state, pages: read.pages.length },
    demo:
      demo && Array.isArray(demo.pages)
        ? { readAt: str(demo.readAt), pages: demo.pages.length, truncated: demo.truncated === true }
        : null,
    pages: [],
    skipped: [],
    counts: emptyCounts()
  }
  let site
  try {
    site = website && !isListingUrl(website) ? new URL(website) : null
  } catch {
    site = null
  }
  if (!site) return { ...base, state: 'no-website' }
  if (read.state === 'none' || read.state === 'failed') return { ...base, state: 'old-site-not-read' }
  if (!base.demo)
    return { ...base, state: 'demo-not-read', ...(str(demo?.reason) ? { reason: str(demo.reason) } : {}) }

  const raw = Array.isArray(row?.collected?.pages) ? row.collected.pages : []
  // The site's own hosts: the website's, and the first page read's (the crawler reads the home page first, after any
  // redirect: a site that moved to a new domain is read there).
  const hosts = new Set([hostOf(site)])
  for (const p of raw) {
    try {
      hosts.add(hostOf(new URL(p?.url)))
      break
    } catch {
      // not an address: skipped below
    }
  }
  const skipped = []
  /** @type {Map<string, any>} one candidate per page key, the plainest address first */
  const byKey = new Map()
  const candidates = []
  for (const p of raw) {
    const url = str(p?.url)
    let u
    try {
      u = url ? new URL(url) : null
    } catch {
      u = null
    }
    if (!u || (u.protocol !== 'http:' && u.protocol !== 'https:')) {
      skipped.push({ url: url ?? '', reason: 'invalid' })
      continue
    }
    if (!hosts.has(hostOf(u))) {
      skipped.push({ url, reason: 'other-host' })
      continue
    }
    const title = str(p.title)
    const query = pageQuery(u)
    const skip = skipOf(u, title, query)
    if (skip) {
      skipped.push({ url, reason: skip })
      continue
    }
    const { parts, languageRoot } = partsOf(u.pathname)
    const search = query.toString()
    const key = `${parts.join('/')}${languageRoot ? '#lang' : ''}?${search}`
    // The plainest address of the page is kept: fewest characters once tracking is gone, https before http.
    const plain = `${u.pathname}${u.search}`.length + (u.protocol === 'https:' ? 0 : 1)
    const candidate = { u, url, title, p, parts, languageRoot, search, key, plain }
    const held = byKey.get(key)
    if (!held) {
      byKey.set(key, candidate)
      candidates.push(candidate)
    } else if (plain < held.plain) {
      skipped.push({ url: held.url, reason: 'duplicate', key })
      candidates[candidates.indexOf(held)] = candidate
      byKey.set(key, candidate)
    } else skipped.push({ url, reason: 'duplicate', key })
  }
  // A duplicate names the address its page is kept under (the plainest one, once every address was seen).
  const listedSkips = skipped.map(({ key, ...s }) =>
    key === undefined ? s : { ...s, sameAs: byKey.get(key).url }
  )

  const siteParts = siteTitleParts(candidates.map((c) => c.title).filter(Boolean))
  const targets = demoTargets(demo)
  const counts = emptyCounts()
  const pages = []
  for (const c of candidates.slice(0, MAX_LISTED)) {
    const words = titleWords(c.title, siteParts)
    const root = c.parts.length === 0 && !c.search
    const role = root ? 'home' : pageRole({ id: c.parts.join('/'), label: words })
    const old = {
      // The site's root, or a page its own address calls home (`/home`, `/homepage`).
      home: role === 'home',
      slug: c.search ? '' : normaliseName(c.parts.at(-1) ?? ''),
      words,
      heading: normaliseName(str(c.p.heading) ?? ''),
      role
    }
    const found = matchOf(old, targets)
    const path = `${c.u.pathname}${c.search ? `?${c.search}` : ''}`
    pages.push({
      from: c.url,
      path,
      title: c.title,
      description: str(c.p.description),
      heading: str(c.p.heading),
      to: found?.to ?? null,
      match: found?.match ?? 'unmatched',
      redirect: Boolean(found) && found.to.path.replace(/\/+$/, '') !== path.replace(/\/+$/, '')
    })
    if (found) {
      counts.matched += 1
      counts.byMatch[found.match] += 1
    } else counts.unmatched += 1
  }
  counts.pages = pages.length
  counts.skipped = listedSkips.length
  return { ...base, state: 'ready', pages, skipped: listedSkips.slice(0, MAX_LISTED), counts }
}

/**
 * One English line an outreach may quote ("12 of your 15 current pages have a matching page on the demo, so their old
 * addresses can lead there."), or null without a ready map or a single match. The number of current pages is said only
 * when research read the whole site; a partial read says how many matched and nothing of the whole.
 * @param {ReturnType<typeof oldUrlMap> | null | undefined} map
 */
export function urlMapProof(map) {
  if (map?.state !== 'ready') return null
  const matched = map.counts?.matched ?? 0
  const all = map.counts?.pages ?? 0
  if (!(matched > 0)) return null
  const whole = map.oldSite?.read === 'complete'
  if (whole && all === 1)
    return 'Your current page has a matching page on the demo, so its old address can lead there.'
  if (whole && matched === all)
    return `All ${all} of your current pages have a matching page on the demo, so their old addresses can lead there.`
  const [verb, theirs] = matched === 1 ? ['has', 'its old address'] : ['have', 'their old addresses']
  return `${matched} of your ${whole ? `${all} ` : ''}current pages ${verb} a matching page on the demo, so ${theirs} can lead there.`
}
