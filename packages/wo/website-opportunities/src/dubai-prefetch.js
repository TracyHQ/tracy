/** Central, opt-in pre-run of the customer Research workflow. Status reads never admit collectors. */

import { websiteOpportunitiesDomain } from './domain-loader.js'
import { createDubaiGoogleSource } from './dubai-google-source.js'
import { decorateFindCandidates, rankFindCandidates } from './find-ranking.js'
import { joinPlace } from './place-jobs.js'
import { reviewSourcesRequired } from './tripadvisor-research.js'
import { addLink, resolvePlace } from './places.js'
import { normalizeUrl, sourceOfUrl } from './sources.js'

const LOCK = 7_243_061
const MONTH = 30 * 86400000
export const DUBAI_SELECTION =
  'Up to 50 Google Places restaurants within 10 km of Burj Khalifa, highest Find Opportunity score first. Known chains excluded; places without websites included. Scores are provisional while checks are pending; ties keep Google source order.'

export function selectDubaiSeeds(data, domain, fetchedAt) {
  if (!Array.isArray(data?.elements)) throw new Error('Invalid OSM source receipt')
  const seeds = new Map()
  for (const element of data.elements) {
    const t = element.tags ?? {},
      c = domain.candidateFromOsm(element)
    if (
      t.amenity !== 'restaurant' ||
      !c?.name ||
      !c.website ||
      t.disused === 'yes' ||
      t.abandoned === 'yes' ||
      t.access === 'private' ||
      Object.keys(t).some((k) => k.startsWith('disused:') || k.startsWith('abandoned:')) ||
      !/^(node|way|relation)\/\d+$/.test(c.providerId)
    )
      continue
    let website
    try {
      website = normalizeUrl(c.website)
      if (website.length > 2048) continue
      const u = new URL(website)
      if (
        !['https:', 'http:'].includes(u.protocol) ||
        u.username ||
        u.password ||
        sourceOfUrl(website) !== 'website'
      )
        continue
    } catch {
      continue
    }
    // Defensive validation of the bounded source query's coordinates.
    const lat = Number(element.lat ?? element.center?.lat),
      lon = Number(element.lon ?? element.center?.lon)
    const distanceM = Math.hypot(
      (lat - 25.1972) * 111320,
      (lon - 55.2744) * 111320 * Math.cos((25.1972 * Math.PI) / 180)
    )
    if (!Number.isFinite(distanceM) || distanceM > 10000) continue
    seeds.set(c.providerId, {
      externalId: c.providerId,
      name: c.name.slice(0, 200),
      website,
      phone: c.phone ?? null,
      address: c.address ?? null,
      lat,
      lon,
      fetchedAt,
      sourceUrl: `https://www.openstreetmap.org/${c.providerId}`
    })
  }
  return [...seeds.values()].sort((a, b) => a.externalId.localeCompare(b.externalId)).slice(0, 50)
}

export function selectDubaiGoogleSeeds(candidates, fetchedAt) {
  const seeds = new Map()
  for (const c of candidates) {
    if (
      c.provider !== 'google-places' ||
      !c.providerId ||
      !c.name ||
      c.kind !== 'restaurants' ||
      !Number.isFinite(c.distanceM) ||
      c.distanceM > 10000
    )
      continue
    let website = null
    try {
      if (c.website) {
        website = normalizeUrl(c.website)
        const u = new URL(website)
        if (
          website.length > 2048 ||
          !['https:', 'http:'].includes(u.protocol) ||
          u.username ||
          u.password ||
          sourceOfUrl(website) !== 'website'
        )
          continue
      }
    } catch {
      continue
    }
    if (!seeds.has(c.providerId))
      seeds.set(c.providerId, {
        externalId: c.providerId,
        name: c.name.slice(0, 200),
        website,
        phone: c.phone ?? null,
        address: c.address ?? null,
        lat: c.lat,
        lon: c.lon,
        candidate: c,
        opportunity: c.score ?? null,
        rank: seeds.size + 1,
        rankingCheckedAt: c.siteCheck?.checkedAt ?? null,
        selected: true,
        fetchedAt,
        sourceUrl: c.mapsUrl ?? null
      })
  }
  return [...seeds.values()].slice(0, 50)
}

