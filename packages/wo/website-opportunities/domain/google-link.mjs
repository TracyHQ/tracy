/**
 * A pasted Google Maps or Google share link, read without a browser and without a Google key.
 *
 * `parseGoogleLink` reads what the address itself says (place id, cid, `@lat,lng`, kgmid, the searched words).
 * `resolveShortLink` follows a short link (`share.google`, `maps.app.goo.gl`, `g.page`…) by its `Location`
 * headers only: manual redirects, Google hosts only, the public-URL guard on every hop, and no response body is
 * ever read. Turning what it says into one place (Places Text Search, matching) is the caller's job.
 */
import { assertPublicUrl } from './url-guard.mjs'
import { USER_AGENT } from './fetch-limited.mjs'
import { distanceM } from './dedupe.mjs'

const MAX_HOPS = 6
const SHORT_HOSTS = new Set(['share.google', 'maps.app.goo.gl', 'goo.gl', 'g.page', 'g.co'])
const GOOGLE_HOST = /^(?:(?:www|maps|consent)\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/

/** A host a Google link may live on or redirect through. */
export function isGoogleHost(host) {
  const h = String(host ?? '').toLowerCase()
  return SHORT_HOSTS.has(h) || GOOGLE_HOST.test(h)
}

/** A hop that only points somewhere else: a short-link host, or Google's own `/share.google` relay. */
function isRelay(u) {
  const host = u.hostname.toLowerCase()
  if (SHORT_HOSTS.has(host)) return true
  return GOOGLE_HOST.test(host) && u.pathname === '/share.google'
}

const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/** A `0x…:0x…` feature id's second half as the decimal cid Google Maps URLs carry. */
function cidOfFeatureId(raw) {
  const m = /0x[0-9a-f]+:(0x[0-9a-f]+)/i.exec(String(raw ?? ''))
  if (!m) return undefined
  try {
    return BigInt(m[1]).toString()
  } catch {
    return undefined
  }
}

/**
 * What a Google link says about its place, from the address alone. Null when it is not a Google link.
 * @param {string} raw
 * @returns {null | { url: string, short: boolean, placeId?: string, cid?: string, lat?: number, lng?: number,
 *   kgmid?: string, q?: string }}
 */
export function parseGoogleLink(raw) {
  let u
  try {
    u = new URL(String(raw ?? '').trim())
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (!isGoogleHost(u.hostname)) return null
  const p = u.searchParams
  /** @type {any} */
  const out = { url: u.href, short: isRelay(u) }
  const placeId = text(p.get('query_place_id') ?? p.get('place_id') ?? p.get('placeid'))
  if (placeId && /^[A-Za-z0-9_-]{4,200}$/.test(placeId)) out.placeId = placeId
  const cid = text(p.get('cid'))
  if (cid && /^\d{1,25}$/.test(cid)) out.cid = cid
  else {
    // `/maps/place/…/data=!…!1s0x…:0x…` and `ftid=0x…:0x…` name the same feature.
    const fromData = cidOfFeatureId(p.get('ftid')) ?? cidOfFeatureId(decodeURIComponent(u.pathname))
    if (fromData) out.cid = fromData
  }
  const at = /@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/.exec(decodeURIComponent(u.pathname))
  if (at) {
    const lat = Number(at[1])
    const lng = Number(at[2])
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) Object.assign(out, { lat, lng })
  }
  const kgmid = text(p.get('kgmid'))
  if (kgmid && /^\/[a-z]\/[A-Za-z0-9_-]+$/.test(kgmid)) out.kgmid = kgmid
  const place = /\/maps\/place\/([^/]+)/.exec(u.pathname)
  const named = place ? decodeURIComponent(place[1].replace(/\+/g, ' ')) : undefined
  const q = text(p.get('q') ?? p.get('query')) ?? text(named)
  // A share relay's `q` is the short link itself, not words.
  if (q && !/^https?:\/\//i.test(q) && !out.short) out.q = q.slice(0, 200)
  if (!out.lat && q) {
    const coords = /^(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)$/.exec(q)
    if (coords) Object.assign(out, { lat: Number(coords[1]), lng: Number(coords[2]) })
  }
  return out
}

/**
 * Follow a Google short link to the address it stands for, by `Location` headers only. Every hop must be a Google
 * host and pass the public-URL guard; a body is never read (each response body is cancelled unread). A consent
 * interstitial is skipped through its `continue` address without being fetched. Throws `{code}`:
 * `GOOGLE_LINK_FOREIGN` (a hop left Google), `URL_BLOCKED`, `TOO_MANY_REDIRECTS`, `FETCH_FAILED`, `TIMEOUT`.
 * @param {string} url
 * @param {{ fetch: typeof fetch, resolve?: Function, timeoutMs?: number }} deps
 * @returns {Promise<{ url: string, hops: number }>}
 */
export async function resolveShortLink(url, deps = {}) {
  if (typeof deps.fetch !== 'function') throw fail('FETCH_FAILED', 'fetch dependency missing')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 10_000)
  try {
    let current = new URL(String(url))
    for (let hop = 0; ; hop++) {
      if (!isGoogleHost(current.hostname)) throw fail('GOOGLE_LINK_FOREIGN', 'the link left Google')
      if (/^consent\./i.test(current.hostname)) {
        const next = current.searchParams.get('continue')
        if (!next) return { url: current.href, hops: hop }
        current = new URL(next)
        continue
      }
      if (!isRelay(current)) return { url: current.href, hops: hop }
      if (hop >= MAX_HOPS) throw fail('TOO_MANY_REDIRECTS', 'too many redirects')
      const checked = await assertPublicUrl(current, { resolve: deps.resolve })
      let res
      try {
        res = await deps.fetch(checked.href, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'user-agent': USER_AGENT, accept: 'text/html' }
        })
      } catch (error) {
        if (controller.signal.aborted) throw fail('TIMEOUT', 'request timed out')
        throw fail('FETCH_FAILED', error?.message ?? 'fetch failed')
      }
      await res.body?.cancel().catch(() => {})
      const location = res.headers.get('location')
      if (res.status < 300 || res.status >= 400 || !location)
        throw fail('FETCH_FAILED', `no redirect (HTTP ${res.status})`)
      current = new URL(location, checked)
    }
  } finally {
    clearTimeout(timer)
  }
}

