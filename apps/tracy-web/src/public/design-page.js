/**
 * The public Design inspiration page's doors (ADR 0011), ported from
 * `workers/cowork-web/src/design-page.js`. Every pure function here — `publicTarget`, `wordsOf`,
 * `isChallengePage`, `wordsFromModel`, `textOfAnswer`, `libraryHeaders` — is unchanged: same
 * inputs, same outputs, same tests, just a new home. One thing changed, because this process is
 * not a Cloudflare Worker and has none of the bindings one gets for free:
 *
 *   `apiWords` used `env.AI.run(WORDS_MODEL, …)` (Workers AI). Here it POSTs
 *   `${model.baseUrl}/chat/completions` itself, OpenAI-shaped, with `model.apiKey` as a bearer
 *   token — `wordsFromModel`/`textOfAnswer` still do all the parsing, unchanged. No `env.model`
 *   configured is 503 `MODEL_NOT_CONFIGURED`, not a crash and not a fallback to some other key.
 *
 * `verifyTurnstile` FAILS CLOSED exactly as the Worker's did (a first draft here skipped the check
 * when no secret was configured, on the theory that a dev lane never sets one — overruled on
 * review: a public, unauthenticated door with a missing-config-means-open failure mode is exactly
 * the pattern `CLAUDE.md` §6 names the `seat-door` gate as existing to catch). The one way past it
 * without a secret is `env.TURNSTILE_DISABLED` — a named, explicit flag, never inferred from the
 * secret's absence. `apiRead` rate-limits by client IP through `deps.pool` and `lib/rate.js`'s
 * `overLimit`, same fail-closed discipline `seats/route.js`/`workspaces/route.js` already use: a
 * database this process cannot reach is treated as the limit already hit, not as "go ahead" — this
 * door fetches an arbitrary caller-supplied URL, so an unlimited version of it is an open proxy.
 *
 * Everything that reads a URL a stranger typed still goes through `publicTarget`: http(s) only, no
 * loopback, no private ranges, no bare hosts without a dot — PLUS a DNS-resolution check and a
 * manual, re-validated redirect walk (`fetchPage`) that the Worker never had, both added on review
 * (see `publicTarget`'s own docstring for why): the Worker's guard was inherited verbatim, and it
 * turned out to be bypassable in a way this process's blast radius makes worth closing rather than
 * carrying forward unexamined.
 */
import { lookup as dnsLookup } from 'node:dns/promises'
import { requestLanguage, translator } from '../lib/i18n/index.js'
import { cut, wordsOf } from '../lib/home-page-words.js'
import { overLimit } from '../lib/rate.js'
import {
  DESIGN_BRAND_LIMIT_PER_DAY,
  DESIGN_READ_LIMIT_PER_DAY,
  DESIGN_WORDS_LIMIT_PER_DAY
} from '../lib/policy.js'

/** Hosts a stranger may point us at: a public name with a dot, never an address we own. Doubles as
 *  the check on a RESOLVED IP address (through `isPrivateAddress` below, not used bare on an
 *  address any more — see there for why): every branch here that names an address range (`127…`,
 *  `10…`, `192.168…`, `172.16-31…`, `169.254…`, the IPv6 ones) is anchored end to end, so it
 *  matches a bare address string exactly as well as it matches a typed hostname. The IPv6 branches
 *  cover `::` itself, loopback (`::1`), link-local (`fe80::/10`, written as the four possible
 *  second-hextet nibbles `8`–`b`), and unique-local (`fc00::/7`, i.e. anything starting `fc`/`fd`)
 *  — NOT IPv4-mapped forms (`::ffff:…`), which need the IPv4 they embed unwrapped and checked
 *  against `PRIVATE_IPV4` first (see `ipv4MappedAddress`/`isPrivateAddress`): a regex alternative
 *  here would have to duplicate every IPv4 range's boundaries a second time, in hex, to be correct
 *  for the general case rather than one hardcoded address. */
