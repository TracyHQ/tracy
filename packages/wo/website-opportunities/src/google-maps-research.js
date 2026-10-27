/** Cached optional Maps menu/review enrichment inside the shared place lease and charge ledger. */
import {
  googleMapsSerpapiCall,
  mapsDataId,
  mapsCategoryId,
  mapsListingUrl,
  supplementalMapsReviews
} from './google-maps-serpapi.js'
import { BudgetExceededError } from './cost-ledger.js'
import { ceilingCents } from './cost-prices.js'
import { StaleLeaseError, fenced } from './store.js'
import { resolveProviderOrder } from './wo-settings.js'

export const GOOGLE_MAPS_SOURCE = 'google-maps'
export const GOOGLE_MAPS_VERSION = 'google-maps-1'
const DAY = 86400000
const CACHE_VERSION = 1
const age = (date, now) => {
  const elapsed = now - Date.parse(date)
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : Infinity
}
export const googleMapsSourcesRequired = ({ keys, settings }) =>
  keys?.serpapi && settings?.googleMapsMenu !== false ? { [GOOGLE_MAPS_SOURCE]: GOOGLE_MAPS_VERSION } : {}
export const controlError = (error) =>
  error instanceof BudgetExceededError ||
  error instanceof StaleLeaseError ||
  [
    'STALE_LEASE',
    'FEATURE_OFF',
    'PREFETCH_STOPPED',
    'SOURCE_START_UNKNOWN',
    'CHARGE_SPENT',
    'CHARGE_IN_PROGRESS'
  ].includes(error?.code)

