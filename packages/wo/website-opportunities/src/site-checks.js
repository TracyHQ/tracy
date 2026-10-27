/**
 * Site checks: what a restaurant's CURRENT website is like, measured in the background after a search
 * (Find spec §1): PageSpeed mobile (performance, SEO, LCP, mobile-friendly, the
 * platforms Lighthouse detects) plus one read of the homepage through the crawler's pinned fetch
 * (CMS and version, footer year, emails and social links — `domain.detectStack`).
 *
 * One row per normalised address in `wo_site_check` (migration 129), shared by every account: a
 * Lighthouse run takes 10–30 s, so a search never waits for it. THE ROW IS THE QUEUE: `request`
 * writes `queued` rows and answers what is known now; `tick` (every 3 s while something is queued)
 * leases claimable rows for two minutes and runs them through `durable-queue.js` (fenced by
 * `lease_token`, migration 130), so a restart or a second web instance neither loses nor doubles a
 * check, a worker whose lease ran out cannot overwrite a newer result, and the third failed attempt
 * is final. `concurrency` and `hourlyCap` are deployment-wide.
 * A `done` verdict is kept 30 days, a `down`/`blocked`/`failed` one 24 h, then asked again.
 *
 * The worker never throws: a failure is a verdict with a short `error` code, logged once.
 */
import { createDurableQueue } from './durable-queue.js'
import { isChallengePage, mergeAttempts } from './escalating-fetch.js'
import { checkPageSpeed } from './pagespeed.js'

const HOUR_MS = 3_600_000
const DONE_MAX_AGE_MS = 30 * 24 * HOUR_MS
const FAIL_MAX_AGE_MS = 24 * HOUR_MS
const PAGE_MAX_BYTES = 2 * 1024 * 1024
const PAGE_TIMEOUT_MS = 20_000
const VERDICTS = new Set(['done', 'down', 'blocked', 'failed'])
const BLOCKED_HTTP = new Set([401, 403, 429])
// A retry needs at least this much of the read's deadline left (tier 2 on).
const RETRY_MIN_MS = 1000
/** "For sale" wording: a strong parked signal in the title or the visible text. */
const PARKED_WORDS = /\bdomain\s+(?:name\s+)?(?:is\s+)?for\s+sale\b|\bbuy\s+this\s+domain\b/i
const PARKED_MARKERS = [
  PARKED_WORDS,
  /sedoparking/i,
  /hugedomains/i,
  /godaddy\.com\/forsale/i,
  /\bdan\.com\b/i,
  /afternic/i
]

/**
 * A domain parked for sale instead of the restaurant's site: two independent markers anywhere, or one in the title,
 * or the "for sale" wording in the visible text. One broker link in a real site's footer is not enough.
 */
export function isParkedPage(html) {
  const head = String(html ?? '').slice(0, 200_000)
  const title = /<title[^>]*>([^<]*)/i.exec(head)?.[1] ?? ''
  if (PARKED_MARKERS.some((re) => re.test(title))) return true
  const text = head.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ')
  if (PARKED_WORDS.test(text)) return true
  return PARKED_MARKERS.filter((re) => re.test(head)).length >= 2
}

/**
 * The address a check is filed under: scheme, lower-case host and path, no query, hash or trailing
 * slash. The scheme stays — the homepage is fetched as given, redirects say where it really lives.
 * Null for anything that is not an http(s) URL.
 * @param {string} raw @returns {string | null}
 */
export function urlKeyOf(raw) {
  let u
  try {
    u = new URL(String(raw))
  } catch {
    return null
  }
  if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname) return null
  return `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, '')}`
}

