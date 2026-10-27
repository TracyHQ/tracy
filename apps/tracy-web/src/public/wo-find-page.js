/**
 * The sign-in-free Find (tasks/todo-wo-public-find-real-component.md): the WO plugin's own Find view
 * in public mode, built by `packages/web/tracy-wo-find-page` into `static/find`. A stranger searches
 * local businesses around an area, picks up to ten, and carries them through sign-in to the Website
 * Opportunities tab in the URL alone. On the master only (a shard answers 404):
 *
 *   GET  /find[/]                the page; a signed-in visitor (or one a shard holds) → the full Find;
 *                                both UI switches off → the signed-in Find, through /login
 *   GET  /find/find-assets/*     its built files, never an HTML fallback
 *   GET  /find/api/capabilities  read-only: kinds, radii, no Maps key, no social stats
 *   POST /find/api/search        one Google Places Nearby call, every kind of local business, at most 20 places
 *   GET  /find/api/places/suggest[/:placeId]  the place box: Autocomplete, then Place Details on a
 *                                pick (`website-opportunities/src/place-suggest.js`, the signed-in doors' own code)
 *   POST /find/api/research      Research pressed on up to ten rows: Google place ids ONLY; the shared
 *                                place job (`website-opportunities/src/public-research.js`) is read, joined or queued
 *   GET  /find/api/research      `placeIds=` → researched | none; `receipts=` → a pressed job's progress
 *   GET  /find/api/research-again `placeId=` → what Research again would look at, and the most it may cost
 *   POST /find/api/research-again {placeId} → a run of only what is due, paid by Tracy from the strangers'
 *                                place budget, at most `publicResearchAgainPerPlacePerDay` a place a day
 *
 * RESEARCH (tasks/plan-wo-public-research.md, contract §7): nothing the browser says about a place is
 * taken — a body with any field but `placeIds` is 400. A researched place costs nothing; a new place is
 * queued only through the day limits and the strangers' research budget (operator settings), checked
 * and recorded atomically; no refresh, resume or retry from here. A GET never makes a place or a job.
 *
 * 🔒 THE COST CEILING IS RESERVED BEFORE THE CALL AND NEVER GIVEN BACK. Per address (IPv6 per /64)
 * a minute and an hour, the deployment a minute and a UTC day — every number an operator setting in
 * `/ops/settings/wo` (`website-opportunities/src/wo-settings.js` PUBLIC_FIND_RANGES), read on each request; a day cap of 0
 * closes the door. Each bucket is `overLimit`'s atomic count; a provider error or
 * timeout keeps its count. One fixed call — the first page of the signed-in Find's default area
 * search, so the picks are found again after sign-in: no Apify or OSM fallback, no second page, no retry — and none of the caller's object reaches the domain.
 *
 * GOOGLE'S ANSWERS ARE KEPT in `wo_places_cache` (`website-opportunities/src/places-cache.js`, shared with the signed-in
 * Find; 23/10/2026: Google bills per call and lets results be kept, `placesCacheDays`): a kept
 * answer costs no Google call and no deployment budget. Nothing of any account is kept. The Nominatim
 * geocode (OSM data) is cached in this process, and Nominatim is asked at most once a second across
 * the app (its usage policy) through a shared `rate_bucket` window.
 *
 * DOMAIN-PURE (`test/module-graph.test.mjs`): imports `lib/` only; the WO domain arrives as
 * `loadDomain` from `app.js`.
 */
