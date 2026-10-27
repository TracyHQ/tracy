import { fetchLimited } from './fetch-limited.mjs'
import { redactToken } from './apify.mjs'
import { socialNetworkOf } from './discovery-osm.mjs'
import { compact, messagingNetworkOf } from './discovery-gmaps.mjs'
import { distanceM } from './dedupe.mjs'
import { KINDS, kindOfPrimaryType, cuisineOfPrimaryType, primaryTypeOfCuisine } from './place-kinds.mjs'
import { tradeOfPlace } from './trades.mjs'
import { googleTypesOf } from './trade-search.mjs'
import { linkKind } from './link-kinds.mjs'

export const GPLACES_URL = 'https://places.googleapis.com/v1/places:searchNearby'
export const GPLACES_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText'
export const GPLACES_AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete'
const MAX_RESULTS = 20
const MAX_TEXT_RESULTS = 60
const MAX_RADIUS_M = 50_000
const MAX_BYTES = 2 * 1024 * 1024

// Google bills a call at the priciest field it asks for; Atmosphere fields (reviews, serves*, editorialSummary…) are the top tier.
export const GPLACES_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'websiteUri',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'rating',
  'userRatingCount',
  'businessStatus',
  'googleMapsUri',
  'primaryTypeDisplayName'
]
  .map((f) => `places.${f}`)
  .join(',')
// Text Search adds Pro/Enterprise fields the Find table shows (still nothing from Atmosphere) and the page token.
export const GPLACES_TEXT_FIELDS = `${GPLACES_FIELDS},places.primaryType,places.priceLevel,places.currentOpeningHours.openNow,places.photos,nextPageToken`

export function candidateFromGplaces(p) {
  const name = typeof p?.displayName?.text === 'string' ? p.displayName.text.trim() : ''
  if (!name || !p.id || p.businessStatus === 'CLOSED_PERMANENTLY') return null
  const lat = Number(p.location?.latitude)
  const lon = Number(p.location?.longitude)
  const site = typeof p.websiteUri === 'string' ? p.websiteUri : undefined
  const net = site ? socialNetworkOf(site) : null
  const chat = site && !net ? messagingNetworkOf(site) : null
  // A directory page Google records as the website (magicpin, Tripadvisor…) is no website of the business: the
  // place counts as having none, and the page is never crawled or scored as theirs.
  const listing = site && !net && !chat && linkKind(site)?.kind === 'listing' ? site : undefined
  return compact({
    provider: 'google-places',
    providerId: p.id,
    name,
    address: p.formattedAddress,
    phone: p.internationalPhoneNumber || p.nationalPhoneNumber,
    lat: Number.isFinite(lat) ? lat : undefined,
    lon: Number.isFinite(lon) ? lon : undefined,
    website: net || chat || listing ? undefined : site,
    socials: net ? { [net]: site } : {},
    contacts: chat ? { [chat]: site } : undefined,
    listings: listing ? [{ url: listing, source: linkKind(listing)?.source }] : undefined,
    category: p.primaryTypeDisplayName?.text,
    rating: Number.isFinite(p.rating) ? p.rating : undefined,
    reviews: Number.isFinite(p.userRatingCount) ? p.userRatingCount : undefined,
    mapsUrl: p.googleMapsUri,
    temporarilyClosed: p.businessStatus === 'CLOSED_TEMPORARILY' ? true : undefined
  })
}

const fail = (code, message, extra) => Object.assign(new Error(message), { code, ...extra })

