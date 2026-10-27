import { fetchLimited, FetchLimitedError } from './fetch-limited.mjs'
import { osmStatementsOf, tradeOfOsmTags } from './trade-search.mjs'

const NOMINATIM = 'https://nominatim.openstreetmap.org/search?format=json&limit=5&q='
// Public Overpass instances answer 502/504 under load; try the next one before giving up.
export const OVERPASS_ENDPOINTS = Object.freeze([
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
])
const MAX_RADIUS_M = 10_000
const MAX_JSON_BYTES = 8 * 1024 * 1024

const SOCIAL_HOSTS = {
  facebook: ['facebook.com', 'fb.com', 'fb.me'],
  instagram: ['instagram.com', 'instagr.am'],
  tiktok: ['tiktok.com'],
  youtube: ['youtube.com', 'youtu.be']
}
const HANDLE_URL = {
  facebook: (h) => `https://www.facebook.com/${h}`,
  instagram: (h) => `https://www.instagram.com/${h}/`,
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
  youtube: (h) => `https://www.youtube.com/@${h}`
}

/** Which social network a URL belongs to, or null. */
export function socialNetworkOf(url) {
  let host
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\.|^m\.|^mobile\./, '')
  } catch {
    return null
  }
  for (const [net, hosts] of Object.entries(SOCIAL_HOSTS)) {
    if (hosts.some((h) => host === h || host.endsWith(`.${h}`))) return net
  }
  return null
}

/** OSM tags hold full URLs, bare domains or bare handles ("phincoffeehoian"); returns a URL or undefined. */
export function normaliseSocial(network, value) {
  const v = String(value ?? '').trim()
  if (!v || /\s/.test(v)) return undefined
  if (/^https?:\/\//i.test(v)) return v
  if (/^[\w.-]+\.[a-z]{2,}\//i.test(v)) return `https://${v}`
  const handle = v.replace(/^@/, '')
  if (!/^[\w.-]+$/.test(handle) || !HANDLE_URL[network]) return undefined
  return HANDLE_URL[network](handle)
}

function normaliseWebsite(value) {
  const v = String(value ?? '').trim()
  if (!v || /\s/.test(v)) return undefined
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : undefined
  } catch {
    return undefined
  }
}

function addressOf(tags) {
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ')
  const parts = [street, tags['addr:suburb'], tags['addr:city'] ?? tags['addr:district']].filter(Boolean)
  return parts.length ? parts.join(', ') : undefined
}

function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''))
}

export function candidateFromOsm(el) {
  const tags = el?.tags ?? {}
  const name = tags.name?.trim()
  if (!name) return null
  const lat = el.lat ?? el.center?.lat
  const lon = el.lon ?? el.center?.lon
  if (typeof lat !== 'number' || typeof lon !== 'number') return null
  return compact({
    provider: 'osm',
    providerId: `${el.type}/${el.id}`,
    name,
    branch: tags.branch,
    brand: tags.brand,
    address: addressOf(tags),
    phone: tags.phone ?? tags['contact:phone'],
    lat,
    lon,
    website: normaliseWebsite(tags.website ?? tags['contact:website']),
    socials: compact({
      facebook: normaliseSocial('facebook', tags['contact:facebook'] ?? tags.facebook),
      instagram: normaliseSocial('instagram', tags['contact:instagram'] ?? tags.instagram),
      tiktok: normaliseSocial('tiktok', tags['contact:tiktok'] ?? tags.tiktok),
      youtube: normaliseSocial('youtube', tags['contact:youtube'] ?? tags.youtube)
    })
  })
}

async function getJson(url, init, deps) {
  const res = await fetchLimited(url, {
    ...init,
    fetch: deps.fetch,
    resolve: deps.resolve,
    maxBytes: MAX_JSON_BYTES,
    timeoutMs: deps.timeoutMs ?? 30_000
  })
  if (res.status < 200 || res.status >= 300) {
    throw new FetchLimitedError('PROVIDER_ERROR', `provider answered ${res.status}`, { status: res.status })
  }
  try {
    return JSON.parse(new TextDecoder().decode(res.bytes))
  } catch {
    throw new FetchLimitedError('PROVIDER_ERROR', 'provider returned invalid JSON', {
      status: res.status,
      transient: true
    })
  }
}

// A `boundary=historic` relation is a unit that no longer exists (Vietnam's 2025 reform made every
// former city one); its centroid can lie far from the town, even at sea. Then the place node of the
// same name, else a current administrative boundary; the rest of the list may be another country.
function pickHit(hits) {
  const first = hits[0]
  if (!first || !(first.class === 'boundary' && first.type === 'historic')) return first ?? null
  return (
    hits.find((h) => h?.class === 'place') ??
    hits.find((h) => h?.class === 'boundary' && h.type === 'administrative') ??
    first
  )
}

export async function geocode(query, deps) {
  const data = await getJson(NOMINATIM + encodeURIComponent(String(query ?? '').trim()), {}, deps)
  const hit = Array.isArray(data) ? pickHit(data) : null
  if (!hit) return null
  const lat = Number(hit.lat)
  const lon = Number(hit.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return { label: hit.display_name ?? String(query), lat, lon }
}

/** Places around a point from Overpass; `trade` = one kind (`trade-search.mjs`), null = every kind, food unless sent. */
export async function searchRestaurants({ lat, lon, radiusM, trade = 'food' }, deps) {
  const r = Math.max(1, Math.min(MAX_RADIUS_M, Math.round(Number(radiusM) || 1000)))
  const statements = osmStatementsOf(trade, `(around:${r},${Number(lat)},${Number(lon)})`)
  const union = statements.indexOf(';') === statements.length - 1 ? statements : `(${statements});`
  const query = `[out:json][timeout:25];${union}out tags center 300;`
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: query }).toString()
  }
  let last
  for (const endpoint of deps.overpassEndpoints ?? OVERPASS_ENDPOINTS) {
    try {
      const data = await getJson(endpoint, init, deps)
      const tagged = (el) => {
        const c = candidateFromOsm(el)
        return c && trade !== 'food' ? { ...c, trade: tradeOfOsmTags(el.tags) ?? trade ?? 'other' } : c
      }
      return (data?.elements ?? []).map(tagged).filter(Boolean)
    } catch (err) {
      last = err
      const transient =
        err?.code === 'TIMEOUT' ||
        err?.code === 'FETCH_FAILED' ||
        err?.status === 429 ||
        err?.status >= 500 ||
        err?.transient === true
      if (!transient) throw err
    }
  }
  throw last
}
