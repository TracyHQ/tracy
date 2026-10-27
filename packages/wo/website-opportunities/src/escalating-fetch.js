/**
 * A homepage read in two tiers. Tier 1 is the crawler's pinned Node fetch, as before. When its answer is a refusal
 * (403), a confirmed bot challenge, or a connection the server cut during the TLS handshake, the same hop is asked
 * once more through `impit` — Chrome's TLS fingerprint, HTTP/2 and headers from one browser profile — dialled through
 * the guarded loopback proxy (`guarded-connect-proxy.js`), which refuses private addresses at connect time.
 *
 * `createEscalatingFetch(deps)` returns `startRead()`; each read gets its own state (escalated yet, attempt ledger,
 * deadline). `read.fetch` is a standard one-hop `fetch`: the caller (`fetchLimited`) follows redirects and re-checks
 * every hop. A tier-2 failure never replaces the tier-1 answer.
 */

export const READ_BUDGETS = Object.freeze({
  readMs: 40_000,
  tier1Ms: 20_000,
  tier2Ms: 12_000,
  minTier2Ms: 1000,
  maxBytes: 2 * 1024 * 1024
})
const PEEK_BYTES = 20_000
const SMALL_BODY = 512
const LEDGER_MAX = 12
const COOLDOWN_DEFAULT_MS = 60_000
const COOLDOWN_MAX_MS = 3_600_000
const COOLDOWN_HOSTS_MAX = 1000
const NO_BODY = new Set([101, 204, 205, 304])

/** Markers only a challenge interstitial carries; reCAPTCHA/hCaptcha forms and `challenge-platform` alone are not. */
const CHALLENGE_BODY =
  /<title>[^<]*just a moment|cf-challenge|cf_chl_|captcha-delivery|_Incapsula_Resource|px-captcha/i

/** The ledgers of one check's reads (a retry included) as one list, capped like a single read's. */
export function mergeAttempts(lists) {
  const all = lists.flat()
  const entries = all.filter((a) => !a?.truncated)
  return entries.length > LEDGER_MAX || entries.length !== all.length
    ? [...entries.slice(0, LEDGER_MAX), { truncated: true }]
    : entries
}

/** @param {string} text the first bytes of a page, decoded @param {Headers} [headers] */
export function isChallengePage(text, headers) {
  if (/(^|,)\s*challenge\s*(,|$)/i.test(headers?.get?.('cf-mitigated') ?? '')) return true
  return CHALLENGE_BODY.test(String(text ?? '').slice(0, PEEK_BYTES))
}

const RESET_CODES = new Set(['ECONNRESET', 'UND_ERR_SOCKET', 'EPIPE'])

/** Node's TLS fingerprint refused: the server reset the connection or failed the handshake. */
function tlsRefusal(error) {
  for (let e = error, depth = 0; e && depth < 4; e = e.cause, depth++) {
    const code = String(e.code ?? '')
    if (code.startsWith('CERT_') || /CERT|VERIFY|SELF_SIGNED/.test(code)) return null
    if (RESET_CODES.has(code)) return 'reset'
    if (/HANDSHAKE_FAILURE/.test(code) || /handshake failure/i.test(String(e.message ?? '')))
      return 'tls_handshake'
  }
  return null
}

function retryAfterMs(value, now) {
  if (!value) return COOLDOWN_DEFAULT_MS
  const seconds = Number(value)
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now
  return Number.isFinite(ms) && ms > 0 ? Math.min(ms, COOLDOWN_MAX_MS) : COOLDOWN_DEFAULT_MS
}

/**
 * Reads at most `limit` bytes of `res`, then hands back a Response whose body replays them and streams the rest, so the
 * caller still owns the whole body (and its cap). `all`: read to the end (or `limit`) and close upstream.
 */
