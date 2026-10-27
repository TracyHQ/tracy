/** Read-only Find projection of published public research and this account's own workflow. */
import { untrackedSocials } from '../domain/social-links.mjs'
import { candidateAsRead } from '../domain/candidate-as-read.mjs'
import { identityOf } from './places.js'

const text = (value) => (typeof value === 'string' && value.trim() ? value : null)
const newer = (a, b) => Date.parse(a ?? '') > Date.parse(b ?? '')

/** A published profile with observed source evidence can enter the existing brief validator. */
export function usableResearch(row) {
  return Boolean(
    row?.snapshot_id &&
      row.scope === 'full' &&
      text(row.profile?.name) &&
      row.sources?.some((s) => s.status === 'complete' && s.collected_at)
  )
}

/** Checks describe the same website. Keep fields a partial newer observation did not measure. */
export function mergeFindCheck(held, cached) {
  if (!held) return cached ?? null
  if (!cached) return held
  return newer(cached.checkedAt, held.checkedAt) ? { ...held, ...cached } : { ...cached, ...held }
}

/** Only a server-matched rating for this exact branch may appear alongside Google's. */
export function tripadvisorReviewOf(sources) {
  const source = sources?.find((s) => s.source === 'tripadvisor' && s.status === 'complete' && s.collected_at)
  const review = source?.review
  if (
    typeof review?.placeId !== 'string' ||
    !/^\d{1,30}$/.test(review.placeId) ||
    review.match?.status !== 'matched' ||
    review.match.placeId !== review.placeId ||
    review.scope === 'brand' ||
    review.match.scope === 'brand' ||
    review.branchVerified === false ||
    review.match.branchVerified === false
  )
    return null
  let url
  try {
    url = new URL(source.ref)
    if (
      url.protocol !== 'https:' ||
      !['tripadvisor.com', 'www.tripadvisor.com'].includes(url.hostname) ||
      url.username ||
      url.password
    )
      return null
  } catch {
    return null
  }
  if (!new RegExp(`(?:^|[-/])d?${review.placeId}(?:[-/.]|$)`).test(url.pathname)) return null
  const rating =
    Number.isFinite(review.rating) && review.rating >= 0 && review.rating <= 5 ? review.rating : null
  const reviews = Number.isInteger(review.reviewCount) && review.reviewCount >= 0 ? review.reviewCount : null
  if (rating === null && reviews === null) return null
  return { rating, reviews, url: url.href, checkedAt: source.collected_at }
}

/**
 * One bulk lookup, no collector admission, account overlays or opportunity creation. A row's
 * `site_key` (live demo) and `action_id` (queued demo action) come from the builder's `demoFactsOf`;
 * without one they are null.
 * @param {((accountId: string, ids: string[]) => Promise<Map<string, {liveSiteKey: string | null,
 *   queuedActionId: string | null}>>) | null} [demoFactsOf]
 */