export function createDubaiPrefetch({
  pool,
  role,
  enabled = true,
  now = Date.now,
  loadDomain = websiteOpportunitiesDomain,
  fetchImpl = fetch,
  resolve,
  runtime,
  ledger,
  siteChecks = null,
  socialStats = null,
  objects = null,
  discover = null
}) {
  const allowed = () => role === 'central' && enabled
  const sourceOf =
    discover ?? createDubaiGoogleSource({ pool, runtime, ledger, loadDomain, fetchImpl, resolve })
  async function rankedCandidates(candidates) {
    const domain = await loadDomain()
    const unique = domain.dedupeCandidates(candidates)
    const marked = typeof domain.markChains === 'function' ? domain.markChains(unique) : unique
    const { settings = {} } = runtime ? await runtime() : {}
    return rankFindCandidates(
      await decorateFindCandidates({
        domain,
        candidates: marked.filter((c) => c.chain !== true),
        settings,
        siteChecks,
        socialStats,
        now
      })
    )
  }
  async function storeSeeds(db, seeds, source) {
    // Historical jobs remain inspectable when a later score moves a place outside the selected 50.
    await db.query(
      "update wo_prefetch_seed set facts=jsonb_set(facts,'{selected}','false') where campaign_id='dubai'"
    )
    for (const facts of seeds) {
      const place = await resolvePlace(pool, {
        provider: source.id === 'openstreetmap-overpass' ? 'osm' : 'google-places',
        providerId: facts.externalId,
        name: facts.name
      })
      await db.query(
        `insert into wo_prefetch_seed(campaign_id,external_id,place_id,facts)
        values('dubai',$1,$2,$3) on conflict(campaign_id,external_id) do update set facts=excluded.facts`,
        [facts.externalId, place, facts]
      )
      if (facts.website)
        await addLink(
          db,
          place,
          'website',
          facts.website,
          source.id === 'openstreetmap-overpass' ? 'osm' : 'google',
          { sourceRevision: source.revision, sourceUrl: facts.sourceUrl, fetchedAt: source.fetchedAt }
        )
    }
  }
  async function locked(fn) {
    const db = await pool.connect()
    try {
      await db.query('begin')
      const got = (await db.query('select pg_try_advisory_xact_lock($1) as got', [LOCK])).rows[0].got
      if (!got) {
        await db.query('rollback')
        return { busy: true }
      }
      const result = await fn(db)
      await db.query('commit')
      return result
    } catch (error) {
      await db.query('rollback').catch(() => {})
      throw error
    } finally {
      db.release()
    }
  }
  async function create() {
    if (!allowed()) throw new Error('Central shared research is required')
    await pool.query(
      `insert into wo_prefetch_campaign(id,seed_source,selection_rule)
      values('dubai','{"id":"google-places-text","revision":null,"fetchedAt":null}'::jsonb,$1)
      on conflict do nothing`,
      [DUBAI_SELECTION]
    )
    return locked(async (db) => {
      const previous = (await db.query("select seed_source from wo_prefetch_campaign where id='dubai'"))
        .rows[0]?.seed_source
      if (
        (
          await db.query(
            "select 1 from wo_prefetch_campaign where id='dubai' and seed_source->>'revision' is not null and (seed_source->>'id'<>'google-places-text' or seed_source->>'rankingVersion'='find-v1')"
          )
        ).rowCount
      )
        return { existing: true }
      let source,
        seeds,
        candidates = []
      try {
        const result = await sourceOf({ receivedOnly: Boolean(previous?.revision) })
        source =
          result.source.id === 'google-places-text'
            ? { ...result.source, rankingVersion: 'find-v1' }
            : result.source
        if (!result.seeds) {
          candidates = result.candidates
          source = { ...source, rankingVersion: 'find-v1' }
        }
        seeds = result.seeds ?? selectDubaiGoogleSeeds(await rankedCandidates(candidates), source.fetchedAt)
        if (!seeds.length) throw new Error('No eligible Dubai restaurants in the source response')
      } catch (error) {
        const message = `Google Places source unavailable (${String(error?.code ?? error?.message ?? 'error').slice(0, 160)}). No verified seeds imported.`
        if (previous?.revision) {
          await db.query("update wo_prefetch_campaign set enabled=false,last_error=$1 where id='dubai'", [
            message
          ])
          return { sourceUnavailable: true, preserved: true }
        }
        await db.query(
          `insert into wo_prefetch_campaign(id,seed_source,selection_rule,last_error)
          values('dubai',$1,$2,$3) on conflict(id) do update set seed_source=excluded.seed_source,
          last_error=excluded.last_error,enabled=false`,
          [
            {
              id: 'google-places-text',
              url: 'https://places.googleapis.com/v1/places:searchText',
              fetchedAt: null,
              revision: null,
              attemptedAt: new Date(now()).toISOString(),
              attribution: 'Google Maps'
            },
            DUBAI_SELECTION,
            message
          ]
        )
        return { seeded: 0, sourceUnavailable: true }
      }
      await db.query(
        `insert into wo_prefetch_campaign(id,seed_source,selection_rule,selection_candidates) values('dubai',$1,$2,$3)
         on conflict(id) do update set seed_source=excluded.seed_source,last_error=null,
         selection_rule=excluded.selection_rule,selection_candidates=excluded.selection_candidates,
         research_mode=case when excluded.seed_source->>'id'='google-places-text' then 'full' else 'website' end,
         paid_enabled=(excluded.seed_source->>'id'='google-places-text')`,
        [source, DUBAI_SELECTION, JSON.stringify(candidates)]
      )
      await storeSeeds(db, seeds, source)
      return { seeded: seeds.length }
    })
  }
  async function setEnabled(value) {
    if (!allowed() || typeof value !== 'boolean') throw new Error('Central shared research is required')
    if (value) {
      const imported = await create()
      if (imported.busy || imported.sourceUnavailable)
        return {
          updated: false,
          reason: imported.preserved ? 'find_selection_required' : 'verified_source_required'
        }
    }
    return locked(async (db) => {
      if (
        value &&
        (
          await db.query(
            "select 1 from wo_prefetch_campaign where id='dubai' and seed_source->>'id'='google-places-text' and seed_source->>'rankingVersion' is distinct from 'find-v1'"
          )
        ).rowCount
      )
        return { updated: false, reason: 'find_selection_required' }
      const result = await db.query(
        "update wo_prefetch_campaign set enabled=$1,next_tick_at=now() where id='dubai' and (not $1 or (seed_source->>'revision' is not null and exists(select 1 from wo_prefetch_seed where campaign_id='dubai'))) returning id",
        [value]
      )
      if (value && result.rowCount)
        await db.query(`update wo_place_job set state='queued',last_error=null,updated_at=now(),
          started_by='campaign',started_by_account_id=null
        where prefetch_campaign_id='dubai' and state='paused' and attempt<3
          and last_error->>'code'='PREFETCH_STOPPED'
        and not exists(select 1 from wo_place_job q where q.place_id=wo_place_job.place_id and q.state='queued')`)
      return {
        updated: result.rowCount === 1,
        ...(value && !result.rowCount ? { reason: 'verified_source_required' } : {})
      }
    })
  }
  async function capacity() {
    return (
      (await pool.query("select max_concurrency from wo_prefetch_campaign where id='dubai'")).rows[0]
        ?.max_concurrency ?? 1
    )
  }
  async function setConcurrency(value) {
    if (!allowed()) throw new Error('Central shared research is required')
    if (!Number.isInteger(value) || value < 1 || value > 3)
      throw new RangeError('Invalid prefetch concurrency')
    return locked(async (db) => {
      const result = await db.query(
        "update wo_prefetch_campaign set max_concurrency=$1,next_tick_at=now() where id='dubai' returning id",
        [value]
      )
      return result.rowCount ? { updated: true } : { reason: 'verified_source_required' }
    })
  }
  async function tick() {
    if (!allowed()) return { ran: false, reason: 'central_only' }
    return locked(async (db) => {
      const c = (
        await db.query(
          "select * from wo_prefetch_campaign where id='dubai' and enabled and next_tick_at <= now() for update"
        )
      ).rows[0]
      if (!c) return { ran: false }
      if (c.seed_source.id === 'google-places-text' && c.seed_source.rankingVersion !== 'find-v1') {
        await db.query(
          "update wo_prefetch_campaign set enabled=false,last_error='Find selection upgrade required; Start replays received discovery receipts only' where id='dubai'"
        )
        return { ran: false, reason: 'find_selection_required' }
      }
      const expired =
        !Number.isFinite(Date.parse(c.seed_source.fetchedAt)) ||
        now() - Date.parse(c.seed_source.fetchedAt) >= MONTH
      await db.query(
        "update wo_prefetch_campaign set last_tick_at=now(),next_tick_at=now()+interval '15 seconds',tick_count=tick_count+1,last_error=$1,enabled=not $2 where id='dubai'",
        [expired ? 'Seed receipt expired; import a new reviewed source before resuming' : null, expired]
      )
      if (expired) return { ran: false, reason: 'seed_expired' }
      if (c.selection_candidates.length) {
        const ranked = await rankedCandidates(c.selection_candidates)
        await storeSeeds(db, selectDubaiGoogleSeeds(ranked, c.seed_source.fetchedAt), c.seed_source)
        const { settings = {} } = runtime ? await runtime() : {}
        const urls = [
          ...new Set(
            ranked
              .filter(
                (r) => r.website && (!r.siteCheck || ['queued', 'not_queued'].includes(r.siteCheck.status))
              )
              .map((r) => r.website)
          )
        ].slice(0, 60)
        if (urls.length && siteChecks)
          await siteChecks.request(urls, { limit: settings.siteChecksAutoLimit ?? 20 })
        const handles = [],
          seen = new Set()
        for (const row of ranked)
          for (const network of ['facebook', 'instagram', 'tiktok', 'youtube']) {
            const url = row.socials?.[network]
            if (!url || seen.has(url)) continue
            seen.add(url)
            // Find keeps admission responses in its flow; persist them here rather than spending another auto batch each tick.
            const stat = row.social?.[network] ?? c.selection_observations[url]
            if (
              (stat?.status !== undefined && stat.status !== 'queued') ||
              Date.parse(stat?.deferredUntil) > now()
            )
              continue
            handles.push({ network, url })
          }
        if (handles.length && socialStats) {
          const observations = await socialStats.request(handles.slice(0, 40), {
            limit: settings.socialStatsAutoLimit ?? 10
          })
          await db.query(
            "update wo_prefetch_campaign set selection_observations=selection_observations || $1::jsonb where id='dubai'",
            [JSON.stringify(observations)]
          )
        }
      }
      await db.query(`update wo_place_job set state='failed',lease_token=lease_token+1,
        lease_owner=null,lease_until=null,last_error='{"code":"PREFETCH_RETRY_LIMIT"}'::jsonb
        where work_priority=1 and attempt>=3
          and (state='queued' or (state='running' and lease_until<now()))`)
      // Bound the backlog and count promoted campaign jobs until they finish.
      if (
        (
          await db.query(
            "select count(*)::int as active from wo_place_job where prefetch_campaign_id is not null and state in ('queued','running')"
          )
        ).rows[0].active >= c.max_concurrency
      )
        return { ran: true, waiting: true }
      const seed = (
        await db.query(`select s.* from wo_prefetch_seed s left join wo_place_job j on j.id=s.job_id
        where s.campaign_id='dubai' and s.next_refresh_at<=now() and s.facts->>'selected' is distinct from 'false'
          and (s.job_id is null or j.state='completed') order by (s.facts->>'rank')::int nulls last,s.external_id limit 1 for update of s`)
      ).rows[0]
      if (!seed) return { ran: true, idle: true }
      const requiredSources =
        c.research_mode === 'full' && runtime ? reviewSourcesRequired(await runtime()) : {}
      const joined = await joinPlace(db, seed.place_id, {
        prefetchCampaignId: 'dubai',
        now: now(),
        requiredSources
      })
      await db.query(
        "update wo_prefetch_seed set job_id=$2,next_refresh_at=now()+interval '30 days' where campaign_id='dubai' and external_id=$1",
        [seed.external_id, joined.job?.id ?? null]
      )
      return { ran: true, jobId: joined.job?.id ?? null, alreadyFresh: joined.fresh === true }
    })
  }
  async function status() {
    const campaign = (await pool.query("select * from wo_prefetch_campaign where id='dubai'")).rows[0] ?? null
    const seeds = campaign
      ? (
          await pool.query(`select s.external_id,s.place_id,s.facts,s.job_id,s.next_refresh_at,
      j.state,j.stage,j.last_error,j.attempt,j.prefetch_campaign_id,
      snap.id as snapshot_id,snap.enrichment_scope,snap.published_at,
      p.profile,
      coalesce((select jsonb_agg(jsonb_build_object('source',src.source,'status',src.status,'reason',src.reason,
        'fetchedAt',src.collected_at,'coverage',src.coverage,'lastError',src.last_error)) from wo_place_snapshot_source src where src.snapshot_id=snap.id),'[]') as sources,
      coalesce((select jsonb_agg(jsonb_build_object('network',l.kind,'url',l.url,'verifiedBy',l.verified_by,'observedAt',l.created_at))
        from wo_place_link l where l.place_id=s.place_id and l.kind in ('facebook','instagram','tiktok','youtube') and l.verified_by='website'),'[]') as socials
      ,(select count(*)::int from wo_place_snapshot_media sm join wo_place_media m on m.id=sm.media_id
        where sm.snapshot_id=snap.id and m.status='stored' and m.revoked_at is null) as media_count
      ,coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'caption',m.caption,'credit',m.credit))
        from wo_place_snapshot_media sm join wo_place_media m on m.id=sm.media_id
        where sm.snapshot_id=place.current_snapshot_id and m.kind='image' and m.status='stored'
          and m.revoked_at is null),'[]') as images
      from wo_prefetch_seed s left join wo_place_job j on j.id=s.job_id
      join wo_place place on place.id=s.place_id
      left join wo_place_snapshot snap on snap.id=coalesce(place.current_snapshot_id,j.snapshot_id)
      left join wo_place_snapshot_profile p on p.snapshot_id=snap.id
      where s.campaign_id='dubai' and (s.facts->>'selected' is distinct from 'false' or s.job_id is not null)
      order by (s.facts->>'selected' is distinct from 'false') desc,(s.facts->>'rank')::int nulls last,s.external_id`)
        ).rows
      : []
    const cost = (
      await pool.query(`select count(*)::int as calls,
      coalesce(sum(case when state='released' then 0 when state='settled' then coalesce(actual_cents,reserved_cents)
        else greatest(reserved_cents,coalesce(actual_cents,0)) end),0)::int as committed,
      coalesce(sum(actual_cents) filter(where state='settled'),0)::int as settled
      from wo_cost_ledger where prefetch_campaign_id='dubai'`)
    ).rows[0]
    return {
      available: allowed(),
      campaign,
      seeds,
      controls: {
        maxPlaces: 50,
        maxPrefetchConcurrency: campaign?.max_concurrency ?? 1,
        reservedUserSlots: 1,
        websitePages: campaign?.research_mode === 'full' ? 40 : 2,
        ...(campaign?.research_mode === 'full'
          ? {}
          : { maxHttpRequestsPerLease: 12, leaseDeadlineSeconds: 45 }),
        maxLeaseClaims: 3,
        sourceMaxAgeDays: 30,
        tickSeconds: 15,
        paidSocialEnabled: campaign?.paid_enabled ?? false,
        providerStarts: cost.calls,
        providerCostCents: cost.committed,
        settledCostCents: cost.settled,
        campaignBudgetCents: campaign?.budget_cents ?? 10000
      },
      socialStatus: 'find_stats_use_shared_queue_rich_social_uses_research',
      sharedPlaceDistribution: 'unavailable_local_place_cache_only'
    }
  }
  async function media(placeId, mediaId) {
    if (![placeId, mediaId].every((v) => /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v))) return null
    const row = (
      await pool.query(
        `select m.object_key,m.mime from wo_prefetch_seed s
      join wo_place p on p.id=s.place_id
      join wo_place_snapshot_media sm on sm.snapshot_id=p.current_snapshot_id
      join wo_place_media m on m.id=sm.media_id
      where s.campaign_id='dubai' and s.place_id=$1 and m.id=$2
        and m.kind='image' and m.status='stored' and m.revoked_at is null
        and m.mime in ('image/png','image/jpeg','image/webp','image/gif','image/avif')`,
        [placeId, mediaId]
      )
    ).rows[0]
    if (!row?.object_key || !objects) return null
    const result = await objects.get(row.object_key)
    if (!result?.ok || !result.body) return null
    return new Response(result.body, {
      headers: {
        'content-type': row.mime ?? 'application/octet-stream',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff'
      }
    })
  }
  return { create, setEnabled, setConcurrency, capacity, tick, status, media }
}