const PRIVATE_HOST =
  /^(localhost|.*\.local|.*\.internal|.*\.lan|0\.0\.0\.0|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2}|\[?::\]?|\[?::1\]?|\[?fe[89ab][0-9a-f]:.*|\[?fc.*|\[?fd.*)$/i

/** The IPv4 half of `PRIVATE_HOST`'s ranges, alone — reused to check the address an IPv4-mapped
 *  IPv6 form embeds, once `ipv4MappedAddress` has unwrapped it down to plain dotted-quad. */
const PRIVATE_IPV4 =
  /^(0\.0\.0\.0|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2})$/

/**
 * The IPv4 address an IPv4-mapped IPv6 form embeds, or null when `addr` is not that shape.
 *
 * 🔒 BOTH FORMS, BECAUSE NODE DOES NOT PICK ONE FOR YOU. `dns.lookup` can hand back either
 * `::ffff:127.0.0.1` (dotted-quad, RFC 5952's recommended form) or `::ffff:7f00:1` (the same
 * address as two hex hextets) depending on the platform resolver — verified directly against
 * Node's own `dns.lookup`: feeding it `::ffff:7f00:1` returns exactly that string, unchanged, not
 * normalized to the dotted form. A check against only the string this file happens to compose in
 * a test is the same hole with a better disguise, so both are handled here.
 */
function ipv4MappedAddress(addr) {
  const stripped = addr.replace(/^\[|\]$/g, '')
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(stripped)
  if (dotted) return dotted[1]
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(stripped)
  if (!hex) return null
  const high = Number.parseInt(hex[1], 16)
  const low = Number.parseInt(hex[2], 16)
  if (!Number.isInteger(high) || !Number.isInteger(low) || high > 0xffff || low > 0xffff) return null
  return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`
}

/** Is `addr` — one address a hostname resolved to — private? An IPv4-mapped IPv6 form is unwrapped
 *  to the IPv4 it names and checked against `PRIVATE_IPV4` first: `PRIVATE_HOST` alone tests
 *  `false` on `::ffff:127.0.0.1` and `::ffff:10.0.0.5` (verified directly), which would otherwise
 *  sail straight through `hostResolvesPublic`. */
function isPrivateAddress(addr) {
  const mapped = ipv4MappedAddress(addr)
  return mapped !== null ? PRIVATE_IPV4.test(mapped) : PRIVATE_HOST.test(addr)
}

/** Every address a hostname resolves to, lower-cased and de-duplicated; `dns.lookup(…, {all:true})`
 *  by default, overridable for tests (which must never make a real DNS query). */
async function defaultResolve(hostname) {
  const results = await dnsLookup(hostname, { all: true, verbatim: true })
  return results.map((r) => r.address)
}

/**
 * Does `hostname` resolve to at least one address, none of them private?
 *
 * This is the fix for a bypass the string checks above cannot see: `http://127.0.0.1.nip.io/` (and
 * `sslip.io`, `xip.io`, and anyone's own DNS record) is a perfectly public-LOOKING hostname — it
 * has a dot, it is not on the `PRIVATE_HOST` list — that resolves straight to a private address.
 * `publicTarget`'s hostname check is pure string matching with no DNS involved, exactly like the
 * Worker's; a resolver rebinding a public name to a private address defeats it completely.
 *
 * 🔒 TOCTOU, NAMED RATHER THAN HIDDEN: this resolves once, here; `fetchImpl`'s own connection
 * resolves again, independently, and nothing pins that connection to the address checked here. An
 * attacker-controlled name with a very short TTL that answers public here and private a moment
 * later is NOT caught. This closes the bypasses that took no effort at all to find (a rebinding
 * hostname, a redirect to a private address, an IPv4-mapped IPv6 form of a private address in
 * either of its two textual shapes) — it does not claim to close every possible one, and nothing
 * downstream should assume it did.
 */
async function hostResolvesPublic(hostname, resolve) {
  let addresses
  try {
    addresses = await resolve(hostname)
  } catch {
    return false
  }
  return addresses.length > 0 && addresses.every((addr) => !isPrivateAddress(addr))
}

/**
 * The URL a typed domain means, or null when it must not be fetched.
 *
 * ⚠ ASYNC, unlike the Worker's byte-for-byte original: this now resolves `host` and refuses when
 * any address is private (`hostResolvesPublic`), on top of the Worker's own string-only checks —
 * see `hostResolvesPublic`'s docstring for the bypass this closes and the TOCTOU window it does
 * not. Both callers (`apiRead`, `apiBrand`) `await` it and thread `deps.resolve` through so a test
 * never makes a real DNS query.
 * @param {string} raw
 * @param {(hostname: string) => Promise<string[]>} [resolve]
 * @returns {Promise<URL | null>}
 */
export async function publicTarget(raw, resolve = defaultResolve) {
  const trimmed = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (trimmed === '' || trimmed.length > 253 + 8) return null
  let url
  try {
    url = new URL(/^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  const host = url.hostname
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(host)) return null
  if (PRIVATE_HOST.test(host)) return null
  if (!(await hostResolvesPublic(host, resolve))) return null
  // Only the home page is read: a typed path is dropped, never fetched.
  url.pathname = '/'
  url.search = ''
  url.hash = ''
  return url
}

/**
 * Is this exact URL (path included — unlike `publicTarget`, which resets it) safe to follow as a
 * REDIRECT HOP? Same rules as `publicTarget`'s host checks, minus the path reset: a redirect's
 * destination path must be kept as-is, or a legitimate root→locale redirect (`/` → `/en/`) would
 * loop forever against this door's own re-fetch of `/`. Used only by `fetchPage`'s manual redirect
 * walk, never by a caller that wants the "home page of a typed domain" shape `publicTarget` gives.
 */
async function redirectTargetSafe(url, resolve) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (url.username || url.password) return false
  const host = url.hostname.toLowerCase()
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(host)) return false
  if (PRIVATE_HOST.test(host)) return false
  return hostResolvesPublic(host, resolve)
}

/** The `SitePreview` Design inspiration takes: the words as `site`, one home page. */
export function previewOf(words) {
  const { thin, ...site } = words
  return {
    present: true,
    thin,
    site: {
      schemaVersion: 'tracy-design-preview/v1',
      readAt: new Date().toISOString(),
      site,
      pages: [{ path: '/', type: 'home', label: 'Home', data: {} }]
    }
  }
}

// ─── reading one home page ───────────────────────────────────────────
// Four ways a real home page defeats a single `fetch` + `res.text()`, each answered here rather
// than folded into one "could not reach" (measured 07/09 on a Joomla demo: 2.4s to first byte,
// 320KB of body, right on the old 6s edge). The shapes are the ones OpenDesign's own harvester
// carries in `vendor/od-brand-engine/src/prefetch.ts`; the budgets are its 8s, split in two.
const READ_HEADERS_MS = 8000 // to the first byte — a slow origin, not a dead one
const READ_BODY_MS = 6000 // to stream the body; whatever arrived by then is what we read
const RETRY_HEADERS_MS = 5000
const RETRY_BODY_MS = 5000
const RETRY_DELAY_MS = 400
const READ_CACHE_TTL_S = 6 * 3600
/** A page read only as far as it got is cached briefly: the next visitor may get the whole thing. */
const READ_PARTIAL_TTL_S = 10 * 60
// `lib/rate.js`'s `overLimit` took an optional `windowMs` (default one hour, unchanged for every
// other caller) so this file's three public, unauthenticated doors — `apiRead`, `apiWords`,
// `apiBrand` — can each carry the Worker's own DAILY number forward as an actual number, through
// `dailyLimitOrClosed` below, rather than bending it to fit an hour it was never in (a 20/hour
// first draft for `apiRead` alone was measured to be ~16x looser than the Worker's 30/day). One
// ceiling per door, not the Worker's separate "reads" vs "tries" split for `apiRead` — a single
// Postgres-backed check is what `lib/rate.js` offers and this task was told not to invent a second
// limiter next to it.
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_HTML_BYTES = 1_500_000

/** A browser-shaped agent: bot walls and hotlink guards answer `TracyDesignPage/1` differently. */
const READ_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

// Anti-bot interstitials, in the three tiers `prefetch.ts` measured them in. A wall's own palette
// and copy are Cloudflare's, never the visitor's brand — so a wall is named as one and its words
// are dropped, rather than handed back as a home page.
const CHALLENGE_TITLE_RE =
  /just a moment|attention required|access denied|verifying you are human|checking your browser|security check|please verify|are you a robot|ddos[- ]guard|captcha/i
const CHALLENGE_DEFINITIVE_RE =
  /cf-browser-verification|_cf_chl_opt|cdn-cgi\/challenge-platform|this website uses a security service|enable javascript and cookies to continue|verify you are human|px-captcha|_incapsula_|EO_Bot_Ssid|__tst_status/i
// A live login or comment page can legitimately embed Turnstile or DataDome. That counts as a wall
// only when the page is otherwise content-sparse — a bare widget and little else.
const CHALLENGE_AMBIGUOUS_RE = /challenges\.cloudflare\.com|cf-turnstile|datadome/i

/** The cheap structural signals a read feeds on — a wall has none of them, a real page has plenty. */
function looksContentRich(html) {
  const scan = html.slice(0, 400_000)
  const anchors = (scan.match(/<a\s[^>]*\bhref=/gi) ?? []).length
  const headings = (scan.match(/<h[1-3][\s/>]/gi) ?? []).length
  const paragraphs = (scan.match(/<p[\s/>]/gi) ?? []).length
  return anchors >= 8 || headings >= 3 || (anchors >= 3 && paragraphs >= 3)
}

const linkCount = (html) => (html.match(/<a\s[^>]*\bhref=/gi) ?? []).length

/**
 * True when the body IS the wall rather than the site behind it.
 *
 * The ambiguous tier is deliberately STRICTER here than in `prefetch.ts`, and the reason is the
 * cost of being wrong: upstream a false positive only thins one harvest, whereas here it refuses a
 * visitor's own domain outright. A small landing page that embeds Turnstile on its contact form is
 * not content-rich by that measure, so the marker alone must not condemn it — a wall also has no
 * navigation at all, and that is the signal carrying the weight.
 */
export function isChallengePage(html) {
  if (typeof html !== 'string' || html === '') return false
  const head = html.slice(0, 200_000)
  if (CHALLENGE_DEFINITIVE_RE.test(head)) return true
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? ''
  if (CHALLENGE_TITLE_RE.test(title)) return true
  return CHALLENGE_AMBIGUOUS_RE.test(head) && !looksContentRich(head) && linkCount(head) < 2
}

const timeoutError = (where) => Object.assign(new Error(`${where} timed out`), { name: 'TimeoutError' })

/** The charset the response declared, when `TextDecoder` knows it; utf-8 otherwise. */
function decoderFor(contentType) {
  const label = /charset\s*=\s*"?([\w-]+)"?/i.exec(contentType ?? '')?.[1]
  if (label) {
    try {
      return new TextDecoder(label)
    } catch {
      /* an unknown label is not a reason to refuse the page */
    }
  }
  return new TextDecoder('utf-8')
}

// A browser allows roughly 20; this is a server fetching a stranger-supplied URL on that
// stranger's behalf, with each hop re-validated (DNS included) rather than trusted, so a much
// lower ceiling is deliberate — enough for the ordinary chain a real site uses (http→https→www),
// not enough to be worth building an amplification chain out of.
const MAX_REDIRECT_HOPS = 5

/**
 * Fetch one page under two deadlines instead of one. The headers must land within `headersMs`; the
 * body then streams under `bodyMs`, and when that runs out the bytes already in hand are the read
 * — `partial: true`. This is the difference between "the site is unreachable" and "the site is
 * slow", which one timeout cannot tell apart.
 *
 * 🔒 REDIRECTS ARE MANUAL, NOT `redirect: 'follow'` — the Worker's own choice, and the second SSRF
 * bypass found on review: a URL that passes `publicTarget` can still answer with a 302 to a private
 * address, and neither `fetch` nor the Worker's use of it ever looks at a hop before taking it.
 * Each hop's `Location` is resolved to an absolute URL and re-checked with `redirectTargetSafe`
 * (`publicTarget`'s own host rules, DNS included, minus its path reset — a hop's destination path
 * must be kept, not forced back to `/`, or a legitimate root→locale redirect never terminates
 * against this door's own retry of `/`) before it is ever followed, capped at `MAX_REDIRECT_HOPS`.
 */
async function fetchPage(fetchImpl, href, headersMs, bodyMs, dnsResolve, hopsLeft = MAX_REDIRECT_HOPS) {
  const ctl = new AbortController()
  let timer = setTimeout(() => ctl.abort(timeoutError('the site')), headersMs)
  let res
  try {
    res = await fetchImpl(href, {
      redirect: 'manual',
      signal: ctl.signal,
      headers: { 'user-agent': READ_UA, accept: 'text/html,application/xhtml+xml,*/*;q=0.8' }
    })
  } finally {
    clearTimeout(timer)
  }
  const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
  if (location !== null) {
    if (hopsLeft <= 0) throw Object.assign(new Error('too many redirects'), { name: 'BlockedRedirectError' })
    let next
    try {
      next = new URL(location, href)
    } catch {
      throw Object.assign(new Error('a redirect pointed nowhere sensible'), { name: 'BlockedRedirectError' })
    }
    if (!(await redirectTargetSafe(next, dnsResolve)))
      throw Object.assign(new Error('a redirect pointed at a private, loopback, or disallowed address'), {
        name: 'BlockedRedirectError'
      })
    return fetchPage(fetchImpl, next.href, headersMs, bodyMs, dnsResolve, hopsLeft - 1)
  }
  const contentType = res.headers.get('content-type') ?? ''
  const reader = res.body?.getReader?.()
  if (!reader) return { res, contentType, html: (await res.text()).slice(0, MAX_HTML_BYTES), partial: false }
  const chunks = []
  let total = 0
  let partial = false
  const STALLED = Symbol('stalled')
  const deadline = Date.now() + bodyMs
  timer = setTimeout(() => ctl.abort(timeoutError('the body')), bodyMs)
  try {
    for (;;) {
      const left = deadline - Date.now()
      if (left <= 0) {
        partial = true
        break
      }
      let stall
      const step = await Promise.race([
        reader.read().catch(() => STALLED),
        new Promise((resolve) => {
          stall = setTimeout(() => resolve(STALLED), left)
        })
      ]).finally(() => clearTimeout(stall))
      if (step === STALLED) {
        partial = true
        break
      }
      if (step.done) break
      chunks.push(step.value)
      total += step.value.length
      // The cap is a decision, not a failure: enough of a home page to read is already in hand.
      if (total >= MAX_HTML_BYTES) break
    }
  } finally {
    clearTimeout(timer)
    reader.cancel().catch(() => {})
  }
  const bytes = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.length
  }
  return {
    res,
    contentType,
    html: decoderFor(contentType).decode(bytes.subarray(0, MAX_HTML_BYTES)),
    partial
  }
}

