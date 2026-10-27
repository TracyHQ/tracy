/**
 * Every Apify run is paid (measured 18/10: up to $1 for one Facebook run before the caps), so each
 * account gets a daily count of runs. Each run is also capped by Apify itself (`maxTotalChargeUsd`,
 * `/ops/wo` › `maxChargeUsdPerRun`), so a day costs at most the count × that ceiling. Two counts:
 * research jobs' social collection (`APIFY_RUNS_PER_DAY`), and Google Maps discovery searches
 * (`/ops/wo` › `searchRunsPerDay`). Over the count: a search skips the Apify tier, a job pauses with
 * `quota` and resumes the next day. Fails closed like every rate check here.
 * Each takes the open layer's `host` (`host.js`) for its rate counts.
 */
import { requireHost } from './host.js'

export const APIFY_RUNS_PER_DAY = 40
const DAY_MS = 86_400_000

/**
 * Shared research (shared research plan P2): Tracy pays research, so its cost is capped
 * by `cost-ledger.js`, deployment-wide, not by the account. What stays per account is an ABUSE limit:
 * how many places never researched before one account may send to research a day (`/ops/wo` ›
 * `newPlacesPerAccountPerDay`). It keeps the `wo:apify:<account>` bucket, so a day already counted
 * by the old per-run quota carries over. A place already researched (or in research) costs the
 * account nothing and is not counted.
 */
export function newPlacesDaySpent(host, pool, accountId, now, perDay) {
  return requireHost(host, ['overLimitOrClosed']).overLimitOrClosed(
    pool,
    `wo:apify:${accountId}`,
    perDay,
    now,
    DAY_MS
  )
}

/**
 * Counts one run against the account's day; true when the day is already spent.
 * @deprecated the per-account cost quota of research before P2; the place executor charges
 * `cost-ledger.js` and counts new places with `newPlacesDaySpent` instead.
 */
export function apifyDaySpent(host, pool, accountId, now, perDay = APIFY_RUNS_PER_DAY) {
  return requireHost(host, ['overLimitOrClosed']).overLimitOrClosed(
    pool,
    `wo:apify:${accountId}`,
    perDay,
    now,
    DAY_MS
  )
}

/** Counts one Apify discovery search against the account's day; true when the day is already spent. */
export function apifySearchDaySpent(host, pool, accountId, now, perDay = APIFY_RUNS_PER_DAY) {
  return requireHost(host, ['overLimitOrClosed']).overLimitOrClosed(
    pool,
    `wo:apify-search:${accountId}`,
    perDay,
    now,
    DAY_MS
  )
}

/** Gives the search count back: the search was answered without an Apify run. */
export function refundApifySearch(host, pool, accountId, now) {
  return requireHost(host, ['refundOne'])
    .refundOne(pool, `wo:apify-search:${accountId}`, now, DAY_MS)
    .catch(() => {})
}
