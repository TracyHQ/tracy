// Copied from tracy-web `lib/rate.js` `memoryRateLimiter` (ADR 0036): the standalone server carries its own.
/**
 * A fixed-window count in this process's memory. Per instance, not shared: the standalone server is one process.
 *
 * The count is bumped synchronously before any await, so a burst of parallel calls cannot all read
 * the same stale count — the property `on conflict … do update` gives `overLimit`. Windows that have
 * closed are dropped as the clock passes them, so a stream of distinct buckets cannot grow the map
 * past one window's worth.
 */
export function memoryRateLimiter() {
  const counts = new Map()
  let openWindows = new Set()
  const limiter = {
    overLimit(bucket, limitPerWindow, now = Date.now(), windowMs = 3_600_000) {
      return limiter.overLimitBy(bucket, 1, limitPerWindow, now, windowMs)
    },
    /** `overLimit` counting `amount` (negative gives back, never below zero), like the pool's `overLimitBy`. */
    overLimitBy(bucket, amount, limitPerWindow, now = Date.now(), windowMs = 3_600_000) {
      const windowStart = Math.floor(now / windowMs) * windowMs
      const tag = `${windowMs}:${windowStart}`
      if (!openWindows.has(tag)) {
        // A new window for this width: every older window of the same width is closed for good.
        for (const key of counts.keys()) {
          const [width, start] = key.split('|', 1)[0].split(':').map(Number)
          if (width === windowMs && start < windowStart) counts.delete(key)
        }
        openWindows = new Set([...openWindows].filter((t) => !t.startsWith(`${windowMs}:`)))
        openWindows.add(tag)
      }
      const key = `${tag}|${bucket}`
      const count = Math.max(0, (counts.get(key) ?? 0) + amount)
      counts.set(key, count)
      return count > limitPerWindow
    },
    /** What `bucket` counted in the window of width `windowMs` that starts at `windowStart` (ms); 0 when nothing. */
    countOf(bucket, windowStart, windowMs) {
      return counts.get(`${windowMs}:${windowStart}|${bucket}`) ?? 0
    }
  }
  return limiter
}
