/** Read-only pre-enrichment contract. No cron, collector admission, budget reservation or provider IO. */
import { createHash } from 'node:crypto'
import { statKeyOf, socialRefreshNeeded } from './social-stats.js'
import { platformKey } from './social-alias.js'

const WEEK = 7 * 86400000
const MONTH = 30 * 86400000
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const text = (value) => typeof value === 'string' && value.length > 0 && value.length <= 500
const date = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value))
export const SOCIAL_PREFETCH_CONTRACT = 'wo-social-prefetch/v1'
export const SOCIAL_PREFETCH_LIMITS = Object.freeze({ cities: 10, placesPerCity: 50, places: 500 })

export function validateSocialSeedManifest(manifest, now = Date.now()) {
  const s = manifest?.source
  let sourceUrl
  try {
    sourceUrl = new URL(s?.url)
  } catch {}
  if (
    manifest?.version !== 1 ||
    !text(s?.id) ||
    !text(s?.revision) ||
    !date(s?.fetchedAt) ||
    Date.parse(s.fetchedAt) > now ||
    !sourceUrl ||
    sourceUrl.protocol !== 'https:' ||
    sourceUrl.username ||
    sourceUrl.password ||
    sourceUrl.search ||
    sourceUrl.hash ||
    !text(manifest?.selection?.rule) ||
    !Array.isArray(manifest.cities) ||
    manifest.cities.length < 1 ||
    manifest.cities.length > 10
  )
    throw new Error('Invalid social seed manifest')
  const cities = new Set()
  for (const city of manifest.cities) {
    if (
      !text(city?.id) ||
      cities.has(city.id) ||
      !Array.isArray(city.places) ||
      city.places.length > 50 ||
      city.places.some((p) => !['google', 'osm'].includes(p?.namespace) || !text(p.externalId))
    )
      throw new Error('Invalid social city seed')
    cities.add(city.id)
  }
}