/** The check as the door answers it; a queued row says only that. */
export function checkShape(row) {
  if (!row || row.status === 'queued') return { status: 'queued' }
  return {
    status: row.status,
    finalUrl: row.final_url ?? null,
    performance: row.performance ?? null,
    seo: row.seo ?? null,
    lcpMs: row.lcp_ms ?? null,
    https: row.https ?? null,
    mobileFriendly: row.mobile_friendly ?? null,
    cms: row.cms ?? null,
    cmsVersion: row.cms_version ?? null,
    copyrightYear: row.copyright_year ?? null,
    emails: Array.isArray(row.emails) ? row.emails : [],
    socials: row.socials && typeof row.socials === 'object' ? row.socials : {},
    error: row.error ?? null,
    checkedAt: row.checked_at ? new Date(row.checked_at).toISOString() : null
  }
}

/**
 * @param {{
 *   pool: import('pg').Pool,
 *   runtime: () => Promise<{ keys: { google?: string|null }, settings: object }>,
 *   domain: object | (() => Promise<object>),
 *   fetchImpl: typeof fetch, apiFetch?: typeof fetch, resolve?: Function,
 *   now?: () => number, concurrency?: number, log?: Console,
 *   tickMs?: number, leaseMs?: number, retryDelayMs?: number, maxAttempts?: number, hourlyCap?: number,
 *   switchOn?: () => Promise<boolean>,
 *   startRead?: ReturnType<typeof import('./escalating-fetch.js').createEscalatingFetch>
 * }} deps
 *   `fetchImpl` is the crawler's pinned fetch (untrusted hosts, `pinned-fetch.js`); `apiFetch` a
 *   plain one for PageSpeed. `hourlyCap` is deployment-wide: checks started in the last hour.
 *   `startRead` (`escalating-fetch.js`) reads the homepage in two tiers when its switch is on; off or absent, the
 *   homepage is read with `fetchImpl` alone and `read_via`/`read_attempts` are not written.
 */
