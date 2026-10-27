/** Server-only Litescrape adapter. Fixed origin, no redirects, one bounded HTTP attempt per operation. */
export const TRIPADVISOR_SOURCE = 'tripadvisor'
export const TRIPADVISOR_VERSION = 'tripadvisor-5'
const API = 'https://api.litescrape.com/api/tripadvisor/'
const MAX_BYTES = 2 * 1024 * 1024
const fail = (code) => Object.assign(new Error(`TripAdvisor provider ${code}`), { code })
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const idOf = (v) => (/^[1-9]\d{0,15}$/.test(String(v ?? '')) ? String(v) : null)
const number = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const object = (v) => v && typeof v === 'object' && !Array.isArray(v)

export function tripadvisorUrl(value) {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' &&
      /^(www\.)?tripadvisor\.com$/.test(u.hostname) &&
      !u.username &&
      !u.password
      ? u.href
      : null
  } catch {
    return null
  }
}

export async function litescrapeCall(
  operation,
  params,
  { key, fetch: fetchImpl = fetch, timeoutMs = 25_000 } = {}
) {
  if (!key) throw fail('CREDENTIAL_MISSING')
  if (!['search', 'place', 'reviews'].includes(operation)) throw fail('INVALID_OPERATION')
  const u = new URL(operation, API)
  u.search = new URLSearchParams({
    locale: 'en-US',
    tripadvisor_domain: 'www.tripadvisor.com',
    ...params
  }).toString()
  const body = await tripadvisorJson(
    u.href,
    { authorization: `Bearer ${key}`, accept: 'application/json' },
    { fetch: fetchImpl, timeoutMs }
  )
  const group = { search: 'search_results', place: 'place_results', reviews: 'reviews' }[operation]
  if (
    !object(body) ||
    body.error ||
    body.error_code ||
    body.search_metadata?.status === 'Error' ||
    (operation === 'place' ? !object(body[group]) : !Array.isArray(body[group]))
  )
    throw fail('INVALID_RESPONSE')
  return body[group]
}

/** One fixed HTTP attempt. Callers own endpoint allowlists, schemas and billing reservations. */
export async function tripadvisorJson(url, headers, { fetch: fetchImpl = fetch, timeoutMs = 25_000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, {
      headers,
      redirect: 'error',
      signal: controller.signal
    })
    if (!res.ok) {
      await res.body?.cancel()
      throw fail(`HTTP_${res.status}`)
    }
    if (Number(res.headers.get('content-length')) > MAX_BYTES) {
      await res.body?.cancel()
      throw fail('BODY_LIMIT')
    }
    const reader = res.body?.getReader()
    if (!reader) throw fail('INVALID_RESPONSE')
    const chunks = []
    let length = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > MAX_BYTES) {
        await reader.cancel()
        throw fail('BODY_LIMIT')
      }
      chunks.push(value)
    }
    let body
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      throw fail('INVALID_JSON')
    }
    return body
  } catch (error) {
    // Never include provider bodies, URLs or native network messages in logs or public errors.
    if (/^(HTTP_\d+|BODY_LIMIT|INVALID_JSON|INVALID_RESPONSE)$/.test(error?.code ?? '')) throw error
    throw fail(controller.signal.aborted ? 'TIMEOUT' : 'PROVIDER_ERROR')
  } finally {
    clearTimeout(timer)
  }
}

export function tripadvisorPlace(raw) {
  if (!object(raw)) return null
  const id = idOf(raw.place_id ?? raw.location_id ?? raw.id)
  const name = text(raw.title ?? raw.name)
  if (!id || !name) return null
  const coords = raw.gps_coordinates ?? raw.coordinates ?? raw.location ?? {}
  const address = text(raw.address) ?? text(raw.address?.full_address) ?? text(raw.address?.street1)
  return {
    placeId: id,
    name,
    address,
    market: text(raw.market ?? raw.location),
    lat: number(coords.latitude ?? coords.lat ?? raw.latitude),
    lon: number(coords.longitude ?? coords.lon ?? raw.longitude),
    phone: text(raw.phone),
    website: text(raw.website),
    url: tripadvisorUrl(raw.link ?? raw.url),
    rating: number(raw.rating),
    reviewCount: number(raw.reviews ?? raw.review_count)
  }
}