async function peek(res, limit, { all = false, onCancel } = {}) {
  const init = { status: res.status, statusText: res.statusText, headers: new Headers(res.headers) }
  if (!res.body || NO_BODY.has(res.status))
    return { head: new Uint8Array(), response: new Response(null, init) }
  const reader = res.body.getReader()
  const chunks = []
  let total = 0
  let done = false
  while (total < limit) {
    const step = await reader.read()
    if (step.done) {
      done = true
      break
    }
    chunks.push(step.value)
    total += step.value.length
  }
  if (all && !done) {
    await reader.cancel().catch(() => {})
    onCancel?.()
    done = true
  }
  const whole = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    whole.set(c, off)
    off += c.length
  }
  const head = all ? whole.subarray(0, limit) : whole
  const body = new ReadableStream({
    start(c) {
      if (head.length) c.enqueue(head)
      if (done) c.close()
    },
    async pull(c) {
      const step = await reader.read()
      if (step.done) c.close()
      else c.enqueue(step.value)
    },
    async cancel(reason) {
      onCancel?.()
      await reader.cancel(reason).catch(() => {})
    }
  })
  return { head, response: new Response(body, init) }
}

/**
 * @param {{
 *   baseFetch: typeof fetch,
 *   getProxy: () => Promise<{ proxyUrl: string }>,
 *   loadImpit?: () => Promise<{ Impit: new (options: object) => { fetch: Function } }>,
 *   isEnabled?: boolean | (() => boolean),
 *   clock?: () => number,
 *   budgets?: Partial<typeof READ_BUDGETS>,
 *   log?: Pick<Console, 'warn'>
 * }} deps
 * @returns {(options?: { deadlineAt?: number }) => {
 *   enabled: boolean, fetch: typeof fetch, remainingMs: () => number, deadlineAt: number,
 *   attempts: () => object[], via: () => 'node' | 'impit' | null
 * }}
 *   Pass `deadlineAt` of an earlier read to make a retry share its deadline.
 */
