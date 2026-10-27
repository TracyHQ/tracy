import { linkKind } from '../domain/link-kinds.mjs'

/** The sources a research job collects from, in the order it collects them. */
export const SOURCES = Object.freeze(['website', 'facebook', 'instagram', 'tiktok', 'youtube'])
export const SOCIAL_SOURCES = Object.freeze(SOURCES.slice(1))
/** The sources a place's research card lists, in this order: the collected ones, then Google and Tripadvisor. Display only. */
/** The research card's rows: the sources, each network's web search (a place without a website), then Google's. */
export const SHOWN_SOURCES = Object.freeze([
  ...SOURCES,
  'facebook-search',
  'instagram-search',
  'google-places',
  'google-maps',
  'tripadvisor',
  // The Menu: its files and pages, then its photos; a food place's parts only.
  'menu-file',
  'menu-photos'
])

const SOCIAL_HOSTS = [
  ['facebook', /(^|\.)(facebook\.com|fb\.com|fb\.me)$/],
  ['instagram', /(^|\.)(instagram\.com|instagr\.am)$/],
  ['tiktok', /(^|\.)tiktok\.com$/],
  ['youtube', /(^|\.)(youtube\.com|youtu\.be)$/]
]

/** The source of a business's page on a listing or directory site (`link-kinds.mjs` LISTING_HOSTS). */
export const LISTING_SOURCE = 'listing'

/**
 * Which source a URL belongs to: a social network by its host, `listing` for a page on a listing or directory site
 * (magicpin, Tripadvisor, Yelp…: read once, never crawled, never scored as the business's website), else `website`.
 * Null for anything that is not an http(s) URL.
 * @param {string} raw @returns {string | null}
 */
export function sourceOfUrl(raw) {
  let url
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase()
  for (const [source, pattern] of SOCIAL_HOSTS) if (pattern.test(host)) return source
  if (linkKind(url.href)?.kind === 'listing') return LISTING_SOURCE
  return 'website'
}

/** A URL in one spelling: lower-case host, no fragment, no trailing slash on the path. */
export function normalizeUrl(raw) {
  const url = new URL(raw)
  url.hash = ''
  url.hostname = url.hostname.toLowerCase()
  const text = url.toString()
  return url.pathname !== '/' && text.endsWith('/') && !url.search ? text.slice(0, -1) : text
}

/**
 * Two URLs name the same website: one host (`www.` aside) and the same path, or one of them the site's root.
 * Scheme, query and fragment are not compared (Google's `websiteUri` often carries `?utm_source=…`).
 */
export function sameWebsite(a, b) {
  const parts = (raw) => {
    try {
      const u = new URL(raw)
      return { host: u.hostname.toLowerCase().replace(/^www\./, ''), path: u.pathname.replace(/\/+$/, '') }
    } catch {
      return null
    }
  }
  const x = typeof a === 'string' ? parts(a) : null
  const y = typeof b === 'string' ? parts(b) : null
  return Boolean(x && y && x.host === y.host && (x.path === y.path || !x.path || !y.path))
}

/**
 * The refs a candidate names: `{website?, facebook?, …}`, each a normalised URL filed under the
 * source its host says (a Facebook page given as a "website" is the Facebook ref).
 */
export function refsOfCandidate(candidate) {
  return refsOfUrls([candidate?.website, ...SOCIAL_SOURCES.map((s) => candidate?.socials?.[s])])
}

/** Refs of a list of URLs; the first URL of each source wins. */
export function refsOfUrls(urls) {
  const refs = {}
  for (const raw of urls) {
    if (typeof raw !== 'string') continue
    const source = sourceOfUrl(raw)
    if (source && !refs[source]) refs[source] = normalizeUrl(raw)
  }
  return refs
}