/**
 * The one rate check shared by every door in this file, Postgres-backed (`lib/rate.js`'s
 * `overLimit`), keyed by client IP, one calendar day. Fails CLOSED: a check the database could not
 * answer (no pool configured, a query error) is treated as the limit already hit, same discipline
 * `lib/rate.js`'s `overLimitOrClosed` already uses. This replaces `bumpCounter` (deleted): that
 * function's `!env.FLEET_SITES` branch returned "not over limit" whenever its KV binding was
 * absent, which in this process is ALWAYS — a permanent no-op silently leaving `apiWords` (which
 * spends `MODEL_API_KEY` on every call) and `apiBrand` (which triggers a shared Chromium job)
 * completely unbounded. `apiRead` — an unauthenticated door that fetches an arbitrary
 * caller-supplied URL — is exactly why fail-open and fail-closed must never sit six lines apart
 * doing opposite things for adjacent doors.
 */
async function dailyLimitOrClosed(deps, env, bucket, limitPerDay) {
  const checkLimit = deps.overLimit ?? overLimit
  const now = deps.now ?? Date.now
  try {
    return await checkLimit(env.pool, bucket, limitPerDay, now(), DAY_MS)
  } catch {
    return true
  }
}

/** One typed domain → the words on its home page, cached by host. */
export async function apiRead(request, env, deps = {}) {
  const t = translator(requestLanguage(request))
  const url = new URL(request.url)
  const resolve = deps.resolve ?? defaultResolve
  const target = await publicTarget(url.searchParams.get('url') ?? '', resolve)
  if (target === null) return json(400, { code: 'BAD_URL', message: t('api.badUrl') })
  const host = target.hostname
  const cacheKey = `readcache:${host}`
  const cached = env.FLEET_SITES ? await env.FLEET_SITES.get(cacheKey) : null
  if (cached) return json(200, JSON.parse(cached), { 'x-tracy-cache': 'hit' })
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  // This door fetches an arbitrary caller-supplied URL — with no limit it is an open proxy, a way
  // to make Tracy's own servers hammer a third party (or itself) on a stranger's say-so.
  if (await dailyLimitOrClosed(deps, env, `design-read:${ip}`, DESIGN_READ_LIMIT_PER_DAY))
    return json(429, { code: 'RATE_LIMITED', message: t('api.readRateLimited') })
  const fetchImpl = deps.fetch ?? fetch
  const budget = deps.readBudget ?? {}
  const headersMs = budget.headersMs ?? READ_HEADERS_MS
  const bodyMs = budget.bodyMs ?? READ_BODY_MS
  let page
  try {
    page = await fetchPage(fetchImpl, target.href, headersMs, bodyMs, resolve)
  } catch (error) {
    // A redirect hop that failed its own re-check is a deterministic refusal, not a network hiccup
    // — retrying sends the exact same request at the exact same hostile redirect again.
    if (error?.name === 'BlockedRedirectError')
      return json(502, {
        code: 'BLOCKED',
        message: t('api.blockedRedirect', { host })
      })
    // A dropped connection is worth one more try; a timeout has already spent its budget, and
    // spending it twice only makes the visitor wait twice for the same answer.
    if (error?.name === 'TimeoutError')
      return json(502, {
        code: 'UNREACHABLE',
        message: t('api.unreachable', { host, reason: t('api.timedOut') })
      })
    await new Promise((r) => setTimeout(r, deps.retryDelayMs ?? RETRY_DELAY_MS))
    try {
      page = await fetchPage(
        fetchImpl,
        target.href,
        budget.retryHeadersMs ?? RETRY_HEADERS_MS,
        budget.retryBodyMs ?? RETRY_BODY_MS,
        resolve
      )
    } catch (again) {
      if (again?.name === 'BlockedRedirectError')
        return json(502, {
          code: 'BLOCKED',
          message: t('api.blockedRedirect', { host })
        })
      return json(502, {
        code: 'UNREACHABLE',
        message: t('api.unreachable', {
          host,
          reason: t(again?.name === 'TimeoutError' ? 'api.timedOut' : 'api.noAnswer')
        })
      })
    }
  }
  // A wall answers 403/503 with a page, so the status is read after the body, not before it.
  if (isChallengePage(page.html))
    return json(502, {
      code: 'BLOCKED',
      message: t('api.verificationWall', { host })
    })
  if (!page.res.ok)
    return json(502, {
      code: 'UNREACHABLE',
      message: t('api.answeredStatus', { host, status: page.res.status })
    })
  if (!/text\/html/i.test(page.contentType))
    return json(502, { code: 'NOT_HTML', message: t('api.notHtml', { host }) })
  const words = wordsOf(page.html, target.href)
  const body = { ok: true, host, partial: page.partial, ...previewOf(words) }
  if (env.FLEET_SITES)
    await env.FLEET_SITES.put(cacheKey, JSON.stringify(body), {
      expirationTtl: page.partial ? READ_PARTIAL_TTL_S : READ_CACHE_TTL_S
    })
  return json(200, body)
}

