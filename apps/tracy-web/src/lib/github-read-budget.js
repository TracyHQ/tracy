/**
 * What the releases read remembers between runs so an unchanged repository costs no GitHub quota.
 *
 * - `pages`: list URL → the ETag and body of its last 200. Sent back as `If-None-Match`; GitHub's 304
 *   does not count against the rate limit.
 * - `assets`: `<asset id> <updated_at>` → the file's text. An asset's bytes never change under one
 *   id (replacing a file uploads a new asset), so a file is downloaded once per process.
 * - `rate`: the quota the last answer stated. Below `LOW_SHARE` of it, reads wait for the reset.
 *
 * Per process, in memory: a restart pays one full read, as it always did.
 */

/** Below this share of the hourly quota, the sweep waits for the reset. */
export const LOW_SHARE = 0.1

export function createReleaseReadCache() {
  return {
    /** @type {Map<string, { etag: string, body: any }>} */
    pages: new Map(),
    /** @type {Map<string, string>} */
    assets: new Map(),
    /** @type {{ remaining: number, limit: number, resetMs: number } | null} */
    rate: null,
    /** @type {number | null} the reset a low-quota pause was logged for: one line per pause */
    deferralLogged: null
  }
}

/** @typedef {ReturnType<typeof createReleaseReadCache>} ReleaseReadCache */

/** The cache the schedule, the webhook and the Refresh press share. */
export const sharedReleaseReadCache = createReleaseReadCache()

/** A refusal because the token's quota is spent — says until when, never "download failed". */
export class GithubRateLimited extends Error {
  /** @param {number} resetMs @param {number} status */
  constructor(resetMs, status = 403) {
    super(`GitHub rate limit exhausted for this token until ${new Date(resetMs).toISOString()}`)
    this.name = 'GithubRateLimited'
    this.status = status
    this.resetMs = resetMs
  }
}

/**
 * Remember the quota an answer states. Answers without the headers (redirected asset bytes) say nothing.
 * @param {ReleaseReadCache} cache
 * @param {Response} response
 */
export function noteRateLimit(cache, response) {
  const remaining = Number(response.headers.get('x-ratelimit-remaining'))
  const limit = Number(response.headers.get('x-ratelimit-limit'))
  const reset = Number(response.headers.get('x-ratelimit-reset'))
  if (
    !response.headers.has('x-ratelimit-remaining') ||
    !Number.isFinite(remaining) ||
    !Number.isFinite(reset)
  )
    return
  cache.rate = { remaining, limit: Number.isFinite(limit) && limit > 0 ? limit : 5000, resetMs: reset * 1000 }
}

/**
 * The refusal to throw when `response` is the primary rate limit (403/429 with nothing left), else null.
 * A 403 with quota left is the secondary limit or a permission, and stays the caller's business.
 * @param {ReleaseReadCache} cache
 * @param {Response} response
 */
export function rateLimitedBy(cache, response) {
  if (response.status !== 403 && response.status !== 429) return null
  if (response.headers.get('x-ratelimit-remaining') !== '0') return null
  return new GithubRateLimited(cache.rate?.resetMs ?? Date.now() + 60_000, response.status)
}

/**
 * When the next read may happen, or null when it may happen now: the quota is below `LOW_SHARE`
 * of the limit and its reset is still ahead.
 * @param {ReleaseReadCache} cache
 * @param {number} nowMs
 */
export function deferredUntil(cache, nowMs) {
  const rate = cache.rate
  if (!rate || rate.resetMs <= nowMs) return null
  return rate.remaining < rate.limit * LOW_SHARE ? rate.resetMs : null
}