// One Places (New) POST; throws {code} with the key redacted so the caller can fall back.
async function callPlaces(url, body, fieldMask, deps, method = 'POST') {
  const key = deps.googleKey
  if (!key) throw fail('CREDENTIAL_MISSING', 'no Google key')
  let res
  try {
    res = await fetchLimited(url, {
      fetch: deps.fetch,
      resolve: deps.resolve,
      method,
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': fieldMask },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      maxBytes: MAX_BYTES,
      timeoutMs: deps.timeoutMs ?? 15_000
    })
  } catch (err) {
    throw fail(err?.code === 'TIMEOUT' ? 'TIMEOUT' : 'PROVIDER_ERROR', redactToken(err?.message, key))
  }
  const text = new TextDecoder().decode(res.bytes)
  if (res.status === 429 || (res.status === 403 && /quota|billing/i.test(text)))
    throw fail('QUOTA', 'quota', { status: res.status })
  if (res.status < 200 || res.status >= 300)
    throw fail('PROVIDER_ERROR', `HTTP ${res.status}`, { status: res.status })
  try {
    return JSON.parse(text)
  } catch {
    throw fail('PROVIDER_ERROR', 'invalid JSON from provider')
  }
}

const clampRadius = (r) => Math.max(1, Math.min(MAX_RADIUS_M, Number(r) || 1000))
const EARTH_R = 6_371_000

// Text Search restricts by rectangle only: the box around the circle; latitude clamps at the poles, longitude wraps
// (low > high is how the Viewport type crosses the antimeridian). The distance post-filter trims the corners.
function boundingBox(lat, lon, radius) {
  const dLat = (radius / EARTH_R) * (180 / Math.PI)
  const cos = Math.cos((lat * Math.PI) / 180)
  const dLon = cos > 1e-9 ? Math.min(180, dLat / cos) : 180
  const wrap = (x) => ((((x + 180) % 360) + 360) % 360) - 180
  return {
    low: { latitude: Math.max(-90, lat - dLat), longitude: wrap(lon - dLon) },
    high: { latitude: Math.min(90, lat + dLat), longitude: wrap(lon + dLon) }
  }
}

/**
 * Google Places (New) Nearby Search, one call. Throws {code} so the caller can fall back.
 * Area searches rank by DISTANCE: POPULARITY fills the 20 slots with famous places that already have a site.
 */
export async function searchRestaurantsGplaces({ lat, lon, radiusM, limit = MAX_RESULTS }, deps = {}) {
  const data = await callPlaces(
    GPLACES_URL,
    {
      includedTypes: ['restaurant'],
      maxResultCount: Math.max(1, Math.min(MAX_RESULTS, Number(limit) || MAX_RESULTS)),
      locationRestriction: {
        circle: { center: { latitude: Number(lat), longitude: Number(lon) }, radius: clampRadius(radiusM) }
      },
      rankPreference: 'DISTANCE'
    },
    GPLACES_FIELDS,
    deps
  )
  return (Array.isArray(data?.places) ? data.places : []).map(candidateFromGplaces).filter(Boolean)
}

// ---------- Text Search (New): the Find places v2 query ----------

const KIND_QUERY = {
  restaurants: 'restaurant',
  cafes: 'cafe',
  'fast-food': 'fast food',
  bakeries: 'bakery',
  bars: 'bar',
  nightlife: 'night club'
}
const KIND_TYPE = {
  restaurants: 'restaurant',
  cafes: 'cafe',
  'fast-food': 'fast_food_restaurant',
  bakeries: 'bakery',
  bars: 'bar',
  nightlife: 'night_club'
}
const PRICE_LEVELS = [
  'PRICE_LEVEL_FREE',
  'PRICE_LEVEL_INEXPENSIVE',
  'PRICE_LEVEL_MODERATE',
  'PRICE_LEVEL_EXPENSIVE',
  'PRICE_LEVEL_VERY_EXPENSIVE'
]

const priceLevelOf = (v) => (PRICE_LEVELS.includes(v) ? PRICE_LEVELS.indexOf(v) : null)

// FREE is not accepted in a request; numbers are the 1–4 scale the form uses.
function priceLevelsParam(levels) {
  const out = []
  for (const v of Array.isArray(levels) ? levels : []) {
    const name = typeof v === 'number' ? PRICE_LEVELS[v] : v
    if (name && PRICE_LEVELS.indexOf(name) > 0 && !out.includes(name)) out.push(name)
  }
  return out
}

