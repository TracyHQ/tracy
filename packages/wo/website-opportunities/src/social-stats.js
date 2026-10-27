/**
 * Social stats: followers, the latest post and posts a month of a restaurant's Facebook, Instagram,
 * TikTok and YouTube pages, fetched in the background through
 * the plugin's provider chains (ScrapeCreators first for Facebook/Instagram/TikTok, followed by the
 * existing RapidAPI and Apify tiers; YouTube keeps the Google and RapidAPI chain).
 *
 * One row per profile in `wo_social_stat` (migration 131), shared by every account and keyed by
 * `statKeyOf`. THE ROW IS THE QUEUE, as in `site-checks.js`: `request` answers what is known and
 * queues what is missing or stale; `tick` leases rows through `durable-queue.js`.
 *
 * Freshness: a snapshot is good 7 days (then `stale` and refreshed), `not_found` 30 days, a failure
 * is asked again after an hour. A failed refresh never wipes the last snapshot (council P1-6).
 *
 * Budget (council P0-3): every HTTP call a provider makes is ONE billable unit, counted against two
 * daily counts (UTC days, `rate_bucket`): the provider's deployment-wide cap (`/ops/wo` ›
 * `socialStatsProviderDailyCap`; 0 = that tier is off and the chain skips it) and the requesting
 * account's (`socialStatsPerAccountPerDay`). A tier's first call reserves what a whole page costs there
 * (`TIER_COST`), so a cap never pays for half a page (dev round L2); units not spent are given back. A
 * refused reservation stops the whole chain — no paid fallback runs — and leaves the row `queued` until
 * the next UTC day, without using an attempt; the door then answers it with `deferredUntil`.
 */

import { reserveSocialQuota, refundSocialQuota, providerQuotaObservation } from './social-quota.js'
import {
  resolveSocialAliases,
  reusableSocialAlias,
  publishSocialSnapshot,
  invalidateSocialAlias
} from './social-alias.js'
import { DEFAULT_WO_OPS_SETTINGS, resolveProviderOrder } from './wo-settings.js'
import { createDurableQueue } from './durable-queue.js'
import { fetchSocialApify, hasSocialApifyAttempt, uncertainSocialApifyAttempt } from './social-apify.js'
import { createCostLedger } from './cost-ledger.js'
import { ceilingCents } from './cost-prices.js'

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const FRESH_MS = 7 * DAY_MS
const NOT_FOUND_MS = 30 * DAY_MS
const RETRY_MS = HOUR_MS

export const SOCIAL_STAT_NETWORKS = Object.freeze(['facebook', 'instagram', 'tiktok', 'youtube'])

/** The domain's chain tier → the budget it spends (the names `/ops/wo` shows). */
const TIER_BUDGET = Object.freeze({
  'facebook/scraper3': 'facebook-scraper3',
  'facebook/scrapecreators': 'facebook-scrapecreators',
  'facebook/apify': 'facebook-apify',
  'instagram/scrapecreators': 'instagram-scrapecreators',
  'instagram/looter2': 'instagram-looter2',
  'instagram/stable': 'instagram-stable',
  'instagram/apify': 'instagram-apify',
  'tiktok/api23': 'tiktok-api23',
  'tiktok/scrapecreators': 'tiktok-scrapecreators',
  'tiktok/apify': 'tiktok-apify',
  'youtube/yt-api': 'yt-api',
  'youtube/official': 'youtube-official'
})

/** Billable calls one page costs on a tier (the adapters in the domain's `social-stats/providers.mjs`). */
const TIER_COST = Object.freeze({
  'facebook/scraper3': 2, // page/details + page/posts
  'facebook/scrapecreators': 2, // page profile + recent posts
  'instagram/scrapecreators': 1, // profile includes recent media
  'tiktok/scrapecreators': 2, // profile + profile videos
  'facebook/apify': 1, // one paid actor start; run/dataset reads do not start another run
  'instagram/apify': 1,
  'tiktok/apify': 1,
  'instagram/looter2': 1, // profile
  'instagram/stable': 2, // hover + user posts
  'tiktok/api23': 2, // user/info + user/posts
  'youtube/yt-api': 2, // resolve + channel/videos
  'youtube/official': 2 // channels + playlistItems
})
const BUDGET_COST = Object.freeze(
  Object.fromEntries(Object.entries(TIER_BUDGET).map(([tier, budget]) => [budget, TIER_COST[tier] ?? 1]))
)

