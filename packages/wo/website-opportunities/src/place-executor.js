/**
 * The research run of a PLACE (`place-jobs.js`): the per-account executor's stages, written into the run's
 * snapshot instead of the opportunity's rows. Built by `createExecutor`, which hands over the collection
 * and media steps both paths share.
 *
 * 🔒 THE RUN READS NOTHING A CLIENT SENT. It starts from the place's identity and its links
 * (`wo_place_link`): Google Place Details (`websiteUri`) and the social pages the place's own website links
 * to. A candidate's website or socials are never read here (`places.js privateRefs`).
 * 🔒 A SOURCE IS COLLECTED AGAIN ONLY WHEN DUE (`sourceDue`, or `force`), and a try that fails keeps the
 * data and `collected_at` of the last success: freshness is per source, and a failing refresh never wipes
 * what the place already has. Place media rows are never changed; a snapshot only stops listing one.
 * 🔒 EVERY PAID CALL IS RESERVED FIRST (`cost-ledger.js`, Tracy pays research): Place Details, each Place
 * photo, PageSpeed and each Apify run of a place go through `h.chargeable`. Over a cap the run pauses with
 * `budget` and keeps what it collected; a resume tries again.
 */
import {
  controlError,
  researchGoogleMaps,
  GOOGLE_MAPS_SOURCE,
  GOOGLE_MAPS_VERSION
} from './google-maps-research.js'
import { researchTripadvisor, tripadvisorProviders } from './tripadvisor-research.js'
import { TRIPADVISOR_SOURCE, TRIPADVISOR_VERSION } from './tripadvisor.js'
import { BudgetExceededError } from './cost-ledger.js'
import { createPlacePaidReceipts } from './place-paid-receipts.js'
import { apifyCeilingCents, ceilingCents } from './cost-prices.js'
import { menuRendererOrder, providerOrderFor, resolveProviderOrder } from './wo-settings.js'
import { checkPageSpeed } from './pagespeed.js'
import { finishPlaceJob, placeLease } from './place-jobs.js'
import {
  GOOGLE_FACTS_SOURCE,
  SOURCE_MAX_AGE_MS,
  addLink,
  linksOf,
  snapshotMediaOf,
  snapshotProfileOf,
  snapshotSourcesOf,
  sourceDue,
  sourceRowsOf
} from './places.js'
import { SOCIAL_SOURCES, SOURCES, normalizeUrl, refsOfUrls } from './sources.js'
import {
  MENU_FILE_PART,
  MENU_FILE_VERSION,
  menuApplicable,
  menuFieldsOf,
  menuItemsForProfile
} from './menu-items.js'
import {
  MENU_PHOTOS_PART,
  MENU_PHOTOS_PER_PLACE,
  countryOf,
  menuPhotoCandidates,
  menuPhotoImage,
  readMenuPhotos
} from './menu-photo-reading.js'
import { mediaJunk } from './media-junk.js'
import {
  logoCandidateImage,
  logoHintsOf,
  logoPaletteOfStored,
  researchLogo,
  sameLogoFindings
} from './place-logo.js'
import { SEARCH_NETWORKS, SOCIAL_SEARCH_VERSION } from './research-again.js'
import { sourceVersionOf } from './collector-versions.js'
import { dropMisjudged } from './link-rejudge.js'
import { BUSINESS_READING_DOOR, BUSINESS_READING_PURPOSE, readBusiness } from './business-reading.js'
import { tradeOfPlace } from '../domain/trades.mjs'
import { StaleLeaseError, checkpoint, fenced, heartbeat } from './store.js'
import { HUB_COLLECTOR_VERSION } from './hub/local-cache.js'

/**
 * Who a place run's charges count against on /ops › Usage (migration 167): whoever created or started the run again
 * (`joinPlace`'s `starter`); a campaign run with no stamp is its campaign's; a run from before the stamp is unknown (null).
 * @returns {import('./cost-ledger.js').Payer | null}
 */
export function payerOfPlaceJob(job) {
  if (job?.started_by === 'account' || job?.started_by === 'operator')
    return { kind: job.started_by, accountId: job.started_by_account_id ?? null }
  if (job?.started_by) return { kind: job.started_by }
  return job?.prefetch_campaign_id ? { kind: 'campaign' } : null
}

/** The stages a logo-only run goes through: the media step downloads the candidates, the brand step reads them. */
const LOGO_ONLY_STAGES = Object.freeze(['media', 'brand', 'done'])

/** A one-source run (`only_source`, a research card row's Retry) collects that source alone, due or not. */
const wanted = (job, source) => !job.only_source || job.only_source === source
const forced = (job, source) => Boolean(job.force) || job.only_source === source
/** The parts a Research again run accepted in its preview (`again_plan`); null on an ordinary run. */
const againParts = (job) => (job.again_plan ? new Set((job.again_plan.run ?? []).map((r) => r.part)) : null)
/** The web search part for one network. */
const searchPart = (network) => `${network}-search`

/** `collector_version` of a snapshot source this code collected. */
const COLLECTOR_VERSION = 'wo-place-1'
/** Pictures a research run downloads at once (a video waits for its turn alone). */
const MEDIA_AT_ONCE = 5