/** The Nearby candidate plus what the Find table shows; `origin` gives distanceM. Null for closed or nameless places. */
export function textCandidateFromGplaces(p, origin) {
  const base = candidateFromGplaces(p)
  if (!base) return null
  const primaryType = typeof p.primaryType === 'string' ? p.primaryType : null
  const first = Array.isArray(p.photos) ? p.photos[0] : null
  const credit = first?.authorAttributions?.[0]?.displayName
  return {
    ...base,
    primaryType,
    kind: kindOfPrimaryType(primaryType),
    cuisine: cuisineOfPrimaryType(primaryType),
    distanceM:
      Number.isFinite(base.lat) && Number.isFinite(base.lon) ? Math.round(distanceM(origin, base)) : null,
    priceLevel: priceLevelOf(p.priceLevel),
    openNow: typeof p.currentOpeningHours?.openNow === 'boolean' ? p.currentOpeningHours.openNow : null,
    photo:
      typeof first?.name === 'string'
        ? { name: first.name, credit: typeof credit === 'string' && credit ? credit : null }
        : null
  }
}

/**
 * Google Places (New) Text Search around a point, one billable call per page of 20, up to `limit` (≤ 60).
 * Kinds/cuisines shape the query; Google filters rating, price, open-now and the bounding box; radius, kind and cuisine are re-checked here.
 * `maxPages` caps the billed calls (the public Find asks for exactly one). Returns {candidates, pages}. Throws {code} like Nearby.
 */
export async function searchPlacesText(
  {
    lat,
    lon,
    radiusM,
    limit = MAX_RESULTS,
    maxPages = MAX_TEXT_RESULTS / MAX_RESULTS,
    kinds,
    cuisines,
    minRating,
    priceLevels,
    openNow
  },
  deps = {}
) {
  const picked = (Array.isArray(kinds) ? kinds : []).filter((k) => KINDS.includes(k))
  // Every kind = no kind filter: one text query naming all six makes Google return loose matches and no next page.
  const wantKinds = KINDS.every((k) => picked.includes(k)) ? [] : picked
  const wantCuisines = (Array.isArray(cuisines) ? cuisines : []).filter((c) => primaryTypeOfCuisine(c))
  const includedType =
    wantCuisines.length === 1
      ? primaryTypeOfCuisine(wantCuisines[0])
      : !wantCuisines.length && wantKinds.length === 1
        ? KIND_TYPE[wantKinds[0]]
        : undefined
  const textQuery = wantCuisines.length
    ? `${wantCuisines.join(' ')} restaurant`
    : wantKinds.length
      ? wantKinds.map((k) => KIND_QUERY[k]).join(' ')
      : 'restaurant cafe bar'
  const prices = priceLevelsParam(priceLevels)
  const radius = clampRadius(radiusM)
  const body = compact({
    textQuery,
    includedType,
    locationRestriction: { rectangle: boundingBox(Number(lat), Number(lon), radius) },
    minRating: Number.isFinite(minRating) && minRating > 0 ? Math.min(5, minRating) : undefined,
    priceLevels: prices.length ? prices : undefined,
    openNow: openNow === true ? true : undefined,
    pageSize: MAX_RESULTS,
    rankPreference: 'RELEVANCE'
  })
  const want = Math.max(1, Math.min(MAX_TEXT_RESULTS, Number(limit) || MAX_RESULTS))
  const raw = []
  let pages = 0
  let pageToken
  do {
    const data = await callPlaces(
      GPLACES_TEXT_URL,
      pageToken ? { ...body, pageToken } : body,
      GPLACES_TEXT_FIELDS,
      deps
    )
    pages += 1
    if (Array.isArray(data?.places)) raw.push(...data.places)
    pageToken = typeof data?.nextPageToken === 'string' && data.nextPageToken ? data.nextPageToken : undefined
  } while (pageToken && raw.length < want && pages * MAX_RESULTS < MAX_TEXT_RESULTS && pages < maxPages)
  const origin = { lat: Number(lat), lon: Number(lon) }
  const candidates = raw
    .map((p) => textCandidateFromGplaces(p, origin))
    .filter((c) => c && c.kind && c.distanceM !== null && c.distanceM <= radius)
    .filter((c) => !wantKinds.length || wantKinds.includes(c.kind))
    .filter((c) => !wantCuisines.length || wantCuisines.includes(c.cuisine))
    .slice(0, want)
  return { candidates, pages }
}

