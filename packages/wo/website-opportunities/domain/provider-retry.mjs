/**
 * A bounded retry for one provider call (reviews, places): a rate limit (429) or a transient server error
 * (500, 502, 503, 504) is tried again after a short wait; anything else, a 402 (paid quota spent) above all,
 * fails at once with its code. The wait honours the provider's Retry-After, and the waits of one call never
 * add up to more than `maxWaitMs`: a Retry-After beyond that budget is not waited for.
 *
 * The attempt throws an error carrying `status` (the HTTP status) and, when the provider sent one,
 * `retryAfter` (the header's raw value). Tests inject `sleep`, so no test waits for real.
 */

/** HTTP statuses worth one more try: rate limited, or the provider's side briefly down. */
export const RETRYABLE_STATUS = Object.freeze([429, 500, 502, 503, 504])

/** The defaults; `WO_PROVIDER_RETRY_MAX_WAIT_MS` sets the wait budget of every call (0 turns retries off). */
export const PROVIDER_RETRY = Object.freeze({ retries: 2, baseDelayMs: 500, maxWaitMs: 4000 })

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function envMaxWait() {
  const raw = process.env.WO_PROVIDER_RETRY_MAX_WAIT_MS
  if (raw === undefined || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Whether an error of one attempt is worth another try. */
export const isRetryable = (error) => RETRYABLE_STATUS.includes(Number(error?.status))

/**
 * How long to wait before try `attempt + 1` (0-based): the provider's Retry-After (seconds or an HTTP date)
 * when readable, else `baseDelayMs * 2^attempt`.
 */
export function retryDelayOf(
  error,
  attempt,
  { baseDelayMs = PROVIDER_RETRY.baseDelayMs, now = Date.now } = {}
) {
  const header = typeof error?.retryAfter === 'string' ? error.retryAfter.trim() : ''
  if (/^\d+(\.\d+)?$/.test(header)) return Math.round(Number(header) * 1000)
  if (header) {
    const at = Date.parse(header)
    if (Number.isFinite(at)) return Math.max(0, at - now())
  }
  return baseDelayMs * 2 ** attempt
}

/**
 * Runs `attempt(n)` and tries again on a retryable error while the wait budget lasts.
 * @template T
 * @param {(n: number) => Promise<T>} attempt
 * @param {{retries?: number, baseDelayMs?: number, maxWaitMs?: number, sleep?: (ms: number) => Promise<void>, now?: () => number}} [options]
 * @returns {Promise<T>}
 */
export async function withProviderRetry(attempt, options = {}) {
  const retries = options.retries ?? PROVIDER_RETRY.retries
  const maxWaitMs = options.maxWaitMs ?? envMaxWait() ?? PROVIDER_RETRY.maxWaitMs
  const sleep = options.sleep ?? realSleep
  let waited = 0
  for (let n = 0; ; n += 1) {
    try {
      return await attempt(n)
    } catch (error) {
      if (n >= retries || !isRetryable(error)) throw error
      const delay = retryDelayOf(error, n, options)
      if (waited + delay > maxWaitMs) throw error
      waited += delay
      await sleep(delay)
    }
  }
}