export function createPlaceRunner(h) {
  const { pool, now, log } = h
  const { mergeCollected, fairShare, mergeProfile, mergePalettes } = h.merge
  const at = () => new Date(now())
  /**
   * Whether this run collects `part`: forced, else due. A Research again run looks only at the parts its preview
   * accepted (and the page a search of it finds), with failures ours tried again at once; it drops a part no longer
   * due, it never adds one.
   */
  const due = (job, part, row, version = null) => {
    if (forced(job, part)) return true
    const again = againParts(job)
    if (!again) return sourceDue(row, now(), version)
    return (
      (again.has(part) || again.has(searchPart(part))) && sourceDue(row, now(), version, { manual: true })
    )
  }
  const paidReceipt = h.researchLedger
    ? createPlacePaidReceipts({ pool, ledger: h.researchLedger, now })
    : null

  async function run(job) {
    const lease = placeLease(job)
    let lost = false
    const beat = setInterval(() => {
      heartbeat(pool, lease, h.leaseMs)
        .then((ok) => {
          if (!ok) lost = true
        })
        .catch(() => {})
    }, h.heartbeatMs)
    beat.unref?.()
    const finish = (outcome) => finishPlaceJob(pool, lease, outcome, { now: now() })
    try {
      const domain = await h.loadDomain()
      const place = (await pool.query('select * from wo_place where id = $1', [job.place_id])).rows[0]
      const identity = (
        await pool.query(
          `select namespace, external_id, source from wo_place_identity where place_id = $1 and namespace not in ('merge', 'tripadvisor')
           order by (namespace = 'google') desc, created_at limit 1`,
          [job.place_id]
        )
      ).rows[0]
      const runtime = await h.runtime()
      const campaignJob = Boolean(job.prefetch_campaign_id)
      const prefetch = campaignJob && job.research_mode === 'website'
      const seed = campaignJob
        ? (
            await pool.query('select facts from wo_prefetch_seed where campaign_id=$1 and place_id=$2', [
              job.prefetch_campaign_id,
              job.place_id
            ])
          ).rows[0]?.facts
        : null
      if (campaignJob && !seed) throw new Error('Prefetch seed is unavailable')
      // Historical website-only jobs keep their original scope. New campaigns use the customer Research stages.
      const keys = prefetch ? { google: null, apify: null, rapidapi: null } : runtime.keys
      const settings = prefetch
        ? { ...runtime.settings, pageSpeedCheckEnabled: false, googlePlacesPhotos: false }
        : runtime.settings
      const deadline = now() + 45000
      let fetches = 0
      const prefetchDeps = prefetch
        ? {
            ...h.domainDeps,
            fetch: async (url, init = {}) => {
              if (++fetches > 12 || now() >= deadline) throw new Error('Prefetch fetch limit reached')
              const signal = AbortSignal.timeout(Math.max(1, deadline - now()))
              return h.domainDeps.fetch(url, {
                ...init,
                signal: init.signal ? AbortSignal.any([init.signal, signal]) : signal
              })
            }
          }
        : null
      const ctx = {
        lease,
        job,
        place,
        identity,
        snapshotId: job.snapshot_id,
        domain,
        keys,
        settings,
        prefetch,
        campaignJob,
        seed,
        prefetchDeps,
        stopOutcome: h.featureOff,
        domainDeps: h.domainDeps,
        async pausePoint(progress) {
          if (lost) throw new StaleLeaseError(job.id)
          if (
            campaignJob &&
            !(
              await pool.query(
                `select 1 from wo_place_job j join wo_prefetch_campaign c on c.id=j.prefetch_campaign_id
                  where j.id=$1 and (exists(select 1 from wo_job r where r.place_job_id=j.id
                    and r.result_snapshot_id is null and r.state in ('queued','running','paused','blocked'))
                    or exists(select 1 from wo_place_public_request pr where pr.place_job_id=j.id) or (c.enabled
                  and (c.seed_source->>'fetchedAt')::timestamptz > now()-interval '30 days'))`,
                [job.id]
              )
            ).rowCount
          ) {
            ctx.stopOutcome = {
              state: 'paused',
              lastError: { code: 'PREFETCH_STOPPED', reason: 'campaign_stopped' }
            }
            return true
          }
          if (!(await h.switchOn().catch(() => false))) return true
          if (!(await checkpoint(pool, lease, { progress }))) throw new StaleLeaseError(job.id)
          return false
        }
      }
      // The logo's retry runs its own stages only; a one-source run runs them all so the profile follows what it found.
      const stages = job.only_source === 'logo' ? LOGO_ONLY_STAGES : h.stages
      let stage = stages.includes(job.stage) ? job.stage : stages[0]
      // Where a research run's minutes go, one line per run (28/10/2026: nothing said it before).
      const spent = []
      while (stage !== 'done') {
        if (await ctx.pausePoint(null)) return void (await finish(ctx.stopOutcome))
        const stageStarted = now()
        const outcome = await STAGES[stage](ctx)
        spent.push(`${stage} ${((now() - stageStarted) / 1000).toFixed(1)}s`)
        if (outcome?.state) return void (await finish(outcome))
        stage = stages[stages.indexOf(stage) + 1]
        if (!(await checkpoint(pool, lease, { stage }))) throw new StaleLeaseError(job.id)
      }
      if (spent.length) log.info?.(`[opportunities] place job ${job.id}: ${spent.join(', ')}`)
      if (!(await finish({ state: 'completed' }))) throw new StaleLeaseError(job.id)
      // What this run read from Google itself is offered to the shared hub (only with `HUB_CONTRIBUTE=1`).
      if (h.hub && !prefetch)
        await h.hub
          .offer(job.place_id, job.snapshot_id)
          .catch((error) => log.warn(`[opportunities] hub offer: ${error?.message}`))
      // A new snapshot may show this place is a pasted URL's Google place, or the other way round.
      if (h.afterPublish && !prefetch) await h.afterPublish(job.place_id)
    } catch (error) {
      if (error instanceof StaleLeaseError || error?.code === 'STALE_LEASE') {
        log.warn(`[opportunities] place job ${job.id}: lease lost, stopping without writing`)
        return
      }
      if (['SOURCE_START_UNKNOWN', 'PREFETCH_STOPPED'].includes(error?.code)) {
        await finish({
          state: error.code === 'PREFETCH_STOPPED' ? 'paused' : 'blocked',
          lastError: { code: error.code, reason: error.message }
        }).catch(() => {})
        return
      }
      if (error?.code === 'FEATURE_OFF') {
        await finish(h.featureOff).catch(() => {})
        return
      }
      if (error instanceof BudgetExceededError) {
        await finish({
          state: 'paused',
          lastError: { code: 'SOURCE_PAUSED', source: error.source ?? null, reason: 'budget' }
        }).catch(() => {})
        return
      }
      log.error(`[opportunities] place job ${job.id} failed`, error?.message ?? error)
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

  const sourceOf = async (snapshotId, source) =>
    (await snapshotSourcesOf(pool, snapshotId)).find((s) => s.source === source) ?? null

  // A2: a place Google gives no own website gets its Facebook/Instagram page from a web search, kept
  // only with branch evidence (contract §6); the page's facts are read through ScrapeCreators. Each network's
  // search is a part of its own (`facebook-search`, `instagram-search`): searched when due like any source, its
  // outcome kept on the snapshot so a place never searched shows it and a Try again runs it alone.
  async function findSocialBySearch(ctx) {
    const { lease, place, identity, snapshotId, domain, keys, settings, job } = ctx
    if (ctx.prefetch || identity?.namespace !== 'google') return
    const google = (await sourceOf(snapshotId, GOOGLE_FACTS_SOURCE))?.collected
    const known = await linksOf(pool, place.id)
    // No Google facts (a failed Place Details leaves `{}`): nothing to search by.
    if (!google?.name || known.some((l) => l.kind === 'website')) return
    const rows = {}
    for (const network of SEARCH_NETWORKS) rows[network] = await sourceOf(snapshotId, searchPart(network))
    const networks = SEARCH_NETWORKS.filter(
      (n) =>
        !known.some((l) => l.kind === n) &&
        wanted(job, searchPart(n)) &&
        due(job, searchPart(n), rows[n], SOCIAL_SEARCH_VERSION)
    )
    if (!networks.length) return
    // The name the last research decided the business carries (`nameCheck`), when it is not Google's: searched too.
    const held = ctx.place.current_snapshot_id
      ? await snapshotProfileOf(pool, ctx.place.current_snapshot_id)
      : null
    const decidedName = held?.profile?.nameCheck?.name
    const target = domain.searchPlaceOf(google, {
      ...ctx.seed,
      otherNames: decidedName ? [decidedName] : [],
      address: google.formattedAddress ?? ctx.seed?.address,
      phone: google.nationalPhoneNumber ?? google.internationalPhoneNumber ?? ctx.seed?.phone,
      socials: Object.fromEntries(known.map((l) => [l.kind, l.url]))
    })
    const scCharge = (spec, call) =>
      charge(ctx, spec.provider, spec.operation, ceilingCents(spec.provider, spec.operation), call)
    const found = await domain.findSocialPages(target, {
      networks,
      // The operator's web search order (/ops/wo); a provider without its key is skipped by findSocialPages.
      order: resolveProviderOrder(settings, 'web-search').order,
      searchers: {
        'scrapecreators-google': keys.scrapecreators
          ? (q, where) =>
              charge(
                ctx,
                'scrapecreators',
                'google-search',
                ceilingCents('scrapecreators', 'google-search'),
                () =>
                  domain.scrapeCreatorsGoogleSearch(q, {
                    ...where,
                    key: keys.scrapecreators,
                    fetch: h.apiFetch
                  }),
                { actualCents: scSearchCents }
              )
          : undefined,
        jina: keys.jina
          ? (q, where) =>
              charge(ctx, 'jina', 'search', ceilingCents('jina', 'search'), () =>
                domain.jinaSearch(q, { ...where, key: keys.jina, fetch: h.apiFetch })
              )
          : undefined,
        firecrawl: keys.firecrawl
          ? (q, where) =>
              charge(ctx, 'firecrawl', 'search', ceilingCents('firecrawl', 'search'), () =>
                domain.firecrawlSearch(q, { ...where, key: keys.firecrawl, fetch: h.apiFetch })
              )
          : undefined,
        'serpapi-google-search': keys.serpapi
          ? (q, where) =>
              charge(ctx, 'serpapi', 'web-search', ceilingCents('serpapi', 'web-search'), () =>
                domain.serpapiGoogleSearch(q, { ...where, key: keys.serpapi, fetch: h.apiFetch })
              )
          : undefined
      },
      pageFacts: async (network, url) => {
        const got = await domain.collectSocialProfile(
          network,
          url,
          { limit: 1 },
          {
            ...h.domainDeps,
            order: ['scrapecreators'],
            keys: { scrapecreators: keys.scrapecreators },
            charge: scCharge
          }
        )
        const p = got?.profile
        return p?.name
          ? {
              name: p.name,
              address: p.address,
              phone: p.phone,
              website: p.website,
              bio: p.bio,
              category: p.category,
              links: p.website ? [p.website] : []
            }
          : null
      },
      rethrow: (e) => e instanceof BudgetExceededError
    })
    await fenced(pool, lease, async (db) => {
      for (const hit of found.confirmed)
        await addLink(db, place.id, hit.network, normalizeUrl(hit.url), 'search', {
          ...hit.evidence,
          provider: hit.provider,
          at: at().toISOString()
        })
      for (const network of networks) {
        const part = searchPart(network)
        const searched = found.searched?.[network] ?? { status: 'not_found', queries: 0 }
        const pages = ['confirmed', 'pending', 'rejected'].flatMap((verdict) =>
          found[verdict].filter((p) => p.network === network).map((p) => ({ ...p, verdict }))
        )
        if (searched.status === 'confirmed' || searched.status === 'pending')
          await collected(
            db,
            snapshotId,
            part,
            {
              ref: null,
              status: 'complete',
              reason: searched.status === 'pending' ? 'pending' : null,
              collected: { queries: searched.queries, pages }
            },
            at(),
            SOCIAL_SEARCH_VERSION
          )
        else
          await tried(
            db,
            snapshotId,
            part,
            rows[network],
            {
              status: searched.status === 'failed' ? 'failed' : 'skipped',
              reason: searched.status === 'failed' ? (searched.reason ?? 'provider_error') : 'not_found',
              coverage: { version: SOCIAL_SEARCH_VERSION, queries: searched.queries, pages }
            },
            at()
          )
      }
    })
    if (found.pending.length)
      log.info(`[opportunities] place ${place.id}: ${found.pending.length} social page(s) pending`)
  }

  /**
   * The website-content order (/ops/wo) when it does not open with the direct crawl then the Apify browser, or the
   * readers after those two when it does: each reader in turn until
   * one gives a page that is not thin (`needsBrowser`). A reader without its key, or a resumed crawl for a
   * one-page reader, is skipped; nothing usable keeps the first answer, as the browser fallback did.
   */
  async function readWebsiteInOrder(ctx, order, { row, cursor, runDirect, browserReceipt }) {
    const { domain, keys } = ctx
    const readers = { jina: domain.readWithJina, firecrawl: domain.readWithFirecrawl }
    let first = null
    let firstUsable = null
    for (const id of order) {
      let result = null
      let fetchedAt = null
      if (id === 'direct') result = await runDirect()
      else if (id === 'apify-browser') {
        if (!paidReceipt || !keys.apify || cursor) continue
        const receipt = await browserReceipt()
        result = receipt.result
        fetchedAt = receipt.fetchedAt
      } else if (readers[id]) {
        if (!keys[id] || cursor) continue
        result = await charge(ctx, id, 'read', ceilingCents(id, 'read'), () =>
          readers[id](row.ref, { key: keys[id], fetch: h.apiFetch })
        )
      } else continue
      first ??= result
      const usable = ['complete', 'partial'].includes(result.status)
      if (usable) firstUsable ??= { result, fetchedAt }
      if (usable && !domain.needsBrowser(result))
        return {
          result:
            result === first
              ? result
              : { ...result, fallbackFrom: { status: first.status, reason: first.reason ?? null } },
          fetchedAt
        }
    }
    if (firstUsable) return firstUsable
    return { result: first ?? { status: 'skipped', reason: 'credential_missing' }, fetchedAt: null }
  }

  /**
   * The rendered readers a menu page with no dish is read again through (`menu-reader.mjs` `renderers`): Jina and
   * Firecrawl (`menuRendererOrder`: as the website-content order names them, both by default), each only with its key, each call charged and
   * logged like a website read. No key, no reader: the read stays `needs_render` and nothing is called.
   */
  function menuRenderers(ctx) {
    const { domain, keys, settings, place } = ctx
    const readers = { jina: domain.readWithJina, firecrawl: domain.readWithFirecrawl }
    return menuRendererOrder(settings, keys)
      .filter((id) => readers[id])
      .map((id) => ({
        provider: id,
        read: async (url) => {
          const r = await charge(ctx, id, 'read', ceilingCents(id, 'read'), () =>
            readers[id](url, { key: keys[id], fetch: h.apiFetch, html: true })
          )
          log.info(`[opportunities] place ${place?.id}: menu page read through ${id}: ${r?.status}`)
          return r?.status === 'complete' && typeof r.html === 'string'
            ? { url: r.url ?? url, html: r.html }
            : null
        }
      }))
  }

  /** A ScrapeCreators search it did not charge ("no results") settles at 0; else at the reservation. */
  const scSearchCents = (links) => (links?.charged === false ? 0 : null)

  // The operator's menu-links order (/ops/wo): the default (website only) leaves the crawl's menus as they are.
  async function menuLinksFor(ctx, profile, google) {
    const { domain, keys, settings } = ctx
    const order = resolveProviderOrder(settings, 'menu-links').order
    if (order.length === 1 && order[0] === 'website') return
    const paid = (provider, operation, run, options) => (q) =>
      charge(ctx, provider, operation, ceilingCents(provider, operation), () => run(q), options)
    const found = await domain.findMenuLinks(domain.searchPlaceOf(google ?? {}, { name: profile.name }), {
      order,
      websiteMenus: profile.menus ?? [],
      searchers: {
        'serpapi-google-search': keys.serpapi
          ? paid('serpapi', 'google-search', (q) =>
              domain.serpapiGoogleSearch(q, { key: keys.serpapi, fetch: h.apiFetch })
            )
          : undefined,
        'scrapecreators-google': keys.scrapecreators
          ? paid(
              'scrapecreators',
              'google-search',
              (q) => domain.scrapeCreatorsGoogleSearch(q, { key: keys.scrapecreators, fetch: h.apiFetch }),
              { actualCents: scSearchCents }
            )
          : undefined
      },
      rethrow: (e) => e instanceof BudgetExceededError
    })
    if (found.menus.length) profile.menus = found.menus
    else delete profile.menus
  }

  const STAGES = {
    async discovery(ctx) {
      const { lease, place, identity, snapshotId, domain, keys, job } = ctx
      const hub = ctx.prefetch ? null : h.hub
      // Every run first re-judges the sources it holds with today's link rules (`link-rejudge.js`): a listing page
      // once taken for the website stops being one, with what it brought.
      await fenced(pool, lease, (db) => dropMisjudged(db, place.id, snapshotId))
      if (identity?.namespace === 'google' && (keys.google || hub) && wanted(job, GOOGLE_FACTS_SOURCE)) {
        const row = await sourceOf(snapshotId, GOOGLE_FACTS_SOURCE)
        const version = sourceVersionOf(GOOGLE_FACTS_SOURCE)
        if (due(job, GOOGLE_FACTS_SOURCE, row, version)) {
          let facts = null
          // A shared hub's fresh copy first (`hub/local-cache.js`); without one, Google is paid as before.
          const fromHub = hub
            ? await hub.placeFacts({ namespace: 'google', externalId: identity.external_id })
            : null
          if (fromHub) facts = fromHub.facts
          else if (keys.google)
            try {
              const raw = await charge(
                ctx,
                'google',
                'place-details',
                ceilingCents('google', 'place-details'),
                () =>
                  domain.fetchPlaceDetails(identity.external_id, { ...h.domainDeps, googleKey: keys.google })
              )
              facts = domain.placeFactsFromDetails(raw, { now: at })
            } catch (error) {
              if (error instanceof BudgetExceededError) throw error
              log.warn(
                `[opportunities] place ${place.id}: Google place details skipped (${error?.code ?? 'error'})`
              )
            }
          await fenced(pool, lease, async (db) => {
            if (!facts)
              return tried(
                db,
                snapshotId,
                GOOGLE_FACTS_SOURCE,
                row,
                { status: 'failed', reason: 'error', coverage: { version } },
                at()
              )
            await collected(
              db,
              snapshotId,
              GOOGLE_FACTS_SOURCE,
              {
                ref: identity.external_id,
                status: 'complete',
                collected: facts,
                ...(fromHub
                  ? {
                      coverage: {
                        provenance: 'hub',
                        hubPlaceId: fromHub.hubPlaceId,
                        hubRevision: fromHub.revision
                      }
                    }
                  : {})
              },
              at(),
              fromHub ? HUB_COLLECTOR_VERSION : version
            )
            if (fromHub) await hub.recordUse(db, snapshotId, fromHub, GOOGLE_FACTS_SOURCE)
            // Google's own record of the place names its website: the place's first verified source.
            for (const [kind, url] of Object.entries(refsOfUrls([facts.website])))
              await addLink(db, place.id, kind, url, fromHub ? 'hub' : 'google', {
                from: fromHub ? 'hub-snapshot' : 'google-place-details',
                placeId: identity.external_id,
                ...(fromHub ? { hubPlaceId: fromHub.hubPlaceId } : {}),
                at: at().toISOString()
              })
          })
        }
      }
      if (ctx.seed)
        await fenced(pool, lease, (db) =>
          collected(
            db,
            snapshotId,
            ctx.identity?.namespace === 'google' ? 'google-places-search' : 'osm',
            {
              ref: identity.external_id,
              status: 'complete',
              collected: ctx.seed
            },
            new Date(ctx.seed.fetchedAt)
          )
        )
      await findSocialBySearch(ctx)
      const links = await linksOf(pool, place.id)
      await fenced(pool, lease, async (db) => {
        for (const link of links) await ensureSource(db, snapshotId, link.kind, link.url)
      })
      if (
        !(await checkpoint(pool, lease, { progress: { discovered: [...new Set(links.map((l) => l.kind))] } }))
      )
        throw new StaleLeaseError(lease.jobId)
    },

    async collection(ctx) {
      const { lease, place, snapshotId, domain, keys, settings, job } = ctx
      const mapsRow = await sourceOf(snapshotId, GOOGLE_MAPS_SOURCE)
      if (
        keys.serpapi &&
        settings.googleMapsMenu !== false &&
        ctx.identity?.namespace === 'google' &&
        wanted(job, GOOGLE_MAPS_SOURCE) &&
        ((mapsRow?.coverage?.pipelineJobId === job.id && mapsRow.coverage.pending) ||
          due(job, GOOGLE_MAPS_SOURCE, mapsRow, GOOGLE_MAPS_VERSION))
      ) {
        await researchGoogleMaps(ctx, {
          pool,
          now,
          fetch: h.apiFetch,
          retry: h.providerRetry,
          chargeable: h.chargeable,
          row: mapsRow,
          google: (await sourceOf(snapshotId, GOOGLE_FACTS_SOURCE))?.collected,
          save: collected,
          tried
        })
      }
      const reviewRow = await sourceOf(snapshotId, TRIPADVISOR_SOURCE)
      if (
        tripadvisorProviders(settings, keys).length > 0 &&
        settings.tripadvisorReviews !== false &&
        wanted(job, TRIPADVISOR_SOURCE) &&
        ((reviewRow?.coverage?.pipelineJobId === job.id && reviewRow.coverage.pending) ||
          due(job, TRIPADVISOR_SOURCE, reviewRow, TRIPADVISOR_VERSION))
      ) {
        const google = (await sourceOf(snapshotId, GOOGLE_FACTS_SOURCE))?.collected
        await researchTripadvisor(ctx, {
          pool,
          now,
          fetch: h.apiFetch,
          retry: h.providerRetry,
          chargeable: h.chargeable,
          row: reviewRow,
          google,
          save: collected,
          tried
        })
      }
      // Social pages walk the operator's provider order (/ops/wo › Settings), each provider reserved at its own price.
      const connectors = domain.connectorsFor(
        { APIFY_TOKEN: keys.apify ?? undefined, SCRAPECREATORS_API_KEY: keys.scrapecreators ?? undefined },
        { order: providerOrderFor(settings) }
      )
      // Use the same plain/browser collectors, but admit the paid fallback before its POST.
      if (paidReceipt && keys.apify) connectors.website = domain.connectorsFor({}).website
      for (const source of SOURCES) {
        if (ctx.prefetch && source !== 'website') continue
        // A Try again of a network's search also collects the page that search found.
        if (!wanted(job, source) && job.only_source !== searchPart(source)) continue
        const row = await sourceOf(snapshotId, source)
        if (!row?.ref) continue
        if (ctx.prefetch && row.ref !== ctx.seed.website) continue
        const resuming = row.status === 'partial' && Boolean(row.cursor)
        const version = sourceVersionOf(source)
        if (!resuming && !due(job, source, row, version)) continue
        if (await ctx.pausePoint({ collecting: source })) return ctx.stopOutcome
        if (settings.autoCollectSources?.[source] === false) {
          await fenced(pool, lease, (db) =>
            tried(db, snapshotId, source, row, { status: 'skipped', reason: 'switched_off' }, at())
          )
          continue
        }
        // Website content follows the operator's reader order (/ops/wo); `[]` switches the website off.
        const websiteOrder =
          source === 'website' && !ctx.prefetch
            ? resolveProviderOrder(settings, 'website-content').order
            : null
        if (websiteOrder?.length === 0) {
          await fenced(pool, lease, (db) =>
            tried(db, snapshotId, source, row, { status: 'skipped', reason: 'switched_off' }, at())
          )
          continue
        }
        // An order opening with the direct crawl then the Apify browser (the default does) runs those two as research
        // always has; the readers after them read a page they left thin.
        const legacyWebsite = websiteOrder?.[0] === 'direct' && websiteOrder[1] === 'apify-browser'
        const customWebsite = websiteOrder !== null && !legacyWebsite
        const social = SOCIAL_SOURCES.includes(source)
        // Without a research ledger the Apify run keeps its old durable-run record (`h.apifyRun`).
        const legacyRun = social && !paidReceipt && Boolean(keys.apify)
        const cursor = ctx.prefetch
          ? {
              host: new URL(row.ref).hostname.replace(/^www\./, ''),
              queue: [row.ref],
              seen: [row.ref],
              fetched: 0
            }
          : resuming
            ? row.cursor
            : null
        const actor = domain.APIFY_ACTORS?.[source] ?? source
        const maxChargeUsd = actor.includes('clockworks')
          ? Math.max(0.5, settings.maxChargeUsdPerRun)
          : settings.maxChargeUsdPerRun
        // Legacy jobs resume their recorded run. Durable place receipts retain authority over unknown runs.
        const held = legacyRun ? h.apifyRun.held(job.progress, source, cursor) : null
        let fetchedAt = at()
        // Each provider call of a social page is reserved here, at that provider's own price.
        const socialCharge = async (spec, call) => {
          if (spec.provider !== 'apify')
            return charge(
              ctx,
              spec.provider,
              spec.operation,
              ceilingCents(spec.provider, spec.operation),
              call,
              {
                requestKey: `${job.id}:${lease.token}:${source}:${spec.provider}`
              }
            )
          const offset = Math.max(0, Number(spec.cursor?.offset) || 0)
          const maxCents = apifyCeilingCents(actor, { items: offset + h.collectLimit, maxChargeUsd })
          if (held) return call()
          if (!paidReceipt)
            return charge(ctx, 'apify', actor, maxCents, call, {
              requestKey: `${job.id}:${lease.token}:${source}:${offset}`,
              sent: (r) => !(r.status === 'blocked' && r.reason === 'credential_missing')
            })
          const receipt = await paidReceipt(
            {
              placeId: place.id,
              jobId: job.id,
              source,
              force: forced(job, source),
              input: { ref: row.ref, cursor: spec.cursor, actor, limit: h.collectLimit, maxChargeUsd },
              spec: {
                provider: 'apify',
                operation: actor,
                maxCents,
                prefetchCampaignId: job.prefetch_campaign_id ?? null,
                expectedLeaseToken: lease.token
              }
            },
            call
          )
          fetchedAt = receipt.fetchedAt
          return receipt.result
        }
        const runDirect = async () => {
          try {
            return await h.collectOne(connectors[source], source, { ref: row.ref, cursor }, maxChargeUsd, {
              ...(ctx.prefetch ? { pageLimit: 2, domainDeps: ctx.prefetchDeps } : {}),
              ...(social ? { domainDeps: { ...h.domainDeps, charge: socialCharge } } : {}),
              ...(legacyRun ? h.apifyRun.hooks(pool, lease, held) : {})
            })
          } catch (error) {
            if (error instanceof BudgetExceededError) error.source = source
            throw error
          }
        }
        const browserReceipt = () =>
          paidReceipt(
            {
              placeId: place.id,
              jobId: job.id,
              source: 'website-browser',
              force: forced(job, 'website'),
              input: {
                ref: row.ref,
                actor: domain.BROWSER_ACTOR,
                maxPages: h.websitePages,
                maxChargeUsd: settings.maxChargeUsdPerRun
              },
              spec: {
                provider: 'apify',
                operation: domain.BROWSER_ACTOR,
                maxCents: apifyCeilingCents(domain.BROWSER_ACTOR, {
                  items: h.websitePages,
                  maxChargeUsd: settings.maxChargeUsdPerRun
                }),
                prefetchCampaignId: job.prefetch_campaign_id ?? null,
                expectedLeaseToken: lease.token
              }
            },
            () =>
              domain.crawlWithBrowser(
                row.ref,
                { maxPages: h.websitePages },
                {
                  ...h.domainDeps,
                  token: keys.apify,
                  maxChargeUsd: settings.maxChargeUsdPerRun
                }
              )
          )
        let result
        if (customWebsite) {
          const r = await readWebsiteInOrder(ctx, websiteOrder, { row, cursor, runDirect, browserReceipt })
          result = r.result
          if (r.fetchedAt) fetchedAt = r.fetchedAt
        } else {
          result = await runDirect()
          if (source === 'website' && paidReceipt && keys.apify && !cursor && domain.needsBrowser(result)) {
            const receipt = await browserReceipt()
            if (['complete', 'partial'].includes(receipt.result.status)) {
              result = {
                ...receipt.result,
                fallbackFrom: { status: result.status, reason: result.reason ?? null }
              }
              fetchedAt = receipt.fetchedAt
            } else
              result = {
                ...result,
                fallback: {
                  provider: 'apify-browser',
                  status: receipt.result.status,
                  reason: receipt.result.reason
                }
              }
          }
          const rest = legacyWebsite ? websiteOrder.slice(2) : []
          const usable = ['complete', 'partial'].includes(result.status)
          if (rest.length && !cursor && (!usable || domain.needsBrowser(result))) {
            const r = await readWebsiteInOrder(ctx, rest, { row, cursor, runDirect, browserReceipt })
            if (['complete', 'partial'].includes(r.result.status) && !domain.needsBrowser(r.result)) {
              result = { ...r.result, fallbackFrom: { status: result.status, reason: result.reason ?? null } }
              if (r.fetchedAt) fetchedAt = r.fetchedAt
            }
          }
        }
        await fenced(pool, lease, async (db) => {
          if (['complete', 'partial'].includes(result.status))
            await collected(
              db,
              snapshotId,
              source,
              {
                ref: row.ref,
                status: result.status,
                reason: result.reason,
                cursor: result.cursor ?? null,
                coverage: result.coverage ?? null,
                collected: mergeCollected(resuming ? row.collected : {}, result)
              },
              fetchedAt,
              version ?? undefined
            )
          else
            await tried(
              db,
              snapshotId,
              source,
              row,
              version ? { ...result, coverage: { ...result.coverage, version } } : result,
              at()
            )
          // The place's own website names its social pages: they become the place's sources.
          if (source === 'website')
            for (const [social, url] of Object.entries(refsOfUrls(result.profile?.links ?? [])))
              if (SOCIAL_SOURCES.includes(social)) {
                await addLink(db, place.id, social, url, 'website', { page: row.ref, at: at().toISOString() })
                await ensureSource(db, snapshotId, social, url)
              }
        })
        if (legacyRun) await h.apifyRun.spend(pool, lease, result)
        if (!ctx.prefetch && result.status === 'partial' && h.resumable.has(result.reason) && result.cursor)
          return { state: 'paused', lastError: { code: 'SOURCE_PAUSED', source, reason: result.reason } }
      }
    },

    async media(ctx) {
      if (ctx.prefetch) return
      const { lease, snapshotId, domain } = ctx
      const owner = placeOwner(ctx)
      const known = await placeMediaByUrl(ctx.place.id)
      const shown = new Set((await snapshotMediaOf(pool, snapshotId)).map((m) => m.id))
      const logoOnly = ctx.job.only_source === 'logo'
      if (logoOnly) await refreshLogoHints(ctx)
      const otherPart = Boolean(ctx.job.only_source) && ctx.job.only_source !== 'facebook'
      const swapped = otherPart ? 0 : await upgradeFacebook(ctx, owner, known, shown)
      const queue = new Map()
      const sourceRows = await snapshotSourcesOf(pool, snapshotId)
      // The logo candidates are downloaded whatever their size and however many other pictures there are (`place-logo.js`).
      const logos = logoHintsOf(sourceRows).filter((l) => !shown.has(known.get(l.url)))
      for (const row of sourceRows) {
        if (!SOURCES.includes(row.source) && ![TRIPADVISOR_SOURCE, GOOGLE_MAPS_SOURCE].includes(row.source))
          continue
        for (const m of row.collected?.media ?? [])
          if (typeof m?.url === 'string' && !queue.has(m.url) && !shown.has(known.get(m.url)))
            queue.set(m.url, { ...m, source: row.source })
      }
      for (const l of logos) queue.delete(l.url)
      const candidates = [...queue.values()]
      const todo = logoOnly
        ? logos
        : [
            ...logos,
            ...fairShare(
              candidates.filter((m) => ![TRIPADVISOR_SOURCE, GOOGLE_MAPS_SOURCE].includes(m.source)),
              Math.max(0, h.mediaBudget - shown.size)
            ),
            ...candidates.filter((m) => m.source === TRIPADVISOR_SOURCE).slice(0, 10),
            ...candidates
              .filter((m) => m.source === GOOGLE_MAPS_SOURCE && m.category === 'menu')
              .slice(0, 20),
            ...candidates.filter((m) => m.source === GOOGLE_MAPS_SOURCE && m.category !== 'menu').slice(0, 20)
          ]
      // 🔒 DOWNLOADS AT ONCE, WRITES IN ORDER (28/10/2026): one picture after another, up to 300 of them, was minutes
      // of a research run. `MEDIA_AT_ONCE` download together (a video alone, for memory); each is then kept in list
      // order, so the row a picture's hash keeps (`keepMedia`, the first) and every pause point are the serial run's.
      for (let i = 0; i < todo.length; i += MEDIA_AT_ONCE) {
        if (i % 10 === 0 && (await ctx.pausePoint({ media: { done: i, total: todo.length } })))
          return ctx.stopOutcome
        const chunk = todo.slice(i, i + MEDIA_AT_ONCE)
        // Already a media row of this place (another snapshot stored it): shown again, not downloaded again.
        const early = chunk.map((m) =>
          known.get(m.url) || m.kind === 'video' ? null : h.mediaRecord(domain, owner, m)
        )
        // A failed download throws at its own turn below, after the ones before it are kept, as it did serially.
        for (const download of early) download?.catch(() => {})
        for (const [k, m] of chunk.entries()) {
          const held = known.get(m.url)
          if (held) {
            await fenced(pool, lease, (db) => show(db, snapshotId, held))
            continue
          }
          const record = await (early[k] ?? h.mediaRecord(domain, owner, m))
          if ([TRIPADVISOR_SOURCE, GOOGLE_MAPS_SOURCE].includes(m.source)) {
            record.credit = m.credit
            record.provider = m.provider
            if (m.category === 'menu') record.category = 'menu'
            if (m.source === GOOGLE_MAPS_SOURCE) record.palette = null
          }
          const mediaId = await fenced(pool, lease, (db) => keepMedia(db, snapshotId, record))
          known.set(m.url, mediaId)
        }
      }
      for (const optionalSource of [TRIPADVISOR_SOURCE, GOOGLE_MAPS_SOURCE]) {
        const ta = await sourceOf(snapshotId, optionalSource)
        if (ta?.collected?.reviews?.length || ta?.collected?.media?.length) {
          const stored = new Set(
            (await snapshotMediaOf(pool, snapshotId))
              .filter((m) => m.status === 'stored' && !m.revoked_at)
              .map((m) => m.id)
          )
          const bind = (photo) => {
            const { mediaId: _old, ...metadata } = photo
            const mediaId = known.get(photo.url)
            return { ...metadata, ...(mediaId && stored.has(mediaId) ? { mediaId } : {}) }
          }
          const collected = {
            ...ta.collected,
            ...(optionalSource === GOOGLE_MAPS_SOURCE
              ? {
                  menuPhotos: (ta.collected.menuPhotos ?? []).map(bind),
                  overviewPhotos: (ta.collected.overviewPhotos ?? []).map(bind)
                }
              : {}),
            reviews: (ta.collected.reviews ?? []).map((review) => ({
              ...review,
              photos: (review.photos ?? []).map(bind)
            })),
            media: (ta.collected.media ?? []).map(bind)
          }
          await fenced(pool, lease, (db) =>
            db.query(
              'update wo_place_snapshot_source set collected = $3::jsonb where snapshot_id = $1 and source = $2',
              [snapshotId, optionalSource, JSON.stringify(collected)]
            )
          )
        }
      }
      const progress = {
        media: {
          done: todo.length,
          total: todo.length,
          overBudget: Math.max(0, queue.size - todo.length),
          ...(swapped ? { upgraded: swapped } : {})
        }
      }
      if (!(await checkpoint(pool, lease, { progress }))) throw new StaleLeaseError(lease.jobId)
    },

    async profile(ctx) {
      const { lease, snapshotId, keys, settings } = ctx
      const sources = await snapshotSourcesOf(pool, snapshotId)
      const google =
        sources.find((s) => s.source === GOOGLE_FACTS_SOURCE && s.collected_at)?.collected ?? null
      // The place's public profile: what its sources say, nothing an account sent (no candidate).
      const profile = mergeProfile(placeAsOpportunity(ctx, google), sourceRowsOf(sources))
      const base = ctx.place.current_snapshot_id
        ? await snapshotProfileOf(pool, ctx.place.current_snapshot_id)
        : null
      const previousAudit = base?.profile?.website === profile.website ? base?.profile?.pageSpeed : null
      const auditFresh = previousAudit && now() - Date.parse(previousAudit.checkedAt) <= SOURCE_MAX_AGE_MS
      if (!ctx.job.force && auditFresh) profile.pageSpeed = previousAudit
      // A one-source run pays for its source only: the last audit and menu links are carried over as they are.
      const onePart = Boolean(ctx.job.only_source)
      if (onePart && base?.profile?.pageSpeed && base.profile.website === profile.website)
        profile.pageSpeed = base.profile.pageSpeed
      if (
        !onePart &&
        !profile.pageSpeed &&
        settings.pageSpeedCheckEnabled &&
        keys.google &&
        typeof profile.website === 'string' &&
        profile.website
      ) {
        const pageSpeed = await charge(ctx, 'google', 'pagespeed', ceilingCents('google', 'pagespeed'), () =>
          checkPageSpeed(profile.website, keys.google, { fetch: h.apiFetch, now })
        )
        if (pageSpeed) profile.pageSpeed = pageSpeed
      }
      if (google) profile.googlePlace = google
      const tripadvisor = sources.find((s) => s.source === TRIPADVISOR_SOURCE && s.collected_at)?.collected
      const googleMaps = sources.find((s) => s.source === GOOGLE_MAPS_SOURCE && s.collected_at)?.collected
      if (tripadvisor || googleMaps)
        profile.reviewSources = {
          ...(tripadvisor ? { tripadvisor } : {}),
          ...(googleMaps ? { googleMaps } : {})
        }
      if (onePart) {
        if (base?.profile?.menus) profile.menus = base.profile.menus
      } else if (!ctx.prefetch) await menuLinksFor(ctx, profile, google)
      // The menu link Google Maps lists for the place (read from the Maps lookup already paid for); no extra call.
      const mapsMenu = googleMaps?.menuLink
      if (mapsMenu?.url && !(profile.menus ?? []).some((m) => m?.url === mapsMenu.url))
        profile.menus = [...(profile.menus ?? []), { url: mapsMenu.url, source: GOOGLE_MAPS_SOURCE }]
      // The Menu's two parts (`menu-file`, then `menu-photos`), merged into the profile's dishes (contract §5).
      if (!ctx.prefetch) Object.assign(profile, await readMenu(ctx, profile, google, base?.profile ?? null))
      // What the business sells, who it is for, its team and story (`business-reading.js`): once per run, from the texts
      // collected; a one-part run keeps the reading it had.
      const reading = ctx.prefetch
        ? null
        : onePart
          ? (base?.profile?.businessReading ?? null)
          : await readBusinessOf(ctx, profile, google, sources, base?.profile?.businessReading ?? null)
      if (reading) profile.businessReading = reading
      await fenced(pool, lease, (db) => saveSnapshotProfile(db, snapshotId, { profile }))
      // A one-source run of another source buys no listing photo.
      if (google && settings.googlePlacesPhotos && wanted(ctx.job, GOOGLE_FACTS_SOURCE))
        return placePhotos(ctx, google)
    },

    async brand(ctx) {
      const { lease, snapshotId, domain, place } = ctx
      const sources = await snapshotSourcesOf(pool, snapshotId)
      const media = (await snapshotMediaOf(pool, snapshotId)).filter((m) => !m.revoked_at)
      const profile = (await snapshotProfileOf(pool, snapshotId))?.profile ?? {}
      const collectedFrom = (pick) =>
        sources.some((r) => pick(r.source) && ['complete', 'partial'].includes(r.status))
      const observe = (origin, pick) => ({
        ...domain.brandFromSocial({
          // The pictures that are the restaurant's own: no icon, map or spacer of its website's markup, and its logo counts
          // three times (the palette of a logo is its brand's colours).
          palette: mergePalettes(brandPictures.filter((m) => pick(m.source))),
          // The chosen logo's own colours, read finer than a photo's: they are the brand's colours and its accent.
          logoPalette,
          bio: profile.bio ?? null,
          name: profile.name ?? place.display_name ?? '',
          avatarUrl: profile.avatarUrl ?? null
        }),
        origin
      })
      const isWebsite = (s) => s === 'website'
      // Google listing photos are visitors' shots, not the restaurant's own: no part of its brand colours.
      const isSocial = (s) => SOCIAL_SOURCES.includes(s)
      const held = ctx.place.current_snapshot_id
        ? ((await snapshotProfileOf(pool, ctx.place.current_snapshot_id))?.brand?.logoResearch ?? null)
        : null
      const found = await findLogo(ctx, { media, sources, name: profile.name ?? place.display_name }, held)
      // Nothing new found: the research on record stays as it is, its vision bill included (e2e dev 24/10/2026).
      const logoResearch = sameLogoFindings(found, held) ? held : found
      const logoId = logoResearch?.chosen?.mediaId ?? null
      const brandPictures = media
        .filter((m) => !mediaJunk(m) || m.id === logoId)
        .flatMap((m) => (m.id === logoId ? [m, m, m] : [m]))
      const logoPalette = logoId
        ? await logoPaletteOfStored(
            h.objects,
            media.find((m) => m.id === logoId)
          )
        : null
      const brand = {
        website: collectedFrom(isWebsite) ? observe('website', isWebsite) : null,
        social: collectedFrom(isSocial) ? observe('social', isSocial) : null,
        engine: h.brandEngine,
        // The logo's own state: found (with its source and how it was recognised), none (looked for, not there), or
        // absent (never looked for). The chosen picture's id also stays at `logo`, where the brief reads it.
        ...(logoResearch
          ? { logoResearch, ...(logoResearch.chosen ? { logo: logoResearch.chosen.mediaId } : {}) }
          : {})
      }
      await fenced(pool, lease, (db) => saveSnapshotProfile(db, snapshotId, { brand }))
    }
  }

  /**
   * One paid call of this run through Tracy's ledger: reserved at `maxCents` before `call` runs, settled at
   * that ceiling after (none of these providers answers its own cost), released when `sent(result)` says it
   * never went out. Throws `BudgetExceededError` over a cap, before calling.
   */
  /**
   * The place's logo among its collected pictures (`place-logo.js`), looked at by the assigned vision model. A failure keeps
   * what an earlier run found and never stops the run; only a pause, a budget stop or a lost lease do.
   */
  async function findLogo(ctx, { media, sources, name }, previous) {
    try {
      return await researchLogo({
        media,
        sources,
        previous,
        force: Boolean(ctx.job.force),
        door: ctx.prefetch ? { state: 'unavailable', reason: 'prefetch' } : await h.menuVisionDoor(),
        name,
        image: (c) => logoCandidateImage(h.objects, c),
        charge: (spec, call) =>
          charge(ctx, 'vision', spec.operation, spec.maxCents, call, {
            actualCents: spec.actualCents,
            purpose: 'logo',
            tokens: spec.tokens
          }),
        fetchImpl: h.apiFetch,
        now
      })
    } catch (error) {
      if (controlError(error)) throw error
      log.warn?.('wo logo research failed', { error: error?.message })
      return previous
    }
  }

  /** A one-part run starts by reading the home page again for the logo it points at; no other source is collected. */
  async function refreshLogoHints(ctx) {
    const row = await sourceOf(ctx.snapshotId, 'website')
    if (!row?.ref) return
    try {
      const res = await ctx.domain.fetchLimited(row.ref, {
        ...h.domainDeps,
        maxBytes: 2 * 1024 * 1024,
        timeoutMs: 20_000
      })
      if (!res || res.status !== 200 || res.mime !== 'text/html') return
      const page = ctx.domain.extractPage(new TextDecoder().decode(res.bytes), res.url)
      const logos = (page.logos ?? []).slice(0, 12).map((l) => ({ ...l, sourceUrl: page.url }))
      await fenced(pool, ctx.lease, (db) =>
        db.query(
          `update wo_place_snapshot_source set collected = jsonb_set(coalesce(collected, '{}'::jsonb), '{logos}', $3::jsonb)
           where snapshot_id = $1 and source = $2`,
          [ctx.snapshotId, 'website', JSON.stringify(logos)]
        )
      )
    } catch (error) {
      if (controlError(error)) throw error
      log.warn?.('wo logo hints not refreshed', { error: error?.message })
    }
  }

  /**
   * The Menu of a food place: its files and pages (`menu-file`, `document-text`), then
   * its photos (`menu-photos`, `photo-vision`), each a tracked part with its own row, version and Try again; then
   * `mergeMenuItems`, file dishes first. A part this run does not read keeps its row. A place that is not a food or
   * drink business, with no dish on record, has no menu parts at all. Returns the profile's menu fields.
   */
  async function readMenu(ctx, profile, google, previous) {
    const { job, snapshotId, lease, settings } = ctx
    const fileRow = await sourceOf(snapshotId, MENU_FILE_PART)
    const photoRow = await sourceOf(snapshotId, MENU_PHOTOS_PART)
    const candidates = menuPhotoCandidates(await snapshotMediaOf(pool, snapshotId), {
      graphic: ctx.domain?.looksGraphic
    })
    const legacy = previous?.menuItems ?? []
    const heldItems = [...(fileRow?.collected?.items ?? []), ...(photoRow?.collected?.items ?? []), ...legacy]
    const menuPhotos = candidates.filter((m) => m.category === 'menu').length
    if (!menuApplicable({ google, profile, items: heldItems, menuPhotos }))
      return { menuPhotoStatus: 'not_applicable' }
    const order = resolveProviderOrder(settings, 'menu-items').order
    const again = againParts(job)
    // Links a search or Google Maps named are not the place's own website: they rank below it and stay unverified.
    const searched = new Set(
      (profile.menus ?? []).filter((m) => ['search', GOOGLE_MAPS_SOURCE].includes(m.source)).map((m) => m.url)
    )
    const save = (part, data, version) =>
      fenced(pool, lease, (db) => collected(db, snapshotId, part, { ref: null, ...data }, at(), version))
    const skip = (part, row, reason, coverage) =>
      fenced(pool, lease, (db) =>
        tried(db, snapshotId, part, row, { status: 'skipped', reason, coverage }, at())
      )

    let file = fileRow
    const urls = [...new Set((profile.menus ?? []).map((m) => m?.url).filter(Boolean))].sort()
    const heldUrls = [...(fileRow?.collected?.menus ?? [])].sort()
    if (order.includes('document-text') && wanted(job, MENU_FILE_PART)) {
      const dueNow = due(job, MENU_FILE_PART, fileRow, MENU_FILE_VERSION)
      // An ordinary run reads links it has not read yet (free); a Research again run never adds a part.
      const changed = !again && urls.join('\n') !== heldUrls.join('\n')
      if (dueNow || changed) {
        if (!urls.length) await skip(MENU_FILE_PART, fileRow, 'not_found', { version: MENU_FILE_VERSION })
        else {
          const docs = await menuItemsForProfile({
            domain: ctx.domain,
            profile,
            previous: dueNow
              ? null
              : {
                  menus: heldUrls.map((url) => ({ url })),
                  menuItems: fileRow?.collected?.items,
                  menuReads: fileRow?.collected?.reads
                },
            force: dueNow,
            deps: h.domainDeps,
            now,
            log,
            renderers: menuRenderers(ctx),
            rethrow: (e) => e instanceof BudgetExceededError
          })
          const reads = docs.menuReads ?? []
          if (reads.length && reads.some((r) => r.status === 'complete'))
            await save(
              MENU_FILE_PART,
              {
                status: reads.every((r) => r.status === 'complete') ? 'complete' : 'partial',
                coverage: { version: MENU_FILE_VERSION, read: reads.length },
                collected: { menus: urls, items: docs.menuItems ?? [], reads }
              },
              MENU_FILE_VERSION
            )
          else
            await fenced(pool, lease, (db) =>
              tried(
                db,
                snapshotId,
                MENU_FILE_PART,
                fileRow,
                {
                  status: 'failed',
                  // A menu drawn by script is missing data, not a broken read (`menu-reader.mjs` `needs_render`).
                  reason:
                    reads.length && reads.every((r) => r.status === 'needs_render')
                      ? 'needs_render'
                      : 'read_failed',
                  coverage: { version: MENU_FILE_VERSION }
                },
                at()
              )
            )
        }
        file = await sourceOf(snapshotId, MENU_FILE_PART)
      }
    }

    let photos = photoRow
    let photoStatus = previous?.menuPhotoStatus ?? photoRow?.collected?.reading?.status ?? null
    const limit = settings.menuPhotosPerPlace ?? MENU_PHOTOS_PER_PLACE
    // A one-part run of another part, or a Research again run that did not accept this one, leaves it as it is.
    const entry = (job.again_plan?.run ?? []).find((r) => r.part === MENU_PHOTOS_PART) ?? null
    const photosWanted = wanted(job, MENU_PHOTOS_PART) && (!again || Boolean(entry))
    if (photosWanted) {
      const door = order.includes('photo-vision') && limit > 0 ? await h.menuVisionDoor() : null
      if (!door || door.state !== 'ready') {
        photoStatus = door ? door.state : 'switched_off'
        await skip(MENU_PHOTOS_PART, photoRow, photoStatus, { limit })
      } else {
        const out = await readPhotos(ctx, profile, {
          candidates,
          held: photoRow?.collected ?? null,
          limit,
          door,
          force: Boolean(job.force),
          manual: forced(job, MENU_PHOTOS_PART) || Boolean(entry),
          only: entry?.photos ?? null
        })
        if (out) photoStatus = out.status
        if (out?.collected) {
          const same =
            photoRow?.collector_version === out.version &&
            JSON.stringify(photoRow?.collected?.photos ?? null) === JSON.stringify(out.collected.photos)
          if (!same)
            await save(
              MENU_PHOTOS_PART,
              {
                status: out.status === 'complete' ? 'complete' : 'partial',
                coverage: { version: out.version, limit, read: out.reading?.calls ?? 0 },
                collected: out.collected
              },
              out.version
            )
        } else if (out?.status === 'no_photos' && !photoRow?.collected_at)
          await skip(MENU_PHOTOS_PART, photoRow, 'not_found', { limit })
        photos = await sourceOf(snapshotId, MENU_PHOTOS_PART)
      }
    }

    // A place researched before the two parts keeps the dishes its profile held until a part reads them.
    const fileItems = file?.collected_at
      ? (file.collected?.items ?? [])
      : legacy.filter((i) => i?.source?.kind !== 'photo')
    const fileReads = file?.collected_at
      ? (file.collected?.reads ?? [])
      : (previous?.menuReads ?? []).filter((r) => r?.kind !== 'photo')
    const photoItems = photos?.collected_at
      ? (photos.collected?.items ?? [])
      : legacy.filter((i) => i?.source?.kind === 'photo')
    return menuFieldsOf({
      docs: {
        ...(fileItems.length ? { menuItems: fileItems } : {}),
        ...(fileReads.length ? { menuReads: fileReads } : {})
      },
      photos: {
        status: photoStatus,
        items: photoItems,
        reads: photos?.collected_at ? (photos.collected?.reads ?? []) : [],
        reading: photos?.collected?.reading ?? null
      },
      searched
    })
  }

  /** The reading step of the profile stage: the bio, posts and reviews of this run's sources, read once. */
  async function readBusinessOf(ctx, profile, google, sources, held) {
    const posts = sources
      .filter((s) => SOURCES.includes(s.source) && s.collected_at)
      .flatMap((s) => (s.collected?.posts ?? []).map((p) => ({ source: s.source, ...p })))
    const reviews = [
      ...(Array.isArray(google?.reviews) ? google.reviews.map((r) => ({ ...r, source: 'google' })) : []),
      ...Object.entries(profile.reviewSources ?? {}).flatMap(([source, group]) =>
        (group?.reviews ?? []).map((r) => ({ ...r, source }))
      )
    ]
    return readBusiness({
      bio: profile.bio ?? null,
      posts,
      reviews,
      name: profile.name ?? google?.name ?? null,
      trade: google ? tradeOfPlace({ primaryType: google.primaryType, types: google.types }) : null,
      // What the sub-trade may quote besides the texts: Google's types and each social profile's own category.
      googleTypes: google ? [google.primaryType, ...(Array.isArray(google.types) ? google.types : [])] : [],
      categories: sources
        .filter((s) => SOURCES.includes(s.source) && s.collected_at)
        .map((s) => ({ source: s.source, text: s.collected?.profile?.category }))
        .filter((c) => typeof c.text === 'string' && c.text.trim()),
      door: await h.businessReadingDoor(),
      held,
      charge: (spec, call) =>
        charge(ctx, BUSINESS_READING_DOOR, spec.operation, spec.maxCents, call, {
          actualCents: spec.actualCents,
          purpose: BUSINESS_READING_PURPOSE,
          tokens: spec.tokens
        }),
      fetchImpl: h.apiFetch,
      now,
      log
    })
  }

  /** The menu photos of this snapshot read by the assigned vision model (`menu-photo-reading.js`); never throws on a model failure. */
  async function readPhotos(ctx, profile, { candidates, held, limit, door, force, manual, only }) {
    try {
      return await readMenuPhotos({
        photos: candidates,
        held,
        limit,
        force,
        manual,
        only,
        door,
        image: (row) => menuPhotoImage(h.objects, row),
        charge: (spec, call) =>
          charge(ctx, 'vision', spec.operation, spec.maxCents, call, {
            actualCents: spec.actualCents,
            purpose: 'menu-photos',
            tokens: spec.tokens
          }),
        country: countryOf(profile),
        fetchImpl: h.apiFetch,
        now
      })
    } catch (error) {
      if (controlError(error)) throw error
      log.warn?.('wo menu photo reading failed', { error: error?.message })
      return null
    }
  }

  function charge(
    ctx,
    provider,
    operation,
    maxCents,
    call,
    { requestKey = null, sent = () => true, actualCents, purpose = null, tokens } = {}
  ) {
    if (ctx.prefetch) throw new Error('Paid prefetch is disabled')
    return h.chargeable(
      {
        provider,
        operation,
        maxCents,
        ...(actualCents ? { actualCents } : {}),
        ...(tokens ? { tokens } : {}),
        ...(purpose ? { purpose } : {}),
        payer: payerOfPlaceJob(ctx.job),
        placeId: ctx.place.id,
        jobId: ctx.job.id,
        requestKey,
        prefetchCampaignId: ctx.job.prefetch_campaign_id ?? null,
        expectedLeaseToken: ctx.lease.token
      },
      async ({ notSent }) => {
        const result = await call()
        if (!sent(result)) notSent()
        return result
      }
    )
  }

  /** The place as `mergeProfile` reads an opportunity: its identity, an empty candidate, Google's name. */
  function placeAsOpportunity(ctx, google) {
    return {
      id: ctx.place.id,
      provider: ctx.identity?.source ?? 'place',
      provider_id: ctx.identity?.external_id ?? null,
      candidate: ctx.seed ?? {},
      name: typeof google?.name === 'string' ? google.name : null,
      branch: null
    }
  }

  const placeOwner = (ctx) => ({
    fields: { placeId: ctx.place.id, jobId: ctx.job.id },
    keyPrefix: `places/${ctx.place.id}`,
    shared: true
  })

  async function placeMediaByUrl(placeId) {
    // Media of places merged into this one count as known: shown again, not downloaded again.
    const { rows } = await pool.query(
      `select id, source_url from wo_place_media
       where place_id = $1 or place_id in (select id from wo_place where merged_into = $1)`,
      [placeId]
    )
    return new Map(rows.map((r) => [r.source_url, r.id]))
  }

  /**
   * Facebook photos stored at feed size whose public page carries the original (`facebook-photos.mjs`): the
   * original is stored as a new row and the snapshot shows it instead of the feed copy, which stays as it was.
   */
  async function upgradeFacebook(ctx, owner, known, shown) {
    const { lease, snapshotId, domain } = ctx
    if (typeof domain.upgradeFacebookPhotos !== 'function') return 0
    const row = await sourceOf(snapshotId, 'facebook')
    const items = row?.collected?.media
    if (!Array.isArray(items) || items.length === 0) return 0
    const pages = await domain.upgradeFacebookPhotos(items, h.domainDeps)
    if (!pages) return 0
    let swapped = 0
    for (const m of items) {
      const feedCopy = typeof m.fallbackUrl === 'string' ? known.get(m.fallbackUrl) : null
      if (!feedCopy || !shown.has(feedCopy) || known.has(m.url)) continue
      const record = await h.mediaRecord(domain, owner, { ...m, source: 'facebook' })
      if (record.status !== 'stored') continue
      const id = await fenced(pool, lease, async (db) => {
        const kept = await keepMedia(db, snapshotId, record)
        if (kept !== feedCopy)
          await db.query('delete from wo_place_snapshot_media where snapshot_id = $1 and media_id = $2', [
            snapshotId,
            feedCopy
          ])
        return kept
      })
      known.set(m.url, id)
      shown.add(id)
      if (id !== feedCopy) {
        shown.delete(feedCopy)
        swapped += 1
      }
    }
    const before = row.coverage?.photoPages ?? {}
    const photoPages = {
      tried: (before.tried ?? 0) + pages.tried,
      upgraded: (before.upgraded ?? 0) + pages.upgraded,
      ...(pages.skipped ? { skipped: pages.skipped } : {})
    }
    await fenced(pool, lease, (db) =>
      db.query(
        `update wo_place_snapshot_source set coverage = $3::jsonb, collected = $4::jsonb
         where snapshot_id = $1 and source = $2`,
        [
          snapshotId,
          'facebook',
          JSON.stringify({ ...row.coverage, photoPages }),
          JSON.stringify(row.collected)
        ]
      )
    )
    return swapped
  }

  /** Photos of the Google listing (`googlePlacesPhotos` on), stored as place media with their authors' credit. */
  async function placePhotos(ctx, googlePlace) {
    const { lease, snapshotId, domain, keys, place } = ctx
    const known = await placeMediaByUrl(place.id)
    const photos = (googlePlace.photos ?? []).slice(0, h.placePhotosMax)
    for (const [i, photo] of photos.entries()) {
      const held = known.get(`${GOOGLE_FACTS_SOURCE}:${photo.name}`)
      if (held) {
        await fenced(pool, lease, (db) => show(db, snapshotId, held))
        continue
      }
      if (await ctx.pausePoint({ placePhotos: { done: i, total: photos.length } })) return ctx.stopOutcome
      let got
      try {
        got = await charge(ctx, 'google', 'place-photo', ceilingCents('google', 'place-photo'), () =>
          domain.fetchPlacePhoto(photo.name, {
            ...h.domainDeps,
            googleKey: keys.google,
            attributions: photo.attributions ?? [],
            maxBytes: h.imageMax
          })
        )
      } catch (error) {
        if (error instanceof BudgetExceededError) throw error
        log.warn(`[opportunities] place ${place.id}: Google photo skipped (${error?.code ?? 'error'})`)
        continue
      }
      const base = {
        ...placeOwner(ctx).fields,
        kind: 'image',
        category: 'other',
        caption: null,
        alt: null,
        source: GOOGLE_FACTS_SOURCE,
        sourceUrl: got.sourceUrl,
        postId: null,
        postedAt: null
      }
      const record = await h.storedRecord(domain, placeOwner(ctx), base, got.bytes, () => null)
      if (!record) continue
      record.credit = { provider: 'Google', authors: got.attributions ?? [] }
      await fenced(pool, lease, (db) => keepMedia(db, snapshotId, record))
    }
    return null
  }

  return { run }
}

/** A snapshot row for `source`, naming `ref` once (an existing row keeps its own ref and state). */
async function ensureSource(db, snapshotId, source, ref) {
  await db.query(
    `insert into wo_place_snapshot_source (snapshot_id, source, ref) values ($1, $2, $3)
     on conflict (snapshot_id, source) do update set ref = coalesce(wo_place_snapshot_source.ref, excluded.ref)`,
    [snapshotId, source, ref]
  )
}

/**
 * A successful collection: the data, and `collected_at` = `attempted_at` = `at`. Stamped from the runner's
 * clock, the one `sourceDue`/`snapshotFresh` judge them by, never the database's `now()`.
 */
async function collected(
  db,
  snapshotId,
  source,
  { ref, status, reason, cursor, coverage, collected: data },
  at,
  collectorVersion = COLLECTOR_VERSION
) {
  await db.query(
    `insert into wo_place_snapshot_source (snapshot_id, source, ref, status, reason, cursor, coverage, collected,
       collected_at, attempted_at, last_error, collector_version)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $10, $10, null, $9)
     on conflict (snapshot_id, source) do update set ref = excluded.ref, status = excluded.status,
       reason = excluded.reason, cursor = excluded.cursor, coverage = excluded.coverage,
       collected = excluded.collected, collected_at = excluded.collected_at, attempted_at = excluded.attempted_at,
       last_error = null, collector_version = excluded.collector_version`,
    [
      snapshotId,
      source,
      ref ?? null,
      status,
      reason ?? null,
      cursor ? JSON.stringify(cursor) : null,
      coverage ? JSON.stringify(coverage) : null,
      JSON.stringify(data ?? {}),
      collectorVersion,
      at
    ]
  )
}

/**
 * A try that collected nothing: a source that was collected before keeps its data and `collected_at` and
 * records the failure; one never collected takes the failure as its state.
 */
async function tried(db, snapshotId, source, row, { status, reason, coverage }, at) {
  const failure = JSON.stringify({
    status,
    reason: reason ?? null,
    at: at.toISOString(),
    ...(coverage?.version ? { version: coverage.version } : {})
  })
  if (row?.collected_at) {
    await db.query(
      `update wo_place_snapshot_source set attempted_at = $4, last_error = $3::jsonb where snapshot_id = $1 and source = $2`,
      [snapshotId, source, failure, at]
    )
    return
  }
  await db.query(
    `insert into wo_place_snapshot_source (snapshot_id, source, ref, status, reason, coverage, attempted_at, last_error)
     values ($1, $2, $3, $4, $5, $6::jsonb, $8, $7::jsonb)
     on conflict (snapshot_id, source) do update set status = excluded.status, reason = excluded.reason,
       cursor = null, coverage = excluded.coverage, attempted_at = excluded.attempted_at, last_error = excluded.last_error`,
    [
      snapshotId,
      source,
      row?.ref ?? null,
      status,
      reason ?? null,
      JSON.stringify(coverage ?? { fetched: 0 }),
      failure,
      at
    ]
  )
}

async function saveSnapshotProfile(db, snapshotId, { profile, brand }) {
  await db.query(
    `insert into wo_place_snapshot_profile (snapshot_id, profile, brand) values ($1, coalesce($2::jsonb, '{}'::jsonb), $3::jsonb)
     on conflict (snapshot_id) do update set profile = coalesce($2::jsonb, wo_place_snapshot_profile.profile),
       brand = coalesce($3::jsonb, wo_place_snapshot_profile.brand)`,
    [snapshotId, profile ? JSON.stringify(profile) : null, brand ? JSON.stringify(brand) : null]
  )
}

async function show(db, snapshotId, mediaId) {
  await db.query(
    'insert into wo_place_snapshot_media (snapshot_id, media_id) values ($1, $2) on conflict do nothing',
    [snapshotId, mediaId]
  )
}

/** Store a place media row once per sha256 and show it in the snapshot. @returns {Promise<string>} its id */
async function keepMedia(db, snapshotId, m) {
  const provider = [TRIPADVISOR_SOURCE, GOOGLE_MAPS_SOURCE].includes(m.source)
    ? (m.provider ?? 'tripadvisor')
    : m.source === GOOGLE_FACTS_SOURCE
      ? 'google'
      : SOCIAL_SOURCES.includes(m.source)
        ? 'apify'
        : 'website'
  const { rows } = await db.query(
    `insert into wo_place_media (place_id, job_id, sha256, object_key, status, reason, mime, bytes, width, height,
       duration_s, kind, category, palette, source, source_url, post_id, posted_at, caption, alt, dhash, labels,
       provider, credit)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23,$24::jsonb)
     on conflict (place_id, sha256) do nothing returning id`,
    [
      m.placeId,
      m.jobId,
      m.sha256,
      m.objectKey ?? null,
      m.status,
      m.reason ?? null,
      m.mime ?? null,
      m.bytes ?? null,
      m.width ?? null,
      m.height ?? null,
      m.durationS ?? null,
      m.kind,
      m.category ?? null,
      m.palette ? JSON.stringify(m.palette) : null,
      m.source,
      m.sourceUrl,
      m.postId ?? null,
      m.postedAt ?? null,
      m.caption ?? null,
      m.alt ?? null,
      m.dhash ?? null,
      m.labels ? JSON.stringify(m.labels) : null,
      provider,
      m.credit ? JSON.stringify(m.credit) : null
    ]
  )
  const id =
    rows[0]?.id ??
    (
      await db.query('select id from wo_place_media where place_id = $1 and sha256 = $2', [
        m.placeId,
        m.sha256
      ])
    ).rows[0].id
  await show(db, snapshotId, id)
  return id
}
