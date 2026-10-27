// Tracy (TCH E11.b, 04/10/2026): the rate limit of `/gateway/api/usage/report`, per user.
//
// It was "one report per 5 s". The client runs one TokenReporter per mounted conversation composer
// (`client/token.tsx`, a 15 s timer each, plus a flush on unmount), so two reporters of one seat — two
// tabs, or a view remounting — collided inside 5 s and one was answered 429 on every tick (measured on
// cowork.tracy.site: ten 429s in one EmDash chat turn). A token bucket keeps the same average ceiling,
// one report per 5 s, and lets a few reporters of one seat through.

/** Reports a user may send at once. */
export const USAGE_REPORT_BURST = 4;
/** One report's worth of room comes back every this many ms: the old minimum interval. */
export const USAGE_REPORT_REFILL_MS = 5_000;
/** A bucket left alone this long is full again and can be dropped. */
const IDLE_MS = 3_600_000;

interface Bucket {
  tokens: number;
  at: number;
}

export function createUsageReportLimiter(burst = USAGE_REPORT_BURST, refillMs = USAGE_REPORT_REFILL_MS) {
  const entries = new Map<number, Bucket>();
  return {
    /** The buckets, by user id — for the gateway's periodic size cap. */
    entries,
    /** Whether this user may report now; spends one report when they may. */
    take(userId: number, now: number): boolean {
      const prior = entries.get(userId);
      const tokens = prior
        ? Math.min(burst, prior.tokens + Math.max(0, now - prior.at) / refillMs)
        : burst;
      if (tokens < 1) {
        entries.set(userId, { tokens, at: now });
        return false;
      }
      entries.set(userId, { tokens: tokens - 1, at: now });
      return true;
    },
    /** A user's quota changed: start them with a full bucket. */
    forget(userId: number): void {
      entries.delete(userId);
    },
    /** Drop buckets idle long enough to be full again. */
    sweep(now: number): void {
      for (const [k, v] of entries) if (now - v.at > IDLE_MS) entries.delete(k);
    },
  };
}