// Primary types that are never a business selling to the public (Google also checks them, as excludedPrimaryTypes).
const NOT_A_BUSINESS = [
  'shopping_mall',
  'department_store',
  'supermarket',
  'hypermarket',
  'hospital',
  'general_hospital',
  'school',
  'primary_school',
  'secondary_school',
  'university',
  'library',
  'government_office',
  'local_government_office',
  'city_hall',
  'courthouse',
  'embassy',
  'police',
  'post_office',
  'church',
  'mosque',
  'synagogue',
  'hindu_temple',
  'buddhist_temple',
  'bank',
  'atm',
  'gas_station',
  'parking',
  'tourist_attraction',
  'museum',
  'park'
]
const NEARBY_FIELDS = `${GPLACES_TEXT_FIELDS.replace(',nextPageToken', '')},places.types`

/**
 * Every local business around a point, or one kind of them (`trade-search.mjs`): one Google Nearby call (at most 20
 * places, Google's cap for Nearby, which has no next page). Rating, price and open-now are checked here, since Nearby
 * takes no such filter. Each candidate carries its `trade`. Returns {candidates, pages: 1}. Throws {code} like the rest.
 */
export async function searchAreaGplaces(
  { lat, lon, radiusM, trade = null, minRating, priceLevels, openNow },
  deps = {}
) {
  const radius = clampRadius(radiusM)
  const data = await callPlaces(
    GPLACES_URL,
    {
      includedTypes: googleTypesOf(trade),
      excludedPrimaryTypes: NOT_A_BUSINESS,
      maxResultCount: MAX_RESULTS,
      locationRestriction: { circle: { center: { latitude: Number(lat), longitude: Number(lon) }, radius } },
      rankPreference: 'DISTANCE'
    },
    NEARBY_FIELDS,
    deps
  )
  const origin = { lat: Number(lat), lon: Number(lon) }
  const prices = priceLevelsParam(priceLevels).map((p) => PRICE_LEVELS.indexOf(p))
  const candidates = (Array.isArray(data?.places) ? data.places : [])
    .filter((p) => !NOT_A_BUSINESS.includes(p.primaryType))
    .map((p) => {
      const c = textCandidateFromGplaces(p, origin)
      if (!c) return null
      const found = tradeOfPlace({ primaryType: c.primaryType, types: p.types, kind: c.kind })
      return { ...c, trade: found === 'other' && trade ? trade : found }
    })
    .filter((c) => c && (c.distanceM === null || c.distanceM <= radius))
    .filter(
      (c) =>
        !(Number.isFinite(minRating) && minRating > 0) || (Number.isFinite(c.rating) && c.rating >= minRating)
    )
    .filter((c) => !prices.length || prices.includes(c.priceLevel))
    .filter((c) => openNow !== true || c.openNow === true)
  return { candidates, pages: 1 }
}

const GEOGRAPHIC =
  /^(locality|sublocality|neighborhood|administrative_area_level_\d|country|postal_code|route|street_address|premise|geocode|political)$/

/**
 * A name/address query is never replaced by a generic nearby query or restricted to an inferred circle.
 * `anyKind`: every trade is kept, each with its `trade` (`trades.mjs`): a customer looking for their own business
 * (Add site), or a Find that is not narrowed to food and drink.
 */
