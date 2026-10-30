import { fetchLimited } from './fetch-limited.mjs'
import { redactToken } from './apify.mjs'
import { sniffMime } from './media.mjs'
import { withProviderRetry } from './provider-retry.mjs'

const API = 'https://places.googleapis.com/v1/'
const DETAILS_MAX_BYTES = 2 * 1024 * 1024
const PHOTO_MAX_BYTES = 25 * 1024 * 1024
// What Place Details (New) returns at most: every review and photo the call paid for is kept.
const MAX_REVIEWS = 5
const MAX_PHOTOS = 10
// A review is quoted word for word, so its text is kept whole up to what QA reads (10,000 characters).
const REVIEW_TEXT_MAX = 10_000

const AMENITIES = [
  'servesBreakfast',
  'servesBrunch',
  'servesLunch',
  'servesDinner',
  'servesBeer',
  'servesWine',
  'servesCocktails',
  'servesCoffee',
  'servesDessert',
  'servesVegetarianFood',
  'outdoorSeating',
  'liveMusic',
  'delivery',
  'takeout',
  'dineIn',
  'goodForChildren',
  'goodForGroups',
  'allowsDogs',
  // Attributes any trade can have, not only food and drink (Place Details Enterprise + Atmosphere, like the above).
  'restroom',
  'goodForWatchingSports',
  'curbsidePickup'
]

/**
 * Google's grouped attributes (Places API (New) `AccessibilityOptions`, `ParkingOptions`, `PaymentOptions`), each
 * sub-field a boolean that reads as one amenity: a gym, a clinic or a shop has them as much as a restaurant.
 * `accessibilityOptions` is a Pro field; the call already bills at Enterprise + Atmosphere, so none costs more.
 */
const AMENITY_GROUPS = {
  accessibilityOptions: [
    'wheelchairAccessibleEntrance',
    'wheelchairAccessibleParking',
    'wheelchairAccessibleRestroom',
    'wheelchairAccessibleSeating'
  ],
  parkingOptions: [
    'freeParkingLot',
    'paidParkingLot',
    'freeStreetParking',
    'paidStreetParking',
    'valetParking',
    'freeGarageParking',
    'paidGarageParking'
  ],
  paymentOptions: ['acceptsCreditCards', 'acceptsDebitCards', 'acceptsCashOnly', 'acceptsNfc']
}

// One Atmosphere-tier call per researched place, never per search result. `websiteUri` is the place's own
// website as Google records it: the shared research starts from it, never from a website a client sent.
export const GPLACES_DETAIL_FIELDS = [
  'id',
  'displayName',
  'websiteUri',
  'formattedAddress',
  'location',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'addressComponents',
  'editorialSummary',
  'generativeSummary',
  'reviewSummary',
  'reviews',
  'photos',
  'regularOpeningHours',
  'priceLevel',
  'priceRange',
  'reservable',
  'primaryType',
  'types',
  // Enterprise fields: the Atmosphere fields above already bill this call at Enterprise + Atmosphere, so they cost
  // nothing more. A place added by its link has no search listing to carry Google's rating.
  'rating',
  'userRatingCount',
  ...AMENITIES,
  ...Object.keys(AMENITY_GROUPS)
].join(',')

const fail = (code, message, extra) => Object.assign(new Error(message), { code, ...extra })
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const local = (v) => text(v?.text)

