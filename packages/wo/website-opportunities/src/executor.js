/**
 * The research executor (spec §5): a durable job per opportunity, run in this process from the cron
 * tick. Claim → `discovery → collection → media → profile → brand → done`, each stage boundary a
 * checkpoint written under the lease.
 *
 * 🔒 THE LEASE IS THE ONLY RIGHT TO WRITE. A claim bumps `lease_token`; every write runs `fenced`
 * (job row locked, token compared), so an executor whose lease expired or whose job was cancelled
 * fails its next write instead of landing it. A lease not renewed for `leaseMs` (heartbeat every
 * `heartbeatMs`) is reclaimable by any replica: a crash costs one lease period, never the job.
 *
 * Switch OFF mid-job: the next checkpoint pauses with `FEATURE_OFF`, keeping everything collected.
 * A source that stops on timeout/rate limit/quota pauses the job with its cursor; resume continues.
 * Crawled content is untrusted data: it is stored and shown, never executed or sent as instructions.
 */
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { WO_DOMAIN_DIR } from './domain-loader.js'
import { normalizeWoOpsSettings } from './wo-settings.js'
import { apifyDaySpent } from './apify-budget.js'
import { requireHost } from './host.js'
import { BudgetExceededError, createChargeable } from './cost-ledger.js'
import { checkPageSpeed } from './pagespeed.js'
import { revokedHubCopy } from './hub/local-cache.js'
import { createPlaceRunner } from './place-executor.js'
import { claimPlaceJob } from './place-jobs.js'
import { isPlaceholderName, nameClaimsOf, withNameDecision } from './business-name.js'
import { candidateAsRead } from '../domain/candidate-as-read.mjs'
import { LISTING_SOURCE, refsOfCandidate, refsOfUrls, SOCIAL_SOURCES, SOURCES } from './sources.js'

const { hoursDisagree } = await import(pathToFileURL(path.join(WO_DOMAIN_DIR, 'opening-hours.mjs')).href)
import {
  checkpoint,
  claimJob,
  ensureSource,
  fenced,
  finishLease,
  heartbeat,
  insertMedia,
  knownMediaUrls,
  mediaOf,
  profileOf,
  StaleLeaseError,
  saveProfile,
  saveSource,
  sourcesOf,
  supersedeMedia
} from './store.js'

export const STAGES = Object.freeze(['discovery', 'collection', 'media', 'profile', 'brand', 'done'])
/** `pg_try_advisory_lock` id of the claim (7_243_001…004, 017…020, 028 are taken). */
export const EXECUTOR_LOCK_ID = 7_243_040

const RESUMABLE = new Set(['timeout', 'rate_limited', 'quota'])
const MEDIA_BUDGET = 300
const WEBSITE_PAGES = 40
const IMAGE_MAX_BYTES = 25 * 1024 * 1024
const VIDEO_MAX_BYTES = 200 * 1024 * 1024
const PLACE_FACTS_MAX_AGE_MS = 30 * 24 * 3600 * 1000
const PLACE_PHOTOS_MAX = 10
/** `wo_media.source` of a photo from the restaurant's Google Places listing. */
export const GOOGLE_PLACES_SOURCE = 'google-places'
/** The most of a caption or alt text kept with a picture: the picture planner reads its opening. */
const TEXT_MAX = 2000
const EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm'
}
const FEATURE_OFF = Object.freeze({
  state: 'paused',
  lastError: { code: 'FEATURE_OFF' },
  outcome: 'feature_off'
})
const NO_RUNTIME = async () => ({ keys: {}, settings: normalizeWoOpsSettings({}) })

/**
 * The Apify run an earlier holder of this job started and recorded (`progress.apifyRun`, written before its
 * wait, `domain/apify.mjs`), when it is for this source and page: the next holder reads it instead of paying
 * for another run. A restart during the run no longer costs a second one.
 * @param {any} progress the job's progress as claimed @param {string} source @param {any} cursor
 */
export function heldApifyRun(progress, source, cursor) {
  const run = progress?.apifyRun
  const offset = Math.max(0, Number(cursor?.offset) || 0)
  if (!run || run.source !== source || run.offset !== offset) return null
  return typeof run.id === 'string' && typeof run.datasetId === 'string' ? run : null
}

/**
 * What a paid collect gets to record its run under the lease (`checkpoint`), and the run to read again.
 * @param {import('pg').Pool} pool @param {{jobId: string, token: string}} lease @param {any} held
 */
export function apifyRunHooks(pool, lease, held) {
  return {
    run: held,
    async onRun(run) {
      if (!(await checkpoint(pool, lease, { progress: { apifyRun: run } })))
        throw new StaleLeaseError(lease.jobId)
    }
  }
}

/** The recorded run is spent once its answer is saved; one still going (a timeout) stays for the resume. */
export async function spendApifyRun(pool, lease, result) {
  if (result?.status === 'partial' && ['timeout', 'network'].includes(result.reason)) return
  await checkpoint(pool, lease, { progress: { apifyRun: null } })
}
const BRAND_ENGINE = Object.freeze({
  status: 'not_integrated',
  reason:
    'The Brand Engine runs inside a site workspace only; these are observations from collected colours and text.'
})

