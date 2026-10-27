/**
 * A business's page on a listing or directory site (magicpin, Tripadvisor, Yelp… `link-kinds.mjs` LISTING_HOSTS):
 * one limited fetch of THAT page only, never a crawl of the directory. Only the JSON-LD node that describes the
 * business is read (a LocalBusiness type, never the directory's own Organization), and its `sameAs` and the page's
 * links are ignored: they are the directory's, not the business's.
 */
import { fetchLimited } from './fetch-limited.mjs'
import { businessFromLd, businessNodeOf, ldBlocksOf } from './website-crawler.mjs'

const MAX_BYTES = 1536 * 1024
/** Path words of listing URLs that are not part of the business's name. */
const NOT_NAME = new Set([
  'store',
  'biz',
  'place',
  'places',
  'restaurant',
  'restaurants',
  'listing',
  'p',
  'b'
])

const num = (v) => {
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? n : undefined
}

const PLATFORMS = /^[a-z][a-z0-9_-]{1,30}$/

/**
 * The star rating a Next.js listing page carries in its page data when its JSON-LD states none (#1780). magicpin
 * (26/10/2026, Harbour Sport Club) shows "5.0 (16)" in its header, and its data says whose rating that is: its own
 * `merchantData.rating` and `totalRatingCount` are 0, and `ratingsByPlatform.google` (also `googleRatingInfo`) is
 * `{rating: 5, count: 16}`. The listing's own rating wins when it has one; else the platform's rating it shows,
 * with `ratingOf` naming that platform. Pure; null when the page holds none.
 * @param {string} html
 * @returns {null | { rating: number, reviews: number, ratingOf?: string }}
 */
export function listingRatingOfNextData(html) {
  const m = /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(String(html ?? ''))
  if (!m) return null
  let data
  try {
    data = JSON.parse(m[1])
  } catch {
    return null
  }
  const merchant = data?.props?.pageProps?.merchantData
  if (!merchant || typeof merchant !== 'object') return null
  const valid = (rating, count) =>
    rating !== undefined &&
    rating > 0 &&
    rating <= 5 &&
    count !== undefined &&
    count > 0 &&
    Number.isInteger(count)
  const own = [num(merchant.rating), num(merchant.totalRatingCount)]
  if (valid(...own)) return { rating: own[0], reviews: own[1] }
  const platforms = Object.entries(merchant.ratingsByPlatform ?? {})
    .filter(([name, r]) => PLATFORMS.test(name) && r && typeof r === 'object')
    .map(([name, r]) => [name, num(r.rating), num(r.count)])
  if (merchant.googleRatingInfo && !platforms.some(([name]) => name === 'google'))
    platforms.push(['google', num(merchant.googleRatingInfo.rating), num(merchant.googleRatingInfo.count)])
  const shown = platforms
    .filter(([, r, c]) => valid(r, c))
    .sort(([a], [b]) => (a === 'google' ? -1 : b === 'google' ? 1 : 0))[0]
  return shown ? { rating: shown[1], reviews: shown[2], ratingOf: shown[0] } : null
}

/**
 * A rating a listing page shows of ANOTHER platform (`ratingOf`), set against that platform's own rating Tracy holds
 * (pure): `copy` when they agree (the copy is dropped, the direct rating stands), `conflict` when they differ (neither is
 * a statistic: one of them is out of date and nothing says which), null when the rating is the listing's own or Tracy
 * holds no direct rating of that platform.
 * @param {{rating?: number, reviews?: number, ratingOf?: string} | null} listing the listing page's facts
 * @param {{rating: number, reviews?: number | null} | null} direct that platform's rating, read from it directly
 * @returns {'copy' | 'conflict' | null}
 */
export function copiedRatingVerdict(listing, direct) {
  if (!listing?.ratingOf || typeof listing.rating !== 'number') return null
  if (!direct || typeof direct.rating !== 'number') return null
  const sameScore = Math.abs(listing.rating - direct.rating) < 0.05
  const counts = [listing.reviews, direct.reviews].filter((n) => Number.isInteger(n))
  const sameCount = counts.length < 2 || counts[0] === counts[1]
  return sameScore && sameCount ? 'copy' : 'conflict'
}

