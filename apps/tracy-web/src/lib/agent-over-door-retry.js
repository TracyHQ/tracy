// Retrying one model call of agent-over-door.js on a transient provider error, the way Claude Code does. All attempts
// belong to one dispatched turn: the turn is saved dispatched once, then answered (or failed) once, and every attempt
// that failed on the way is recorded on it (attempt number, reason, wait).
//
// Retried: HTTP 408, 409, 425, 429, 500, 502, 503, 504 and 529 (DeepSeek's own API answers 503
// service_unavailable_error "Service is too busy" when overloaded); an error object in a 200 body (OpenRouter
// forwards the provider's) whose code is one of those or whose code or message says overloaded, rate limit, service
// unavailable or too busy; a 200 whose body is not JSON (DeepSeek cuts the body while overloaded); a network error or
// a timeout before any response. Never retried: any other HTTP status (400, 401, 403, 404...), an answer that is JSON
// but not a message, and a content filter refusal (that is an answered turn, never an error here).
// The wait is the provider's Retry-After when it sends one, else exponential backoff with jitter; capped either way.

export const RETRY_STATUSES = Object.freeze([408, 409, 425, 429, 500, 502, 503, 504, 529])

/** The default retry policy: attempts per call (the first one included) and the longest single wait. */
export const RETRY_DEFAULTS = Object.freeze({ attempts: 5, maxWaitMs: 60_000, baseMs: 2_000 })

const NEVER_STATUSES = new Set([400, 401, 403, 404])
const TRANSIENT_TEXT = /overloaded|rate[ _-]?limit|service[ _-]?unavailable|too busy/i

/** Whether an AgentError from one attempt is worth another attempt. */
export function isTransient(error) {
  if (['AGENT_NETWORK', 'AGENT_TIMEOUT', 'AGENT_PROVIDER_JSON'].includes(error?.code)) return true
  if (error?.code === 'AGENT_PROVIDER_HTTP') return RETRY_STATUSES.includes(error.status)
  if (error?.code === 'AGENT_PROVIDER_ERROR') {
    const code = Number(error.providerCode)
    if (NEVER_STATUSES.has(code)) return false
    return (
      RETRY_STATUSES.includes(code) ||
      TRANSIENT_TEXT.test(String(error.providerCode ?? '')) ||
      TRANSIENT_TEXT.test(String(error.reason ?? ''))
    )
  }
  return false
}

/**
 * A Retry-After header value in milliseconds: seconds, or an HTTP date. Null when absent or unreadable.
 * @param {string | null | undefined} value
 * @param {number} now
 */
export function retryAfterMs(value, now = Date.now()) {
  if (value == null || String(value).trim() === '') return null
  const text = String(value).trim()
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text) * 1000)
  const at = Date.parse(text)
  return Number.isFinite(at) ? Math.max(0, at - now) : null
}

/** How long to wait after failed attempt `attempt` (1 = the first call): Retry-After, else 2^n backoff + jitter. */
export function waitMs(error, attempt, policy, random = Math.random) {
  const hinted = Number.isFinite(error?.retryAfterMs) ? error.retryAfterMs : null
  if (hinted !== null) return Math.min(policy.maxWaitMs, hinted)
  const backoff = policy.baseMs * 2 ** (attempt - 1)
  return Math.round(Math.min(policy.maxWaitMs, backoff * (1 + 0.25 * random())))
}

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Run `attempt` until it answers, a non transient error, or the attempts are spent. Resolves to the answer and the
 * failed attempts; rejects with the last error, which carries `retries` (the failed attempts before it).
 * @param {() => Promise<any>} attempt one model call
 * @param {{ policy?: Partial<typeof RETRY_DEFAULTS>, sleep?: (ms: number) => Promise<void>, random?: () => number }} options
 */
export async function withRetries(attempt, { policy = {}, sleep = sleepFor, random = Math.random } = {}) {
  const p = { ...RETRY_DEFAULTS, ...policy }
  const retries = []
  for (let n = 1; ; n++) {
    try {
      // eslint-disable-next-line no-await-in-loop -- attempts of one call go one after the other.
      return { answer: await attempt(), retries }
    } catch (error) {
      if (n >= p.attempts || !isTransient(error)) throw Object.assign(error, { retries })
      const wait = waitMs(error, n, p, random)
      retries.push({
        attempt: n,
        code: error.code,
        ...(error.status !== undefined ? { status: error.status } : {}),
        reason: String(error.reason || error.code).slice(0, 300),
        waitMs: wait,
        ...(error.usage ? { usage: error.usage, cost: error.cost ?? null } : {}),
        at: new Date().toISOString()
      })
      // eslint-disable-next-line no-await-in-loop -- the backoff is the point.
      await sleep(wait)
    }
  }
}