const WORDS_MAX_BRIEF = 400

/**
 * The words the model wrote, as the site block — every field checked and cut; the model's JSON is
 * the first `{…}` in its answer, since small models like to talk around it.
 * @param {string} text
 * @param {string} brief
 */
export function wordsFromModel(text, brief) {
  const m = /\{[\s\S]*\}/.exec(String(text ?? ''))
  let parsed = null
  try {
    parsed = m ? JSON.parse(m[0]) : null
  } catch {
    parsed = null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const str = (v, n) => (typeof v === 'string' && v.trim() !== '' ? cut(v.trim(), n) : null)
  const nav = Array.isArray(parsed.nav)
    ? parsed.nav
        .filter((x) => typeof x === 'string' && x.trim() !== '')
        .map((x) => cut(x.trim(), 24))
        .slice(0, 5)
    : []
  const name = str(parsed.name, 60)
  const headline = str(parsed.headline, 120)
  if (!name || !headline) return null
  return {
    name,
    url: null,
    nav,
    eyebrow: str(parsed.eyebrow, 60),
    headline,
    sub: str(parsed.sub, 280) ?? cut(brief, 280),
    cta: str(parsed.cta, 40),
    cta2: str(parsed.cta2, 40),
    image: null,
    thin: false
  }
}

/**
 * The text of a chat completion, whichever shape the answer wears: a string, `response` as a
 * string (Workers AI's older models), `response` already parsed to an object, or the OpenAI shape
 * this process's own model call gets back (`choices[0].message.content`).
 * @param {unknown} answer
 */
export function textOfAnswer(answer) {
  if (typeof answer === 'string') return answer
  if (!answer || typeof answer !== 'object') return ''
  const a = /** @type {Record<string, any>} */ (answer)
  if (typeof a.response === 'string') return a.response
  if (a.response && typeof a.response === 'object') return JSON.stringify(a.response)
  const content = a.choices?.[0]?.message?.content
  return typeof content === 'string' ? content : ''
}

const WORDS_SYSTEM_PROMPT =
  'You write the words of a business website home page. Answer with ONE JSON object and nothing else: ' +
  '{"name": the business name (invent a short one if the brief has none), "eyebrow": 2-5 words above the headline, ' +
  '"headline": 4-9 words, "sub": one or two sentences of 20-35 words, "nav": 3-5 short menu labels, ' +
  '"cta": a 2-3 word button, "cta2": a second 2-3 word button}. Write in the language of the brief. No markdown.'

/**
 * A name or a sentence about a business → the site block, written by a chat completion.
 *
 * 🔒 `env.model` (never `env.AI`): this process has no Workers AI binding, so the model is a
 * bearer key plus a base URL (`config.model`, read once in `config.js`) and the call is a plain
 * `fetch` to `${model.baseUrl}/chat/completions`, OpenAI-shaped. No key configured is 503
 * `MODEL_NOT_CONFIGURED` — stated, not guessed around, and the key itself never rides along in any
 * response: a failed call reports the model's own answer or the fetch error's message, never the
 * request it was given.
 */
export async function apiWords(request, env, deps = {}) {
  const t = translator(requestLanguage(request))
  let body = {}
  try {
    body = await request.json()
  } catch {
    // empty
  }
  const brief =
    typeof body?.brief === 'string' ? body.brief.trim().replace(/\s+/g, ' ').slice(0, WORDS_MAX_BRIEF) : ''
  if (brief.length < 3) return json(400, { code: 'BAD_BRIEF', message: t('api.badBrief') })
  // The provider book first, then what `config.js` read from the environment. `env` here is this
  // domain's dependency bag, and `env.modelForDoor` is wired by `app.js`; a deployment with no
  // database keeps the old behaviour exactly (`lib/llm-door.js`).
  const model = env.modelForDoor ? await env.modelForDoor('web') : env.model
  if (!model)
    return json(503, {
      code: 'MODEL_NOT_CONFIGURED',
      message: t('api.wordsOff')
    })
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  // This door spends `model.apiKey` on every call — unbounded, a stranger spends Tracy's model
  // budget at will.
  if (await dailyLimitOrClosed(deps, env, `design-words:${ip}`, DESIGN_WORDS_LIMIT_PER_DAY))
    return json(429, {
      code: 'RATE_LIMITED',
      message: t('api.wordsRateLimited')
    })
  const fetchImpl = deps.fetch ?? fetch
  let answer
  try {
    const res = await fetchImpl(`${model.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${model.apiKey}` },
      body: JSON.stringify({
        model: model.words,
        messages: [
          { role: 'system', content: WORDS_SYSTEM_PROMPT },
          { role: 'user', content: brief }
        ],
        max_tokens: 400,
        temperature: 0.6
      })
    })
    if (!res.ok) {
      // The model's own error body is surfaced to help debugging, but never on faith: a hostile or
      // misbehaving endpoint could echo the request back at us, bearer header included, so the key
      // is redacted out of whatever text comes back rather than trusted not to appear in it.
      const text = await res.text().catch(() => '')
      const safe = text ? text.slice(0, 200).split(model.apiKey).join('[redacted]') : ''
      throw new Error(`the model answered ${res.status}${safe ? `: ${safe}` : ''}`)
    }
    answer = await res.json()
  } catch (error) {
    // Redacted for the same reason as the non-ok branch above: whatever threw (a network error, a
    // client library) is not a trusted source not to have echoed the bearer key back into its own
    // message, so the key is never assumed absent — it is checked for and removed.
    const raw = error instanceof Error ? error.message : String(error)
    const safe = raw.split(model.apiKey).join('[redacted]')
    return json(502, { code: 'MODEL_FAILED', message: t('api.modelFailed', { detail: safe }) })
  }
  const words = wordsFromModel(textOfAnswer(answer), brief)
  if (!words) return json(502, { code: 'MODEL_ANSWER_UNUSABLE', message: t('api.modelUnusable') })
  return json(200, { ok: true, brief, ...previewOf(words) })
}