export async function researchGoogleMaps(
  ctx,
  { pool, now, fetch: fetchImpl, retry, chargeable, row, google, save, tried }
) {
  if (
    ctx.prefetch ||
    ctx.job.research_mode === 'website' ||
    !ctx.keys.serpapi ||
    ctx.settings.googleMapsMenu === false ||
    ctx.identity?.namespace !== 'google'
  )
    return
  const { lease, job, snapshotId } = ctx
  const placeId = ctx.identity.external_id
  const sameJob = row?.coverage?.pipelineJobId === job.id
  let pipeline = sameJob ? { ...row?.coverage?.pipeline } : {}
  let data =
    row?.collected?.placeId === placeId
      ? { ...row.collected }
      : {
          source: GOOGLE_MAPS_SOURCE,
          provider: 'serpapi',
          attribution: 'Google',
          placeId,
          url: mapsListingUrl(placeId),
          reviews: [],
          overviewPhotos: [],
          menuPhotos: [],
          media: []
        }
  let cache =
    data.cache?.version === CACHE_VERSION && data.cache.placeId === placeId
      ? { ...data.cache }
      : { version: CACHE_VERSION, placeId }
  // Every HTTP try of this run, in order, with its code: a 429 retried twice reads as three tries in the brief
  // (`brief-sources.mjs`), not as one.
  const attempts = sameJob && Array.isArray(row?.coverage?.attempts) ? [...row.coverage.attempts] : []
  let pending = true
  const coverage = () => ({
    version: GOOGLE_MAPS_VERSION,
    pipelineJobId: job.id,
    pipeline,
    pending,
    attempts
  })
  const persist = async () =>
    fenced(pool, lease, (db) =>
      db.query(
        `insert into wo_place_snapshot_source(snapshot_id,source,coverage) values($1,$2,$3::jsonb) on conflict(snapshot_id,source) do update set coverage=excluded.coverage`,
        [snapshotId, GOOGLE_MAPS_SOURCE, JSON.stringify(coverage())]
      )
    )
  const at = () => new Date(now())
  const publish = async (complete = false) => {
    data.cache = cache
    await fenced(pool, lease, async (db) => {
      await save(
        db,
        snapshotId,
        GOOGLE_MAPS_SOURCE,
        { ref: data.url, status: 'complete', coverage: coverage(), collected: data },
        at(),
        complete ? GOOGLE_MAPS_VERSION : 'google-maps-0'
      )
      if (!complete && row?.collected_at)
        await db.query(
          'update wo_place_snapshot_source set collected_at=$3 where snapshot_id=$1 and source=$2',
          [snapshotId, GOOGLE_MAPS_SOURCE, row.collected_at]
        )
    })
  }
  const call = async (operation, params) => {
    const held = pipeline[operation]
    if (held?.state === 'done') return held.result
    if (held?.state === 'sent' || held?.state === 'failed')
      throw Object.assign(new Error('Maps checkpoint not repeated'), { code: held.code ?? 'OUTCOME_UNKNOWN' })
    if (await ctx.pausePoint({ collecting: GOOGLE_MAPS_SOURCE, operation }))
      throw Object.assign(new Error('feature off'), { code: 'FEATURE_OFF' })
    return chargeable(
      {
        provider: 'serpapi',
        operation: `google-maps-${operation}`,
        maxCents: ceilingCents('serpapi', `google-maps-${operation}`),
        placeId: ctx.place.id,
        jobId: job.id,
        prefetchCampaignId: job.prefetch_campaign_id ?? null,
        expectedLeaseToken: lease.token,
        requestKey: `${job.id}:${lease.token}:google-maps:${operation}`
      },
      async () => {
        pipeline[operation] = { state: 'sent' }
        await persist()
        const tries = []
        // A try that got an HTTP answer is settled by what the call made of it (a 200 can still be an
        // APPLICATION_ERROR); a try that failed at HTTP keeps its own code.
        const settle = (error) => {
          const outcome = error
            ? {
                provider: 'serpapi',
                step: operation,
                status: 'failed',
                reason: error?.code ?? 'PROVIDER_ERROR'
              }
            : { provider: 'serpapi', step: operation, status: 'complete' }
          if (!tries.length || tries.at(-1) === null) tries[Math.max(tries.length - 1, 0)] = outcome
          attempts.push(...tries)
        }
        try {
          const result = await googleMapsSerpapiCall(operation, params, {
            key: ctx.keys.serpapi,
            fetch: fetchImpl,
            retry,
            onTry: ({ error }) =>
              tries.push(
                error
                  ? {
                      provider: 'serpapi',
                      step: operation,
                      status: 'failed',
                      reason: error.code ?? 'PROVIDER_ERROR'
                    }
                  : null
              )
          })
          settle(null)
          pipeline[operation] = { state: 'done', result }
          await persist()
          return result
        } catch (error) {
          settle(error)
          if (!['TIMEOUT', 'PROVIDER_ERROR'].includes(error?.code)) {
            pipeline[operation] = { state: 'failed', code: error?.code ?? 'PROVIDER_ERROR' }
            await persist()
          }
          throw error
        }
      }
    )
  }
  try {
    if (!mapsDataId(cache.dataId) || age(cache.placeCheckedAt, now()) > 180 * DAY) {
      const place = await call('place', { placeId })
      cache = { version: CACHE_VERSION, placeId, dataId: place.dataId, placeCheckedAt: at().toISOString() }
      data = {
        ...data,
        name: place.name,
        dataId: place.dataId,
        menuLink: place.menuLink ?? null,
        reviews: supplementalMapsReviews(place.reviews, google?.reviews ?? []).map((review) => ({
          ...review,
          fetchedAt: at().toISOString()
        })),
        reviewsFetchedAt: at().toISOString()
      }
      await publish()
    }
    const categoryTtl = cache.categoryId === null ? 30 * DAY : 180 * DAY
    if (
      !cache.categoryCheckedAt ||
      age(cache.categoryCheckedAt, now()) > categoryTtl ||
      (cache.categoryId !== null && !mapsCategoryId(cache.categoryId))
    ) {
      const overview = await call('overview', { dataId: cache.dataId })
      cache.categoryId =
        overview.categories.find((category) => category.title.toLowerCase() === 'menu')?.id ?? null
      cache.categoryCheckedAt = at().toISOString()
      data.overviewPhotos = overview.photos
      data.overviewFetchedAt = at().toISOString()
      await publish()
    }
    // Menu photos is its own capability group on /ops/wo; `[]` there skips only this call.
    if (
      cache.categoryId &&
      resolveProviderOrder(ctx.settings, 'menu-photos').order.includes('serpapi-google-maps')
    ) {
      const menu = await call('menu', { dataId: cache.dataId, categoryId: cache.categoryId })
      data.menuPhotos = menu.photos
      data.menuFetchedAt = at().toISOString()
    } else {
      data.menuPhotos = []
      data.menuFetchedAt = at().toISOString()
    }
    data.media = mapsMedia(data)
    pending = false
    await publish(true)
  } catch (error) {
    if (controlError(error)) {
      if (error instanceof BudgetExceededError) error.source = GOOGLE_MAPS_SOURCE
      throw error
    }
    pending = false
    if (error?.code === 'INVALID_DATA_ID') cache = { version: CACHE_VERSION, placeId }
    if (error?.code === 'INVALID_CATEGORY_ID') {
      delete cache.categoryId
      delete cache.categoryCheckedAt
    }
    // Already saved place/category checkpoints survive optional failure; prior successful menu data stays intact.
    if (data.cache || cache.dataId) {
      data.media = mapsMedia(data)
      await publish()
    }
    await fenced(pool, lease, (db) =>
      tried(
        db,
        snapshotId,
        GOOGLE_MAPS_SOURCE,
        row?.collected_at ? row : cache.dataId ? { ...row, collected_at: at() } : row,
        { status: 'failed', reason: error?.code ?? 'PROVIDER_ERROR', coverage: coverage() },
        at()
      )
    )
  }
}

export function mapsMedia(data) {
  const byUrl = new Map()
  const add = (photo, kind, review = null) => {
    if (byUrl.has(photo.url)) return
    byUrl.set(photo.url, {
      kind: 'image',
      url: photo.url,
      category: kind === 'menu' ? 'menu' : null,
      postId: review?.id ?? null,
      provider: 'serpapi',
      credit: {
        provider: 'Google',
        viaProvider: 'serpapi',
        googlePlaceId: data.placeId,
        dataId: data.cache?.dataId ?? data.dataId,
        sourceUrl: review?.url ?? data.url,
        reviewId: review?.id ?? null,
        photoSource: kind,
        authors: review ? [] : (photo.authors ?? [])
      }
    })
  }
  for (const photo of (data.menuPhotos ?? []).slice(0, 20)) add(photo, 'menu')
  for (const review of data.reviews ?? [])
    for (const photo of review.photos ?? []) add(photo, 'review', review)
  for (const photo of (data.overviewPhotos ?? []).slice(0, 20)) add(photo, 'overview')
  return [...byUrl.values()].slice(0, 90)
}