const normalized = (s) =>
  String(s ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
const phone = (s) => String(s ?? '').replace(/\D/g, '')
const host = (s) => {
  try {
    return new URL(s).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}
const distanceM = (a, b) => {
  if (![a.lat, a.lon, b.lat, b.lon].every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  const rad = Math.PI / 180
  const dlat = (a.lat - b.lat) * rad,
    dlon = (a.lon - b.lon) * rad
  const x = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlon / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

/** Remove an explicit locality suffix only when the server-owned address corroborates it. */
export function tripadvisorRestaurantName(name, address) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+[-–—]\s+/)
  while (parts.length > 1) {
    const suffix = normalized(parts.at(-1))
    if (suffix.length < 3 || !containsPhrase(address, suffix)) break
    parts.pop()
  }
  return parts.join(' - ')
}

const containsPhrase = (value, phrase) =>
  Boolean(phrase && ` ${normalized(value)} `.includes(` ${normalized(phrase)} `))
const descriptors = new Set([
  'restaurant',
  'restaurants',
  'cafe',
  'cafeteria',
  'bar',
  'grill',
  'kitchen',
  'the',
  'and',
  'llc',
  'ltd'
])
const brandName = (name, address) =>
  normalized(tripadvisorRestaurantName(name, address))
    .split(' ')
    .filter((word) => !descriptors.has(word))
    .join(' ')
export const tripadvisorNameMatches = (a, b, { addressA, addressB } = {}) => {
  const name = brandName(a, addressA)
  return Boolean(name && name === brandName(b, addressB))
}

/** Branch identity remains strict; restaurant review association does not assert branch identity. */
export function matchTripadvisor(google, candidates, { truncated = false, allowBrand = true } = {}) {
  if (!google?.name) return { status: 'not_found', reason: 'verified_facts_missing', candidates: [] }
  const evidence = candidates.map((p) => {
    const name = tripadvisorNameMatches(p.name, google.name, {
      addressA: p.address,
      addressB: google.address
    })
    const address = Boolean(normalized(p.address) && normalized(p.address) === normalized(google.address))
    const samePhone = phone(p.phone).length >= 8 && phone(p.phone) === phone(google.phone)
    const website = Boolean(
      host(p.website) &&
        host(p.website) === host(google.website) &&
        !/^(facebook\.com|instagram\.com|tripadvisor\.com|google\.com|maps\.google\.com|linktr\.ee)$/.test(
          host(p.website)
        )
    )
    // Search location is a provider-supplied city hint, not an inferred address component.
    const city = text(p.market)?.split(',')[0].trim() ?? null
    const market = Boolean(city && containsPhrase(google.address, city))
    const distance = distanceM(google, p)
    const phoneConflict = phone(p.phone).length >= 8 && phone(google.phone).length >= 8 && !samePhone
    const confident =
      name &&
      !phoneConflict &&
      ((distance !== null && distance <= 100 && (address || samePhone)) ||
        (distance === null && address && samePhone))
    return {
      placeId: p.placeId,
      name,
      address,
      phone: samePhone,
      website,
      market,
      city,
      exactName: normalized(p.name) === normalized(google.name),
      distanceM: distance === null ? null : Math.round(distance),
      confident,
      brand: name && (market || website),
      insufficient:
        name &&
        !phoneConflict &&
        distance !== null &&
        distance <= 100 &&
        !(normalized(p.address) && normalized(google.address) && !address) &&
        (!phone(p.phone) || !phone(google.phone)) &&
        (!normalized(p.address) || !normalized(google.address))
    }
  })
  const hits = evidence.filter((e) => e.confident)
  if (truncated || hits.length > 1)
    return {
      status: 'ambiguous',
      reason: truncated ? 'candidate_limit' : 'branch_evidence',
      candidates: evidence
    }
  if (hits.length === 1)
    return {
      status: 'matched',
      scope: 'branch',
      branchVerified: true,
      placeId: hits[0].placeId,
      candidates: evidence
    }
  if (allowBrand) {
    const brands = evidence.filter((e) => e.brand)
    if (brands.length === 1 || (brands.length > 1 && brands.every((e) => e.website))) {
      brands.sort(
        (a, b) =>
          Number(b.exactName) - Number(a.exactName) ||
          a.placeId.localeCompare(b.placeId, 'en', { numeric: true })
      )
      return {
        status: 'matched',
        scope: 'brand',
        branchVerified: false,
        reason:
          brands.length > 1
            ? 'shared_brand_website'
            : brands[0].market
              ? 'brand_name_and_city'
              : 'brand_name_and_website',
        placeId: brands[0].placeId,
        candidates: evidence
      }
    }
    if (brands.length > 1) return { status: 'ambiguous', reason: 'restaurant_evidence', candidates: evidence }
  }
  return {
    status: evidence.length === 1 && evidence[0].insufficient ? 'insufficient_evidence' : 'not_found',
    reason: 'restaurant_evidence',
    candidates: evidence
  }
}

/** Verbatim text, real author and source link only. Invalid/partial reviews are omitted, never invented. */
export function tripadvisorReviews(raw, { fetchedAt, placeUrl, provider = null }) {
  const seen = new Set()
  return (Array.isArray(raw) ? raw : [])
    .flatMap((r) => {
      const id = idOf(r.id ?? r.review_id)
      const content = text(r.text ?? r.description)
      const author = text(r.user?.name ?? r.user?.username ?? r.author?.name ?? r.author)
      const url = tripadvisorUrl(r.link ?? r.url) ?? tripadvisorUrl(placeUrl)
      if (!id || seen.has(id) || !content || content.length > 10_000 || !author || !url) return []
      seen.add(id)
      return [
        {
          id,
          source: 'tripadvisor',
          ...(provider ? { provider } : {}),
          authorAvatarUrl: tripadvisorImageUrl(r.author?.avatar ?? r.user?.avatar),
          text: content,
          author,
          url,
          authorUrl: tripadvisorUrl(r.user?.link ?? r.user?.url ?? r.author?.url),
          rating: number(r.rating),
          date: text(r.published_date ?? r.date),
          language: text(r.original_language ?? r.language),
          fetchedAt,
          photos: (Array.isArray(r.images) ? r.images : [])
            .map(tripadvisorImageUrl)
            .filter(Boolean)
            .slice(0, 10)
            .map((image) => ({ url: image, reviewId: id, sourceUrl: url, ...(provider ? { provider } : {}) }))
        }
      ]
    })
    .slice(0, 20)
}

export function tripadvisorImageUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      ['media-cdn.tripadvisor.com', 'dynamic-media-cdn.tripadvisor.com'].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      url.pathname.startsWith('/media/photo-')
      ? url.href
      : null
  } catch {
    return null
  }
}