/**
 * @param {{
 *   pool: import('pg').Pool,
 *   host: import('./host.js').WoHost,
 *   loadDomain: () => Promise<any>,
 *   runtime?: () => Promise<{ keys: { apify?: string|null, google?: string|null }, settings: object }>,
 *   objects: { put: (key: string, bytes: Uint8Array, type: string) => Promise<boolean> } | null,
 *   switchOn: () => Promise<boolean>,
 *   imageInfo: (bytes: Uint8Array) => Promise<{width: number|null, height: number|null, palette: any[]}>,
 *   fetchImpl?: typeof fetch, apiFetch?: typeof fetch, resolve?: Function, now?: () => number, log?: Console,
 *   owner?: string, leaseMs?: number, heartbeatMs?: number, concurrency?: number, collectLimit?: number,
 *   shared?: boolean, chargeable?: ReturnType<typeof createChargeable>,
 *   afterPublish?: (placeId: string) => Promise<unknown>,
 *   hub?: ReturnType<typeof import('./hub/local-cache.js').createHubLink> | null
 * }} deps
 *   `shared` (`WO_SHARED_RESEARCH`): place jobs (`place-jobs.js`) are claimed too, before per-account jobs.
 *   `chargeable` (`cost-ledger.js createChargeable`): every paid call of a PLACE run is reserved against
 *   Tracy's research caps before it goes out (`place-executor.js`); over a cap the run pauses with
 *   `budget`. The default counts nothing. The per-account path keeps its daily Apify count, as before.
 *   `menuVisionDoor` (`menu-photo-reading.js menuVisionDoorFor`): the vision model menu photos are read with; the default has none.
 *   `businessReadingDoor` (`business-reading.js businessReadingDoorFor`): the model a place's services, audience, team
 *   and story are read with; the default has none, and the rules read alone.
 *   `afterPublish` (`place-maintenance.js`): called once a place run published, never throws.
 *   `hub` (`hub/local-cache.js`): a shared hub read before Place Details is paid for; null reads none.
 *   `providerRetry` (`domain/provider-retry.mjs`): how Place Details, Google Maps and TripAdvisor calls retry a 429 or
 *   transient 5xx (`{retries, baseDelayMs, maxWaitMs, sleep}`); the default waits a few seconds at most per call.
 */
