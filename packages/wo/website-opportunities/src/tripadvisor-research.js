/** Optional review enrichment inside the existing place lease, snapshot and charge ledger. */
import { googleMapsSourcesRequired } from './google-maps-research.js'
import { serpapiTripadvisorCall } from './tripadvisor-serpapi.js'
import { tripadvisorPhotos } from './tripadvisor-media.js'
import { oneapiTripadvisorCall } from './tripadvisor-oneapi.js'
import { BudgetExceededError } from './cost-ledger.js'
import { ceilingCents } from './cost-prices.js'
import { resolveProviderOrder } from './wo-settings.js'
import { StaleLeaseError, fenced } from './store.js'
import {
  litescrapeCall,
  matchTripadvisor,
  tripadvisorPlace,
  tripadvisorNameMatches,
  tripadvisorRestaurantName,
  tripadvisorReviews,
  TRIPADVISOR_SOURCE,
  TRIPADVISOR_VERSION
} from './tripadvisor.js'

export function reviewSourcesRequired({ keys, settings }) {
  return {
    ...googleMapsSourcesRequired({ keys, settings }),
    ...(tripadvisorProviders(settings, keys).length > 0 && settings?.tripadvisorReviews !== false
      ? { [TRIPADVISOR_SOURCE]: TRIPADVISOR_VERSION }
      : {})
  }
}

/** Catalogue provider id (`domain/capabilities.mjs` tripadvisor) → the key and call this module uses. */
const TA_PROVIDER = Object.freeze({
  serpapi: 'serpapi',
  'rapidapi-tripadvisor': 'rapidapi',
  litescrape: 'litescrape'
})

/** The operator's Tripadvisor order (/ops/wo), keyed providers only: a provider without its key is skipped. */
export function tripadvisorProviders(settings, keys) {
  return resolveProviderOrder(settings, 'tripadvisor')
    .order.map((id) => TA_PROVIDER[id])
    .filter((provider) => provider && keys?.[provider])
}