export function createEscalatingFetch({
  baseFetch,
  getProxy,
  loadImpit = () => import('impit'),
  isEnabled = false,
  clock = Date.now,
  budgets = {},
  log = console
}) {
  const limits = { ...READ_BUDGETS, ...budgets }
  const enabledNow = () => (typeof isEnabled === 'function' ? isEnabled() : isEnabled) === true
  /** @type {Promise<any> | null} */
  let impitModule = null
  let impitBroken = false
  const clients = new Map()
  const cooldown = new Map()

  async function impitClient(proxyUrl) {
    impitModule ??= Promise.resolve().then(loadImpit)
    let mod
    try {
      mod = await impitModule
    } catch (error) {
      if (!impitBroken)
        log.warn?.(`[site-read] impit unavailable, tier 2 off for this process (${error?.message ?? error})`)
      impitBroken = true
      return null
    }
    const Impit = mod?.Impit ?? mod?.default?.Impit
    if (!clients.has(proxyUrl)) {
      clients.clear()
      // One Chrome profile: UA, headers and TLS come from it, verification stays on.
      clients.set(
        proxyUrl,
        new Impit({
          browser: 'chrome',
          proxyUrl,
          followRedirects: false,
          http3: false,
          timeout: limits.tier2Ms
        })
      )
    }
    return clients.get(proxyUrl)
  }

  function coolingDown(host) {
    const until = cooldown.get(host)
    if (until === undefined) return false
    if (until > clock()) return true
    cooldown.delete(host)
    return false
  }

  function coolDown(host, retryAfter) {
    if (cooldown.size >= COOLDOWN_HOSTS_MAX) {
      for (const [h, until] of cooldown) if (until <= clock()) cooldown.delete(h)
      if (cooldown.size >= COOLDOWN_HOSTS_MAX) cooldown.delete(cooldown.keys().next().value)
    }
    cooldown.set(host, clock() + retryAfterMs(retryAfter, clock()))
  }

  return function startRead({ deadlineAt } = {}) {
    const enabled = enabledNow() && !impitBroken
    const deadline = deadlineAt ?? clock() + limits.readMs
    const ledger = []
    let truncated = false
    let sticky = false
    /** @type {'node' | 'impit' | null} */
    let lastTier = null
    const remainingMs = () => Math.max(0, deadline - clock())

    function record(tier, status, reason, started) {
      if (ledger.length < LEDGER_MAX)
        ledger.push({ tier, status, reason, ms: Math.max(0, clock() - started) })
      else truncated = true
    }

    const signalFor = (init, ms) =>
      init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms)

    async function tier1(url, init) {
      const started = clock()
      const signal = signalFor(init, Math.max(1, Math.min(limits.tier1Ms, remainingMs())))
      let res
      try {
        res = await baseFetch(url, { ...init, signal })
      } catch (error) {
        const refusal = signal.aborted ? null : tlsRefusal(error)
        record(1, null, refusal ?? (signal.aborted ? 'timeout' : String(error?.code ?? 'error')), started)
        return { error, escalate: refusal !== null }
      }
      const redirect = res.status >= 300 && res.status < 400 && res.headers.has('location')
      if (redirect || res.status === 401) {
        record(1, res.status, redirect ? 'redirect' : 'http_401', started)
        return { response: res, escalate: false }
      }
      let peeked
      try {
        peeked = await peek(res, PEEK_BYTES)
      } catch (error) {
        const refusal = signal.aborted ? null : tlsRefusal(error)
        record(1, res.status, refusal ?? 'body_error', started)
        return { error, escalate: refusal !== null }
      }
      const challenge = isChallengePage(new TextDecoder().decode(peeked.head), res.headers)
      let reason = challenge ? 'challenge' : res.status >= 400 ? `http_${res.status}` : 'ok'
      if (reason === 'ok' && res.status === 200 && peeked.head.length < SMALL_BODY) reason = 'small_body'
      if (res.status === 429 && !challenge) coolDown(new URL(url).hostname, res.headers.get('retry-after'))
      record(1, res.status, reason, started)
      const escalate = challenge || res.status === 403
      if (!escalate) return { response: peeked.response, escalate }
      // Kept as the fallback: only the bounded head, so tier 2's wait cannot leave a dead socket behind it.
      await peeked.response.body?.cancel().catch(() => {})
      const fallback = new Response(peeked.head, {
        status: res.status,
        statusText: res.statusText,
        headers: new Headers(res.headers)
      })
      return { response: fallback, escalate }
    }

    /** Tier 2, fully buffered (≤ maxBytes + 1, after decompression), so a broken stream is a tier-2 failure. */
    async function tier2(url, init) {
      const started = clock()
      const budget = Math.min(limits.tier2Ms, remainingMs())
      if (budget < limits.minTier2Ms) {
        record(2, null, 'no_time', started)
        return null
      }
      let client
      try {
        const proxy = await getProxy()
        client = await impitClient(proxy.proxyUrl)
      } catch {
        record(2, null, 'proxy_unavailable', started)
        return null
      }
      if (!client) {
        record(2, null, 'impit_unavailable', started)
        return null
      }
      const accept = new Headers(init.headers ?? {}).get('accept')
      const signal = signalFor(init, budget)
      let res
      try {
        res = await client.fetch(url, {
          method: init.method ?? 'GET',
          headers: accept ? { accept } : {},
          redirect: 'manual',
          timeout: budget,
          signal
        })
        const abort = () => {
          try {
            res.abort?.()
          } catch {}
        }
        signal.addEventListener('abort', abort, { once: true })
        const { head, response } = await peek(res, limits.maxBytes + 1, { all: true, onCancel: abort })
        signal.removeEventListener('abort', abort)
        const challenge = isChallengePage(new TextDecoder().decode(head.subarray(0, PEEK_BYTES)), res.headers)
        const usable = res.status < 500 && res.status !== 403 && !challenge
        record(2, res.status, challenge ? 'challenge' : usable ? 'ok' : `http_${res.status}`, started)
        return usable ? response : null
      } catch {
        try {
          res?.abort?.()
        } catch {}
        record(2, res?.status ?? null, signal.aborted ? 'timeout' : 'tier2_failed', started)
        return null
      }
    }

    /** @type {typeof fetch} */
    async function escalatingFetch(input, init = {}) {
      if (!enabled) return baseFetch(input, init)
      const url = String(input)
      if (sticky) {
        const second = await tier2(url, init)
        if (second) {
          lastTier = 'impit'
          return second
        }
      }
      const first = await tier1(url, init)
      if (first.escalate && !sticky) {
        const host = new URL(url).hostname
        if (coolingDown(host)) record(2, null, 'cooldown', clock())
        else {
          const second = await tier2(url, init)
          if (second) {
            sticky = true
            await first.response?.body?.cancel().catch(() => {})
            lastTier = 'impit'
            return second
          }
        }
      }
      if (first.error) throw first.error
      lastTier = 'node'
      return /** @type {Response} */ (first.response)
    }

    return {
      enabled,
      deadlineAt: deadline,
      fetch: escalatingFetch,
      remainingMs,
      attempts: () => (truncated ? [...ledger, { truncated: true }] : [...ledger]),
      via: () => lastTier
    }
  }
}