export function createExecutor({
  pool,
  host,
  loadDomain,
  // `woRuntime` in the app: `/ops/wo` keys and settings, read once per job.
  runtime = NO_RUNTIME,
  objects,
  switchOn,
  imageInfo,
  fetchImpl = fetch,
  // Third-party APIs called with our own key (PageSpeed), not the crawler's pinned fetch.
  apiFetch = fetch,
  resolve,
  now = Date.now,
  log = console,
  owner = `web-${process.pid}-${randomUUID().slice(0, 8)}`,
  leaseMs = 60_000,
  heartbeatMs = 15_000,
  concurrency = 2,
  collectLimit = 20,
  shared = false,
  prefetch = false,
  prefetchConcurrency = async () => 1,
  chargeable = createChargeable(null),
  researchLedger = null,
  afterPublish = null,
  hub = null,
  providerRetry = undefined,
  menuVisionDoor = async () => ({ state: 'not_configured' }),
  businessReadingDoor = async () => ({ state: 'not_configured' })
}) {
  requireHost(host, ['overLimitOrClosed'])
  const running = new Set()
  let claiming = Promise.resolve()
  const domainDeps = {
    fetch: fetchImpl,
    ...(resolve ? { resolve } : {}),
    now,
    ...(providerRetry ? { retry: providerRetry } : {})
  }

  async function claim(allowPrefetch) {
    const client = await pool.connect()
    try {
      const { rows } = await client.query('select pg_try_advisory_lock($1) as got', [EXECUTOR_LOCK_ID])
      if (!rows[0]?.got) return null
      try {
        return (
          (shared && (await claimPlaceJob(pool, owner, leaseMs, { kind: 'user' }))) ||
          (await claimJob(pool, owner, leaseMs)) ||
          (shared &&
            prefetch &&
            allowPrefetch &&
            (await claimPlaceJob(pool, owner, leaseMs, { kind: 'prefetch' })))
        )
      } finally {
        await client.query('select pg_advisory_unlock($1)', [EXECUTOR_LOCK_ID]).catch(() => {})
      }
    } finally {
      client.release()
    }
  }

  /** One cron tick: claim at most one job when a slot is free, and run it in the background. */
  async function tick() {
    const previousClaim = claiming
    let releaseClaim
    claiming = new Promise((resolve) => {
      releaseClaim = resolve
    })
    await previousClaim
    try {
      const configured = shared && prefetch ? await prefetchConcurrency() : 1
      const backgroundSlots =
        Number.isInteger(configured) && configured >= 1 && configured <= 3 ? configured : 1
      const capacity =
        shared && prefetch
          ? Math.max(concurrency, Math.min(3, Math.max(1, backgroundSlots)) + 1)
          : concurrency
      if (running.size >= capacity) return { claimed: null, done: Promise.resolve() }
      const job = await claim(running.size < capacity - 1)
      if (!job) return { claimed: null, done: Promise.resolve() }
      const done = (job.place_id ? places.run(job) : run(job)).finally(() => running.delete(done))
      running.add(done)
      return { claimed: job, done }
    } finally {
      releaseClaim()
    }
  }

  async function run(job) {
    const lease = { jobId: job.id, token: String(job.lease_token) }
    let lost = false
    const beat = setInterval(() => {
      heartbeat(pool, lease, leaseMs)
        .then((ok) => {
          if (!ok) lost = true
        })
        .catch(() => {})
    }, heartbeatMs)
    beat.unref?.()
    const finish = (outcome) => finishLease(pool, lease, outcome)
    try {
      const domain = await loadDomain()
      const { rows } = await pool.query('select * from wo_opportunity where id = $1', [job.opportunity_id])
      const opp = rows[0]
      if (!opp) return void (await finish({ state: 'failed', lastError: { code: 'OPPORTUNITY_GONE' } }))
      const { keys, settings } = await runtime()
      const ctx = {
        pool,
        lease,
        opp,
        domain,
        keys,
        settings,
        // A request's own round after its place answered (`place-jobs.js answerOne`): only the sources its
        // opportunity names, no Google call, no rename; the place's research is not repeated.
        private: Boolean(job.result_snapshot_id),
        progress: job.progress ?? null,
        /** @returns {Promise<boolean>} true when the switch is off and the job must pause */
        async pausePoint(progress) {
          if (lost) throw new StaleLeaseError(job.id)
          if (!(await switchOn().catch(() => false))) return true
          if (!(await checkpoint(pool, lease, { progress }))) throw new StaleLeaseError(job.id)
          return false
        }
      }
      let stage = STAGES.includes(job.stage) ? job.stage : 'discovery'
      while (stage !== 'done') {
        if (await ctx.pausePoint(null)) return void (await finish(FEATURE_OFF))
        const outcome = await STAGE_RUNNERS[stage](ctx)
        if (outcome?.state) return void (await finish(outcome))
        stage = STAGES[STAGES.indexOf(stage) + 1]
        if (!(await checkpoint(pool, lease, { stage }))) throw new StaleLeaseError(job.id)
      }
      await finish({ state: 'completed', outcome: 'completed' })
    } catch (error) {
      if (error instanceof StaleLeaseError || error?.code === 'STALE_LEASE') {
        log.warn(`[opportunities] job ${job.id}: lease lost, stopping without writing`)
        return
      }
      log.error(`[opportunities] job ${job.id} failed`, error?.message ?? error)
      await finish({
        state: 'failed',
        lastError: {
          code: error?.code ?? 'EXECUTOR_ERROR',
          message: String(error?.message ?? error).slice(0, 500)
        }
      }).catch(() => {})
    } finally {
      clearInterval(beat)
    }
  }

  const STAGE_RUNNERS = {
    async discovery({ opp, lease, private: own }) {
      if (own) return
      const refs = refsOfCandidate(opp.candidate)
      await fenced(pool, lease, async (db) => {
        for (const source of SOURCES) if (refs[source]) await ensureSource(db, opp.id, source, refs[source])
      })
      if (!(await checkpoint(pool, lease, { progress: { discovered: Object.keys(refs) } })))
        throw new StaleLeaseError(lease.jobId)
    },

    async collection(ctx) {
      const { opp, lease, domain, keys, settings } = ctx
      const connectors = domain.connectorsFor({ APIFY_TOKEN: keys.apify ?? undefined })
      for (const source of SOURCES) {
        const row = (await sourcesOf(pool, opp.id)).find((r) => r.source === source)
        if (!row?.ref || ['complete', 'blocked', 'failed', 'skipped'].includes(row.status)) continue
        if (row.status === 'partial' && !row.cursor) continue
        if (await ctx.pausePoint({ collecting: source })) return FEATURE_OFF
        // Switched off on `/ops/wo`: an operator's choice, like `skipped_by_operator`, not a failure.
        if (settings.autoCollectSources?.[source] === false) {
          await fenced(pool, lease, (db) =>
            saveSource(db, opp.id, source, {
              status: 'skipped',
              reason: 'switched_off',
              cursor: null,
              coverage: { fetched: 0 },
              collected: row.collected ?? {}
            })
          )
          continue
        }
        const paid = SOCIAL_SOURCES.includes(source) && connectors[source]?.available && keys.apify
        // A run an earlier holder started (a restart during it) is read, and was counted when it started.
        const held = paid ? heldApifyRun(ctx.progress, source, row.cursor) : null
        if (paid && !held && (await apifyDaySpent(host, pool, opp.account_id, now())))
          return {
            state: 'paused',
            lastError: { code: 'SOURCE_PAUSED', source, reason: 'quota' },
            outcome: 'source_paused'
          }
        const result = await collectOne(
          connectors[source],
          source,
          row,
          settings.maxChargeUsdPerRun,
          paid ? apifyRunHooks(pool, lease, held) : {}
        )
        const collected = mergeCollected(row.collected, result)
        await fenced(pool, lease, async (db) => {
          await saveSource(db, opp.id, source, {
            status: result.status,
            reason: result.reason,
            cursor: result.cursor ?? null,
            coverage: result.coverage ?? null,
            collected
          })
          // The website names the restaurant's social accounts: collect them too.
          if (source === 'website') {
            const found = refsOfUrls(result.profile?.links ?? [])
            for (const social of SOCIAL_SOURCES)
              if (found[social]) await ensureSource(db, opp.id, social, found[social])
          }
        })
        if (paid) await spendApifyRun(pool, lease, result)
        if (result.status === 'partial' && RESUMABLE.has(result.reason) && result.cursor)
          return {
            state: 'paused',
            lastError: { code: 'SOURCE_PAUSED', source, reason: result.reason },
            outcome: 'source_paused'
          }
      }
    },

    async media(ctx) {
      const { opp, lease, domain } = ctx
      const known = await knownMediaUrls(pool, opp.id)
      // Facebook photos the feed served small, whose public page carries the original: the item
      // learns the larger address first, so the queue below stores the original, never the feed copy.
      const swapped = await upgradeFacebookStored(ctx, known)
      const queue = new Map()
      for (const row of await sourcesOf(pool, opp.id))
        for (const m of row.collected?.media ?? [])
          if (typeof m?.url === 'string' && !known.has(m.url) && !queue.has(m.url))
            queue.set(m.url, { ...m, source: row.source })
      const todo = fairShare([...queue.values()], Math.max(0, MEDIA_BUDGET - known.size))
      for (let i = 0; i < todo.length; i += 1) {
        if (i % 10 === 0 && (await ctx.pausePoint({ media: { done: i, total: todo.length } })))
          return FEATURE_OFF
        const record = await mediaRecord(domain, opportunityOwner(opp), todo[i])
        await fenced(pool, lease, (db) => insertMedia(db, record))
      }
      if (
        !(await checkpoint(pool, lease, {
          progress: {
            media: {
              done: todo.length,
              total: todo.length,
              overBudget: queue.size - todo.length,
              ...(swapped ? { upgraded: swapped } : {})
            }
          }
        }))
      )
        throw new StaleLeaseError(lease.jobId)
    },

    async profile(ctx) {
      const { opp, lease, keys, settings, domain } = ctx
      const rows = await sourcesOf(pool, opp.id)
      const profile = mergeProfile(opp, rows)
      if (ctx.private) return void (await fenced(pool, lease, (db) => saveProfile(db, opp.id, { profile })))
      // The candidate's website as judged today: never a listing or social page saved before (`candidate-as-read.mjs`).
      const website = profile.website ?? candidateAsRead(opp.candidate)?.website
      if (settings.pageSpeedCheckEnabled && keys.google && typeof website === 'string' && website) {
        const pageSpeed = await checkPageSpeed(website, keys.google, { fetch: apiFetch, now })
        if (pageSpeed) profile.pageSpeed = pageSpeed
      }
      const googlePlace = await placeFacts(domain, opp, keys)
      if (googlePlace) profile.googlePlace = googlePlace
      await fenced(pool, lease, async (db) => {
        await saveProfile(db, opp.id, { profile })
        if (opp.provider === 'url' && profile.name && profile.name !== opp.name)
          await db.query('update wo_opportunity set name = $2, updated_at = now() where id = $1', [
            opp.id,
            profile.name.slice(0, 200)
          ])
      })
      if (googlePlace && settings.googlePlacesPhotos) return placePhotos(ctx, googlePlace)
    },

    async brand({ opp, lease, domain }) {
      const rows = await sourcesOf(pool, opp.id)
      const media = await mediaOf(pool, opp.id)
      const profile = (await profileOf(pool, opp.id))?.profile ?? {}
      const collectedFrom = (pick) =>
        rows.some((r) => pick(r.source) && ['complete', 'partial'].includes(r.status))
      const observe = (origin, pick) => ({
        ...domain.brandFromSocial({
          palette: mergePalettes(media.filter((m) => pick(m.source))),
          bio: profile.bio ?? null,
          name: profile.name ?? opp.name,
          avatarUrl: profile.avatarUrl ?? null
        }),
        origin
      })
      const isWebsite = (s) => s === 'website'
      // Google listing photos are visitors' shots, not the restaurant's own: no part of its brand colours.
      const isSocial = (s) => SOCIAL_SOURCES.includes(s)
      const brand = {
        website: collectedFrom(isWebsite) ? observe('website', isWebsite) : null,
        social: collectedFrom(isSocial) ? observe('social', isSocial) : null,
        engine: BRAND_ENGINE
      }
      await fenced(pool, lease, (db) => saveProfile(db, opp.id, { brand }))
    }
  }

  /**
   * Place Details facts of a Google Places candidate: the stored ones while fresh (and, when they came from a hub, not
   * revoked since), else a shared hub's fresh copy, else one paid call; null on any failure.
   */
  async function placeFacts(domain, opp, keys) {
    if (opp.provider !== GOOGLE_PLACES_SOURCE || !opp.provider_id || !(keys.google || hub)) return null
    const held = (await profileOf(pool, opp.id))?.profile?.googlePlace
    // Facts older than 30 days are fetched again, so a brief reads current hours and reviews. Keeping Google
    // content is not limited here: a 19/10/2026 decision keeps it all and leaves takedowns to the legal team;
    // the place store's revoke columns are their way.
    if (
      held?.placeId === opp.provider_id &&
      now() - Date.parse(held.fetchedAt) < PLACE_FACTS_MAX_AGE_MS &&
      !(await revokedHubCopy(pool, held))
    )
      return held
    // The same hub read the shared path makes (`place-executor.js`), before Google is paid.
    const fromHub = hub ? await hub.placeFacts({ namespace: 'google', externalId: opp.provider_id }) : null
    if (fromHub) return fromHub.facts
    if (!keys.google) return null
    try {
      const raw = await domain.fetchPlaceDetails(opp.provider_id, { ...domainDeps, googleKey: keys.google })
      return domain.placeFactsFromDetails(raw, { now: () => new Date(now()) })
    } catch (error) {
      log.warn(`[opportunities] ${opp.id}: Google place details skipped (${error?.code ?? 'error'})`)
      return null
    }
  }

  /** Preserve paid-run recovery hooks alongside per-job collection limits. */
  async function collectOne(
    connector,
    source,
    row,
    maxChargeUsd,
    { pageLimit = WEBSITE_PAGES, domainDeps: collectDeps = domainDeps, ...hooks } = {}
  ) {
    if (!connector?.available)
      return {
        source,
        status: 'blocked',
        reason: connector?.reason ?? 'unsupported',
        media: [],
        coverage: { fetched: 0 }
      }
    try {
      // For the website `limit` is a page count, elsewhere a post count.
      const limit = source === 'website' ? pageLimit : collectLimit
      return await connector.collect(
        row.ref,
        { cursor: row.cursor ?? null, limit, ...(hooks.run ? { run: hooks.run } : {}) },
        { ...collectDeps, maxChargeUsd, ...(hooks.onRun ? { onRun: hooks.onRun } : {}) }
      )
    } catch (error) {
      // A paid call refused or left unknown by `deps.charge` belongs to the run, not to this source.
      if (error instanceof BudgetExceededError || error?.code === 'SOURCE_START_UNKNOWN') throw error
      const blocked = error?.code === 'URL_BLOCKED'
      return {
        source,
        status: blocked ? 'blocked' : 'failed',
        reason: blocked ? 'url_blocked' : 'error',
        media: [],
        coverage: { fetched: 0 }
      }
    }
  }

  /**
   * Stored Facebook photos at feed size get their original from the public photo page (no Apify
   * run; `facebook-photos.mjs`): the collected item is rewritten with the larger address, the large
   * copy is stored outside the media budget, and the feed-size row is superseded. A research that
   * collected nothing new (the source was already `complete`) still gets this.
   * @returns {Promise<number>} how many stored photos were swapped for their original
   */
  async function upgradeFacebookStored({ opp, lease, domain }, known) {
    if (typeof domain.upgradeFacebookPhotos !== 'function') return 0
    const row = (await sourcesOf(pool, opp.id)).find((r) => r.source === 'facebook')
    const items = row?.collected?.media
    if (!Array.isArray(items) || items.length === 0) return 0
    const pages = await domain.upgradeFacebookPhotos(items, domainDeps)
    if (!pages) return 0
    let swapped = 0
    for (const m of items) {
      if (typeof m.fallbackUrl !== 'string' || !known.has(m.fallbackUrl) || known.has(m.url)) continue
      const record = await mediaRecord(domain, opportunityOwner(opp), { ...m, source: 'facebook' })
      known.add(m.url)
      if (record.status !== 'stored') continue
      const inserted = await fenced(pool, lease, async (db) => {
        const inserted = await insertMedia(db, record)
        // The same bytes again (the original did not answer and the feed copy came back) supersede nothing.
        if (inserted) await supersedeMedia(db, opp.id, m.fallbackUrl)
        return inserted
      })
      if (inserted) swapped += 1
    }
    const before = row.coverage?.photoPages ?? {}
    const photoPages = {
      tried: (before.tried ?? 0) + pages.tried,
      upgraded: (before.upgraded ?? 0) + pages.upgraded,
      ...(pages.skipped ? { skipped: pages.skipped } : {})
    }
    await fenced(pool, lease, (db) =>
      saveSource(db, opp.id, 'facebook', {
        status: row.status,
        reason: row.reason,
        cursor: row.cursor,
        coverage: { ...row.coverage, photoPages },
        collected: row.collected
      })
    )
    return swapped
  }

  /** Where a media row goes: its owner columns and the object key prefix. */
  const opportunityOwner = (opp) => ({
    fields: { accountId: opp.account_id, opportunityId: opp.id },
    keyPrefix: `opportunities/${opp.account_id}/${opp.id}`
  })

  /** The media row of one collected item (`owner`: `opportunityOwner`, or a place's in `place-executor.js`). */
  async function mediaRecord(domain, owner, m) {
    const declared = m.kind === 'video' ? 'video' : 'image'
    const base = {
      ...owner.fields,
      kind: declared,
      category: domain.classifyMedia({ caption: m.caption, alt: m.alt, url: m.url }),
      caption: typeof m.caption === 'string' ? m.caption.slice(0, TEXT_MAX) : null,
      alt: typeof m.alt === 'string' ? m.alt.slice(0, TEXT_MAX) : null,
      source: m.source,
      sourceUrl: m.url,
      postId: typeof m.postId === 'string' ? m.postId : null,
      postedAt:
        m.postedAt && !Number.isNaN(Date.parse(m.postedAt)) ? new Date(m.postedAt).toISOString() : null
    }
    const reference = (reason) => ({
      ...base,
      status: 'reference',
      reason,
      sha256: domain.sha256Hex(new TextEncoder().encode(`ref:${m.url}`))
    })
    if (!objects) return reference('store_unavailable')
    // A connector may name a larger copy first (Facebook's photo page, an image host's original) and keep
    // the copy as seen in `fallbackUrl`: when the large one does not answer, is too large or is not a
    // readable picture, the small one is still the restaurant's photo. `sourceUrl` stays the item's
    // address (what `knownMediaUrls` and a supersede match); `labels.fetchedFrom` names the copy stored.
    const candidates = [
      m.url,
      ...(typeof m.fallbackUrl === 'string' && m.fallbackUrl !== m.url ? [m.fallbackUrl] : [])
    ]
    let failure = 'download_failed'
    for (const url of candidates) {
      let got
      try {
        got = await domain.fetchLimited(url, {
          ...domainDeps,
          maxBytes: declared === 'video' ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES,
          timeoutMs: 60_000
        })
      } catch (error) {
        if (error?.code === 'URL_BLOCKED') return reference('url_blocked')
        continue
      }
      if (!got || got.status >= 400 || got.truncated) {
        failure = got?.truncated ? 'too_large' : 'download_failed'
        continue
      }
      const record = await storedRecord(domain, owner, base, got.bytes, reference)
      if (record.status === 'stored') {
        if (url !== m.url) record.labels = { ...record.labels, fetchedFrom: url }
        return record
      }
      if (!['not_media', 'image_unreadable'].includes(record.reason)) return record
      failure = record.reason
    }
    return reference(failure)
  }

  /** The `wo_media` row of downloaded bytes: sniffed, measured, stored by sha256; `reference(reason)` otherwise. */
  async function storedRecord(domain, owner, base, bytes, reference) {
    const mime = domain.sniffMime(bytes)
    const kind = mime?.startsWith('image/') ? 'image' : mime?.startsWith('video/') ? 'video' : null
    if (!kind || !EXT[mime]) return reference('not_media')
    let info = { width: null, height: null, palette: null, dhash: null, features: null }
    if (kind === 'image') {
      try {
        info = await imageInfo(bytes)
      } catch {
        return reference('image_unreadable')
      }
    }
    const sha256 = domain.sha256Hex(bytes)
    // A place's picture goes to the shared bucket when this deployment has one (`opportunities/place-media-store.js`).
    const objectKey =
      (owner.shared && objects?.sharedKey?.({ ...base, sha256 }, EXT[mime])) ||
      `${owner.keyPrefix}/${sha256}.${EXT[mime]}`
    if (!objects || !(await objects.put(objectKey, bytes, mime))) return reference('store_failed')
    return {
      ...base,
      kind,
      status: 'stored',
      sha256,
      objectKey,
      mime,
      bytes: bytes.length,
      width: info.width,
      height: info.height,
      palette: info.palette,
      dhash: info.dhash ?? null,
      labels: info.features ? { features: info.features } : null
    }
  }

  /**
   * Photos of the Google Places listing (`googlePlacesPhotos` on), stored like any collected picture. Each keeps its
   * authors in `labels.credit`: Google requires the credit wherever the photo is shown. A failed photo is skipped.
   */
  async function placePhotos(ctx, googlePlace) {
    const { opp, lease, domain, keys } = ctx
    const known = await knownMediaUrls(pool, opp.id)
    const photos = (googlePlace.photos ?? []).slice(0, PLACE_PHOTOS_MAX)
    for (const [i, photo] of photos.entries()) {
      if (known.has(`${GOOGLE_PLACES_SOURCE}:${photo.name}`)) continue
      if (await ctx.pausePoint({ placePhotos: { done: i, total: photos.length } })) return FEATURE_OFF
      let got
      try {
        got = await domain.fetchPlacePhoto(photo.name, {
          ...domainDeps,
          googleKey: keys.google,
          attributions: photo.attributions ?? [],
          maxBytes: IMAGE_MAX_BYTES
        })
      } catch (error) {
        log.warn(`[opportunities] ${opp.id}: Google photo skipped (${error?.code ?? 'error'})`)
        continue
      }
      const base = {
        accountId: opp.account_id,
        opportunityId: opp.id,
        kind: 'image',
        category: 'other',
        caption: null,
        alt: null,
        source: GOOGLE_PLACES_SOURCE,
        sourceUrl: got.sourceUrl,
        postId: null,
        postedAt: null
      }
      const record = await storedRecord(domain, opportunityOwner(opp), base, got.bytes, () => null)
      if (!record) continue
      record.labels = { ...record.labels, credit: { provider: 'Google', authors: got.attributions ?? [] } }
      await fenced(pool, lease, (db) => insertMedia(db, record))
    }
    return null
  }

  const places = createPlaceRunner({
    pool,
    runtime,
    switchOn,
    log,
    now,
    leaseMs,
    heartbeatMs,
    collectLimit,
    loadDomain,
    apiFetch,
    domainDeps,
    providerRetry,
    chargeable,
    researchLedger,
    collectOne,
    apifyRun: { held: heldApifyRun, hooks: apifyRunHooks, spend: spendApifyRun },
    mediaRecord,
    storedRecord,
    imageMax: IMAGE_MAX_BYTES,
    placePhotosMax: PLACE_PHOTOS_MAX,
    mediaBudget: MEDIA_BUDGET,
    websitePages: WEBSITE_PAGES,
    brandEngine: BRAND_ENGINE,
    featureOff: FEATURE_OFF,
    resumable: RESUMABLE,
    stages: STAGES,
    objects,
    menuVisionDoor,
    businessReadingDoor,
    merge: { mergeCollected, fairShare, mergeProfile, mergePalettes },
    afterPublish,
    hub
  })

  return { tick, run, idle: () => Promise.all(running) }
}