/** One authenticated call to the Places API; returns the parsed JSON or throws {code} (with `status`, `retryAfter`). */
async function placesCall(url, headers, deps) {
  const key = deps.googleKey
  if (!key) throw fail('CREDENTIAL_MISSING', 'no Google key')
  let res
  try {
    res = await fetchLimited(url, {
      fetch: deps.fetch,
      resolve: deps.resolve,
      headers: { 'X-Goog-Api-Key': key, ...headers },
      maxBytes: DETAILS_MAX_BYTES,
      timeoutMs: deps.timeoutMs ?? 15_000
    })
  } catch (err) {
    throw fail(err?.code === 'TIMEOUT' ? 'TIMEOUT' : 'PROVIDER_ERROR', redactToken(err?.message, key))
  }
  const body = new TextDecoder().decode(res.bytes)
  if (res.status === 429 || (res.status === 403 && /quota|billing/i.test(body)))
    throw fail('QUOTA', 'quota', { status: res.status, retryAfter: res.retryAfter ?? null })
  if (res.status < 200 || res.status >= 300)
    throw fail('PROVIDER_ERROR', `HTTP ${res.status}`, {
      status: res.status,
      retryAfter: res.retryAfter ?? null
    })
  try {
    return JSON.parse(body)
  } catch {
    throw fail('PROVIDER_ERROR', 'invalid JSON from provider')
  }
}

/** Place Details (New) with the Atmosphere field mask. `deps.language` sets `languageCode`. */
export async function fetchPlaceDetails(placeId, deps = {}) {
  if (!deps.googleKey) throw fail('CREDENTIAL_MISSING', 'no Google key')
  if (typeof placeId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(placeId))
    throw fail('PROVIDER_ERROR', 'invalid place id')
  const url = new URL(`places/${placeId}`, API)
  if (text(deps.language)) url.searchParams.set('languageCode', deps.language.trim())
  // The research's one Details call (reviews, amenities): a 429 or transient 5xx is tried again within a few seconds
  // (`provider-retry.mjs`, `deps.retry` overrides its defaults); the last answer's code stands.
  return withProviderRetry(
    () => placesCall(url.href, { 'X-Goog-FieldMask': GPLACES_DETAIL_FIELDS }, deps),
    deps.retry
  )
}

/**
 * The place's website as Google records it, asked with the `websiteUri` field mask ONLY (the Enterprise SKU,
 * cheaper than the Atmosphere mask of `fetchPlaceDetails`). Null when Google names none. Throws {code}.
 */
export async function fetchPlaceWebsite(placeId, deps = {}) {
  if (!deps.googleKey) throw fail('CREDENTIAL_MISSING', 'no Google key')
  if (typeof placeId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(placeId))
    throw fail('PROVIDER_ERROR', 'invalid place id')
  const raw = await placesCall(
    new URL(`places/${placeId}`, API).href,
    { 'X-Goog-FieldMask': 'websiteUri' },
    deps
  )
  const website = text(raw?.websiteUri)
  return website && /^https?:\/\//i.test(website) ? website : null
}

/**
 * The facts the shared hub checks a contribution against: identity, name, website, phones, address, point, rating,
 * primary type and regular opening hours. `rating` already bills this mask at the Enterprise tier, which also covers
 * the hours, so the two added fields cost nothing more per read.
 */
export const PLACE_VERIFICATION_FIELDS =
  'id,displayName,websiteUri,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,location,rating,userRatingCount,primaryType,regularOpeningHours'

const weekPoint = (t) =>
  Number.isInteger(t?.day) && Number.isInteger(t?.hour) && Number.isInteger(t?.minute)
    ? { day: t.day, hour: t.hour, minute: t.minute }
    : null

/** Google's regular opening hours as `{periods: [{open, close?}], weekdayText}` with only day/hour/minute kept; null when absent. */
function openingHoursOf(raw) {
  const periods = []
  for (const p of Array.isArray(raw?.periods) ? raw.periods : []) {
    const open = weekPoint(p?.open)
    if (!open) continue
    const close = weekPoint(p?.close)
    periods.push(close ? { open, close } : { open })
  }
  const weekdayText = (Array.isArray(raw?.weekdayDescriptions) ? raw.weekdayDescriptions : [])
    .map(text)
    .filter(Boolean)
  return periods.length || weekdayText.length ? { periods, weekdayText } : null
}

/**
 * Those facts of one place as Google records them, flat; `{found: false, id}` when Google has no such place.
 * Throws {code} on any other failure (a failed read is never turned into "not there").
 */