/**
 * Turnstile: the token the page got, verified with the secret.
 *
 * FAILS CLOSED, same as the Worker: no secret configured is a REFUSAL, not a pass. This is a
 * public, unauthenticated door — "missing config reads as an open door" is exactly the shape
 * CLAUDE.md §6 names as what the `seat-door` gate exists to catch, and an absent secret must not
 * quietly become "everyone gets through." The only way past it is `env.TURNSTILE_DISABLED`
 * (`config.turnstileDisabled` / the `TURNSTILE_DISABLED` env var) — a NAMED, explicit flag an
 * operator sets on purpose for a lane with no Turnstile secret (local dev, a test lane), never
 * inferred from the secret's mere absence.
 */
export async function verifyTurnstile(env, token, ip, fetchImpl = fetch) {
  if (!env.TURNSTILE_SECRET)
    return env.TURNSTILE_DISABLED ? { ok: true } : { ok: false, reason: 'not-configured' }
  if (typeof token !== 'string' || token === '') return { ok: false, reason: 'missing' }
  try {
    const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip })
    })
    const body = await res.json()
    return body && body.success === true ? { ok: true } : { ok: false, reason: 'rejected' }
  } catch {
    return { ok: false, reason: 'unreachable' }
  }
}

/**
 * The brand doors: start on the guest lane (Turnstile first), read progress, read the card's files.
 * `deps.laneFetch(path, init)` is this process's own way to the guest lane with a minted GUEST
 * session (`public/route.js`'s `laneFetch`, ported from `designDshFetch` in `worker.js`).
 */