/**
 * A provider as the domain's chain names its tier (`facebook/scraper3`); a bare tier (`scraper3`, as
 * the adapters and rows written before this said it) takes its network in front.
 */
const tierIdOf = (network, provider) =>
  typeof provider === 'string' && provider !== ''
    ? provider.includes('/') || !network
      ? provider
      : `${network}/${provider}`
    : null

/** The host a billable call goes to → its budget; any other host is refused. */
const HOST_BUDGET = Object.freeze({
  'facebook-scraper3.p.rapidapi.com': 'facebook-scraper3',
  'instagram-looter2.p.rapidapi.com': 'instagram-looter2',
  'instagram-scraper-stable-api.p.rapidapi.com': 'instagram-stable',
  'tiktok-api23.p.rapidapi.com': 'tiktok-api23',
  'yt-api.p.rapidapi.com': 'yt-api',
  'www.googleapis.com': 'youtube-official'
})
/** The research cost ledger's provider of a metered host (`cost-prices.js`, operation `social-stats:<network>`). */
const LEDGER_PROVIDER = (host) =>
  host === 'api.scrapecreators.com' ? 'scrapecreators' : host === 'www.googleapis.com' ? 'google' : 'rapidapi'

/**
 * The cache key of a profile: `<network>:<id>` from the domain's `parseSocialUrl`, case folded where
 * the network folds it. Null for anything that is not a profile of that network.
 * @param {{network: string, url: string}} handle @param {Function} parseSocialUrl
 * @returns {string | null}
 */
export function statKeyOf({ network, url } = {}, parseSocialUrl) {
  if (!SOCIAL_STAT_NETWORKS.includes(network) || typeof url !== 'string') return null
  const p = parseSocialUrl(url, { network })
  if (!p || p.network !== network) return null
  if (p.handle) return `${network}:${p.handle.toLowerCase()}`
  if (p.pageSlug) return `facebook:${p.pageSlug.toLowerCase()}`
  if (p.pageId) return `facebook:id:${p.pageId}`
  if (p.channelId) return `youtube:channel:${p.channelId}`
  if (p.legacy && p.name) return `youtube:${p.legacy}/${p.name.toLowerCase()}`
  return null
}

const numberOf = (v) => (v === null || v === undefined ? null : Number(v))
const isoOf = (v) => (v ? new Date(v).toISOString() : null)

/** The last successful snapshot, or null; `url` is the caller's own spelling. */
function snapshotOf(row, url, now) {
  if (!row?.fetched_at) return null
  return {
    url,
    followers: numberOf(row.followers),
    posts: numberOf(row.posts),
    lastPostAt: isoOf(row.last_post_at),
    postsPerMonth: numberOf(row.posts_per_month),
    coverage: row.coverage ?? 'partial',
    fetchedAt: isoOf(row.fetched_at),
    stale: now - new Date(row.fetched_at).getTime() >= FRESH_MS,
    provider: tierIdOf(row.network, row.provider)
  }
}

/**
 * The profile as the door answers it. A failed refresh with a snapshot answers `done` with the old
 * numbers (`stale` says how old) and the failure's code; a queued one carries what it has.
 */