/** Nothing client-supplied enters this function: Google facts came from the server's source snapshot. */
export async function researchTripadvisor(
  ctx,
  { pool, now, fetch: fetchImpl, chargeable, row, google, save, tried }
) {
  if (
    ctx.prefetch ||
    ctx.job.research_mode === 'website' ||
    tripadvisorProviders(ctx.settings, ctx.keys).length === 0 ||
    ctx.settings.tripadvisorReviews === false
  )
    return
  const { lease, job, place, snapshotId } = ctx
  const scope = {
    placeId: place.id,
    jobId: job.id,
    // The shared admin cron adds these fields; develop's ledger ignores absent campaign scope.
    prefetchCampaignId: job.prefetch_campaign_id ?? null,
    expectedLeaseToken: lease.token
  }
  const sameJob = row?.coverage?.pipelineJobId === job.id
  let pipeline = sameJob ? (row.coverage.pipeline ?? {}) : {}
  let pinnedPlaceId = row?.coverage?.pinnedPlaceId ?? row?.collected?.placeId ?? null
  let pending = true
  const components = sameJob ? { ...row.coverage.components } : {}
  const outcomes = sameJob ? [...(row.coverage.outcomes ?? [])] : []
  const persist = async () =>
    fenced(pool, lease, (db) =>
      db.query(
        `insert into wo_place_snapshot_source (snapshot_id, source, coverage) values ($1, $2, $3::jsonb)
     on conflict (snapshot_id, source) do update set coverage = excluded.coverage`,
        [
          snapshotId,
          TRIPADVISOR_SOURCE,
          JSON.stringify({
            pipeline,
            pending,
            components,
            pipelineJobId: job.id,
            pinnedPlaceId,
            outcomes,
            version: TRIPADVISOR_VERSION
          })
        ]
      )
    )
  const call = async (provider, operation, params, slot = operation) => {
    const providerSlot = `${provider}:${slot}`
    const held = pipeline[providerSlot] ?? (provider === 'litescrape' ? pipeline[slot] : null)
    if (held?.state === 'done') return held.result
    if (held?.state === 'failed')
      throw Object.assign(new Error('TripAdvisor provider attempt failed'), { code: held.code })
    if (held?.state === 'sent')
      throw Object.assign(new Error('TripAdvisor provider outcome unknown'), { code: 'OUTCOME_UNKNOWN' })
    if (await ctx.pausePoint({ collecting: TRIPADVISOR_SOURCE, operation }))
      throw Object.assign(new Error('feature off'), { code: 'FEATURE_OFF' })
    return chargeable(
      {
        provider,
        operation: provider === 'litescrape' ? operation : `tripadvisor-${operation}`,
        maxCents: ceilingCents(provider, provider === 'litescrape' ? operation : `tripadvisor-${operation}`),
        ...scope,
        requestKey: `${job.id}:${lease.token}:tripadvisor:${providerSlot}`
      },
      async () => {
        pipeline = { ...pipeline, [providerSlot]: { state: 'sent' } }
        await persist()
        let result
        try {
          result = await {
            serpapi: serpapiTripadvisorCall,
            rapidapi: oneapiTripadvisorCall,
            litescrape: litescrapeCall
          }[provider](operation, params, { key: ctx.keys[provider], fetch: fetchImpl })
        } catch (error) {
          // A timeout/network failure may have been billed; preserve the sent checkpoint.
          if (!['TIMEOUT', 'PROVIDER_ERROR'].includes(error?.code)) {
            pipeline = {
              ...pipeline,
              [providerSlot]: { state: 'failed', code: error?.code ?? 'PROVIDER_ERROR' }
            }
            await persist()
          }
          throw error
        }
        pipeline = { ...pipeline, [providerSlot]: { state: 'done', result } }
        await persist()
        return result
      }
    )
  }
  const at = () => new Date(now())
  try {
    if (!google?.name)
      return await fenced(pool, lease, (db) =>
        tried(
          db,
          snapshotId,
          TRIPADVISOR_SOURCE,
          row,
          { status: 'skipped', reason: 'verified_facts_missing', coverage: { version: TRIPADVISOR_VERSION } },
          at()
        )
      )
    // A fixed server-side Google door supplies branch facts when older snapshots predate this capability.
    // No opportunity name/address/coordinates are consulted.
    if (!google.matchFacts && !ctx.keys.google)
      return await fenced(pool, lease, (db) =>
        tried(
          db,
          snapshotId,
          TRIPADVISOR_SOURCE,
          row,
          { status: 'skipped', reason: 'verified_facts_missing', coverage: { version: TRIPADVISOR_VERSION } },
          at()
        )
      )
    let facts = google.matchFacts
    if (!facts) {
      if (await ctx.pausePoint({ collecting: TRIPADVISOR_SOURCE, operation: 'google-match' }))
        throw Object.assign(new Error('feature off'), { code: 'FEATURE_OFF' })
      facts = await chargeable(
        {
          provider: 'google',
          operation: 'place-location',
          maxCents: ceilingCents('google', 'place-location'),
          ...scope
        },
        async () => {
          const fields = 'id,displayName,formattedAddress,location,internationalPhoneNumber,websiteUri'
          const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(google.placeId)}`
          const result = await ctx.domain.fetchLimited(url, {
            ...ctx.domainDeps,
            headers: { 'X-Goog-Api-Key': ctx.keys.google, 'X-Goog-FieldMask': fields },
            maxBytes: 256 * 1024,
            timeoutMs: 10_000
          })
          if (result.status !== 200)
            throw Object.assign(new Error('Google branch facts unavailable'), { code: 'GOOGLE_MATCH_FAILED' })
          const raw = JSON.parse(new TextDecoder().decode(result.bytes))
          if (raw.id !== google.placeId)
            throw Object.assign(new Error('Google identity mismatch'), { code: 'GOOGLE_MATCH_FAILED' })
          return {
            name: raw.displayName?.text ?? google.name,
            address: raw.formattedAddress ?? null,
            phone: raw.internationalPhoneNumber ?? null,
            website: raw.websiteUri ?? google.website,
            lat: raw.location?.latitude ?? null,
            lon: raw.location?.longitude ?? null
          }
        }
      )
      google.matchFacts = facts
      // Persist the server-owned matching seed even if the provider later fails or a budget pauses.
      await fenced(pool, lease, (db) =>
        db.query(
          `update wo_place_snapshot_source set collected = jsonb_set(collected, '{matchFacts}', $2::jsonb)
         where snapshot_id = $1 and source = 'google-places'`,
          [snapshotId, JSON.stringify(facts)]
        )
      )
    }
    const providers = tripadvisorProviders(ctx.settings, ctx.keys)
    const blocked = new Set(
      outcomes.filter((o) => /^HTTP_(401|402|403|429)$/.test(o.reason ?? '')).map((o) => o.provider)
    )
    let lastProviderError = null
    const failed = async (provider, step, error) => {
      if (controlError(error)) throw error
      lastProviderError = error
      outcomes.push({ provider, step, status: 'failed', reason: error?.code ?? 'PROVIDER_ERROR' })
      if (/^HTTP_(401|402|403|429)$/.test(error?.code ?? '')) blocked.add(provider)
      await persist()
    }
    const stop = async (reason, match) =>
      fenced(pool, lease, (db) =>
        tried(
          db,
          snapshotId,
          TRIPADVISOR_SOURCE,
          row,
          {
            status: reason.includes('conflict') ? 'blocked' : 'skipped',
            reason,
            coverage: {
              ...match,
              version: TRIPADVISOR_VERSION,
              outcomes,
              pinnedPlaceId,
              retryAfter: new Date(now() + 86400000).toISOString()
            }
          },
          at()
        )
      )
    // Reuse only a previously accepted, still corroborated association from this place's snapshot.
    // A pinned ID from an interrupted/failed search alone is not sufficient evidence.
    const prior = row?.collected
    const priorMatch = prior?.match
    const reusable =
      priorMatch?.status === 'matched' &&
      priorMatch.placeId === prior?.placeId &&
      prior.placeId === pinnedPlaceId &&
      matchTripadvisor(facts, [prior]).status === 'matched'
        ? prior
        : null
    let matched = null,
      match = null,
      matchProvider = null
    for (const [index, provider] of providers.entries()) {
      if (blocked.has(provider)) continue
      try {
        const params = {
          q: tripadvisorRestaurantName(facts.name, facts.address).slice(0, 500),
          place_type: 'eatery',
          num: '4'
        }
        if (Number.isFinite(facts.lat) && Number.isFinite(facts.lon))
          Object.assign(params, { lat: String(facts.lat), lon: String(facts.lon) })
        const search = reusable ? null : await call(provider, 'search', params)
        const candidates = reusable
          ? [reusable]
          : [
              ...new Map(
                search
                  .map(tripadvisorPlace)
                  .filter(
                    (p) =>
                      p &&
                      tripadvisorNameMatches(p.name, facts.name, {
                        addressA: p.address,
                        addressB: facts.address
                      })
                  )
                  .map((p) => [p.placeId, p])
              ).values()
            ]
        const details = []
        for (const p of candidates.slice(0, 3)) {
          const raw = await call(provider, 'place', { place_id: p.placeId }, `place:${p.placeId}`)
          const detail = tripadvisorPlace(raw)
          if (!detail || detail.placeId !== p.placeId)
            throw Object.assign(new Error('TripAdvisor place mismatch'), { code: 'INVALID_RESPONSE' })
          details.push({
            ...detail,
            url: detail.url ?? p.url,
            market: detail.market ?? p.market,
            rating: detail.rating ?? p.rating,
            reviewCount: detail.reviewCount ?? p.reviewCount
          })
        }
        match = matchTripadvisor(facts, details, { truncated: candidates.length > 3 })
        if (match.status === 'insufficient_evidence' && index < providers.length - 1) {
          outcomes.push({ provider, step: 'match', status: 'insufficient_evidence' })
          await persist()
          continue
        }
        if (match.status !== 'matched') return await stop(match.status, match)
        if (pinnedPlaceId && pinnedPlaceId !== match.placeId)
          return await stop('provider_identity_conflict', match)
        pinnedPlaceId = match.placeId
        await persist()
        const linked = match.branchVerified
          ? await fenced(pool, lease, async (db) => {
              await db.query(
                `insert into wo_place_identity (namespace, external_id, place_id, source) values ('tripadvisor', $1, $2, $3) on conflict do nothing`,
                [pinnedPlaceId, place.id, provider]
              )
              const owner = (
                await db.query(
                  `select place_id from wo_place_identity where namespace = 'tripadvisor' and external_id = $1`,
                  [pinnedPlaceId]
                )
              ).rows[0]
              return owner?.place_id === place.id
            })
          : true
        if (!linked) return await stop('identity_conflict', match)
        matched = details.find((p) => p.placeId === pinnedPlaceId)
        matchProvider = provider
        outcomes.push({ provider, step: 'match', status: 'matched' })
        break
      } catch (error) {
        await failed(provider, 'match', error)
      }
    }
    if (!matched)
      throw (
        lastProviderError ??
        Object.assign(new Error('TripAdvisor match providers unavailable'), { code: 'PROVIDER_ERROR' })
      )
    let reviews = row?.collected?.reviews ?? []
    let media = row?.collected?.media ?? []
    let reviewProvider = row?.collected?.provider ?? matchProvider
    const publish = async () => {
      const complete = components.reviews?.status === 'complete' && components.photos?.status === 'complete'
      await fenced(pool, lease, (db) =>
        save(
          db,
          snapshotId,
          TRIPADVISOR_SOURCE,
          {
            ref: matched.url,
            status: 'complete',
            coverage: {
              ...match,
              version: TRIPADVISOR_VERSION,
              fetched: reviews.length,
              photos: media.length,
              components,
              pending,
              pipeline,
              pipelineJobId: job.id,
              outcomes,
              pinnedPlaceId
            },
            collected: {
              ...matched,
              source: TRIPADVISOR_SOURCE,
              provider: reviewProvider,
              attribution: 'TripAdvisor',
              scope: match.scope,
              branchVerified: match.branchVerified,
              fetchedAt: at().toISOString(),
              reviews,
              media,
              match
            }
          },
          at(),
          complete ? TRIPADVISOR_VERSION : (row?.collector_version ?? 'tripadvisor-2')
        )
      )
    }
    for (const provider of providers) {
      if (blocked.has(provider)) continue
      try {
        const raw = await call(provider, 'reviews', {
          place_id: pinnedPlaceId,
          num: '10',
          sort_by: 'recent',
          translate: 'false'
        })
        const normalized = tripadvisorReviews(raw, {
          fetchedAt: at().toISOString(),
          placeUrl: matched.url,
          provider
        })
        const fresh = normalized.map((review) => {
          const old = reviews.find((previous) => previous.id === review.id)
          if (!old) return review
          return {
            ...review,
            url: review.url === matched.url ? old.url : review.url,
            authorUrl: review.authorUrl ?? old.authorUrl,
            authorAvatarUrl: review.authorAvatarUrl ?? old.authorAvatarUrl,
            photos: review.photos.length ? review.photos : (old.photos ?? [])
          }
        })
        reviews = [...fresh, ...reviews.filter((old) => !fresh.some((review) => review.id === old.id))].slice(
          0,
          30
        )
        reviewProvider = provider
        components.reviews = { status: 'complete', provider, fetched: fresh.length }
        outcomes.push({ provider, step: 'reviews', status: 'complete' })
        await publish()
        break
      } catch (error) {
        await failed(provider, 'reviews', error)
      }
    }
    if (!components.reviews) components.reviews = { status: 'failed' }
    let photoPlace = null,
      photoProvider = matchProvider
    for (const provider of providers) {
      if (blocked.has(provider) && pipeline[`${provider}:place:${pinnedPlaceId}`]?.state !== 'done') continue
      try {
        const raw = await call(provider, 'place', { place_id: pinnedPlaceId }, `place:${pinnedPlaceId}`)
        const detail = tripadvisorPlace(raw)
        if (!detail || detail.placeId !== pinnedPlaceId)
          throw Object.assign(new Error('TripAdvisor photo identity mismatch'), { code: 'INVALID_RESPONSE' })
        if (!Array.isArray(raw.images))
          throw Object.assign(new Error('TripAdvisor gallery capability unavailable'), {
            code: 'PHOTO_CAPABILITY_MISSING'
          })
        photoPlace = raw
        photoProvider = provider
        components.photos = { status: 'complete', provider }
        outcomes.push({ provider, step: 'photos', status: 'complete' })
        break
      } catch (error) {
        await failed(provider, 'photos', error)
      }
    }
    const freshMedia = tripadvisorPhotos(photoPlace, reviews, {
      placeId: pinnedPlaceId,
      placeUrl: matched.url,
      provider: photoProvider
    })
    media = [
      ...freshMedia,
      ...media.filter((photo) => !freshMedia.some((item) => item.url === photo.url))
    ].slice(0, 10)
    if (!components.photos) components.photos = { status: 'failed' }
    components.photos.fetched = freshMedia.length
    pending = false
    if (
      components.reviews.status === 'complete' ||
      components.photos.status === 'complete' ||
      media.length ||
      reviews.length
    )
      return await publish()
    throw (
      lastProviderError ??
      Object.assign(new Error('TripAdvisor optional content unavailable'), { code: 'PROVIDER_ERROR' })
    )
  } catch (error) {
    if (controlError(error)) {
      if (error instanceof BudgetExceededError) error.source = TRIPADVISOR_SOURCE
      throw error
    }
    await fenced(pool, lease, (db) =>
      tried(
        db,
        snapshotId,
        TRIPADVISOR_SOURCE,
        row,
        {
          status: 'failed',
          reason: error?.code ?? 'PROVIDER_ERROR',
          coverage: { version: TRIPADVISOR_VERSION, outcomes, pinnedPlaceId, pipeline, pipelineJobId: job.id }
        },
        at()
      )
    )
  }
}

function controlError(error) {
  return (
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
  )
}
