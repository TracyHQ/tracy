/**
 * The public Design inspiration page (ADR 0011, Task 3), ported from
 * `workers/cowork-web/src/worker.js`'s `designPage`/`designDshFetch`. Three doors behind
 * `/design-inspiration`, all reachable with no seat:
 *
 *   GET  /design-inspiration[/…]        the built page and its assets, off disk (`root`)
 *   GET  /design-inspiration/api/read   a visitor's words, read live off their own home page
 *   POST /design-inspiration/api/words  the same words, written by the model behind `config.model`
 *   *    /design-inspiration/api/brand* the brand engine, reached as a GUEST of the landing site
 *   *    /design-inspiration/api/none/* 404 — the doors a seat would need, answered as "no file"
 *
 * `laneFetch` here is this process's `designDshFetch`: it mints a GUEST session (never a real
 * seat) into `config.defaultHost`'s dsh for `config.guestSiteKey`, cached in memory for twenty
 * minutes (the Worker kept the same token in KV; this process has no KV, so a module-scoped
 * variable is the whole cache — one process, one cache, same lifetime rule).
 *
 * DOMAIN-PURE ON PURPOSE (`test/module-graph.test.mjs`): this file lives under `src/public/`, a
 * domain of its own, and may only import `lib/`/`db/` — `seatDoor.mintSeatSession` (a sibling in
 * `workspace/`) and `fleetLabel` (a sibling in `sites/`) arrive as injected deps from `app.js`
 * instead of a direct import, same convention every other cross-domain need in this app already
 * follows.
 */
import { Hono } from 'hono'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getMimeType } from 'hono/utils/mime'
import { apiRead, apiWords, apiBrand, libraryHeaders } from './design-page.js'
import { requestLanguage, translate } from '../lib/i18n/index.js'
import { modelForDoor } from '../lib/llm-door.js'

const MOUNT = '/design-inspiration'
const GUEST_TOKEN_TTL_MS = 20 * 60 * 1000
// Every guest-lane door answers at once (an extraction is started, then polled), so a lane silent
// for this long is down, not busy.
const LANE_TIMEOUT_MS = 30 * 1000

const DEFAULT_ROOT = fileURLToPath(new URL('../../static/design-inspiration', import.meta.url))

/** One file under `root`, or null when it is missing or not a plain file. */
async function readAsset(root, relPath) {
  const path = join(root, relPath)
  let stats
  try {
    stats = await stat(path)
  } catch {
    return null
  }
  if (!stats.isFile()) return null
  return { body: await readFile(path), mimeType: getMimeType(path) ?? 'application/octet-stream' }
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  })
}

/**
 * @param {object} deps
 * @param {object} deps.config - `readConfig`'s value: `model`, `turnstileSecret`,
 *   `turnstileDisabled`, `hosts`, `defaultHost`, `guestSiteKey`, `siteDomain`.
 * @param {import('pg').Pool | null} [deps.pool] - for `apiRead`'s rate limit; null fails closed.
 * @param {{mintSeatSession: Function}} [deps.seatDoor] - the workspace domain's seat-door client.
 * @param {(siteKey: string, zone: string) => Promise<string>} [deps.fleetLabel] - the sites
 *   domain's label algorithm; a guest is granted the same folder a seat holder would be.
 * @param {typeof fetch} [deps.fetchImpl] - test seam; used for the model call, Turnstile, and the
 *   guest lane fetch alike.
 * @param {(hostname: string) => Promise<string[]>} [deps.resolve] - test seam for `publicTarget`'s
 *   DNS-resolution check (`apiRead`, `apiBrand`) — a test must never make a real DNS query.
 * @param {() => number} [deps.now] - test seam for the guest-token cache's clock.
 * @param {number} [deps.laneTimeoutMs] - test seam: how long one guest-lane call may take.
 * @param {string} [deps.root] - where the built page lives on disk (test override).
 * @returns {import('hono').Hono}
 */
