// Approximate location from a network address, the way a map falls back when the browser gives no
// position (plain http, permission denied, no location hardware). City-level only: callers must
// label it approximate and let the person correct it.
import { isIP } from 'node:net'
import { fetchLimited } from './fetch-limited.mjs'
import { isBlockedAddress } from './url-guard.mjs'

const MAX_JSON_BYTES = 64 * 1024

const REGION_NAMES =
  typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null

function countryName(code) {
  if (typeof code !== 'string' || !/^[A-Za-z]{2}$/.test(code)) return code || null
  try {
    return REGION_NAMES?.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

function labelOf(city, region, country) {
  const parts = [city, region && region !== city ? region : null, country].filter(
    (p) => typeof p === 'string' && p.trim()
  )
  return parts.length ? parts.join(', ') : null
}

function point(lat, lon) {
  const la = Number(lat)
  const lo = Number(lon)
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null
  // 0,0 is what some providers answer for "unknown".
  if (la === 0 && lo === 0) return null
  return { lat: la, lon: lo }
}

// Each provider takes an address (or null = the caller's own egress address) and returns a place or null.
export const GEOIP_PROVIDERS = Object.freeze([
  {
    name: 'ipinfo',
    url: (ip) => (ip ? `https://ipinfo.io/${encodeURIComponent(ip)}/json` : 'https://ipinfo.io/json'),
    read: (d) => {
      if (!d || d.bogon) return null
      const [lat, lon] = String(d.loc ?? '').split(',')
      const p = point(lat, lon)
      return (
        p && { ...p, label: labelOf(d.city, d.region, countryName(d.country)), country: d.country ?? null }
      )
    }
  },
  {
    name: 'geojs',
    url: (ip) =>
      ip
        ? `https://get.geojs.io/v1/ip/geo/${encodeURIComponent(ip)}.json`
        : 'https://get.geojs.io/v1/ip/geo.json',
    read: (d) => {
      const p = d && point(d.latitude, d.longitude)
      return p && { ...p, label: labelOf(d.city, d.region, d.country), country: d.country_code ?? null }
    }
  }
])

/** True for an address worth asking a geo-IP provider about: public IPv4/IPv6 only. */
export function isLocatableAddress(ip) {
  return typeof ip === 'string' && isIP(ip) !== 0 && !isBlockedAddress(ip)
}

/**
 * `{lat, lon, label, country, accuracy: 'city', provider}` or null.
 * `ip` null asks about this machine's own public address — only meaningful when the server runs on
 * the person's machine (a local stand), so the caller decides when that is allowed.
 */
export async function approxLocationOf(ip, deps) {
  if (ip !== null && !isLocatableAddress(ip)) return null
  for (const provider of deps.geoipProviders ?? GEOIP_PROVIDERS) {
    try {
      const res = await fetchLimited(provider.url(ip), {
        fetch: deps.fetch,
        resolve: deps.resolve,
        maxBytes: MAX_JSON_BYTES,
        timeoutMs: deps.timeoutMs ?? 8_000
      })
      if (res.status < 200 || res.status >= 300) continue
      const place = provider.read(JSON.parse(new TextDecoder().decode(res.bytes)))
      if (place) return { ...place, accuracy: 'city', provider: provider.name }
    } catch {
      // try the next provider
    }
  }
  return null
}