export function statShape(row, url, now) {
  if (!row) return { status: 'queued' }
  const snap = snapshotOf(row, url, now)
  if (row.status === 'not_found') return { status: 'not_found' }
  if (row.status === 'queued') {
    const until = row.last_error === 'budget' && row.next_retry_at ? new Date(row.next_retry_at) : null
    // A page deferred to the next budget day: the client stops asking until then.
    const deferred = until && until.getTime() > now ? { deferredUntil: until.toISOString() } : {}
    return { status: 'queued', ...snap, ...deferred }
  }
  if (row.status === 'failed')
    return snap
      ? { status: 'done', ...snap, error: row.last_error ?? row.error ?? null }
      : { status: 'failed', error: row.last_error ?? row.error ?? null }
  return snap ? { status: 'done', ...snap } : { status: 'failed', error: 'no_snapshot' }
}

/**
 * The code that explains a failed chain: a tier that is merely not configured (`credential_missing`,
 * e.g. the unwired Apify tier at the end) says less than the technical failure before it.
 */
function failureCodeOf(error) {
  const codes = (Array.isArray(error?.attempts) ? error.attempts : []).map((a) => a?.code)
  const telling = codes.filter((c) => typeof c === 'string' && c !== 'credential_missing').at(-1)
  const code = telling ?? (typeof error?.code === 'string' ? error.code : 'provider_error')
  return code.slice(0, 40)
}

/** Shared admission and standalone requests use the same freshness and uncertain-attempt policy. */
export function socialNeedsWork(row, now) {
  if (!row) return true
  if (uncertainSocialApifyAttempt(row)) return false
  const age = (at) => (at ? now - new Date(at).getTime() : Infinity)
  if (row.status === 'queued') return false
  if (row.status === 'done') return age(row.fetched_at) >= FRESH_MS
  if (row.status === 'not_found') return age(row.checked_at) >= NOT_FOUND_MS
  const retryAt = row.next_retry_at
    ? new Date(row.next_retry_at).getTime()
    : (row.checked_at ? new Date(row.checked_at).getTime() : 0) + RETRY_MS
  return retryAt <= now && age(row.fetched_at) >= FRESH_MS
}
export function socialRefreshNeeded(row, now, invalidatedAt = null, expiresAt = null) {
  if (row?.status === 'queued' || uncertainSocialApifyAttempt(row)) return false
  const invalidated = invalidatedAt ? new Date(invalidatedAt).getTime() : null
  const checked = row?.checked_at ? new Date(row.checked_at).getTime() : -Infinity
  if (invalidated !== null && now - invalidated < RETRY_MS) return false
  if (invalidated !== null && checked < invalidated) return true
  if (expiresAt !== null && expiresAt <= now && checked < expiresAt) return true
  return socialNeedsWork(row, now)
}

/**
 * @param {{
 *   pool: import('pg').Pool,
 *   runtime: () => Promise<{ keys: { rapidapi?: string|null, google?: string|null, apify?: string|null }, settings: object }>,
 *   domain: object | (() => Promise<object>),
 *   fetchImpl?: typeof fetch, now?: () => number, log?: Console,
 *   concurrency?: number, hourlyCap?: number, leaseMs?: number, tickMs?: number, maxAttempts?: number,
 *   switchOn?: () => Promise<boolean>
 * }} deps
 *   `fetchImpl` reaches fixed provider hosts only (RapidAPI, googleapis), so a plain fetch is right.
 */