export async function fetchPlaceVerification(placeId, deps = {}) {
  if (!deps.googleKey) throw fail('CREDENTIAL_MISSING', 'no Google key')
  if (typeof placeId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(placeId))
    throw fail('PROVIDER_ERROR', 'invalid place id')
  let raw
  try {
    raw = await placesCall(
      new URL(`places/${placeId}`, API).href,
      { 'X-Goog-FieldMask': PLACE_VERIFICATION_FIELDS },
      deps
    )
  } catch (err) {
    if (err?.status === 404) return { found: false, id: placeId }
    throw err
  }
  const lat = raw?.location?.latitude
  const lon = raw?.location?.longitude
  return {
    found: true,
    id: text(raw?.id) ?? placeId,
    name: local(raw?.displayName) ?? null,
    website: text(raw?.websiteUri) ?? null,
    address: text(raw?.formattedAddress) ?? null,
    phones: [text(raw?.internationalPhoneNumber), text(raw?.nationalPhoneNumber)].filter(Boolean),
    location: Number.isFinite(lat) && Number.isFinite(lon) ? { latitude: lat, longitude: lon } : null,
    rating: Number.isFinite(raw?.rating) ? raw.rating : null,
    reviewCount: Number.isInteger(raw?.userRatingCount) ? raw.userRatingCount : null,
    category: text(raw?.primaryType) ?? null,
    openingHours: openingHoursOf(raw?.regularOpeningHours)
  }
}

/** A picked suggestion's point: the cheapest Details mask that names and places it. */
export const PLACE_LOCATION_FIELDS = 'id,displayName,formattedAddress,location'

