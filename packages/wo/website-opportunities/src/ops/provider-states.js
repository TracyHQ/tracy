/**
 * What the operator's Settings shows about research providers: each capability provider's state (connected, missing
 * key, daily cap reached, last error) and the Provider order block (each group's order, whether research reads it,
 * and each provider's numbers from `../provider-report.js`). Read-only: nothing here changes an order.
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { WO_DOMAIN_DIR } from '../domain-loader.js'
import { PROVIDER_REPORT, providerReport, readProviderUsage } from '../provider-report.js'
import { readWoRuntime, resolveProviderOrder } from '../wo-settings.js'

const capabilities = await import(pathToFileURL(path.join(WO_DOMAIN_DIR, 'capabilities.mjs')).href)

/** A capability provider → the social stats budget whose daily cap it spends (`../social-stats.js`). */
export const SOCIAL_BUDGET_OF = Object.freeze({
  facebook: {
    scrapecreators: 'facebook-scrapecreators',
    'rapidapi-scraper3': 'facebook-scraper3',
    apify: 'facebook-apify'
  },
  instagram: {
    scrapecreators: 'instagram-scrapecreators',
    'rapidapi-looter2': 'instagram-looter2',
    'rapidapi-stable': 'instagram-stable',
    apify: 'instagram-apify'
  },
  tiktok: {
    scrapecreators: 'tiktok-scrapecreators',
    'rapidapi-api23': 'tiktok-api23',
    apify: 'tiktok-apify'
  },
  youtube: { 'youtube-official': 'youtube-official', 'rapidapi-yt-api': 'yt-api' }
})
const BUDGET_PREFIX = 'wo:social-budget:'
const DAY_MS = 86_400_000
const LAST_ERROR_WINDOW_MS = 7 * DAY_MS

/**
 * Groups whose research step reads `resolveProviderOrder`. The others still follow their old setting or fixed order,
 * so the operator sees them read-only; add a group here in the change that wires its consumer.
 */
export const WIRED_CAPABILITY_GROUPS = Object.freeze([
  'facebook',
  'instagram',
  'tiktok',
  'youtube',
  'website-content',
  'web-search',
  'tripadvisor',
  'menu-links',
  'menu-photos',
  'menu-items'
])

/**
 * Each capability provider's state: `missing_key` (its credential is not set), `limit_reached` (its daily social
 * stats cap is spent today, UTC), `error` (its latest recorded call in the last 7 days gave nothing:
 * `lastError {reason, at}`), else `connected`. Calls are read from the attempts research keeps on each snapshot
 * source (`coverage.attempts`, `last_error.attempts`). `rateCountsOf` is the host's (`../host.js`); without it no cap
 * shows as reached.
 * @param {import('pg').Pool | null} pool
 * @param {{keys: Record<string, string | null>, settings: any, now?: () => number,
 *   rateCountsOf?: (pool: any, buckets: string[], windowStart: Date, windowMs: number) => Promise<Map<string, number>>}} input
 */
export async function providerStates(pool, { keys, settings, now = Date.now, rateCountsOf }) {
  const at = now()
  const used = new Map()
  const latest = new Map()
  if (pool) {
    if (rateCountsOf) {
      try {
        const buckets = Object.values(SOCIAL_BUDGET_OF).flatMap((m) =>
          Object.values(m).map((b) => `${BUDGET_PREFIX}${b}`)
        )
        const counts = await rateCountsOf(pool, buckets, new Date(Math.floor(at / DAY_MS) * DAY_MS), DAY_MS)
        for (const [bucket, count] of counts) used.set(bucket.slice(BUDGET_PREFIX.length), Number(count))
      } catch {}
    }
    try {
      const { rows } = await pool.query(
        `select source, at, attempt from (
           select s.source, coalesce(s.collected_at, s.attempted_at) as at, a as attempt
             from wo_place_snapshot_source s
             cross join lateral jsonb_array_elements(case when jsonb_typeof(s.coverage->'attempts') = 'array'
               then s.coverage->'attempts' else '[]'::jsonb end) a
            where coalesce(s.collected_at, s.attempted_at) > $1
           union all
           select s.source, (s.last_error->>'at')::timestamptz, a
             from wo_place_snapshot_source s
             cross join lateral jsonb_array_elements(case when jsonb_typeof(s.last_error->'attempts') = 'array'
               then s.last_error->'attempts' else '[]'::jsonb end) a
            where s.attempted_at > $1
         ) recorded order by at desc limit 5000`,
        [new Date(at - LAST_ERROR_WINDOW_MS)]
      )
      for (const r of rows) {
        const key = `${r.source}/${r.attempt?.provider}`
        if (!latest.has(key)) latest.set(key, { ...r.attempt, at: new Date(r.at).toISOString() })
      }
    } catch {}
  }
  const caps = settings?.socialStatsProviderDailyCap ?? {}
  return Object.fromEntries(
    capabilities.CAPABILITY_GROUPS.map((group) => [
      group.id,
      Object.fromEntries(
        group.providers.map((p) => {
          const budget = SOCIAL_BUDGET_OF[group.id]?.[p.id]
          const last = latest.get(`${group.id}/${p.id}`)
          const failed = last?.status === 'skipped' && last.reason && last.reason !== 'credential_missing'
          const lastError = failed ? { reason: last.reason, at: last.at } : undefined
          const state =
            p.credential && !keys?.[p.credential]
              ? 'missing_key'
              : budget && caps[budget] > 0 && (used.get(budget) ?? 0) >= caps[budget]
                ? 'limit_reached'
                : lastError
                  ? 'error'
                  : 'connected'
          return [p.id, lastError ? { state, lastError } : { state }]
        })
      )
    ])
  )
}

/**
 * The Provider order block: each capability group with its providers, the order it runs in now (`declared` false =
 * the old default), whether research reads it yet (`wired`), each provider's state and its numbers (`report`).
 * @param {import('pg').Pool | null} pool
 * @param {any} config
 * @param {{openSecret?: Function, rateCountsOf?: Function}} host
 */
export async function capabilityGroups(pool, config, host, { now = Date.now } = {}) {
  const { keys, settings } = await readWoRuntime(pool, config, { openSecret: host?.openSecret })
  const states = await providerStates(pool, { keys, settings, now, rateCountsOf: host?.rateCountsOf })
  const usage = await readProviderUsage(pool, { now })
  return capabilities.CAPABILITY_GROUPS.map((g) => {
    const { order, declared } = resolveProviderOrder(settings, g.id)
    const report = providerReport(order, usage[g.id] ?? {})
    return {
      id: g.id,
      label: g.label,
      providers: g.providers.map((p) => ({
        id: p.id,
        label: p.label,
        credential: p.credential,
        ...states[g.id][p.id],
        report: report[p.id] ?? { enough: false, calls: 0 }
      })),
      reportMinCalls: PROVIDER_REPORT.minCalls,
      order,
      declared,
      defaultOrder: capabilities.defaultOrderOf(g.id, settings),
      wired: WIRED_CAPABILITY_GROUPS.includes(g.id)
    }
  })
}