/** The verifier is a server-owned, read-only seed authority adapter; never a manifest-provided assertion. */
export function createSocialPreEnrichmentPlanner({ pool, domain, role, verifySeed = null, now = Date.now }) {
  const domainOf = typeof domain === 'function' ? domain : async () => domain
  async function plan(manifest) {
    if (role !== 'central') throw new Error('Pre-enrichment planning requires the central social role')
    const at = now()
    validateSocialSeedManifest(manifest, at)
    const dom = await domainOf(),
      seenPlaces = new Set(),
      seenLocalPlaces = new Map(),
      identities = new Map(),
      results = []
    const metrics = {
      seededPlaces: 0,
      verifiedPlaces: 0,
      placesWithKnownSocial: 0,
      localPublishedPlaceProfiles: 0,
      sharedPlaceProfiles: 0,
      freshSocialIdentities: 0,
      staleSocialIdentities: 0,
      inFlightSocialIdentities: 0,
      dueIntents: 0,
      blockedByReason: {},
      providerStarts: 0,
      reservedCostCents: 0,
      observedCostCents: 0,
      estimatedCostCents: null
    }
    const block = (row, reason) => {
      row.blockers.push(reason)
      metrics.blockedByReason[reason] = (metrics.blockedByReason[reason] ?? 0) + 1
    }
    for (const city of manifest.cities)
      for (const seed of city.places) {
        metrics.seededPlaces++
        const placeKey = JSON.stringify([seed.namespace, seed.externalId])
        const result = {
          cityId: city.id,
          placeIdentity: { ...seed },
          placeKey,
          blockers: [],
          socialIdentities: []
        }
        results.push(result)
        if (seenPlaces.has(placeKey)) {
          block(result, 'duplicate_place_identity')
          continue
        }
        seenPlaces.add(placeKey)
        let proof
        try {
          proof = verifySeed
            ? await verifySeed({
                source: manifest.source,
                selection: manifest.selection,
                cityId: city.id,
                placeIdentity: { ...seed }
              })
            : null
        } catch {}
        if (
          !proof ||
          proof.eligible !== true ||
          proof.sourceId !== manifest.source.id ||
          proof.sourceRevision !== manifest.source.revision ||
          proof.selectionRule !== manifest.selection.rule ||
          proof.cityId !== city.id ||
          proof.namespace !== seed.namespace ||
          proof.externalId !== seed.externalId ||
          !text(proof.proofId) ||
          !date(proof.verifiedAt) ||
          Date.parse(proof.verifiedAt) > at ||
          !date(proof.expiresAt) ||
          Date.parse(proof.expiresAt) <= at
        ) {
          block(result, 'authoritative_seed_not_verified')
          continue
        }
        const place = (
          await pool.query(
            `select p.id,p.current_snapshot_id from wo_place_identity i join wo_place p on p.id=i.place_id
        where i.namespace=$1 and i.external_id=$2 and i.confidence=1 and p.merged_into is null
          and i.source in ('google-places','google-maps','osm')`,
            [seed.namespace, seed.externalId]
          )
        ).rows[0]
        if (!place) {
          block(result, 'verified_local_place_missing')
          continue
        }
        if (seenLocalPlaces.has(place.id)) {
          result.duplicateOfPlaceKey = seenLocalPlaces.get(place.id)
          block(result, 'duplicate_verified_place')
          continue
        }
        seenLocalPlaces.set(place.id, placeKey)
        metrics.verifiedPlaces++
        if (place.current_snapshot_id) metrics.localPublishedPlaceProfiles++
        const links = (
          await pool.query(
            `select kind,url,verified_by,created_at from wo_place_link where place_id=$1
        and kind in ('facebook','instagram','tiktok','youtube') order by kind,url`,
            [place.id]
          )
        ).rows
        if (!links.length) block(result, 'verified_social_source_missing')
        for (const link of links) {
          if (at - new Date(link.created_at).getTime() >= MONTH) {
            block(result, 'place_source_revalidation_required')
            continue
          }
          const aliasKey = statKeyOf({ network: link.kind, url: link.url }, dom.parseSocialUrl)
          if (!aliasKey) {
            block(result, 'invalid_verified_social_url')
            continue
          }
          const r = (
            await pool.query(
              `select a.owner_key,a.revision as binding_revision,a.observed_at,a.verified_at,a.invalidated_at,
          s.*,v.version,v.fetched_at as snapshot_fetched_at from wo_social_alias a join wo_social_stat s on s.stat_key=a.owner_key
          left join lateral(select version,fetched_at from wo_social_snapshot where identity_key=s.stat_key order by version desc limit 1)v on true
          where a.alias_key=$1 and a.platform_id=s.platform_id`,
              [aliasKey]
            )
          ).rows[0]
          if (
            !r ||
            r.invalidated_at ||
            at - new Date(r.observed_at).getTime() >= WEEK ||
            platformKey(link.kind, r.platform_id) !== r.owner_key
          ) {
            block(result, 'social_identity_revalidation_required')
            continue
          }
          const edge = (
            await pool.query(
              `select e.* from wo_place_social_link e join wo_social_authority a on a.authority_id=e.authority_id
          where e.place_id=$1 and e.kind=$2 and e.url=$3`,
              [place.id, link.kind, link.url]
            )
          ).rows[0]
          if (
            !edge ||
            edge.revoked_at ||
            edge.identity_key !== r.owner_key ||
            edge.alias_key !== aliasKey ||
            String(edge.binding_revision) !== String(r.binding_revision) ||
            at - new Date(edge.verified_at).getTime() >= MONTH
          ) {
            block(result, 'verified_place_social_binding_required')
            continue
          }
          if (!r.version) {
            block(result, 'versioned_social_snapshot_missing')
            continue
          }
          const fetchedAt = new Date(r.snapshot_fetched_at).toISOString()
          const stale = at - new Date(fetchedAt).getTime() >= WEEK
          const uncertain = ['starting', 'start_uncertain'].includes(r.apify_attempt?.phase)
          const active =
            r.status === 'queued' ||
            ['planned', 'reserved', 'running', 'publishing'].includes(r.apify_attempt?.phase)
          const disposition = uncertain
            ? 'unknown_receipt'
            : active
              ? 'in_flight'
              : !stale
                ? 'fresh'
                : socialRefreshNeeded(r, at)
                  ? 'due'
                  : 'cooldown'
          const provenance = {
            cityId: city.id,
            placeKey,
            seedSource: { ...manifest.source },
            seedProof: Object.fromEntries(
              [
                'proofId',
                'selectionRule',
                'sourceId',
                'sourceRevision',
                'cityId',
                'namespace',
                'externalId',
                'eligible',
                'verifiedAt',
                'expiresAt'
              ].map((key) => [key, proof[key]])
            ),
            placeSource: {
              url: link.url,
              verifiedBy: link.verified_by,
              observedAt: new Date(link.created_at).toISOString()
            },
            placeSocialBinding: {
              authorityId: edge.authority_id,
              origin: edge.origin,
              identityKey: edge.identity_key,
              bindingRevision: String(edge.binding_revision),
              verifiedAt: new Date(edge.verified_at).toISOString()
            },
            aliasKey,
            bindingRevision: String(r.binding_revision),
            aliasObservedAt: new Date(r.observed_at).toISOString()
          }
          result.socialIdentities.push(r.owner_key)
          const previous = identities.get(r.owner_key)
          if (previous) {
            previous.provenance.push(provenance)
            // A planner never bridges concurrent generations into one proposed admission.
            if (previous.version !== String(r.version) || previous.disposition !== disposition) {
              previous.disposition = 'changed_during_plan'
              previous.blockers = ['observation_changed_during_plan']
            }
            continue
          }
          identities.set(r.owner_key, {
            identityKey: r.owner_key,
            network: link.kind,
            version: String(r.version),
            fetchedAt,
            stale,
            disposition,
            provenance: [provenance],
            priority: 'prefetch',
            enqueueAllowed: false,
            idempotencyKey: hash([
              SOCIAL_PREFETCH_CONTRACT,
              r.owner_key,
              String(r.version),
              fetchedAt,
              r.next_retry_at ?? null
            ]),
            blockers:
              disposition === 'unknown_receipt'
                ? ['existing_attempt_requires_reconciliation']
                : ['scheduler_not_activated']
          })
        }
        result.socialIdentities = [...new Set(result.socialIdentities)]
        if (result.socialIdentities.length) metrics.placesWithKnownSocial++
      }
    const intents = [...identities.values()].sort((a, b) => a.identityKey.localeCompare(b.identityKey))
    for (const intent of intents) {
      if (intent.disposition === 'fresh') metrics.freshSocialIdentities++
      if (intent.stale) metrics.staleSocialIdentities++
      if (intent.disposition === 'in_flight') metrics.inFlightSocialIdentities++
      if (intent.disposition === 'due') metrics.dueIntents++
    }
    return {
      contract: SOCIAL_PREFETCH_CONTRACT,
      planId: hash(manifest),
      plannedAt: new Date(at).toISOString(),
      dryRun: true,
      executable: false,
      targets: { cities: 10, placesPerCity: 50, places: 500 },
      actualCities: manifest.cities.length,
      controls: {
        killSwitch: true,
        maxPrefetchConcurrency: 0,
        maxPrefetchBudgetCents: 0,
        prefetchClaimsCapacity: false,
        priorityContract: 'user_before_prefetch'
      },
      blockers: [
        'scheduler_not_activated',
        'shared_place_distribution_unavailable',
        'central_budget_not_allocated'
      ],
      source: { ...manifest.source },
      selection: { ...manifest.selection },
      places: results,
      intents,
      metrics
    }
  }
  // Future central cron adapters must consume the contract through existing admission/receipt fencing.
  // There is deliberately no path from this seam to the provider queue, including when killed.
  async function tick() {
    return {
      ran: false,
      reason: role === 'central' ? 'scheduler_not_activated' : 'central_only',
      providerStarts: 0
    }
  }
  return { plan, tick }
}