/** What a source has collected so far, with this round's result appended (bounded). */
export function mergeCollected(previous, result) {
  const prev = previous ?? {}
  // A cursor continues the same source observation. Later pages often contain no profile, so
  // keep the first observed fields just as the crawler does within a batch. Fresh runs pass {}.
  const present = (value) =>
    value != null &&
    (typeof value !== 'string' || value.trim().length > 0) &&
    (!Array.isArray(value) || value.length > 0)
  const profile = { ...prev.profile }
  for (const [key, value] of Object.entries(result.profile ?? {}))
    if (!present(profile[key]) && present(value)) profile[key] = value
  const links = [...new Set([...(prev.profile?.links ?? []), ...(result.profile?.links ?? [])])]
    .filter((link) => typeof link === 'string' && link.trim())
    .slice(0, 1000)
  if (links.length) profile.links = links
  const media = new Map()
  for (const m of [...(prev.media ?? []), ...(result.media ?? [])])
    if (typeof m?.url === 'string' && !media.has(m.url)) media.set(m.url, m)
  return {
    profile: prev.profile != null || result.profile != null ? profile : null,
    pages: [...(prev.pages ?? []), ...(result.pages ?? [])]
      .slice(0, 200)
      .map((p) => ({ url: p?.url, title: p?.title ?? null, text: String(p?.text ?? '').slice(0, 20_000) })),
    posts: [...(prev.posts ?? []), ...(result.posts ?? [])].slice(0, 500),
    media: [...media.values()].slice(0, 1000),
    menus: uniqueByUrl([...(prev.menus ?? []), ...(result.menus ?? [])]),
    logos: uniqueByUrl([...(prev.logos ?? []), ...(result.logos ?? [])]),
    bookings: uniqueByUrl([...(prev.bookings ?? []), ...(result.bookings ?? [])])
  }
}