export async function searchNamedPlaces(
  { query, placeId, sessionToken, limit = 20, minRating, priceLevels, openNow, anyKind = false },
  deps = {}
) {
  const fields = anyKind ? `${GPLACES_TEXT_FIELDS},places.types` : GPLACES_TEXT_FIELDS
  const mask = fields.split(',').filter((f) => f !== 'nextPageToken')
  const data = placeId
    ? {
        places: [
          await callPlaces(
            `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}${sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : ''}`,
            undefined,
            mask.map((f) => f.replace(/^places\./, '')).join(','),
            deps,
            'GET'
          )
        ]
      }
    : await callPlaces(
        GPLACES_TEXT_URL,
        compact({
          textQuery: String(query).trim(),
          pageSize: Math.max(1, Math.min(20, limit)),
          minRating: Number.isFinite(minRating) && minRating > 0 ? minRating : undefined,
          priceLevels: priceLevelsParam(priceLevels).length ? priceLevelsParam(priceLevels) : undefined,
          openNow: openNow === true ? true : undefined,
          rankPreference: 'RELEVANCE'
        }),
        fields,
        deps
      )
  const raw = Array.isArray(data?.places) ? data.places : []
  const first = raw.find(
    (p) => Number.isFinite(p.location?.latitude) && Number.isFinite(p.location?.longitude)
  )
  const center = first
    ? { lat: first.location.latitude, lon: first.location.longitude, label: String(query).trim() }
    : null
  // Google may resolve a bare city to a geographic place. Only an explicit geographic type opens nearby discovery.
  const area =
    !placeId &&
    first &&
    /^(locality|sublocality|neighborhood|administrative_area_level_[12])$/.test(first.primaryType ?? '')
      ? center
      : null
  const candidates = raw
    .map((p) => {
      const c = textCandidateFromGplaces(
        p,
        p.location ? { lat: p.location.latitude, lon: p.location.longitude } : { lat: 0, lon: 0 }
      )
      return c && anyKind
        ? { ...c, trade: tradeOfPlace({ primaryType: c.primaryType, types: p.types, kind: c.kind }) }
        : c
    })
    // A town or a street is where a business is, never the business itself.
    .filter(
      (c) =>
        c &&
        (c.kind || (anyKind && !GEOGRAPHIC.test(c.primaryType ?? ''))) &&
        (!placeId || c.providerId === placeId)
    )
    .map((c) => ({ ...c, distanceM: null }))
  return { center, area, candidates, pages: 1, provider: 'google-places' }
}

// ---------- Autocomplete (New): the Find box's place suggestions ----------

/** Retained for area-only callers; the unified Find box also accepts businesses and addresses. */
export const SUGGEST_PRIMARY_TYPES = [
  'locality',
  'sublocality',
  'administrative_area_level_1',
  'administrative_area_level_2',
  'neighborhood'
]
const SUGGEST_FIELDS =
  'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types'
const MAX_SUGGESTIONS = 5
const textOf = (v) => (typeof v?.text === 'string' && v.text.trim() ? v.text.trim() : null)

/**
 * One Autocomplete (New) call; `sessionToken` groups the keystrokes and the pick into one billed session.
 * Returns [{placeId, text, mainText, secondaryText, types}]. Throws {code} like the searches.
 */
export async function suggestPlaces({ input, sessionToken, language }, deps = {}) {
  const lang = typeof language === 'string' && language.trim() ? language.trim() : undefined
  const data = await callPlaces(
    GPLACES_AUTOCOMPLETE_URL,
    compact({
      input: String(input ?? '').trim(),
      sessionToken: typeof sessionToken === 'string' && sessionToken ? sessionToken : undefined,
      languageCode: lang
    }),
    SUGGEST_FIELDS,
    { timeoutMs: 5_000, ...deps }
  )
  const out = []
  for (const s of Array.isArray(data?.suggestions) ? data.suggestions : []) {
    const p = s?.placePrediction
    const text = textOf(p?.text)
    if (typeof p?.placeId !== 'string' || !p.placeId || !text) continue
    out.push({
      placeId: p.placeId,
      text,
      mainText: textOf(p.structuredFormat?.mainText) ?? text,
      secondaryText: textOf(p.structuredFormat?.secondaryText),
      types: Array.isArray(p.types) ? p.types.filter((t) => typeof t === 'string' && t) : []
    })
    if (out.length === MAX_SUGGESTIONS) break
  }
  return out
}