/** How close a place must be to a coordinate a listing or the link states, to be taken as the same place. */
export const NEAR_M = 150
/** Most candidates a person is asked to pick from. */
export const MAX_CANDIDATES = 5

/** A name in one spelling: lower case, no accents, `&` as "and", punctuation as spaces. */
export function normalName(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Two names of one business: the same words, or one wholly inside the other (4 characters at least). */
export function namesMatch(a, b) {
  const x = normalName(a)
  const y = normalName(b)
  if (!x || !y) return false
  if (x === y) return true
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  return short.length >= 4 && ` ${long} `.includes(` ${short} `)
}

const digits = (v) => String(v ?? '').replace(/\D/g, '')
/** Two phone numbers that end the same (9 digits, at least 7 when shorter): local and international spellings. */
function samePhone(a, b) {
  const x = digits(a)
  const y = digits(b)
  const n = Math.min(9, x.length, y.length)
  return n >= 7 && x.slice(-n) === y.slice(-n)
}

const cidOfMapsUrl = (url) => {
  try {
    return new URL(String(url)).searchParams.get('cid') ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Which of a Google search's places a pasted Google link means. Accepted only when one is certain: the link's own
 * place id or cid; else exactly one result whose name matches (the link's words, the typed name or a listing's name)
 * and that is within `NEAR_M` of a coordinate the link or a listing states, or shares a listing's phone; else the
 * typed name equal to exactly one result's name. Anything else is never guessed.
 * @param {{ candidates: any[], parsed?: any, typedName?: string | null,
 *   hints?: Array<{ name?: string, lat?: number, lng?: number, phone?: string }> }} input
 *   `candidates` as `searchNamedPlaces` answers them (`providerId`, `name`, `lat`, `lon`, `phone`, `mapsUrl`)
 * @returns {{ match: any } | { ambiguous: any[] } | { none: true }}
 */
export function matchGooglePlace({ candidates, parsed = {}, typedName = null, hints = [] }) {
  const list = Array.isArray(candidates) ? candidates.filter((c) => c && c.providerId) : []
  if (list.length === 0) return { none: true }
  if (parsed.placeId) {
    const exact = list.find((c) => c.providerId === parsed.placeId)
    if (exact) return { match: exact }
  }
  if (parsed.cid) {
    const exact = list.find((c) => cidOfMapsUrl(c.mapsUrl) === parsed.cid)
    if (exact) return { match: exact }
  }
  const all = [...hints]
  if (Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng))
    all.push({ lat: parsed.lat, lng: parsed.lng })
  const names = [parsed.q, typedName, ...hints.map((h) => h.name)].filter((n) => normalName(n))
  const near = (c) =>
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lon) &&
    all.some(
      (h) =>
        Number.isFinite(h.lat) &&
        Number.isFinite(h.lng) &&
        distanceM({ lat: h.lat, lon: h.lng }, { lat: c.lat, lon: c.lon }) <= NEAR_M
    )
  const phoned = (c) => all.some((h) => h.phone && c.phone && samePhone(h.phone, c.phone))
  const sure = list.filter((c) => names.some((n) => namesMatch(n, c.name)) && (near(c) || phoned(c)))
  if (sure.length === 1) return { match: sure[0] }
  if (normalName(typedName)) {
    const typed = list.filter((c) => normalName(c.name) === normalName(typedName))
    if (typed.length === 1) return { match: typed[0] }
  }
  return { ambiguous: list.slice(0, MAX_CANDIDATES) }
}

function fail(code, message) {
  return Object.assign(new Error(message), { code })
}