export function createSocialStats({
  pool,
  runtime,
  domain,
  fetchImpl = fetch,
  now = Date.now,
  log = console,
  concurrency = 2,
  hourlyCap = 60,
  leaseMs = 120_000,
  tickMs = 3000,
  maxAttempts = 3,
  switchOn = async () => true
}) {
  const domainOf = typeof domain === 'function' ? domain : async () => domain
  const queue = createDurableQueue({
    pool,
    table: 'wo_social_stat',
    keyColumn: 'stat_key',
    notBeforeColumn: 'next_retry_at',
    name: 'social-stats',
    run: fetchOne,
    now,
    concurrency,
    leaseMs,
    maxAttempts,
    hourlyCap,
    tickMs,
    log,
    // The feature's switch: off, nothing queued is fetched (dev round L5).
    enabled: switchOn
  })

  const needsWork = (row) => socialNeedsWork(row, now())

  /** `url` → `{key, network, url: normalised}` for the valid handles, plus the invalid urls. */
  async function keysOf(handles, options = {}) {
    const dom = await domainOf()
    const valid = new Map()
    const invalid = []
    for (const h of Array.isArray(handles) ? handles : []) {
      if (typeof h?.url !== 'string') continue
      const key = statKeyOf(h, dom.parseSocialUrl)
      if (!key) {
        invalid.push(h.url)
        continue
      }
      const normalised = dom.parseSocialUrl(h.url, { network: h.network })?.url ?? h.url
      valid.set(h.url, { key, network: h.network, url: normalised })
    }
    return { valid: await resolveSocialAliases(pool, valid, now(), options), invalid }
  }

  async function rowsOf(keys) {
    if (keys.length === 0) return new Map()
    const { rows } = await pool.query('select * from wo_social_stat where stat_key = any($1)', [keys])
    return new Map(rows.map((r) => [r.stat_key, r]))
  }

  /** What is known about each profile, read-only: nothing is queued. Unknown profiles are absent. */
  async function lookup(handles) {
    const { valid } = await keysOf(handles)
    const rows = await rowsOf([...new Set([...valid.values()].map((v) => v.key))])
    const out = {}
    const t = now()
    for (const [url, { key, invalidatedAt }] of valid)
      if (invalidatedAt) out[url] = { status: 'failed', error: 'not_found' }
      else if (rows.has(key)) out[url] = statShape(rows.get(key), url, t)
    return out
  }

  /**
   * What is known about each profile. What is missing or stale is queued (charged to `account`), the
   * first `limit` of them in the order given; the rest answer `not_queued`. `force` queues every
   * profile given that is not already queued, fresh or not — still under the daily caps.
   */
  async function request(handles, { account = null, limit = Number.POSITIVE_INFINITY, force = false } = {}) {
    const seenAt = new Date(now())
    const { valid, invalid } = await keysOf(handles, { force })
    const rows = await rowsOf([...new Set([...valid.values()].map((v) => v.key))])
    const t = now()
    const out = {}
    for (const url of invalid) out[url] = { status: 'not_found', error: 'not_a_profile' }
    const queued = new Map()
    for (const [url, v] of valid) {
      const row = rows.get(v.key)
      const invalidatedAt = v.invalidatedAt ? new Date(v.invalidatedAt).getTime() : null
      if (
        invalidatedAt !== null &&
        (force ? invalidatedAt >= seenAt.getTime() : t - invalidatedAt < RETRY_MS)
      ) {
        out[url] = { status: 'failed', error: 'not_found' }
        continue
      }
      const unmeasuredInvalidation =
        invalidatedAt !== null && (!row?.checked_at || new Date(row.checked_at).getTime() < invalidatedAt)
      const wanted = force ? row?.status !== 'queued' : unmeasuredInvalidation || needsWork(row)
      if (!wanted) {
        out[url] = statShape(row, url, t)
        continue
      }
      if (!queued.has(v.key)) {
        if (queued.size >= limit) {
          out[url] = { status: 'not_queued' }
          continue
        }
        queued.set(v.key, v)
      }
      const snap = snapshotOf(row, url, t)
      out[url] = snap ? { status: 'queued', ...snap } : { status: 'queued' }
    }
    if (queued.size > 0) {
      for (const [key, v] of queued) {
        const previous = rows.get(key)
        if (force && previous) {
          // Two force presses that observed the same generation can admit only one refresh,
          // including when alias resolution outlives another request’s completed refresh.
          const admitted = await pool.query(
            `update wo_social_stat set status='queued', queued_at=$3, attempts=0,
            lease_until=null,lease_token=lease_token+1,
            url=case when apify_attempt->>'phase' in ('planned','reserved','starting','running','start_uncertain','publishing') then url else $4 end,
            requested_by=case when apify_attempt->>'phase' in ('planned','reserved','starting','running','start_uncertain','publishing') then requested_by else $5 end,
            next_retry_at=null,last_error='force'
            where stat_key=$1 and lease_token=$2 and status<>'queued'
            and (checked_at is null or checked_at < $6) returning stat_key`,
            [key, previous.lease_token, new Date(now()), v.url, account, seenAt]
          )
          if (admitted.rowCount !== 1) {
            const current = (await pool.query('select * from wo_social_stat where stat_key=$1', [key]))
              .rows[0]
            for (const [url, value] of valid) if (value.key === key) out[url] = statShape(current, url, now())
          }
        } else
          await queue.enqueue(
            [
              {
                key,
                fields: {
                  network: v.network,
                  url: hasSocialApifyAttempt(previous)
                    ? (previous.apify_attempt?.url ?? previous.url)
                    : v.url,
                  requested_by: hasSocialApifyAttempt(previous) ? previous.requested_by : account,
                  next_retry_at: null,
                  last_error: force ? 'force' : null
                }
              }
            ],
            { seenAt }
          )
      }
      void queue.tick()
    }
    return out
  }

  async function fetchOne(row, lease) {
    const dom = await domainOf()
    if (row.apify_attempt?.phase === 'publishing') {
      const p = row.apify_attempt.publication
      if (!p?.fields || !Array.isArray(p.aliasKeys))
        return lease.finish({ status: 'failed', last_error: 'schema_error' })
      return publishSocialSnapshot({
        pool,
        row,
        lease,
        fields: p.fields,
        aliasKeys: p.aliasKeys,
        now: now(),
        clock: now
      })
    }
    const inputKey = statKeyOf({ network: row.network, url: row.url }, dom.parseSocialUrl)
    const redirectedAlias = async () => {
      const r = await reusableSocialAlias(pool, { ...row, stat_key: inputKey }, now())
      return r && r.stat_key !== row.stat_key ? r : null
    }
    if (!hasSocialApifyAttempt(row)) {
      const reused = await redirectedAlias()
      if (reused)
        return lease.finish(
          /:(?:id|channel):/.test(row.stat_key) && reused.platform_id !== row.platform_id
            ? { status: 'done', last_error: 'identity_changed', checked_at: new Date(now()) }
            : {
                status: 'done',
                platform_id: reused.platform_id,
                followers: reused.followers,
                posts: reused.posts,
                last_post_at: reused.last_post_at,
                posts_per_month: reused.posts_per_month,
                coverage: reused.coverage,
                provider: reused.provider,
                fetched_at: reused.fetched_at,
                checked_at: new Date(now()),
                last_error: null
              }
        )
    }
    const { keys, settings, readable } = await runtime()
    if (readable === false)
      return lease.finish({ status: 'failed', last_error: 'budget_unreadable', checked_at: new Date(now()) })
    const caps = {
      ...DEFAULT_WO_OPS_SETTINGS.socialStatsProviderDailyCap,
      ...settings?.socialStatsProviderDailyCap
    }
    const perAccount =
      settings?.socialStatsPerAccountPerDay ?? DEFAULT_WO_OPS_SETTINGS.socialStatsPerAccountPerDay
    const spent = { budget: null, retryAt: null }
    // 🔒 Each paid call is also a row of the research cost ledger, under the research caps like the Apify tier
    // (`social-apify.js`): Tracy pays for research, one budget (e2e dev 24/10/2026: these calls were in no ledger).
    const ledger = createCostLedger({
      pool,
      now,
      caps: async () => ({
        dailyCapCents: settings?.researchDailyCapCents ?? DEFAULT_WO_OPS_SETTINGS.researchDailyCapCents,
        jobCapCents: settings?.researchJobCapCents ?? DEFAULT_WO_OPS_SETTINGS.researchJobCapCents
      })
    })
    /** Per budget: units reserved for this page and not yet spent. */
    const held = new Map()
    const tickets = new Map()
    const reserve = async (budget, units, cap, account, perAccount) => {
      try {
        const r = await reserveSocialQuota({
          pool,
          budget,
          units,
          cap,
          account,
          perAccount,
          settings,
          now: now()
        })
        if (r.ok) {
          tickets.set(budget, [...(tickets.get(budget) ?? []), { ...r, left: units }])
          return true
        }
        spent.retryAt = r.retryAt
      } catch {
        spent.retryAt = now() + RETRY_MS
      }
      return false
    }
    const metered = async (u, init) => {
      if (spent.budget) throw new Error('social stats budget spent')
      const host = new URL(String(u)).host
      const budget = host === 'api.scrapecreators.com' ? `${row.network}-scrapecreators` : HOST_BUDGET[host]
      if (budget && !(held.get(budget) > 0)) {
        // The tier's first call holds a whole page; a call past that (a second lookup) holds one more.
        const units = held.has(budget) ? 1 : (BUDGET_COST[budget] ?? 1)
        if (await reserve(budget, units, caps[budget] ?? 0, row.requested_by, perAccount))
          held.set(budget, units)
      }
      if (!budget || !(held.get(budget) > 0)) {
        spent.budget = budget ?? 'unknown_host'
        throw new Error('social stats budget spent')
      }
      const provider = LEDGER_PROVIDER(host)
      const operation = `social-stats:${row.network}`
      const charge = await ledger.reserve({
        provider,
        operation,
        maxCents: ceilingCents(provider, operation)
      })
      if (!charge.ok) {
        spent.budget = 'research'
        spent.retryAt = (Math.floor(now() / DAY_MS) + 1) * DAY_MS
        throw new Error('social stats budget spent')
      }
      held.set(budget, held.get(budget) - 1)
      const ticket = tickets.get(budget)?.find((x) => x.left > 0)
      if (ticket) ticket.left--
      let res
      try {
        res = await fetchImpl(u, init)
      } catch (error) {
        // It may have reached the provider: counted at its ceiling until someone reconciles it.
        await ledger.unreconcile(charge.reservation).catch(() => {})
        throw error
      }
      await ledger.settle(charge.reservation).catch(() => {})
      const observation = providerQuotaObservation(res.headers, now())
      if (observation)
        await pool.query(
          `update wo_social_stat set provider_quota=coalesce(provider_quota,'{}'::jsonb)||jsonb_build_object($3::text,$4::jsonb)
        where stat_key=$1 and lease_token=$2 and status='queued' and lease_until>$5`,
          [row.stat_key, lease.token, budget, JSON.stringify(observation), new Date(now())]
        )
      return res
    }
    const settle = async () => {
      for (const list of tickets.values())
        for (const ticket of list) if (ticket.left > 0) await refundSocialQuota(pool, ticket, ticket.left)
    }
    // A tier whose cap is 0 is off: absent from the chain, so the next tier answers instead.
    const off = Object.fromEntries(
      Object.entries(TIER_BUDGET)
        .filter(([, budget]) => !((caps[budget] ?? 0) > 0))
        .map(([tier]) => [tier, undefined])
    )
    const at = new Date(now())
    let completedApify = null
    const apifyProfile = async () => {
      if (spent.budget) throw new dom.SocialStatsError('provider_error', 'social stats budget spent')
      const result = await fetchSocialApify({
        row,
        lease,
        pool,
        runtime,
        dom,
        fetchImpl,
        now,
        reserveStart: async (account) => {
          const budget = `${row.network}-apify`
          const ok = await reserve(budget, 1, caps[budget] ?? 0, account, perAccount)
          if (ok) tickets.get(budget).at(-1).left = 0
          return ok
        },
        admitAlias: async () => !(await redirectedAlias()),
        aliasKey: inputKey,
        refundStart: async () => {
          const ticket = tickets.get(`${row.network}-apify`)?.at(-1)
          if (ticket) await refundSocialQuota(pool, ticket, 1)
        },
        budgetRefused: () => {
          spent.budget = `${row.network}-apify`
        }
      })
      completedApify = result.attempt
      return result.stat
    }
    try {
      const { stat, provider } = hasSocialApifyAttempt(row)
        ? { stat: await apifyProfile(), provider: 'apify' }
        : await dom
            .fetchSocialStats(
              { network: row.network, url: row.url },
              {
                keys: {
                  rapidapi: keys?.rapidapi ?? null,
                  google: keys?.google ?? null,
                  scrapecreators: keys?.scrapecreators ?? null
                },
                apifyToken: keys?.apify ?? null,
                fetch: metered,
                apifyProfile,
                now,
                // The same order the place profile walks (/ops/wo › Settings › Provider order).
                order: resolveProviderOrder(settings, row.network).order,
                providers: off
              }
            )
            .finally(settle)
      const aliasKeys = [row.stat_key]
      const verifiedUrl = stat.url && statKeyOf({ network: row.network, url: stat.url }, dom.parseSocialUrl)
      if (verifiedUrl) aliasKeys.push(verifiedUrl)
      if (row.network === 'facebook' && stat.platformId) aliasKeys.push(`facebook:id:${stat.platformId}`)
      if (row.network === 'youtube' && stat.platformId) aliasKeys.push(`youtube:channel:${stat.platformId}`)
      if (stat.handle && ['instagram', 'tiktok', 'youtube'].includes(row.network))
        aliasKeys.push(`${row.network}:${stat.handle.toLowerCase()}`)
      return publishSocialSnapshot({
        pool,
        row,
        lease,
        aliasKeys,
        now: now(),
        clock: now,
        fields: {
          ...(completedApify ? { apify_attempt: completedApify } : {}),
          status: 'done',
          platform_id: stat.platformId ?? null,
          handle: stat.handle ?? null,
          followers: stat.followers ?? null,
          posts: stat.posts ?? null,
          last_post_at: stat.lastPostAt ? new Date(stat.lastPostAt) : null,
          posts_per_month: stat.postsPerMonth ?? null,
          coverage: stat.coverage === 'complete' ? 'complete' : 'partial',
          provider: tierIdOf(row.network, stat.provider ?? provider),
          fetched_at: completedApify ? new Date(completedApify.at) : at,
          last_attempt_at: at,
          last_error: null,
          next_retry_at: null,
          error: null,
          checked_at: new Date(now())
        }
      })
    } catch (error) {
      if (error.aliasReused)
        return lease.finish({ status: 'queued', attempts: 0, next_retry_at: new Date(now() + 1000) })
      if (error.apifyPending)
        return lease.finish({
          status: 'queued',
          attempts: 0,
          last_error: null,
          next_retry_at: new Date(now() + 3000)
        })
      if (spent.budget) {
        log.warn?.(`[social-stats] ${row.stat_key}: ${spent.budget} budget spent, deferred to tomorrow`)
        return lease.finish({
          status: 'queued',
          attempts: 0,
          last_attempt_at: at,
          last_error: 'budget',
          next_retry_at: new Date(spent.retryAt ?? (Math.floor(at.getTime() / DAY_MS) + 1) * DAY_MS)
        })
      }
      const code = failureCodeOf(error)
      if (
        code === 'not_found' &&
        /:(?:id|channel):/.test(row.stat_key) &&
        inputKey !== row.stat_key &&
        !/:(?:id|channel):/.test(inputKey)
      )
        return invalidateSocialAlias({ pool, row, lease, aliasKey: inputKey, observedAt: at, clock: now })
      if (code === 'not_found')
        return lease.finish({
          status: 'not_found',
          last_attempt_at: at,
          last_error: 'not_found',
          next_retry_at: new Date(at.getTime() + NOT_FOUND_MS),
          error: null,
          checked_at: new Date(now())
        })
      log.warn?.(`[social-stats] ${row.stat_key}: ${code}`)
      return lease.finish({
        status: 'failed',
        last_attempt_at: at,
        last_error: code,
        next_retry_at: new Date(at.getTime() + RETRY_MS),
        error: code,
        checked_at: new Date(now())
      })
    }
  }

  const { tick, drain, start, stop } = queue
  return { request, lookup, tick, drain, start, stop }
}