const PROFILE_FIELDS = ['name', 'bio', 'phone', 'address', 'email']

function uniqueByUrl(list) {
  const seen = new Map()
  for (const x of list) if (typeof x?.url === 'string' && !seen.has(x.url)) seen.set(x.url, x)
  return [...seen.values()].slice(0, 50)
}

// The site's own pictures first, then each social account in turn, so one busy feed cannot use the
// whole budget.
const MEDIA_ORDER = ['website', 'instagram', 'facebook', 'tiktok', 'youtube']

/** Round-robin over sources in `MEDIA_ORDER`, keeping each source's own order, up to `budget`. */
export function fairShare(items, budget) {
  const lanes = MEDIA_ORDER.map((source) => items.filter((m) => m.source === source))
  lanes.push(items.filter((m) => !MEDIA_ORDER.includes(m.source)))
  const out = []
  for (let i = 0; out.length < budget && lanes.some((l) => i < l.length); i += 1)
    for (const lane of lanes) if (i < lane.length && out.length < budget) out.push(lane[i])
  return out
}

/** One profile from the candidate and every source, keeping provenance and conflicts.
 * `publicProfiles` contains server-verified snapshot evidence, never a client-provided overlay.
 * `name` is the name the sources agree on, or the one the person typed (`business-name.js`); `nameClaims` keeps
 * every source's word for it, so a read can add the logo's text and the person's pick (`withNameDecision`).
 */
