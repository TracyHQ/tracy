/**
 * Rate limiting on Postgres, one fixed window at a time.
 *
 * Replaces the Durable Object bucket at `workers/seat-registry/src/index.js:362` (`overLimit`):
 * same one-bucket-per-window shape, same "count > limit" answer. The DO existed because KV cannot
 * increment atomically (a comment on that function records the incident: concurrent requests all
 * saw the same stale count and the brake didn't brake). Postgres's `on conflict … do update` is
 * atomic the same way a DO's single-threaded queue was, so the DO itself has no equivalent here.
 *
 * `windowMs` defaults to one hour — every existing caller (`seats/route.js`,
 * `workspaces/route.js`) passes only four arguments, so this default keeps their exact behaviour
 * unedited. `public/design-page.js`'s `apiRead` is the first caller that needs a different window
 * (a day, to carry the Worker's own daily cap forward as an actual number rather than one bent to
 * fit an hour it was never in).
 */
export async function overLimit(pool, bucket, limitPerWindow, now = Date.now(), windowMs = 3_600_000) {
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs)
  const { rows } = await pool.query(
    `insert into rate_bucket (bucket, window_start, count)
     values ($1, $2, 1)
     on conflict (bucket, window_start) do update set count = rate_bucket.count + 1
     returning count`,
    [bucket, windowStart]
  )
  return rows[0].count > limitPerWindow
}

/**
 * `overLimit` counting what a call costs instead of one: the characters a spoken reply is billed for
 * (`speech/say.js`). Same table, same window, same "count > limit" answer; a negative amount gives a
 * count back (never below zero), for a call refused before anything was made.
 * @returns {Promise<boolean>}
 */
export async function overLimitBy(
  pool,
  bucket,
  amount,
  limitPerWindow,
  now = Date.now(),
  windowMs = 3_600_000
) {
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs)
  const { rows } = await pool.query(
    `insert into rate_bucket (bucket, window_start, count)
     values ($1, $2, greatest($3::int, 0))
     on conflict (bucket, window_start) do update set count = greatest(rate_bucket.count + $3::int, 0)
     returning count`,
    [bucket, windowStart, amount]
  )
  return rows[0].count > limitPerWindow
}

/**
 * Give back one count of a window: a turn that was refused before any answer was started must not
 * cost the person their quota. Never below zero.
 */
export async function refundOne(pool, bucket, now = Date.now(), windowMs = 3_600_000) {
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs)
  await pool.query(
    'update rate_bucket set count = greatest(count - 1, 0) where bucket = $1 and window_start = $2',
    [bucket, windowStart]
  )
}

/**
 * `overLimit` with the one number a refused caller can act on: how many seconds until the NEXT
 * fixed window opens, i.e. the `Retry-After` the Apply door sends a seat key that is over its cap
 * (`tasks/todo-api-public.md` Q8). Same bucket table, same count, same "count > limit" answer —
 * the two functions can never disagree about whether a call was over. Kept beside `overLimit`
 * rather than folded into it so its every existing caller's boolean stays exactly as it was.
 *
 * `retryAfterS` rounds UP: a client told "0" would retry inside the same window.
 * @returns {Promise<{over: boolean, retryAfterS: number}>}
 */
export async function overLimitDetail(pool, bucket, limitPerWindow, now = Date.now(), windowMs = 3_600_000) {
  const over = await overLimit(pool, bucket, limitPerWindow, now, windowMs)
  const nextWindow = (Math.floor(now / windowMs) + 1) * windowMs
  return { over, retryAfterS: Math.max(1, Math.ceil((nextWindow - now) / 1000)) }
}

/** How much of each bucket the window starting at `windowStart` used; a bucket never counted is left out. */
export async function rateCountsOf(pool, buckets, windowStart) {
  const { rows } = await pool.query(
    'select bucket, count from rate_bucket where bucket = any($1) and window_start = $2',
    [buckets, windowStart]
  )
  return new Map(rows.map((r) => [r.bucket, Number(r.count)]))
}

/**
 * Fail CLOSED: a rate check the database could not answer is treated as the limit already hit, not
 * as "go ahead" — the opposite of what a network error should ever buy a caller here. Lived as two
 * private copies in `seats/route.js` and `workspaces/route.js` until the sign-in door needed it too
 * (#664); a domain may not import a sibling domain (`test/module-graph.test.mjs`), so it moved here.
 */
export async function overLimitOrClosed(pool, bucket, limit, now, windowMs = 3_600_000) {
  try {
    return await overLimit(pool, bucket, limit, now, windowMs)
  } catch {
    return true
  }
}

/**
 * The same fixed-window count, in this process's memory — for the one configuration with no
 * database at all (`DATABASE_URL` unset: a laptop on the memory identity store). Per instance, not
 * shared, which is exactly as far as that configuration reaches: it has one instance.
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
    }
  }
  return limiter
}