export function publicRoutes({
  config,
  pool = null,
  seatDoor = { mintSeatSession: async () => null },
  fleetLabel = async () => null,
  fetchImpl = fetch,
  resolve,
  now = Date.now,
  laneTimeoutMs = LANE_TIMEOUT_MS,
  root = DEFAULT_ROOT
}) {
  const app = new Hono()
  // No KV in this process — `FLEET_SITES` is `null` here ONLY for `apiRead`'s response cache
  // (design-page.js's `apiRead` already treats a missing one as "no cache", a harmless perf
  // no-op); it is NOT how rate limiting works any more (that used to be `bumpCounter`'s job, and
  // `bumpCounter` is gone — see design-page.js's `dailyLimitOrClosed`). No Workers AI binding
  // either — `model` carries the bearer key and base URL `apiWords` needs instead. `pool` is
  // EVERY rate limit in this file (`apiRead`, `apiWords`, `apiBrand` alike) — null (no
  // DATABASE_URL) fails CLOSED (`lib/rate.js`'s `overLimit` throws on a null pool, and
  // `dailyLimitOrClosed` treats any throw as "the limit is already hit"), never as an open door.
  const env = {
    FLEET_SITES: null,
    model: config.model,
    // The provider book, asked per REQUEST rather than read once here: an administrator rotating a
    // key on the Model & AI screen must reach this public door without a redeploy, and this bag is
    // built once when the routes are mounted. Falls back to `config.model` on its own
    // (`lib/llm-door.js`), so a deployment with no database is unchanged.
    modelForDoor: (door) => modelForDoor(pool, door, config),
    TURNSTILE_SECRET: config.turnstileSecret,
    TURNSTILE_DISABLED: config.turnstileDisabled,
    pool
  }

  let cachedToken = null
  let cachedAt = 0

  /** A fresh GUEST session into the landing site's dsh, or null when there is nothing to mint one
   *  with (no configured host, or no configured `guestSiteKey`). Never a real seat: the grant's
   *  `role` is always `'guest'`, exactly as a visitor's own guest view of that site would get. */
  async function mintGuestToken(host) {
    if (!config.guestSiteKey) return null
    const label = await fleetLabel(config.guestSiteKey, config.siteDomain)
    if (!label) return null
    return seatDoor.mintSeatSession({
      origin: host.dshOrigin,
      secret: host.seatSecret,
      grant: { role: 'guest', folders: [`/site/${label}`], site: config.guestSiteKey },
      fetchImpl
    })
  }

  async function guestToken(host) {
    if (cachedToken && now() - cachedAt < GUEST_TOKEN_TTL_MS) return cachedToken
    const fresh = await mintGuestToken(host)
    if (fresh) {
      cachedToken = fresh
      cachedAt = now()
    }
    return fresh
  }

  // 503, never 502: Cloudflare replaces an origin 502 or 504 with its own `error code: 502`
  // text/plain page, so a translated 502 here never reached anyone (#811 F-S5-001, measured 11/10
  // on cowork.tracy.site with `GUEST_SITE_KEY` unset). 503 passes the edge untouched.
  const unavailable = (lang = 'en') =>
    jsonResponse(503, { code: 'LANE_UNAVAILABLE', message: translate(lang, 'api.brandReaderUnavailable') })

  /** `designDshFetch`, ported: one call into the guest lane, retried once with a fresh session on
   *  a 401/403 (a cached token the lane no longer honours), never on any other status. Never
   *  throws and never hands back a 502/504: a lane that cannot be reached, does not answer within
   *  `laneTimeoutMs`, or answers as a gateway would is `unavailable`, so the door always speaks
   *  JSON in the asker's language. */
  async function laneFetch(path, init = {}, lang = 'en') {
    try {
      const res = await laneCall(path, init)
      if (res === null || res.status === 502 || res.status === 504) return unavailable(lang)
      return res
    } catch (error) {
      console.warn(`[public] guest lane ${path}: ${error instanceof Error ? error.message : String(error)}`)
      return unavailable(lang)
    }
  }

  /**
   * The guest-lane call itself; null when there is no lane or no guest session to call it with.
   *
   * One time limit covers everything up to the lane's answer — minting the guest session included,
   * since a lane that hangs on the mint hangs the door just the same — and ends there: the body of
   * an answer (a large extraction) streams on without a clock that would cut it off halfway.
   */
  async function laneCall(path, init) {
    const host = config.hosts.get(config.defaultHost)
    if (!host) return null
    const limit = new AbortController()
    const timer = setTimeout(
      () => limit.abort(new Error(`no answer within ${laneTimeoutMs} ms`)),
      laneTimeoutMs
    )
    const expired = new Promise((_, reject) => {
      limit.signal.addEventListener('abort', () => reject(limit.signal.reason), { once: true })
    })
    expired.catch(() => {})
    /** @template T @param {Promise<T>} work @returns {Promise<T>} */
    const inTime = (work) => Promise.race([work, expired])
    const call = (token) =>
      fetchImpl(`${host.dshOrigin}${path}`, {
        ...init,
        headers: { ...init.headers, cookie: `dsh_gateway_token=${token}` },
        signal: limit.signal
      })
    try {
      const token = await inTime(guestToken(host))
      if (!token) return null
      let res = await inTime(call(token))
      if (res.status === 401 || res.status === 403) {
        cachedToken = null
        const again = await inTime(guestToken(host))
        if (again) res = await inTime(call(again))
      }
      return res
    } finally {
      clearTimeout(timer)
    }
  }

  app.all(`${MOUNT}/api/read`, (c) =>
    c.req.method === 'GET' ? apiRead(c.req.raw, env, { fetch: fetchImpl, resolve }) : c.notFound()
  )
  app.all(`${MOUNT}/api/words`, (c) =>
    c.req.method === 'POST' ? apiWords(c.req.raw, env, { fetch: fetchImpl }) : c.notFound()
  )
  // The lane's own refusal (`LANE_UNAVAILABLE`) speaks the asker's language too (#753).
  const laneFetchFor = (c) => (path, init) => laneFetch(path, init, requestLanguage(c))
  app.all(`${MOUNT}/api/brand`, (c) =>
    apiBrand(c.req.raw, env, '', { laneFetch: laneFetchFor(c), fetch: fetchImpl, resolve })
  )
  app.all(`${MOUNT}/api/brand/*`, (c) => {
    const rest = c.req.path.slice(`${MOUNT}/api/brand/`.length)
    return apiBrand(c.req.raw, env, rest, { laneFetch: laneFetchFor(c), fetch: fetchImpl, resolve })
  })
  // The doors a seat would need — `choose`, `copy/*` — answered as "no file", same as the Worker:
  // the shared components already treat a 404 here as "nothing to write", and `publicMode` hides
  // the buttons that would otherwise call them.
  app.all(`${MOUNT}/api/none/*`, () => jsonResponse(404, { code: 'NO_SUCH_DOOR' }))
  app.all(`${MOUNT}/api/*`, () => jsonResponse(404, { code: 'NO_SUCH_DOOR' }))

  app.get(MOUNT, (c) => servePage(c, root))
  app.get(`${MOUNT}/*`, (c) => servePage(c, root))

  return app
}

/** A file of the built page, or the page itself (`index.html`) for a pretty address. */
async function servePage(c, root) {
  const url = new URL(c.req.url)
  const rest = url.pathname.slice(MOUNT.length).replace(/^\/+/, '')
  const looksLikeFile = /\.[a-z0-9]+$/i.test(rest)
  if (looksLikeFile) {
    const asset = await readAsset(root, rest)
    if (asset) {
      const headers = new Headers({ 'content-type': asset.mimeType })
      const extra = libraryHeaders(rest, url)
      if (extra) for (const [k, v] of Object.entries(extra)) headers.set(k, v)
      return new Response(asset.body, { status: 200, headers })
    }
    return new Response('Not found', { status: 404 })
  }
  const index = await readAsset(root, 'index.html')
  if (!index) return new Response('The design page has not been built into this deploy.', { status: 404 })
  return new Response(index.body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }
  })
}
