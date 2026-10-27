import { fetchLimited } from './fetch-limited.mjs'
import { searchPhrasesOf, searchTradeOf } from './trade-search.mjs'
import { apifyRunUrl, redactToken } from './apify.mjs'
import { searchRestaurants, socialNetworkOf } from './discovery-osm.mjs'
import { searchRestaurantsGplaces, searchPlacesText, searchAreaGplaces } from './discovery-gplaces.mjs'
import { isListingUrl } from './link-kinds.mjs'

export const GMAPS_ACTOR = 'compass~crawler-google-places'
const RUN_SECS = 120
const MAX_BYTES = 16 * 1024 * 1024
export const DEFAULT_PLACES = 40

// Chat links Google lists as a "website"; they are a way to reach the owner, not a site to crawl.
const MESSAGING_HOSTS = {
  zalo: ['zalo.me'],
  whatsapp: ['wa.me', 'whatsapp.com'],
  messenger: ['m.me'],
  line: ['line.me']
}

export function messagingNetworkOf(url) {
  let host
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
  for (const [net, hosts] of Object.entries(MESSAGING_HOSTS))
    if (hosts.some((h) => host === h || host.endsWith(`.${h}`))) return net
  return null
}

export function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''))
}

export function candidateFromGmaps(p) {
  const name = typeof p?.title === 'string' ? p.title.trim() : ''
  if (!name || !p.placeId || p.permanentlyClosed) return null
  const lat = Number(p.location?.lat)
  const lon = Number(p.location?.lng)
  // Google lists a Facebook page as the "website" of many small restaurants.
  const net = p.website ? socialNetworkOf(p.website) : null
  const chat = p.website && !net ? messagingNetworkOf(p.website) : null
  return compact({
    provider: 'google-maps',
    providerId: p.placeId,
    name,
    address: p.address,
    phone: p.phone,
    lat: Number.isFinite(lat) ? lat : undefined,
    lon: Number.isFinite(lon) ? lon : undefined,
    website: net || chat || isListingUrl(p.website) ? undefined : p.website,
    socials: net ? { [net]: p.website } : {},
    contacts: chat ? { [chat]: p.website } : undefined,
    category: p.categoryName,
    rating: Number.isFinite(p.totalScore) ? p.totalScore : undefined,
    reviews: Number.isFinite(p.reviewsCount) ? p.reviewsCount : undefined,
    imageUrl: p.imageUrl,
    mapsUrl: p.url,
    temporarilyClosed: p.temporarilyClosed === true ? true : undefined
  })
}

/**
 * Google Maps places around a point, through Apify. `trade`: one kind, null = every kind (one phrase each, the
 * place budget split between them: Apify bills per place). Throws {code} so the caller can fall back.
 */
export async function searchRestaurantsGmaps(
  { lat, lon, radiusM, limit = DEFAULT_PLACES, trade = 'food' },
  deps = {}
) {
  const { token } = deps
  const phrases = searchPhrasesOf(trade)
  if (!token) throw Object.assign(new Error('no token'), { code: 'CREDENTIAL_MISSING' })
  let res
  try {
    res = await fetchLimited(
      apifyRunUrl(GMAPS_ACTOR, { runSecs: RUN_SECS, maxChargeUsd: deps.maxChargeUsd }),
      {
        fetch: deps.fetch,
        resolve: deps.resolve,
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          searchStringsArray: phrases,
          customGeolocation: {
            type: 'Point',
            coordinates: [Number(lon), Number(lat)],
            radiusKm: Math.max(0.1, Number(radiusM) / 1000)
          },
          maxCrawledPlacesPerSearch: Math.max(1, Math.floor(limit / phrases.length)),
          language: 'en',
          skipClosedPlaces: true,
          scrapePlaceDetailPage: false
        }),
        maxBytes: MAX_BYTES,
        timeoutMs: deps.timeoutMs ?? (RUN_SECS + 20) * 1000
      }
    )
  } catch (err) {
    throw Object.assign(new Error(redactToken(err?.message, token)), {
      code: err?.code === 'TIMEOUT' ? 'TIMEOUT' : 'PROVIDER_ERROR'
    })
  }
  if (res.status === 402) throw Object.assign(new Error('quota'), { code: 'QUOTA', status: 402 })
  if (res.status < 200 || res.status >= 300)
    throw Object.assign(new Error(`HTTP ${res.status}`), { code: 'PROVIDER_ERROR', status: res.status })
  let items
  try {
    items = JSON.parse(new TextDecoder().decode(res.bytes))
  } catch {
    throw Object.assign(new Error('invalid JSON from provider'), { code: 'PROVIDER_ERROR' })
  }
  const found = (Array.isArray(items) ? items : []).map(candidateFromGmaps).filter(Boolean)
  return trade === 'food' ? found : found.map((c) => ({ ...c, trade: trade ?? 'other' }))
}

// Paid tiers in order; `key` names the credential a tier needs, and auto skips a tier without it.
const TIERS = {
  google: { provider: 'google-places', key: 'googleKey', search: searchRestaurantsGplaces },
  apify: { provider: 'google-maps', key: 'token', search: searchRestaurantsGmaps }
}
const CHAINS = { auto: ['google', 'apify'], google: ['google'], apify: ['apify'], osm: [] }

/**
 * deps.provider picks the chain: 'auto' (default) = Places → Apify → OSM, skipping tiers without a key;
 * 'google' / 'apify' = that tier then OSM; 'osm' = OSM only.
 * deps.filters ({trade, kinds, cuisines, minRating, priceLevels, openNow}) adds `pages`: food (or no `trade`) runs Places Text
 * Search; `any` or another kind (`trade-search.mjs`) runs one Places Nearby call, and narrows Apify and OSM the same way.
 * Returns {provider, candidates, pages?, fallbackFrom?}; fallbackFrom names the first tier that failed.
 */
export async function discoverRestaurants(area, deps = {}) {
  const choice = Object.hasOwn(CHAINS, deps.provider ?? '') ? deps.provider : 'auto'
  const trade = deps.filters?.trade === undefined ? 'food' : searchTradeOf(deps.filters.trade)
  const asked = deps.limit === undefined ? area : { ...area, limit: deps.limit }
  const query = trade === 'food' ? asked : { ...asked, trade }
  let fallbackFrom
  for (const id of CHAINS[choice]) {
    const tier = TIERS[id]
    if (choice === 'auto' && !deps[tier.key]) continue
    try {
      // Find places v2: with filters, Places runs Text Search for food (paged, billed per page) and one Nearby call
      // for any other kind or for every kind (`trade` absent = food, as before kinds of business existed).
      const found =
        id !== 'google' || !deps.filters
          ? { candidates: await tier.search(query, deps) }
          : (deps.filters.trade ?? 'food') === 'food'
            ? await searchPlacesText({ ...deps.filters, ...query }, deps)
            : await searchAreaGplaces({ ...deps.filters, ...query }, deps)
      return { provider: tier.provider, ...found, ...(fallbackFrom ? { fallbackFrom } : {}) }
    } catch (err) {
      fallbackFrom ??= { provider: tier.provider, code: err?.code ?? 'PROVIDER_ERROR' }
    }
  }
  const candidates = await searchRestaurants(query, deps)
  return fallbackFrom ? { provider: 'osm', candidates, fallbackFrom } : { provider: 'osm', candidates }
}