export async function apiBrand(request, env, rest, deps) {
  const t = translator(requestLanguage(request))
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  if (rest === '' && request.method === 'POST') {
    let body = {}
    try {
      body = await request.json()
    } catch {
      // empty
    }
    const target = await publicTarget(body?.url ?? '', deps.resolve ?? defaultResolve)
    if (target === null) return json(400, { code: 'BAD_URL', message: t('api.badUrl') })
    // `refresh` is how a caller says "measure it as it is today" — the one way past the thirty-day
    // rule. Until 08/09 nothing sent it, so a card measured once was frozen for thirty days even
    // after the engine that measured it was corrected. It stays BEHIND the human check on purpose:
    // skipping the shortcut is exactly what spends a Chromium run on a shared lane.
    const refresh = body?.refresh === true
    // Already measured, and recently enough to stand: hand the card straight back. Nothing is
    // going to run, so there is nothing for a human check to protect and no reason to make a
    // visitor solve one — the lane decides what "recently enough" means (30 days, `fresh` in its
    // answer), so the rule lives in one place. This read is public either way: the same job is
    // readable at `GET api/brand/<host>` with no check at all.
    if (!refresh) {
      const existing = await deps
        .laneFetch(`/api/tracy-brand-engine/extract/${encodeURIComponent(target.hostname)}`, {
          headers: { accept: 'application/json' }
        })
        .catch(() => null)
      if (existing?.ok) {
        const job = await existing.json().catch(() => null)
        if (job?.state === 'done' && job.fresh === true) return json(200, job)
      }
    }
    const gate = await verifyTurnstile(env, body?.turnstile, ip, deps.fetch)
    if (!gate.ok)
      return json(403, {
        code: 'TURNSTILE',
        message: gate.reason === 'not-configured' ? t('api.brandOff') : t('api.turnstileFailed')
      })
    // This door triggers a shared Chromium job on the guest lane — unbounded, a stranger spends
    // that shared resource at will.
    if (await dailyLimitOrClosed(deps, env, `design-brand:${ip}`, DESIGN_BRAND_LIMIT_PER_DAY))
      return json(429, {
        code: 'RATE_LIMITED',
        message: t('api.brandRateLimited')
      })
    const res = await deps.laneFetch('/api/tracy-brand-engine/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        url: target.href,
        kind: 'reference',
        deep: true,
        ...(refresh ? { refresh: true } : {})
      })
    })
    return passthrough(res)
  }
  const m = /^([a-z0-9][a-z0-9.-]*\.[a-z]{2,})(?:\/(.+))?$/.exec(rest)
  if (!m || request.method !== 'GET') return json(404, { code: 'UNKNOWN_ROUTE' })
  const host = m[1]
  const file = m[2]
  if (file === undefined) {
    const res = await deps.laneFetch(`/api/tracy-brand-engine/extract/${encodeURIComponent(host)}`, {
      headers: { accept: 'application/json' }
    })
    return passthrough(res)
  }
  // The closed list of an inspiration's files. `artifact-slots/<kind>` was missing until 08/09, and
  // the hole did not read as a hole: the dialog fetches an artifact's page and its slot map in one
  // `Promise.all`, so a 404 on the map threw the PAGE away too and every artifact tab said "This
  // inspiration does not ship this page" — for a page the same door served at 200 and 210KB. The
  // lane has had the route all along (tracy-design-inspiration/src/host/index.ts).
  if (
    !/^(components\.html|tokens\.css|DESIGN\.md|slots|artifact-slots\/[a-z]+|system\/artifacts\/[a-z]+\.html)$/.test(
      file
    )
  )
    return json(404, { code: 'NO_SUCH_FILE' })
  const res = await deps.laneFetch(
    `/api/tracy-design-inspiration/systems/${encodeURIComponent(`brand:${host}`)}/${file}`,
    {
      headers: { accept: file === 'slots' || file.startsWith('artifact-slots/') ? 'application/json' : '*/*' }
    }
  )
  return passthrough(res)
}

async function passthrough(res) {
  const headers = new Headers()
  const type = res.headers.get('content-type')
  if (type) headers.set('content-type', type)
  headers.set('cache-control', 'no-store')
  return new Response(res.body, { status: res.status, headers })
}

/**
 * The headers a library file leaves with. The 152 systems are read by every viewer's browser
 * (cross-origin) and by the lane's own host, so they are open to any origin; a versioned address
 * (`?v=<commit>`) is kept for a year, the manifest is revalidated every time (it is how a viewer
 * learns the library moved), and anything else for five minutes.
 * @param {string} rest path under `/design-inspiration/`, e.g. `systems/airbnb/tokens.css`
 * @param {URL} url
 * @returns {Record<string, string> | null} null when the path is not a library file
 */
export function libraryHeaders(rest, url) {
  if (!rest.startsWith('systems/') && !rest.startsWith('data/')) return null
  const cache =
    rest === 'data/manifest.json'
      ? 'no-cache'
      : url.searchParams.has('v')
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=300'
  return { 'access-control-allow-origin': '*', 'cache-control': cache, vary: 'accept-encoding' }
}

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra }
  })
}