import { readFile, stat } from 'node:fs/promises'
import { join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'
import { getMimeType } from 'hono/utils/mime'
import { parseCookies, shardCookieName } from '../lib/cookies.js'
import { requestLanguage, translator } from '../lib/i18n/index.js'
import { clientIp } from '../lib/login-mail-rate.js'
import {
  isPlaceId,
  providerRefusalOf,
  resolveFrom,
  suggestFrom,
  suggestInput,
  suggestSession
} from 'website-opportunities/src/place-suggest.js'
import { placesCacheFetch, snapToCell } from 'website-opportunities/src/places-cache.js'
import { againPartsOf } from 'website-opportunities/src/research-again.js'
import { overLimitOrClosed } from '../lib/rate.js'
import { sessionFromCookieHeader } from '../lib/session.js'
import { uiSwitchOn } from '../lib/ui-setting.js'
import { woRuntime } from '../lib/wo-ops.js'

export const PUBLIC_FIND_SWITCH = 'website-opportunities-public-find'
const WO_SWITCH = 'website-opportunities'
export const PUBLIC_FIND_RADII_M = Object.freeze([1000, 3000, 5000, 10_000])
/** Where the picks go: the signed-in Find (it reads `wo-at`, `wo-radius`, `wo-pick` once). */
export const SIGNED_IN_FIND = '/new/?tab=tracy:website-opportunities&wo-view=find'
/** Kept from `/find`'s address on the way to the full Find: the hand-over and the visit's campaign. */
const KEPT_PARAM = /^(?:wo-at|wo-radius|wo-pick|wo-build|utm_[a-z0-9_]{1,30})$/
const DEFAULT_ROOT = fileURLToPath(new URL('../../static/find', import.meta.url))
const MAX_BODY_BYTES = 2048
const MAX_QUERY_CHARS = 200
const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
const GEOCODE_TTL_MS = 7 * DAY_MS
const GEOCODE_CACHE_MAX = 1000
const GEOCODE_TURN_TRIES = 3
const GOOGLE_TIMEOUT_MS = 15_000
/** One Text Search page: one billed call. */
const PAGE_SIZE = 20
const PLACE_ID = /^[A-Za-z0-9_-]{1,300}$/
const FIELDS = new Set(['query', 'lat', 'lon', 'radiusM'])
/** A Google place id a research press may name (`website-opportunities/src/places.js identityOf`). */
const RESEARCH_ID = /^[A-Za-z0-9_-]{1,200}$/
const MAX_RESEARCH = 10
const MAX_RESEARCH_BODY = 4096
/** Door hits per address a minute: DB reads only, the costly part is behind the day limits. */
const RESEARCH_POSTS_PER_MINUTE = 30
const RESEARCH_READS_PER_MINUTE = 120

/**
 * The bucket an address counts in: IPv4 as is, IPv6 by its /64 (one household or one VPS), an
 * IPv4-mapped IPv6 as its IPv4, anything else `unknown` — one shared bucket, never a fresh one.
 */
export function ipBucketOf(raw) {
  const ip = String(raw ?? '')
    .trim()
    .toLowerCase()
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip)
  if (mapped) return mapped[1]
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return ip
  if (!ip.includes(':') || !/^[0-9a-f:]+$/.test(ip)) return 'unknown'
  const halves = ip.split('::')
  if (halves.length > 2) return 'unknown'
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return 'unknown'
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return 'unknown'
  return `${groups
    .slice(0, 4)
    .map((g) => g.padStart(4, '0'))
    .join(':')}::/64`
}

/** An http(s) address, or null: anything else is never linked nor handed on. */
function webAddress(value) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

/** The search the body asks for, or null when the door would not make it. */
function parseSearch(text) {
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return null
  let b
  try {
    b = JSON.parse(text)
  } catch {
    return null
  }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null
  if (Object.keys(b).some((k) => !FIELDS.has(k))) return null
  if (!PUBLIC_FIND_RADII_M.includes(b.radiusM)) return null
  const byQuery = b.query !== undefined
  const byPoint = b.lat !== undefined || b.lon !== undefined
  if (byQuery === byPoint) return null
  if (byQuery) {
    const query = typeof b.query === 'string' ? b.query.trim() : ''
    if (!query || b.query.length > MAX_QUERY_CHARS) return null
    return { query, radiusM: b.radiusM }
  }
  const okLat = typeof b.lat === 'number' && Number.isFinite(b.lat) && Math.abs(b.lat) <= 90
  const okLon = typeof b.lon === 'number' && Number.isFinite(b.lon) && Math.abs(b.lon) <= 180
  return okLat && okLon ? { lat: b.lat, lon: b.lon, radiusM: b.radiusM } : null
}

/** The place ids a research press names, or null: exactly `{placeIds: [1..10 Google ids]}`. */
function parseResearch(text) {
  if (new TextEncoder().encode(text).length > MAX_RESEARCH_BODY) return null
  let b
  try {
    b = JSON.parse(text)
  } catch {
    return null
  }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null
  if (Object.keys(b).length !== 1 || !Array.isArray(b.placeIds)) return null
  const ids = b.placeIds
  if (ids.length === 0 || ids.length > MAX_RESEARCH) return null
  if (!ids.every((id) => typeof id === 'string' && RESEARCH_ID.test(id))) return null
  return [...new Set(ids)]
}

/** A comma list of a query parameter, at most ten; null when one entry does not match. */
function listParam(value, pattern) {
  if (value === undefined || value === '') return []
  const items = [...new Set(String(value).split(','))]
  if (items.length > MAX_RESEARCH || !items.every((v) => pattern.test(v))) return null
  return items
}

const iso = (at) => (at ? new Date(at).toISOString() : null)