export async function findResearchOf(pool, candidates, accountId, demoFactsOf = null) {
  const identities = candidates.map((c) => identityOf(c.provider, c.providerId))
  const namespaces = identities.map((i) => i?.namespace ?? '')
  const externalIds = identities.map((i) => i?.externalId ?? '')
  if (!candidates.length) return []
  const { rows } = await pool.query(
    `
    with recursive wanted as (
      select namespace, external_id, ord from unnest($1::text[], $2::text[]) with ordinality w(namespace,external_id,ord)
    ), resolved as (
      select w.ord, p.id, p.merged_into, 0 as hop from wanted w
      join wo_place_identity i using(namespace,external_id) join wo_place p on p.id=i.place_id
      union all select r.ord,p.id,p.merged_into,r.hop+1 from resolved r join wo_place p on p.id=r.merged_into where r.hop<5
    )
    select w.ord, p.id as place_id, s.id as snapshot_id, s.published_at, coalesce(to_jsonb(s)->>'enrichment_scope','full') as scope,
      sp.profile, coalesce(src.sources,'[]'::jsonb) as sources,
      own.id as opportunity_id, op.profile as own_profile,
      own_research.completed_at
    from wanted w left join resolved r on r.ord=w.ord and r.merged_into is null
    left join wo_place p on p.id=r.id
    left join wo_place_snapshot s on s.id=p.current_snapshot_id and s.state='published' and coalesce(to_jsonb(s)->>'enrichment_scope','full')='full'
    left join wo_place_snapshot_profile sp on sp.snapshot_id=s.id
    left join lateral (select jsonb_agg(jsonb_build_object('source',source,'ref',ref,'status',status,
      'collected_at',collected_at,'review',case when source='tripadvisor' then jsonb_build_object(
        'placeId',collected->'placeId','rating',collected->'rating','reviewCount',collected->'reviewCount',
        'scope',collected->'scope','branchVerified',collected->'branchVerified','match',collected->'match') else null end)) as sources from wo_place_snapshot_source where snapshot_id=s.id) src on true
    left join lateral (select o.* from wo_opportunity o where o.account_id=$3 and
      (o.place_id=p.id or (o.provider=($4::text[])[(w.ord)::int] and o.provider_id=($5::text[])[(w.ord)::int]))
      order by o.created_at desc limit 1) own on true
    left join wo_profile op on op.opportunity_id=own.id
    left join lateral (select max(updated_at) as completed_at from wo_job where opportunity_id=own.id and state='completed' and kind='research') own_research on true
    order by w.ord`,
    [
      namespaces,
      externalIds,
      accountId,
      candidates.map((c) => c.provider),
      candidates.map((c) => c.providerId)
    ]
  )
  const owned = [...new Set(rows.map((r) => r.opportunity_id).filter(Boolean))]
  const facts = demoFactsOf && accountId && owned.length ? await demoFactsOf(accountId, owned) : new Map()
  return rows.map((r) => {
    const f = facts.get(r.opportunity_id)
    return { ...r, site_key: f?.liveSiteKey ?? null, action_id: f?.queuedActionId ?? null }
  })
}

/** Public source fields only; Find-specific location/distance and Google identity stay intact. */
export function withResearch(candidate, row) {
  if (!row) return { ...candidate, research: null, findAction: { kind: 'research' } }
  const published = Boolean(row.snapshot_id && row.profile)
  const own = Boolean(row.completed_at && row.own_profile)
  const profile = published ? row.profile : own ? row.own_profile : {}
  const website = text(candidate.website) ?? text(profile.website)
  const pageSpeed = profile.pageSpeed
  const heldCheck =
    website && website === profile.website && pageSpeed?.checkedAt ? { ...pageSpeed, status: 'done' } : null
  const siteCheck =
    heldCheck && (!candidate.siteCheck || newer(heldCheck.checkedAt, candidate.siteCheck.checkedAt))
      ? heldCheck
      : candidate.siteCheck
  const google = profile.googlePlace ?? {}
  const researchedAt = published ? row.published_at : own ? row.completed_at : null
  const canBuild = usableResearch(row) || own
  const kind = row.site_key ? 'view' : row.action_id ? 'building' : canBuild ? 'build' : 'research'
  // Contact details are lifted only from the published profile or this account's own research. A listing or social page
  // held as the website (an old candidate or snapshot) is read as one, with no site check (`candidate-as-read.mjs`).
  return candidateAsRead({
    ...candidate,
    website,
    phone: text(candidate.phone) ?? text(profile.phone),
    address: text(candidate.address) ?? text(profile.address),
    email: text(candidate.email) ?? text(profile.email),
    // Without share tracking, whenever the profile or the candidate was saved (`social-links.mjs`).
    socials: untrackedSocials({ ...profile.socials, ...candidate.socials }),
    rating: candidate.rating ?? google.rating ?? null,
    reviews: candidate.reviews ?? google.reviews ?? google.userRatingCount ?? null,
    siteCheck,
    tripadvisor: published ? tripadvisorReviewOf(row.sources) : null,
    ...(researchedAt && candidate.status !== 'demo' ? { status: 'researched' } : {}),
    research: researchedAt ? { researchedAt, canBuild } : null,
    findAction: {
      kind,
      ...(row.opportunity_id ? { opportunityId: row.opportunity_id } : {}),
      ...(row.site_key ? { siteKey: row.site_key } : {})
    }
  })
}