/**
 * The business facts a listing page's JSON-LD states, or null when it holds no business node. The star rating comes
 * from the business node, else from the page data (`listingRatingOfNextData`), with `ratingOf` when it is another
 * platform's rating the listing shows.
 * @param {string} html
 * @returns {null | { name?: string, address?: string, telephone?: string, category?: string, hours?: string[],
 *   geo?: { lat: number, lng: number }, rating?: number, reviews?: number, ratingOf?: string }}
 */
export function listingFromHtml(html) {
  const blocks = ldBlocksOf(html)
  const found = businessNodeOf(blocks)
  if (!found) return null
  const facts = businessFromLd(blocks)
  const node = found.node
  const lat = num(node.geo?.latitude)
  const lng = num(node.geo?.longitude)
  const rating = num(node.aggregateRating?.ratingValue)
  const reviews = num(node.aggregateRating?.reviewCount ?? node.aggregateRating?.ratingCount)
  /** @type {any} */
  const out = {}
  if (facts?.name) out.name = facts.name.slice(0, 200)
  if (facts?.address) out.address = facts.address.slice(0, 500)
  if (facts?.telephone) out.telephone = facts.telephone.slice(0, 60)
  if (facts?.type) out.category = facts.type
  // The hours the listing states: a second source a business's hours can be confirmed by (`hours-check.mjs`).
  const hours = (facts?.openingHours ?? []).filter((h) => typeof h === 'string' && h.trim()).slice(0, 14)
  if (hours.length) out.hours = hours.map((h) => h.trim().slice(0, 120))
  if (lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180)
    out.geo = { lat, lng }
  if (rating !== undefined && rating >= 0 && rating <= 5) out.rating = rating
  if (reviews !== undefined && reviews >= 0) out.reviews = Math.round(reviews)
  if (out.rating === undefined) {
    const shown = listingRatingOfNextData(html)
    if (shown) Object.assign(out, shown)
  }
  return out
}

/**
 * A low-confidence name read from a listing URL's path: the words before `/store/`, after `/biz/`, else the last
 * path segment that is not a number (`…/Fitness/Padel-and-Tennis-Coach/store/1000001` → "Padel and Tennis Coach").
 * @param {string} url
 * @returns {string | null}
 */
export function nameHintOfListingUrl(url) {
  let parts
  try {
    parts = new URL(url).pathname.split('/').filter(Boolean).map(decodeURIComponent)
  } catch {
    return null
  }
  const at = parts.findIndex((p) => p.toLowerCase() === 'store')
  const after = parts.findIndex((p) => p.toLowerCase() === 'biz')
  const pick =
    at > 0
      ? parts[at - 1]
      : after >= 0 && parts[after + 1]
        ? parts[after + 1]
        : [...parts].reverse().find((p) => !/^\d+$/.test(p) && !NOT_NAME.has(p.toLowerCase()))
  if (!pick) return null
  const words = pick
    .replace(/\.[a-z]{2,5}$/i, '')
    .replace(/[-_+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return words.length >= 2 ? words.slice(0, 200) : null
}

/**
 * Read one listing page. Never throws: a page that blocks, fails or states no business answers
 * `{ok: false, reason, nameHint}` with the name its URL suggests.
 * @param {string} url
 * @param {{ fetch: typeof fetch, resolve?: Function, timeoutMs?: number }} deps
 * @returns {Promise<{ ok: true, facts: object } | { ok: false, reason: string, nameHint: string | null }>}
 */
export async function readListingPage(url, deps = {}) {
  const nameHint = nameHintOfListingUrl(url)
  try {
    const got = await fetchLimited(url, {
      fetch: deps.fetch,
      resolve: deps.resolve,
      maxBytes: MAX_BYTES,
      timeoutMs: deps.timeoutMs ?? 10_000,
      headers: { accept: 'text/html' }
    })
    if (got.status === 401 || got.status === 403 || got.status === 429)
      return { ok: false, reason: 'blocked', nameHint }
    if (got.status < 200 || got.status >= 300) return { ok: false, reason: `http_${got.status}`, nameHint }
    const facts = listingFromHtml(new TextDecoder().decode(got.bytes))
    if (!facts || !facts.name) return { ok: false, reason: 'no_business', nameHint }
    return { ok: true, facts }
  } catch (error) {
    return { ok: false, reason: error?.code === 'URL_BLOCKED' ? 'not_public' : 'fetch_failed', nameHint }
  }
}
