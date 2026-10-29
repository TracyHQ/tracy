/**
 * The optional Monid pass of Google reviews: after the Maps step, inside the same place lease and charge ledger.
 * Off unless the operator puts `monid-google-reviews` in the Google reviews order (/ops/wo › Settings) and a Monid
 * key is set. Its reviews join the Maps source's reviews once, each tagged `provider: 'monid'`; a failed call leaves
 * the reviews already held as they are and never fails the research.
 */
import { BudgetExceededError } from './cost-ledger.js'
import { ceilingCents } from './cost-prices.js'
import { GOOGLE_MAPS_SOURCE, controlError } from './google-maps-research.js'
import { mapsListingUrl } from './google-maps-serpapi.js'
import { MONID_ROUTE, monidGoogleReviewsCall, monidRetryable, withMonidReviews } from './google-maps-monid.js'
import { fenced } from './store.js'
import { resolveProviderOrder } from './wo-settings.js'

export const MONID_PROVIDER = 'monid-google-reviews'

/** Reviews age slowly: refetch after 90 days, not the 30 of the other sources. */
export const MONID_MAX_AGE_MS = 90 * 24 * 3600 * 1000

/** On only when the operator's Google reviews order names Monid and its key is set; no key = skipped, not an error. */
export function monidReviewsOn({ keys, settings }) {
  return (
    Boolean(keys?.monid) &&
    resolveProviderOrder(settings ?? {}, 'google-reviews').order.includes(MONID_PROVIDER)
  )
}

/** The pass's last try, shaped as a snapshot source row so the executor's `due` (`sourceDue`) judges it. */
export function monidAttemptOf(row) {
  const monid = row?.collected?.monid
  return {
    attempted_at: monid?.attemptedAt ?? null,
    collected_at: monid?.fetchedAt ?? null,
    last_error: monid?.lastError ?? null
  }
}

/** Nothing client-supplied enters: the place id is the snapshot's Google identity, `google` the server's facts. */
export async function researchMonidReviews(
  ctx,
  { pool, now, fetch: fetchImpl, chargeable, row, google, save, sleep }
) {
  if (
    ctx.prefetch ||
    ctx.job.research_mode === 'website' ||
    ctx.identity?.namespace !== 'google' ||
    !monidReviewsOn(ctx)
  )
    return
  const { lease, job, snapshotId } = ctx
  const placeId = ctx.identity.external_id
  const prior = row?.collected?.monid ?? {}
  // A resumed job never sends the same paid call twice; the next job tries again.
  if (prior.jobId === job.id) return
  const at = () => new Date(now())
  const ours = row?.collected?.placeId === placeId
  const empty = {
    source: GOOGLE_MAPS_SOURCE,
    attribution: 'Google',
    placeId,
    url: mapsListingUrl(placeId),
    reviews: [],
    overviewPhotos: [],
    menuPhotos: [],
    media: []
  }
  const mark = (monid) =>
    fenced(pool, lease, (db) =>
      db.query(
        `insert into wo_place_snapshot_source (snapshot_id, source, collected) values ($1, $2, $3::jsonb)
         on conflict (snapshot_id, source) do update set collected = jsonb_set(
           coalesce(wo_place_snapshot_source.collected, excluded.collected), '{monid}', excluded.collected->'monid')`,
        [snapshotId, GOOGLE_MAPS_SOURCE, JSON.stringify({ ...empty, monid })]
      )
    )
  const record = { provider: 'monid', route: MONID_ROUTE, jobId: job.id }
  try {
    if (await ctx.pausePoint({ collecting: GOOGLE_MAPS_SOURCE, operation: 'monid-reviews' }))
      throw Object.assign(new Error('feature off'), { code: 'FEATURE_OFF' })
    const result = await chargeable(
      {
        provider: 'monid',
        operation: 'google-reviews',
        maxCents: ceilingCents('monid', 'google-reviews'),
        placeId: ctx.place.id,
        jobId: job.id,
        prefetchCampaignId: job.prefetch_campaign_id ?? null,
        expectedLeaseToken: lease.token,
        requestKey: `${job.id}:${lease.token}:google-reviews:monid`,
        actualCents: (answer) => (answer?.costUsd == null ? null : answer.costUsd * 100),
        providerRunId: (answer) => answer?.runId ?? null
      },
      async (charge) => {
        if (!ctx.keys.monid) {
          charge.notSent()
          throw Object.assign(new Error('Monid key missing'), { code: 'CREDENTIAL_MISSING' })
        }
        await mark({ ...prior, ...record, state: 'sent' })
        return monidGoogleReviewsCall({ placeId }, { key: ctx.keys.monid, fetch: fetchImpl, now, sleep })
      }
    )
    const held = ours ? (row.collected.reviews ?? []) : []
    const reviews = withMonidReviews(held, result.reviews, google?.reviews ?? [])
    const monid = {
      ...record,
      state: 'done',
      attemptedAt: result.fetchedAt,
      fetchedAt: result.fetchedAt,
      fetched: result.reviews.length,
      kept: reviews.filter((review) => review.provider === 'monid').length,
      placeReviewCount: result.placeInfo.reviews,
      costUsd: result.costUsd
    }
    await fenced(pool, lease, (db) =>
      ours && row.collected_at
        ? // The Maps step's own freshness (collected_at, version) stays as it was: only its reviews change.
          db.query(
            `update wo_place_snapshot_source set collected = jsonb_set(jsonb_set(collected, '{reviews}', $3::jsonb),
               '{monid}', $4::jsonb) where snapshot_id = $1 and source = $2`,
            [snapshotId, GOOGLE_MAPS_SOURCE, JSON.stringify(reviews), JSON.stringify(monid)]
          )
        : save(
            db,
            snapshotId,
            GOOGLE_MAPS_SOURCE,
            {
              ref: empty.url,
              status: 'complete',
              coverage: row?.coverage ?? null,
              collected: { ...(ours ? row.collected : empty), reviews, monid }
            },
            at(),
            row?.collector_version ?? 'google-maps-0'
          )
    )
  } catch (error) {
    if (controlError(error)) {
      if (error instanceof BudgetExceededError) error.source = GOOGLE_MAPS_SOURCE
      throw error
    }
    if (error?.code === 'CREDENTIAL_MISSING') return
    const lastError = { reason: error?.code ?? 'PROVIDER_ERROR', at: at().toISOString() }
    // A timeout or a busy provider is tried again on the next run; any other failure waits like a failed source.
    await mark(
      monidRetryable(error)
        ? { ...prior, ...record, state: 'retry', lastError }
        : { ...prior, ...record, state: 'failed', attemptedAt: lastError.at, lastError }
    )
  }
}