export function mergeProfile(opp, allRows, publicProfiles = []) {
  const candidate = opp.candidate ?? {}
  const listingRow = allRows.find((r) => r.source === LISTING_SOURCE) ?? null
  const rows = allRows.filter((r) => r.source !== LISTING_SOURCE)
  const entries = [
    {
      source: opp.provider,
      // A pasted URL's placeholder name is its hostname, not evidence of what the place is called; a name the
      // person typed with it is, and it comes first (pilot 24/10/2026: "Taco Corner No. 7" became the site's title).
      profile: {
        name: opp.provider === 'url' && isPlaceholderName(candidate.name) ? undefined : candidate.name,
        phone: candidate.phone,
        address: candidate.address
      }
    },
    ...publicProfiles,
    ...SOURCES.flatMap((source) => {
      const row = rows.find((r) => r.source === source)
      return row?.collected?.profile ? [{ source, profile: row.collected.profile }] : []
    }),
    // A listing site's page (magicpin, Tripadvisor…: `link-fields.js`) says least: it comes after every other source.
    ...(listingRow?.collected?.profile
      ? [{ source: LISTING_SOURCE, profile: listingRow.collected.profile }]
      : [])
  ]
  const evidence = {}
  for (const field of PROFILE_FIELDS) {
    const seen = new Map()
    for (const { source, profile } of entries) {
      const value = typeof profile?.[field] === 'string' ? profile[field].trim() : ''
      if (!value) continue
      const key = value.toLowerCase().replace(/\s+/g, ' ')
      if (!seen.has(key)) seen.set(key, { value, sources: [] })
      seen.get(key).sources.push(source)
    }
    evidence[field] = [...seen.values()]
  }
  const links = new Set()
  for (const { profile } of entries)
    for (const l of profile?.links ?? []) if (typeof l === 'string') links.add(l)
  for (const ref of rows.map((r) => r.ref)) if (ref) links.add(ref)
  const socials = {}
  for (const r of rows) if (r.ref && r.source !== 'website') socials[r.source] = r.ref
  const websiteRow = rows.find((r) => r.source === 'website')
  const website = websiteRow?.ref ?? null
  const seenAt = (row) => (row?.updated_at ? new Date(row.updated_at).toISOString() : null)
  // Hours and cuisine: the first source that states them, the restaurant's own website first.
  const firstList = (field) => {
    for (const source of SOURCES) {
      const list = rows.find((r) => r.source === source)?.collected?.profile?.[field]
      if (Array.isArray(list) && list.length) return list.filter((v) => typeof v === 'string')
    }
    return null
  }
  // Every source's hours, kept apart: two that disagree make none of them a fact, and a listing page's hours can
  // confirm another source's (`hours-check.mjs`). A listing's hours are never the profile's own `hours`.
  const hoursBySource = {}
  for (const source of [...SOURCES, LISTING_SOURCE]) {
    const list = allRows.find((r) => r.source === source)?.collected?.profile?.hours
    const hours = Array.isArray(list) ? list.filter((v) => typeof v === 'string' && v.trim()) : []
    if (hours.length) hoursBySource[source] = hours
  }
  const hoursLists = Object.values(hoursBySource)
  const hoursConflict = hoursLists.some((a, i) => hoursLists.slice(i + 1).some((b) => hoursDisagree(a, b)))
  const firstText = (field) => {
    for (const row of [...SOURCES.map((source) => rows.find((r) => r.source === source)), listingRow]) {
      const value = row?.collected?.profile?.[field]
      if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 80)
    }
    return null
  }
  // A menu or booking link found on the restaurant's own website is theirs: verified.
  const menus = (websiteRow?.collected?.menus ?? []).map((m) => ({
    url: m.url,
    source: 'website',
    seenAt: seenAt(websiteRow)
  }))
  const booking = (websiteRow?.collected?.bookings ?? []).map((b) => ({
    url: b.url,
    verified: true,
    source: 'website'
  }))
  const provenance = {}
  for (const field of PROFILE_FIELDS)
    if (evidence[field][0]) provenance[field] = { source: evidence[field][0].sources[0] }
  const nameClaims = nameClaimsOf(opp, rows.concat(listingRow ? [listingRow] : []), publicProfiles)
  const decided = withNameDecision(
    { name: evidence.name[0]?.value ?? opp.name, nameClaims },
    { opportunity: opp }
  )
  return {
    name: decided.name,
    nameClaims,
    nameCheck: decided.nameCheck,
    bio: evidence.bio[0]?.value ?? null,
    phone: evidence.phone[0]?.value ?? null,
    address: evidence.address[0]?.value ?? null,
    ...(evidence.email[0] ? { email: evidence.email[0].value } : {}),
    ...(website ? { website } : {}),
    ...(firstList('hours') ? { hours: firstList('hours') } : {}),
    ...(Object.keys(hoursBySource).length ? { hoursBySource } : {}),
    ...(hoursConflict ? { hoursConflict } : {}),
    ...(firstList('cuisine') ? { cuisine: firstList('cuisine') } : {}),
    // What the business's own website says it is (schema.org `@type`): the trade of a business saved by its link.
    ...(firstText('businessType') ? { businessType: firstText('businessType') } : {}),
    ...(menus.length ? { menus } : {}),
    ...(booking.length ? { booking } : {}),
    socials,
    provenance,
    links: [...links],
    branch: opp.branch ?? null,
    evidence,
    conflicts: PROFILE_FIELDS.filter((f) => evidence[f].length > 1),
    sources: allRows.map((r) => ({
      source: r.source,
      status: r.status,
      reason: r.reason,
      coverage: r.coverage
    }))
  }
}

/** The palettes of stored images, weighted together: the 12 heaviest colours. */
export function mergePalettes(media) {
  const all = media.flatMap((m) => (m.status === 'stored' && Array.isArray(m.palette) ? m.palette : []))
  const total = all.reduce((sum, c) => sum + (Number(c.weight) || 0), 0) || 1
  return all
    .map((c) => ({ r: c.r, g: c.g, b: c.b, weight: (Number(c.weight) || 0) / total }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 12)
}