/** A Google candidate in the signed-in Find's row shape, minus what costs or could run: no photo, http(s) links only. */
function publicCandidate(candidate) {
  // `findAction` names an account's opportunity, demo or queued action: never for a stranger.
  const {
    photo: _photo,
    findAction: _action,
    website,
    mapsUrl,
    socials,
    contacts,
    status,
    ...rest
  } = candidate
  const links = (record) =>
    record && typeof record === 'object'
      ? Object.fromEntries(Object.entries(record).filter(([, url]) => webAddress(url) !== null))
      : undefined
  return {
    ...rest,
    ...(webAddress(website) ? { website: webAddress(website) } : {}),
    ...(webAddress(mapsUrl) ? { mapsUrl: webAddress(mapsUrl) } : {}),
    socials: links(socials) ?? {},
    ...(contacts ? { contacts: links(contacts) } : {}),
    // No site check runs for a stranger: without published research the site reads as not checked.
    ...(webAddress(website) && !rest.siteCheck ? { siteCheck: { status: 'not_queued' } } : {}),
    status: status === 'researched' ? 'researched' : 'new'
  }
}

/** `next`'s query: only the kept parameters of `/find`'s own address. */
function keptQuery(url) {
  const kept = [...new URL(url).searchParams].filter(([name]) => KEPT_PARAM.test(name))
  return kept.length ? `&${new URLSearchParams(kept)}` : ''
}

/** One file of the built page under `root`, or null (missing, a directory, or outside `root`). */
async function readAsset(root, rel) {
  const path = normalize(join(root, rel))
  if (!path.startsWith(normalize(root))) return null
  try {
    if (!(await stat(path)).isFile()) return null
    return { body: await readFile(path), type: getMimeType(path) ?? 'application/octet-stream' }
  } catch {
    return null
  }
}

/**
 * @param {object} deps
 * @param {object} deps.config - `deploymentRole`, plus what `woRuntime` reads for the Google key.
 * @param {import('pg').Pool | null} deps.pool - every count; null refuses (fail closed).
 * @param {() => Promise<any>} deps.loadDomain - the WO domain (`geocode`, `searchAreaGplaces`, `markChains`, …).
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {Function} [deps.resolve] - DNS seam for the domain's guarded fetch.
 * @param {() => number} [deps.now]
 * @param {(ms: number) => Promise<void>} [deps.sleep] - waits for Nominatim's next second.
 * @param {string} [deps.root] - where the built page lives (`static/find`; a test override).
 * @param {(candidates: object[]) => Promise<object[]>} [deps.decorateResearch] - published shared
 *   research on each row (`website-opportunities/src/find-research.js` with no account), one read-only lookup.
 * @param {ReturnType<import('website-opportunities/src/public-research.js').publicResearchDoor> | null} [deps.research]
 *   the research doors' place work (`app.js`); null answers them 503.
 */
