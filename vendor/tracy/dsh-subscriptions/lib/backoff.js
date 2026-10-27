/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{
 *   maxRetries?: number,
 *   initialDelayMs?: number,
 *   maxDelayMs?: number,
 *   factor?: number,
 *   isRetryable?: (err: any) => boolean,
 * }} [options]
 * @returns {Promise<T>}
 */
export async function executeWithRetry(fn, {
  maxRetries = 3,
  initialDelayMs = 200,
  maxDelayMs = 3000,
  factor = 2,
  isRetryable = (_err) => true
} = {}) {
  let attempt = 0
  let delay = initialDelayMs

  while (true) {
    try {
      return await fn()
    } catch (err) {
      attempt++
      if (attempt > maxRetries || !isRetryable(err)) {
        throw err
      }
      // Exponential backoff with random jitter: delay * (1 + random * 0.3)
      const jitter = 1 + Math.random() * 0.3
      const sleepMs = Math.min(maxDelayMs, Math.round(delay * jitter))
      await new Promise((r) => setTimeout(r, sleepMs))
      delay = Math.min(maxDelayMs, delay * factor)
    }
  }
}