/** `{placeId, label, lat, lon}` of a place, or null when Google gives no location. `deps.sessionToken` closes an Autocomplete session. */
export async function fetchPlaceLocation(placeId, deps = {}) {
  if (!deps.googleKey) throw fail('CREDENTIAL_MISSING', 'no Google key')
  if (typeof placeId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(placeId))
    throw fail('PROVIDER_ERROR', 'invalid place id')
  const url = new URL(`places/${placeId}`, API)
  if (text(deps.sessionToken)) url.searchParams.set('sessionToken', deps.sessionToken.trim())
  if (text(deps.language)) url.searchParams.set('languageCode', deps.language.trim())
  const raw = await placesCall(
    url.href,
    { 'X-Goog-FieldMask': PLACE_LOCATION_FIELDS },
    { timeoutMs: 5_000, ...deps }
  )
  const lat = Number(raw?.location?.latitude)
  const lon = Number(raw?.location?.longitude)
  if (raw?.location?.latitude === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return {
    placeId: text(raw.id) ?? placeId,
    label: text(raw.formattedAddress) ?? local(raw.displayName) ?? placeId,
    lat,
    lon
  }
}

const attributionOf = (a) => {
  const displayName = text(a?.displayName)
  return displayName ? { displayName, ...(text(a.uri) ? { uri: a.uri.trim() } : {}) } : null
}

function reviewOf(r) {
  const body = local(r?.text) ?? local(r?.originalText)
  const author = text(r?.authorAttribution?.displayName)
  if (!body || !author) return null
  const out = { author }
  if (text(r.authorAttribution.uri)) out.authorUri = r.authorAttribution.uri.trim()
  const avatar = text(r.authorAttribution.photoUri)
  if (avatar) {
    try {
      const url = new URL(avatar)
      if (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        (url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com'))
      ) {
        out.authorAvatarUrl = url.href
      }
    } catch {
      /* Missing or malformed avatars stay absent. */
    }
  }
  if (Number.isFinite(r.rating)) out.rating = r.rating
  out.text = body.slice(0, REVIEW_TEXT_MAX)
  const language = text(r.text?.languageCode) ?? text(r.originalText?.languageCode)
  if (language) out.language = language
  if (text(r.publishTime)) out.publishTime = r.publishTime
  if (text(r.googleMapsUri)) out.googleMapsUri = r.googleMapsUri
  return out
}

/** One Money of Google's: whole units plus nanos. */
const amountOf = (m) => {
  const units = Number(m?.units ?? 0)
  const nanos = Number(m?.nanos ?? 0)
  return Number.isFinite(units) &&
    Number.isFinite(nanos) &&
    (m?.units !== undefined || m?.nanos !== undefined)
    ? units + nanos / 1e9
    : null
}

/** Google's `priceRange` (per person) as `{currency, start?, end?}`; null without a currency or an amount. */
function priceRangeOf(r) {
  const currency = text(r?.startPrice?.currencyCode) ?? text(r?.endPrice?.currencyCode)
  const start = amountOf(r?.startPrice)
  const end = amountOf(r?.endPrice)
  if (!currency || (start === null && end === null)) return null
  return { currency, ...(start !== null ? { start } : {}), ...(end !== null ? { end } : {}) }
}

function photoOf(p) {
  if (!text(p?.name)) return null
  return {
    name: p.name,
    ...(Number.isFinite(p.widthPx) ? { widthPx: p.widthPx } : {}),
    ...(Number.isFinite(p.heightPx) ? { heightPx: p.heightPx } : {}),
    attributions: (Array.isArray(p.authorAttributions) ? p.authorAttributions : [])
      .map(attributionOf)
      .filter(Boolean)
  }
}

/** Plain facts for the site brief. Absent Google fields stay absent; reviews and photos keep their author attribution. */
export function placeFactsFromDetails(raw, { now = () => new Date() } = {}) {
  const amenities = {}
  for (const k of AMENITIES) if (typeof raw?.[k] === 'boolean') amenities[k] = raw[k]
  for (const [group, keys] of Object.entries(AMENITY_GROUPS))
    for (const k of keys) if (typeof raw?.[group]?.[k] === 'boolean') amenities[k] = raw[group][k]
  const summaries = {}
  const editorial = local(raw?.editorialSummary)
  const generative = local(raw?.generativeSummary?.overview)
  const reviewsSummary = local(raw?.reviewSummary?.text)
  if (editorial) summaries.editorial = editorial
  if (generative) summaries.generative = generative
  if (reviewsSummary) summaries.reviews = reviewsSummary
  const hours = (raw?.regularOpeningHours?.weekdayDescriptions ?? []).map(text).filter(Boolean)
  const website = text(raw?.websiteUri)
  const facts = {
    placeId: raw?.id,
    ...(local(raw?.displayName) ? { name: local(raw.displayName) } : {}),
    ...(website && /^https?:\/\//i.test(website) ? { website } : {}),
    ...(Array.isArray(raw?.addressComponents) ? { addressComponents: raw.addressComponents } : {}),
    // The branch's own address and phone: what a found social page is matched on (`social-search.mjs`).
    ...(text(raw?.formattedAddress) ? { formattedAddress: raw.formattedAddress.trim() } : {}),
    ...(text(raw?.nationalPhoneNumber) ? { nationalPhoneNumber: raw.nationalPhoneNumber.trim() } : {}),
    ...(text(raw?.internationalPhoneNumber)
      ? { internationalPhoneNumber: raw.internationalPhoneNumber.trim() }
      : {}),
    ...(Number.isFinite(raw?.location?.latitude) && Number.isFinite(raw?.location?.longitude)
      ? { location: { latitude: raw.location.latitude, longitude: raw.location.longitude } }
      : {}),
    // Google's place types: what decides whether a place is food and drink (`trades.mjs`), and so has a Menu.
    ...(text(raw?.primaryType) ? { primaryType: raw.primaryType.trim() } : {}),
    ...(Array.isArray(raw?.types) && raw.types.some((t) => text(t))
      ? { types: raw.types.map(text).filter(Boolean) }
      : {}),
    // Google's rating and how many reviews it counts (`google-rating.mjs` decides whether the site shows it).
    ...(Number.isFinite(raw?.rating) && raw.rating >= 0 && raw.rating <= 5 ? { rating: raw.rating } : {}),
    ...(Number.isInteger(raw?.userRatingCount) && raw.userRatingCount >= 0
      ? { userRatingCount: raw.userRatingCount }
      : {}),
    amenities,
    ...(typeof raw?.reservable === 'boolean' ? { reservable: raw.reservable } : {}),
    summaries,
    reviews: (Array.isArray(raw?.reviews) ? raw.reviews : [])
      .map(reviewOf)
      .filter(Boolean)
      .slice(0, MAX_REVIEWS),
    ...(hours.length ? { openingHours: hours } : {}),
    ...(text(raw?.priceLevel) ? { priceLevel: raw.priceLevel } : {}),
    ...(priceRangeOf(raw?.priceRange) ? { priceRange: priceRangeOf(raw.priceRange) } : {}),
    photos: (Array.isArray(raw?.photos) ? raw.photos : []).map(photoOf).filter(Boolean).slice(0, MAX_PHOTOS),
    attribution: 'Google',
    fetchedAt: now().toISOString()
  }
  return facts
}

/** The photo media URL that answers JSON (`photoUri`); the caller sends the key as a header. */
export function placePhotoUrl(photoName, { maxWidthPx = 1600 } = {}) {
  if (typeof photoName !== 'string' || !/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(photoName)) {
    throw new Error('invalid photo name')
  }
  const w = Math.max(1, Math.min(4800, Math.round(Number(maxWidthPx) || 1600)))
  return `${API}${photoName}/media?maxWidthPx=${w}&skipHttpRedirect=true`
}

/**
 * The public, short-lived `photoUri` of one Places photo (googleusercontent), for a party that downloads it at once.
 * The key goes to Google in a header and never appears in the answer.
 */
export async function placePhotoUri(photoName, deps = {}) {
  let url
  try {
    url = placePhotoUrl(photoName, { maxWidthPx: deps.maxWidthPx })
  } catch (err) {
    throw fail('PROVIDER_ERROR', err.message)
  }
  const meta = await placesCall(url, {}, deps)
  const uri = text(meta?.photoUri)
  if (!uri || !/^https:\/\//i.test(uri)) throw fail('PROVIDER_ERROR', 'no photoUri from provider')
  return uri
}

/**
 * Downloads one Places photo: the media call (key in header) names a `photoUri`, then the bytes come
 * through the URL guard with a byte cap. Returns {bytes, mime, sourceUrl, attributions}.
 */
export async function fetchPlacePhoto(photoName, deps = {}) {
  if (!deps.googleKey) throw fail('CREDENTIAL_MISSING', 'no Google key')
  let url
  try {
    url = placePhotoUrl(photoName, { maxWidthPx: deps.maxWidthPx })
  } catch (err) {
    throw fail('PROVIDER_ERROR', err.message)
  }
  const meta = await placesCall(url, {}, deps)
  if (!text(meta?.photoUri)) throw fail('PROVIDER_ERROR', 'no photoUri from provider')
  let got
  try {
    got = await fetchLimited(meta.photoUri, {
      fetch: deps.fetch,
      resolve: deps.resolve,
      accept: ['image/*'],
      maxBytes: deps.maxBytes ?? PHOTO_MAX_BYTES,
      timeoutMs: deps.timeoutMs ?? 60_000
    })
  } catch (err) {
    const code =
      { URL_BLOCKED: 'URL_BLOCKED', TIMEOUT: 'TIMEOUT', MIME_REJECTED: 'NOT_MEDIA' }[err?.code] ??
      'PROVIDER_ERROR'
    throw fail(code, redactToken(err?.message, deps.googleKey))
  }
  if (got.truncated) throw fail('TOO_LARGE', 'photo larger than the byte cap')
  if (got.status < 200 || got.status >= 300)
    throw fail('PROVIDER_ERROR', `HTTP ${got.status}`, { status: got.status })
  const mime = sniffMime(got.bytes)
  if (!mime?.startsWith('image/')) throw fail('NOT_MEDIA', `unexpected type ${mime ?? 'unknown'}`)
  return {
    bytes: got.bytes,
    mime,
    sourceUrl: `google-places:${photoName}`,
    attributions: Array.isArray(deps.attributions) ? deps.attributions : []
  }
}