export function createSiteChecks({
  pool,
  runtime,
  domain,
  fetchImpl,
  apiFetch = fetch,
  resolve,
  now = Date.now,
  concurrency = 4,
  log = console,
  tickMs = 3000,
  leaseMs = 120_000,
  retryDelayMs = 5000,
  maxAttempts = 3,
  hourlyCap = 120,
  switchOn = async () => true,
  startRead
}) {
  const domainOf = typeof domain === 'function' ? domain : async () => domain
  const queue = createDurableQueue({
    pool,
    table: 'wo_site_check',
    keyColumn: 'url_key',
    name: 'site-checks',
    run: check,
    now,
    concurrency,
    leaseMs,
    maxAttempts,
    hourlyCap,
    tickMs,
    log,
    // The feature's switch: off, nothing queued is fetched (dev round L5).
    enabled: switchOn
  })

  function fresh(row) {
    if (!VERDICTS.has(row.status) || !row.checked_at) return false
    const age = now() - new Date(row.checked_at).getTime()
    return age < (row.status === 'done' ? DONE_MAX_AGE_MS : FAIL_MAX_AGE_MS)
  }

  /** Keys of the http(s) URLs given, each under its own spelling. */
  function keysOf(urls) {
    const out = new Map()
    for (const url of Array.isArray(urls) ? urls : []) {
      const key = typeof url === 'string' ? urlKeyOf(url) : null
      if (key) out.set(url, key)
    }
    return out
  }

  async function rowsOf(keys) {
    if (keys.length === 0) return new Map()
    const { rows } = await pool.query('select * from wo_site_check where url_key = any($1)', [keys])
    return new Map(rows.map((r) => [r.url_key, r]))
  }

  /** What is known about each URL, read-only: nothing is queued. Unknown addresses are absent. */
  async function lookup(urls) {
    const keys = keysOf(urls)
    const rows = await rowsOf([...new Set(keys.values())])
    const out = {}
    for (const [url, key] of keys) if (rows.has(key)) out[url] = checkShape(rows.get(key))
    return out
  }

  /**
   * What is known about each URL. What is missing or stale is queued, the first `limit` of them in
   * the order given (the client sends them by score); the rest answer `{status: 'not_queued'}` and
   * can be asked again later. The enqueue never touches a row a worker holds.
   */
  async function request(urls, { limit = Number.POSITIVE_INFINITY } = {}) {
    const keys = keysOf(urls)
    const seenAt = new Date(now())
    const rows = await rowsOf([...new Set(keys.values())])
    const out = {}
    const queued = new Map()
    for (const [url, key] of keys) {
      const row = rows.get(key)
      if (row && (fresh(row) || row.status === 'queued')) {
        out[url] = checkShape(row)
        continue
      }
      if (!queued.has(key)) {
        if (queued.size >= limit) {
          out[url] = { status: 'not_queued' }
          continue
        }
        queued.set(key, url)
      }
      out[url] = { status: 'queued' }
    }
    if (queued.size > 0) {
      await queue.enqueue(
        [...queued].map(([key, url]) => ({ key, fields: { url } })),
        { seenAt }
      )
      void queue.tick()
    }
    return out
  }

  async function check(row, lease) {
    const { url_key: key, url } = row
    const store = (v) => storeVerdict(lease, url, v)
    const dom = await domainOf()
    const { keys } = await runtime()
    // The read's deadline starts here: the guard's DNS answer is part of it.
    const first = startRead?.()
    const tiered = first?.enabled ? first : null
    try {
      await dom.assertPublicUrl(url, { resolve })
    } catch (error) {
      return store({ ...verdictOfError(error), read: tiered ? { via: null, attempts: [] } : undefined })
    }
    const [psi, page] = await Promise.all([
      keys?.google ? checkPageSpeed(url, keys.google, { fetch: apiFetch, now }) : null,
      readHomepage(dom, url, tiered)
    ])
    const facts = {
      finalUrl: page.url ?? null,
      performance: psi?.performance ?? null,
      seo: psi?.seo ?? null,
      lcpMs: psi?.lcpMs ?? null,
      mobileFriendly: psi?.mobileFriendly ?? null,
      https: page.url ? page.url.startsWith('https:') : (psi?.https ?? null),
      read: page.read
    }
    if (page.ok) {
      const stack = detectStack(dom, key, {
        html: page.html,
        finalUrl: page.url,
        stackPacks: psi?.stackPacks ?? []
      })
      return store({ ...facts, ...stack, status: 'done', error: null })
    }
    // No readable homepage: PageSpeed alone still says the site exists, how it does and what it runs. A parked
    // domain is not the restaurant's site, whatever PageSpeed measured.
    if (page.status === 'failed' && psi && page.error !== 'parked') {
      const stack = detectStack(dom, key, { html: '', finalUrl: url, stackPacks: psi.stackPacks })
      return store({ ...facts, ...stack, status: 'done', error: page.error })
    }
    log.warn?.(`[site-checks] ${key}: ${page.status} (${page.error})`)
    return store({ ...facts, status: page.status, error: page.error })
  }

  /**
   * The homepage as given, through the crawler's guarded fetch (≤ 5 redirects): `{ok: true, url, html}`,
   * or `{ok: false, status, error}` — `down` only after one retry, `blocked` for a refusal or a
   * bot challenge, `failed` for anything else.
   */
  async function readHomepage(dom, url, tiered = null) {
    const reads = tiered ? [tiered] : []
    let verdict = await readOnce(dom, url, tiered)
    // With tiers on, the retry spends the same deadline as the first read.
    const room = !tiered || tiered.remainingMs() > retryDelayMs + RETRY_MIN_MS
    if (!verdict.ok && verdict.status === 'down' && retryDelayMs >= 0 && room) {
      await new Promise((r) => setTimeout(r, retryDelayMs))
      const again = tiered ? startRead({ deadlineAt: tiered.deadlineAt }) : null
      if (again?.enabled) reads.push(again)
      verdict = await readOnce(dom, url, again?.enabled ? again : null)
    }
    if (tiered)
      verdict.read = { via: verdict.via ?? null, attempts: mergeAttempts(reads.map((r) => r.attempts())) }
    return verdict
  }

  async function readOnce(dom, url, read = null) {
    let got
    try {
      got = await dom.fetchLimited(url, {
        fetch: read ? read.fetch : fetchImpl,
        resolve,
        maxBytes: PAGE_MAX_BYTES,
        timeoutMs: read ? read.remainingMs() : PAGE_TIMEOUT_MS,
        headers: { accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1' }
      })
    } catch (error) {
      return verdictOfError(error)
    }
    const via = read?.via() ?? null
    const verdict = judge(got)
    return via ? { ...verdict, via } : verdict
  }

  /** The verdict on a homepage that answered. */
  function judge(got) {
    const isText = !got.mime || got.mime.startsWith('text/') || got.mime.includes('xml')
    const html = isText ? new TextDecoder().decode(got.bytes) : ''
    if (isChallengePage(html)) return { ok: false, url: got.url, status: 'blocked', error: 'challenge' }
    if (isParkedPage(html)) return { ok: false, url: got.url, status: 'failed', error: 'parked' }
    if (BLOCKED_HTTP.has(got.status))
      return { ok: false, url: got.url, status: 'blocked', error: `http_${got.status}` }
    if (got.status >= 500) return { ok: false, url: got.url, status: 'down', error: `http_${got.status}` }
    return { ok: true, url: got.url, html }
  }

  function detectStack(dom, key, input) {
    const empty = { cms: null, cmsVersion: null, copyrightYear: null, emails: [], socials: {} }
    if (typeof dom.detectStack !== 'function') return empty
    try {
      const s = dom.detectStack({ ...input, now: new Date(now()) }) ?? {}
      const version = s.cmsVersion ?? s.version
      return {
        cms: typeof s.cms === 'string' && s.cms ? s.cms.slice(0, 80) : null,
        cmsVersion: typeof version === 'string' && version ? version.slice(0, 40) : null,
        copyrightYear: Number.isInteger(s.copyrightYear) ? s.copyrightYear : null,
        emails: Array.isArray(s.emails) ? s.emails.filter((e) => typeof e === 'string').slice(0, 10) : [],
        socials: s.socials && typeof s.socials === 'object' ? s.socials : {}
      }
    } catch (error) {
      log.warn?.(`[site-checks] ${key}: stack detection failed (${error?.code ?? 'error'})`)
      return empty
    }
  }

  /** The verdict, written only while the lease is ours (a lost lease is logged by the queue). */
  function storeVerdict(lease, url, v) {
    return lease.finish({
      url,
      status: v.status,
      final_url: v.finalUrl ?? null,
      performance: v.performance ?? null,
      seo: v.seo ?? null,
      lcp_ms: v.lcpMs ?? null,
      https: v.https ?? null,
      mobile_friendly: v.mobileFriendly ?? null,
      cms: v.cms ?? null,
      cms_version: v.cmsVersion ?? null,
      copyright_year: v.copyrightYear ?? null,
      emails: JSON.stringify(v.emails ?? []),
      socials: JSON.stringify(v.socials ?? {}),
      error: v.error ?? null,
      checked_at: new Date(now()),
      ...(v.read ? { read_via: v.read.via, read_attempts: JSON.stringify(v.read.attempts) } : {})
    })
  }

  const { tick, drain, start, stop } = queue
  return { request, lookup, tick, drain, start, stop, urlKeyOf }
}

/** A guard or fetch error as a verdict: the guard's refusal cannot be retried; no answer means down. */
function verdictOfError(error) {
  const code = error?.code
  if (code === 'URL_BLOCKED') {
    const dns = error.reason === 'dns_failed' || error.reason === 'dns_empty'
    return dns
      ? { ok: false, status: 'down', error: 'dns' }
      : { ok: false, status: 'failed', error: 'url_blocked' }
  }
  if (code === 'TIMEOUT') return { ok: false, status: 'down', error: 'timeout' }
  if (code === 'FETCH_FAILED') return { ok: false, status: 'down', error: 'fetch_failed' }
  return { ok: false, status: 'failed', error: code === 'TOO_MANY_REDIRECTS' ? 'redirects' : 'fetch_error' }
}