export function woPublicFindRoutes({
  config,
  pool,
  loadDomain,
  fetchImpl = fetch,
  resolve,
  now = Date.now,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
  root = DEFAULT_ROOT,
  decorateResearch = async (candidates) => candidates,
  research = null
}) {
  const app = new Hono()
  const geocodes = new Map()
  const onMaster = () => (config?.deploymentRole ?? 'master') === 'master'
  const switchesOn = async () => {
    if (!pool) return false
    const [wo, open] = await Promise.all([
      uiSwitchOn(pool, WO_SWITCH).catch(() => false),
      uiSwitchOn(pool, PUBLIC_FIND_SWITCH).catch(() => false)
    ])
    return wo && open
  }
  const domainDeps = () => ({ fetch: fetchImpl, ...(resolve ? { resolve } : {}) })
  const refuse = (c, t, status, code, key) => {
    c.header('cache-control', 'no-store')
    return c.json({ code, message: t(key) }, status)
  }
  const over = (bucket, limit, windowMs) => overLimitOrClosed(pool, bucket, limit, now(), windowMs)

  /** Nominatim's one ask a second, app-wide: wait for the next second rather than ask inside one. */
  async function geocodeTurn() {
    for (let i = 0; i < GEOCODE_TURN_TRIES; i++) {
      const at = now()
      if (!(await over('wo-public:nominatim', 1, 1000))) return true
      await sleep(1000 - (at % 1000))
    }
    return false
  }

  /** `{center}` | `{code}`: the cached geocode, else one Nominatim ask in its turn. */
  async function geocode(domain, query) {
    const key = query.toLowerCase().replace(/\s+/g, ' ')
    const hit = geocodes.get(key)
    if (hit && now() - hit.at < GEOCODE_TTL_MS) return { center: hit.center }
    if (!(await geocodeTurn())) return { code: 'BUSY' }
    let found
    try {
      found = await domain.geocode(query, domainDeps())
    } catch {
      return { code: 'GEOCODE_FAILED' }
    }
    if (!found) return { code: 'PLACE_NOT_FOUND' }
    const center = { lat: found.lat, lon: found.lon, label: found.label ?? query }
    geocodes.delete(key)
    geocodes.set(key, { at: now(), center })
    if (geocodes.size > GEOCODE_CACHE_MAX) geocodes.delete(geocodes.keys().next().value)
    return { center }
  }

  /** The page itself, or where this visitor belongs instead. Documents only: assets never redirect. */
  async function page(c) {
    if (!onMaster()) return c.notFound()
    c.header('cache-control', 'no-store')
    const next = `${SIGNED_IN_FIND}${keptQuery(c.req.url)}`
    // A signed-in visitor gets the full Find; one a shard holds goes through `/new/`, whose routing
    // cookie (`shards/route-cookie.js`) sends them on to their shard by the usual `/login?next=`.
    const cookie = c.req.header('cookie') ?? null
    const signedIn = await sessionFromCookieHeader(cookie, config.sessionSecret, now())
    if (signedIn || parseCookies(cookie).get(shardCookieName(config.secure))) return c.redirect(next, 302)
    if (!(await switchesOn())) return c.redirect(`/login?next=${encodeURIComponent(next)}`, 302)
    const index = await readAsset(root, 'index.html')
    if (!index) return c.text('The Find page has not been built into this deploy.', 404)
    return c.body(index.body, 200, { 'content-type': 'text/html; charset=utf-8' })
  }
  app.get('/find', page)
  app.get('/find/', page)

  app.get('/find/find-assets/*', async (c) => {
    if (!onMaster()) return c.notFound()
    const asset = await readAsset(root, c.req.path.slice('/find/'.length))
    if (!asset) return c.text('Not found', 404)
    return c.body(asset.body, 200, {
      'content-type': asset.type,
      'cache-control': 'public, max-age=31536000, immutable'
    })
  })

  app.get('/find/api/capabilities', async (c) => {
    if (!onMaster()) return c.notFound()
    const t = translator(requestLanguage(c))
    if (!(await switchesOn())) return refuse(c, t, 404, 'FEATURE_OFF', 'woFind.error.off')
    let domain
    try {
      domain = await loadDomain()
    } catch {
      return refuse(c, t, 503, 'UNAVAILABLE', 'woFind.error.failed')
    }
    c.header('cache-control', 'no-store')
    return c.json({
      kinds: [...domain.KINDS],
      cuisines: [],
      discovery: { 'google-places': true, 'google-maps': false, osm: false },
      search: {
        maxRadiusM: PUBLIC_FIND_RADII_M.at(-1),
        radiiM: [...PUBLIC_FIND_RADII_M],
        depths: { quick: PAGE_SIZE }
      },
      maps: { browserKey: null },
      socialStats: { providers: { rapidapi: false, youtube: false, apify: false } }
    })
  })

  app.post('/find/api/search', async (c) => {
    if (!onMaster()) return c.notFound()
    const t = translator(requestLanguage(c))
    if (!(await switchesOn())) return refuse(c, t, 404, 'FEATURE_OFF', 'woFind.error.off')
    // A browser page elsewhere must not spend this deployment's searches with a visitor's address.
    const site = c.req.header('sec-fetch-site')
    if (site !== undefined && site !== 'same-origin')
      return refuse(c, t, 403, 'CSRF_ORIGIN', 'woFind.error.failed')
    if (!/^application\/json\b/i.test(c.req.header('content-type') ?? ''))
      return refuse(c, t, 415, 'UNSUPPORTED_MEDIA_TYPE', 'woFind.error.invalid')
    const declared = Number(c.req.header('content-length'))
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES)
      return refuse(c, t, 400, 'INVALID_SEARCH', 'woFind.error.invalid')
    const ask = parseSearch(await c.req.text())
    if (!ask) return refuse(c, t, 400, 'INVALID_SEARCH', 'woFind.error.invalid')

    const { keys, settings, readable } = await woRuntime(pool, config)
    if (!readable) return refuse(c, t, 503, 'UNAVAILABLE', 'woFind.error.failed')
    if (settings.publicFindSearchesPerDay === 0) return refuse(c, t, 429, 'CLOSED', 'woFind.error.daily')
    if (!keys.google) return refuse(c, t, 503, 'CREDENTIAL_MISSING', 'woFind.error.failed')

    // The address's own counts first, so an address over its cap never spends the deployment's.
    const ip = ipBucketOf(clientIp(c))
    if (
      (await over(`wo-public:ip:${ip}:h`, settings.publicFindSearchesPerAddressHour, HOUR_MS)) ||
      (await over(`wo-public:ip:${ip}:m`, settings.publicFindSearchesPerAddressMinute, MINUTE_MS))
    )
      return refuse(c, t, 429, 'RATE_LIMITED', 'woFind.error.limit')

    let domain
    try {
      domain = await loadDomain()
    } catch {
      return refuse(c, t, 503, 'UNAVAILABLE', 'woFind.error.failed')
    }
    let center = 'query' in ask ? null : { lat: ask.lat, lon: ask.lon, label: null }
    if (!center) {
      const found = await geocode(domain, ask.query)
      if (found.code === 'PLACE_NOT_FOUND') return refuse(c, t, 404, found.code, 'woFind.error.notFound')
      if (found.code === 'BUSY') return refuse(c, t, 429, found.code, 'woFind.error.busy')
      if (found.code) return refuse(c, t, 502, found.code, 'woFind.error.failed')
      center = found.center
    }

    // One cache for both Finds (`website-opportunities/src/places-cache.js`): asked around the cache cell's centre, a nearby
    // visitor's search is the same request; a kept answer costs no Google call and no deployment
    // budget, which is reserved only right before a real request.
    const caching = settings.placesCacheDays > 0
    const asked = caching ? snapToCell(center, ask.radiusM, settings.placesCacheCellMeters) : center
    const budget = { refusal: null }
    const googleFetch = placesCacheFetch({
      fetchImpl,
      pool,
      now,
      days: () => settings.placesCacheDays,
      onMiss: async () => {
        if (await over('wo-public:all:m', settings.publicFindSearchesPerMinute, MINUTE_MS))
          budget.refusal = [429, 'BUSY', 'woFind.error.busy']
        else if (await over('wo-public:all:d', settings.publicFindSearchesPerDay, DAY_MS))
          budget.refusal = [429, 'DAILY_LIMIT', 'woFind.error.daily']
        if (budget.refusal) throw Object.assign(new Error('public find budget spent'), { code: 'BUDGET' })
      }
    })
    let found
    let hidden = 0
    try {
      // The signed-in Find's default area search (every kind of business, no filter), one call: the
      // places a stranger picks here are the ones that search finds after sign-in.
      const answer = await domain.searchAreaGplaces(
        { lat: asked.lat, lon: asked.lon, radiusM: ask.radiusM, trade: null },
        {
          fetch: googleFetch,
          ...(resolve ? { resolve } : {}),
          googleKey: keys.google,
          timeoutMs: GOOGLE_TIMEOUT_MS
        }
      )
      // Sure chains are hidden there by default, so here too.
      const marked = domain.markChains(domain.dedupeCandidates(answer.candidates))
      found = marked.filter((p) => p.chain !== true)
      hidden = marked.length - found.length
    } catch (error) {
      if (budget.refusal) return refuse(c, t, ...budget.refusal)
      if (error?.code === 'TIMEOUT') return refuse(c, t, 504, 'SEARCH_TIMEOUT', 'woFind.error.failed')
      return refuse(c, t, 502, 'DISCOVERY_FAILED', 'woFind.error.failed')
    }
    // Distances from this visitor, not from the cell's centre.
    found = found.map((p) =>
      Number.isFinite(p.lat) && Number.isFinite(p.lon)
        ? { ...p, distanceM: Math.round(domain.distanceM(center, p)) }
        : p
    )
    const rows = found.filter((p) => typeof p?.providerId === 'string' && PLACE_ID.test(p.providerId))
    // Published shared research only (no account), one read-only lookup; a failed read shows plain rows.
    const decorated = await decorateResearch(rows).catch(() => rows)
    const candidates = decorated.map(publicCandidate)
    c.header('cache-control', 'no-store')
    return c.json({ center, provider: 'google-places', pages: 1, hiddenChains: hidden, candidates })
  })

  /**
   * The place box's budget: per address an hour and a minute, checked first; the deployment's minute
   * and UTC day (0 = no suggestions) reserved right before a real Google request, so a kept answer
   * (`website-opportunities/src/places-cache.js`, shared with the signed-in box) costs none of it. Returns the refusal, or
   * `{deps, budget}` for the domain call. A refusal only stops the box; typing and Search still work.
   */
  async function suggestTurn(c, t) {
    const { keys, settings, readable } = await woRuntime(pool, config)
    if (!readable) return refuse(c, t, 503, 'UNAVAILABLE', 'woFind.error.failed')
    if (settings.publicFindSuggestPerDay === 0) return refuse(c, t, 429, 'CLOSED', 'woFind.error.daily')
    if (!keys.google) return refuse(c, t, 503, 'CREDENTIAL_MISSING', 'woFind.error.failed')
    const ip = ipBucketOf(clientIp(c))
    if (
      (await over(`wo-public:suggest:ip:${ip}:h`, settings.publicFindSuggestPerAddressHour, HOUR_MS)) ||
      (await over(`wo-public:suggest:ip:${ip}:m`, settings.publicFindSuggestPerAddressMinute, MINUTE_MS))
    )
      return refuse(c, t, 429, 'RATE_LIMITED', 'woFind.error.limit')
    const budget = { refusal: null }
    const googleFetch = placesCacheFetch({
      fetchImpl,
      pool,
      now,
      days: () => settings.placesCacheDays,
      onMiss: async () => {
        if (await over('wo-public:suggest:all:m', settings.publicFindSuggestPerMinute, MINUTE_MS))
          budget.refusal = [429, 'BUSY', 'woFind.error.busy']
        else if (await over('wo-public:suggest:all:d', settings.publicFindSuggestPerDay, DAY_MS))
          budget.refusal = [429, 'DAILY_LIMIT', 'woFind.error.daily']
        if (budget.refusal) throw Object.assign(new Error('public suggest budget spent'), { code: 'BUDGET' })
      }
    })
    return { deps: { fetch: googleFetch, ...(resolve ? { resolve } : {}), googleKey: keys.google }, budget }
  }

  /** The caller checks both place-box doors share: role, switches, typing session, the domain. */
  async function suggestCaller(c) {
    if (!onMaster()) return c.notFound()
    const t = translator(requestLanguage(c))
    if (!(await switchesOn())) return refuse(c, t, 404, 'FEATURE_OFF', 'woFind.error.off')
    const asked = suggestSession(c.req.query('session'), c.req.query('lang'))
    if (asked.refusal) return refuse(c, t, asked.refusal.status, asked.refusal.code, 'woFind.error.invalid')
    let domain
    try {
      domain = await loadDomain()
    } catch {
      return refuse(c, t, 503, 'UNAVAILABLE', 'woFind.error.failed')
    }
    return { t, domain, session: asked.session, lang: asked.lang }
  }

  app.get('/find/api/places/suggest', async (c) => {
    const ctx = await suggestCaller(c)
    if (ctx instanceof Response) return ctx
    const typed = suggestInput(c.req.query('q'))
    if (typed.refusal)
      return refuse(c, ctx.t, typed.refusal.status, typed.refusal.code, 'woFind.error.invalid')
    c.header('cache-control', 'no-store')
    if (typed.tooShort) return c.json({ suggestions: [] })
    const turn = await suggestTurn(c, ctx.t)
    if (turn instanceof Response) return turn
    try {
      const suggestions = await suggestFrom(
        ctx.domain,
        { input: typed.input, session: ctx.session, lang: ctx.lang },
        turn.deps
      )
      return c.json({ suggestions })
    } catch (error) {
      if (turn.budget.refusal) return refuse(c, ctx.t, ...turn.budget.refusal)
      const r = providerRefusalOf(error)
      return refuse(c, ctx.t, r.status, r.code, 'woFind.error.failed')
    }
  })

  app.get('/find/api/places/suggest/:placeId', async (c) => {
    const ctx = await suggestCaller(c)
    if (ctx instanceof Response) return ctx
    const placeId = c.req.param('placeId')
    if (!isPlaceId(placeId)) return refuse(c, ctx.t, 400, 'INVALID_PLACE_ID', 'woFind.error.invalid')
    const turn = await suggestTurn(c, ctx.t)
    if (turn instanceof Response) return turn
    try {
      const place = await resolveFrom(ctx.domain, placeId, ctx, turn.deps)
      if (!place) return refuse(c, ctx.t, 404, 'PLACE_NOT_FOUND', 'woFind.error.notFound')
      c.header('cache-control', 'no-store')
      return c.json(place)
    } catch (error) {
      if (turn.budget.refusal) return refuse(c, ctx.t, ...turn.budget.refusal)
      const r = providerRefusalOf(error)
      return refuse(c, ctx.t, r.status, r.code, 'woFind.error.failed')
    }
  })

  app.post('/find/api/research', async (c) => {
    if (!onMaster()) return c.notFound()
    const t = translator(requestLanguage(c))
    if (!(await switchesOn())) return refuse(c, t, 404, 'FEATURE_OFF', 'woFind.error.off')
    const site = c.req.header('sec-fetch-site')
    if (site !== undefined && site !== 'same-origin')
      return refuse(c, t, 403, 'CSRF_ORIGIN', 'woFind.error.failed')
    if (!/^application\/json\b/i.test(c.req.header('content-type') ?? ''))
      return refuse(c, t, 415, 'UNSUPPORTED_MEDIA_TYPE', 'woFind.error.invalid')
    const declared = Number(c.req.header('content-length'))
    if (Number.isFinite(declared) && declared > MAX_RESEARCH_BODY)
      return refuse(c, t, 400, 'INVALID_RESEARCH', 'woFind.error.invalid')
    const placeIds = parseResearch(await c.req.text())
    if (!placeIds) return refuse(c, t, 400, 'INVALID_RESEARCH', 'woFind.error.invalid')
    if (!research) return refuse(c, t, 503, 'UNAVAILABLE', 'woFind.error.failed')
    const ip = ipBucketOf(clientIp(c))
    if (await over(`wo-public:research:ip:${ip}:m`, RESEARCH_POSTS_PER_MINUTE, MINUTE_MS))
      return refuse(c, t, 429, 'RATE_LIMITED', 'woFind.error.limit')
    const { settings, readable } = await woRuntime(pool, config)
    if (!readable) return refuse(c, t, 503, 'UNAVAILABLE', 'woFind.error.failed')
    const limits = {
      perAddressDay: settings.publicResearchNewPlacesPerAddressDay,
      perDay: settings.publicResearchNewPlacesPerDay,
      budgetCents: settings.researchPublicDailyCapCents,
      jobCapCents: settings.researchJobCapCents
    }
    const places = []
    try {
      for (const placeId of placeIds) {
        const answer = await research.admit({ providerId: placeId, ipBucket: ip, now: now(), limits })
        if (answer.refused) places.push({ placeId, state: 'refused', code: answer.refused })
        else if (answer.state === 'researched') {
          const [held] = await research.researched([placeId])
          places.push({
            placeId,
            state: 'researched',
            researchedAt: iso(held?.researchedAt ?? answer.researchedAt),
            canBuild: held?.canBuild === true
          })
        } else if (answer.state === 'stopped') places.push({ placeId, state: 'stopped' })
        else places.push({ placeId, state: answer.state, receipt: answer.receipt })
      }
    } catch {
      return refuse(c, t, 503, 'UNAVAILABLE', 'woFind.error.failed')
    }
    c.header('cache-control', 'no-store')
    return c.json({ places })
  })

  // Research again (tasks/todo-wo-research-again.md; 24/10/2026): a stranger may look again at a researched
  // place's failed, outdated or never-tried parts; Tracy pays, inside the same limits as a first research.
  const againRuntime = async () => {
    const { keys, settings, readable } = await woRuntime(pool, config)
    return { keys, settings, readable, domain: await loadDomain().catch(() => null) }
  }

  app.get('/find/api/research-again', async (c) => {
    if (!onMaster()) return c.notFound()
    const t = translator(requestLanguage(c))
    if (!(await switchesOn())) return refuse(c, t, 404, 'FEATURE_OFF', 'woFind.error.off')
    const placeId = c.req.query('placeId') ?? ''
    if (!RESEARCH_ID.test(placeId)) return refuse(c, t, 400, 'INVALID_RESEARCH', 'woFind.error.invalid')
    if (!research) return refuse(c, t, 503, 'UNAVAILABLE', 'woFind.error.failed')
    const ip = ipBucketOf(clientIp(c))
    if (await over(`wo-public:research-read:ip:${ip}:m`, RESEARCH_READS_PER_MINUTE, MINUTE_MS))
      return refuse(c, t, 429, 'RATE_LIMITED', 'woFind.error.limit')
    const limited = againPartsOf(c.req.query('parts'))
    if ('error' in limited) return refuse(c, t, 400, 'INVALID_RESEARCH', 'woFind.error.invalid')
    const rt = await againRuntime()
    if (!rt.readable) return refuse(c, t, 503, 'UNAVAILABLE', 'woFind.error.failed')
    let plan
    try {
      plan = await research.againPreview({
        providerId: placeId,
        now: now(),
        keys: rt.keys,
        settings: rt.settings,
        domain: rt.domain,
        jobCapCents: rt.settings.researchJobCapCents,
        onlyParts: limited.parts
      })
    } catch {
      return refuse(c, t, 503, 'UNAVAILABLE', 'woFind.error.failed')
    }
    c.header('cache-control', 'no-store')
    return c.json({ placeId, plan, payer: 'tracy', open: rt.settings.publicResearchAgainPerPlacePerDay > 0 })
  })

  app.post('/find/api/research-again', async (c) => {
    if (!onMaster()) return c.notFound()
    const t = translator(requestLanguage(c))
    if (!(await switchesOn())) return refuse(c, t, 404, 'FEATURE_OFF', 'woFind.error.off')
    const site = c.req.header('sec-fetch-site')
    if (site !== undefined && site !== 'same-origin')
      return refuse(c, t, 403, 'CSRF_ORIGIN', 'woFind.error.failed')
    if (!/^application\/json\b/i.test(c.req.header('content-type') ?? ''))
      return refuse(c, t, 415, 'UNSUPPORTED_MEDIA_TYPE', 'woFind.error.invalid')
    const declared = Number(c.req.header('content-length'))
    if (Number.isFinite(declared) && declared > MAX_RESEARCH_BODY)
      return refuse(c, t, 400, 'INVALID_RESEARCH', 'woFind.error.invalid')
    let body
    try {
      body = JSON.parse(await c.req.text())
    } catch {
      body = null
    }
    // Nothing the browser says about a place is taken: exactly `{placeId}`, and optionally the `parts` to look at.
    const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : []
    const limited = againPartsOf(body?.parts)
    if (
      !keys.includes('placeId') ||
      keys.some((k) => k !== 'placeId' && k !== 'parts') ||
      !RESEARCH_ID.test(String(body.placeId)) ||
      'error' in limited
    )
      return refuse(c, t, 400, 'INVALID_RESEARCH', 'woFind.error.invalid')
    if (!research) return refuse(c, t, 503, 'UNAVAILABLE', 'woFind.error.failed')
    const ip = ipBucketOf(clientIp(c))
    if (await over(`wo-public:research:ip:${ip}:m`, RESEARCH_POSTS_PER_MINUTE, MINUTE_MS))
      return refuse(c, t, 429, 'RATE_LIMITED', 'woFind.error.limit')
    const rt = await againRuntime()
    if (!rt.readable) return refuse(c, t, 503, 'UNAVAILABLE', 'woFind.error.failed')
    const limits = {
      perAddressDay: rt.settings.publicResearchNewPlacesPerAddressDay,
      perDay: rt.settings.publicResearchNewPlacesPerDay,
      budgetCents: rt.settings.researchPublicDailyCapCents,
      jobCapCents: rt.settings.researchJobCapCents
    }
    let answer
    try {
      answer = await research.admitAgain({
        providerId: body.placeId,
        ipBucket: ip,
        now: now(),
        limits,
        keys: rt.keys,
        settings: rt.settings,
        domain: rt.domain,
        onlyParts: limited.parts
      })
    } catch {
      return refuse(c, t, 503, 'UNAVAILABLE', 'woFind.error.failed')
    }
    c.header('cache-control', 'no-store')
    if (answer.refused)
      return c.json(
        { placeId: body.placeId, state: 'refused', code: answer.refused, plan: answer.plan ?? null },
        200
      )
    return c.json({
      placeId: body.placeId,
      state: answer.state,
      ...(answer.receipt ? { receipt: answer.receipt } : {}),
      plan: answer.plan ?? null
    })
  })

  app.get('/find/api/research', async (c) => {
    if (!onMaster()) return c.notFound()
    const t = translator(requestLanguage(c))
    if (!(await switchesOn())) return refuse(c, t, 404, 'FEATURE_OFF', 'woFind.error.off')
    const placeIds = listParam(c.req.query('placeIds'), RESEARCH_ID)
    // A receipt that is not one simply reads as unknown: nothing to tell apart for a guesser.
    const receipts = listParam(c.req.query('receipts'), /^[^,]{1,64}$/)
    if (!placeIds || !receipts) return refuse(c, t, 400, 'INVALID_RESEARCH', 'woFind.error.invalid')
    if (!research) return refuse(c, t, 503, 'UNAVAILABLE', 'woFind.error.failed')
    const ip = ipBucketOf(clientIp(c))
    if (await over(`wo-public:research-read:ip:${ip}:m`, RESEARCH_READS_PER_MINUTE, MINUTE_MS))
      return refuse(c, t, 429, 'RATE_LIMITED', 'woFind.error.limit')
    let places
    let progress
    try {
      progress = await research.progress(receipts, { now: now() })
      const done = Object.values(progress)
        .filter((p) => p.state === 'researched')
        .map((p) => p.placeId)
      const asked = [...new Set([...placeIds, ...done])]
      const held = asked.length ? await research.researched(asked) : []
      const byId = new Map(asked.map((id, i) => [id, held[i]]))
      places = placeIds.map((placeId) => {
        const h = byId.get(placeId)
        return h
          ? { placeId, state: 'researched', researchedAt: iso(h.researchedAt), canBuild: h.canBuild === true }
          : { placeId, state: 'none' }
      })
      progress = Object.fromEntries(
        Object.entries(progress).map(([receipt, p]) => {
          if (p.state !== 'researched') return [receipt, p]
          const h = byId.get(p.placeId)
          return [
            receipt,
            { ...p, researchedAt: iso(h?.researchedAt ?? p.researchedAt), canBuild: h?.canBuild === true }
          ]
        })
      )
    } catch {
      return refuse(c, t, 503, 'UNAVAILABLE', 'woFind.error.failed')
    }
    c.header('cache-control', 'no-store')
    return c.json({ places, receipts: progress })
  })

  // Any other door under /find/api answers JSON, never the page.
  app.all('/find/api/*', (c) => c.json({ code: 'NO_SUCH_DOOR' }, 404))

  return app
}
