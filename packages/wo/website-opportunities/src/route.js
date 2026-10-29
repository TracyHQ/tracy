import { mediaJunk } from './media-junk.js'
import { reviewSourcesRequired } from './tripadvisor-research.js'
import { findResearchOf, withResearch } from './find-research.js'
/**
 * Website Opportunities doors (contracts spec §4). Every door reads the
 * signed-in person from the session and touches only that account's rows: another account's
 * opportunity, job, media, revision or build answers 404, exactly like one that does not exist.
 *
 * 🔒 THE SWITCH `website-opportunities` GATES WHAT STARTS WORK, not what was made. Off (or unreadable:
 * `uiSwitchOn` fails closed) → 404 `FEATURE_OFF` on settings, capabilities, search, create, research,
 * resume, revision and build; the person's own lists, details, media, revisions and builds stay
 * readable, and cancel still stops a job.
 *
 * Cross-domain needs arrive as functions from `app.js` (module graph): `request` (this app's own
 * doors, read by the builder for `POST /api/sites` and `GET /api/templates`), `ensureAccount` and `objects`.
 * Every refusal is `{code, next}`.
 */
import { createHash } from 'node:crypto'
import { Hono } from 'hono'
import { providerRefusalOf, resolveFrom, suggestFrom, suggestInput, suggestSession } from './place-suggest.js'
import { placesCacheFetch, snapToCell } from './places-cache.js'
import { apifySearchDaySpent, newPlacesDaySpent, refundApifySearch } from './apify-budget.js'
import { requireHost } from './host.js'
import { decorateFindCandidates } from './find-ranking.js'
import { withOutreach } from './outreach.js'
import { creditOf, fetchPlacePhotoName, isPhotoName, isPlaceId, placeIdOfPhotoName } from './place-photo.js'
import {
  AgainLimitError,
  againRunsToday,
  cancelRequest,
  NewPlacesLimitError,
  NothingDueError,
  requestResearch,
  resumeRequest
} from './place-requests.js'
import { againPartsOf, againShape, placeAgainPlan } from './research-again.js'
import { placeViewOf, searchRowPages } from './place-view.js'
import { candidateAsRead } from '../domain/candidate-as-read.mjs'
import { cleanProfileLinks, untrackedUrl } from '../domain/social-links.mjs'
import { readPlaceProfile } from './place-profile-read.js'
import { validatePlaceProfile } from '../domain/place-profile.mjs'
import { factDecisions } from '../domain/fact-assessment.mjs'
import { briefFactsOf } from '../domain/brief-facts.mjs'
import {
  FACT_OVERRIDES_MAX,
  KEY_MESSAGE_LABEL_MAX,
  readFactOverride,
  readKeyMessagePicks
} from './owner-fact-picks.js'
import { linkKind } from '../domain/link-kinds.mjs'
import { briefTradeOf } from '../domain/trades.mjs'
import { identityOf } from './places.js'
import { urlKeyOf } from './site-checks.js'
import { SOCIAL_STAT_NETWORKS } from './social-stats.js'
import { SHOWN_SOURCES, SOCIAL_SOURCES, normalizeUrl, refsOfUrls, sourceOfUrl } from './sources.js'
import { createLinkFields, linkRequestOf, mergeListings, saveListingSource } from './link-fields.js'
import { pastedLinkResults, requiresLinkReview } from '../domain/pasted-link-status.mjs'
import {
  activeJobOf,
  claimBulkRequest,
  countMatching,
  countStages,
  decodeCursor,
  finishBulkRequest,
  insertJob,
  insertOpportunity,
  JobActiveError,
  jobOf,
  jobsOfOpportunity,
  latestJobIdsMatching,
  listOpportunities,
  mediaById,
  mediaOf,
  opportunityOf,
  placeMediaOf,
  NAME_PICK_MAX,
  profileOf,
  releaseBulkRequest,
  saveHoursPick,
  saveRatingPick,
  saveFactOverride,
  saveKeyMessagePicks,
  saveReadingPick,
  saveNamePick,
  STAGES,
  sourcesOf
} from './store.js'
import { withNameDecision } from './business-name.js'
import { withHoursDecision } from './business-hours.js'
import { withRatingDecision } from './business-rating.js'
import { withPhoneDecision } from './business-phones.js'
import { readableHours } from '../domain/hours-check.mjs'

export const WO_SWITCH = 'website-opportunities'
const BASE = '/api/website-opportunities'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** The parts of a researched place that can be refreshed alone (`place-jobs.js`, `only_source`): the logo or one source. */
const ONLY_PARTS = ['logo', ...SHOWN_SOURCES]
/** Parts a run collects only with Google, SerpApi or a Tripadvisor provider set up. */
const GOOGLE_PARTS = ['google-places', 'google-maps', 'tripadvisor']
const REQUEST_ID = /^[A-Za-z0-9._:-]{8,100}$/
// Google Maps through Apify takes ~15 s for 40 places; an OSM fallback after it needs headroom.
const SEARCH_TIMEOUT_MS = 90_000
const SEARCHES_PER_HOUR = 60
const APPROX_LOCATIONS_PER_HOUR = 30
// A 3 s poll while ~20 sites are measured is ~50 calls a search; the door only reads the table and queues.
const SITE_CHECK_CALLS_PER_HOUR = 600
const PHOTOS_PER_HOUR = 600
// One call per debounced keystroke (≥ 3 characters, 300 ms apart) plus the pick, suggest and resolve together.
const SUGGEST_CALLS_PER_HOUR = 300
const SITE_CHECK_URLS_MAX = 60
// Social stats are read and queued, never fetched in the request; a poll every ≥ 10 s fits the hour.
const SOCIAL_STAT_CALLS_PER_HOUR = 60
const SOCIAL_STAT_HANDLES_MAX = 40
// "Get social stats" on one row: its own pages, at most one per network.
const SOCIAL_STAT_FORCE_MAX = 4
/** Google's own ceiling for a Places search (Find spec §2). */
const MAX_RADIUS_M = 50_000
/** A search's depth: how many places Text Search pages through (20 a page, 60 at most). */
const DEPTH_LIMITS = Object.freeze({ quick: 20, standard: 60 })
/** Up to this radius a search is quick by default; wider areas page to the standard depth. */
const QUICK_RADIUS_M = 3000
const PHOTO_WIDTH = Object.freeze({ min: 160, max: 1600, default: 480 })
const PHOTO_MAX_BYTES = 8 * 1024 * 1024
const PRICE_LEVELS = [0, 1, 2, 3, 4]

/**
 * @param {{
 *   config: { sessionSecret: string, origin: string, apifyToken?: string | null, googleApiKey?: string | null },
 *   pool: import('pg').Pool,
 *   request: (path: string, init?: RequestInit) => Promise<Response>,
 *   ensureAccount: (pool: import('pg').Pool, email: string) => Promise<{ id: string }>,
 *   loadDomain: () => Promise<any>,
 *   objects: {
 *     get: (key: string) => Promise<Response | null>,
 *     publicUrl: (key: string) => Promise<string | null>
 *   } | null,
 *   sessionAhead?: (site: any, email: string) => Promise<string | null>,
 *   demoQa?: (site: any, payload: object) => Promise<{ok: boolean, status: number, body: any}>,
 *   siteChecks?: { request: Function, lookup: Function } | null,
 *   socialStats?: { request: Function, lookup: Function } | null,
 *   fetchImpl?: typeof fetch, resolve?: Function, now?: () => number
 * }} deps
 *   `siteChecks` is `createSiteChecks` (`site-checks.js`): a search reads its cache, the site-checks
 *   door fills it. `socialStats` is `createSocialStats` (`social-stats.js`), read and filled the same way.
 */
function hostOf(url) {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

export function websiteOpportunitiesRoutes(deps) {
  const { config, pool, ensureAccount, loadDomain, objects } = deps
  const host = requireHost(deps.host, [
    'json',
    'requireViewer',
    'clientIp',
    'overLimitOrClosed',
    'refundOne',
    'uiSwitchOn',
    'principalOf',
    'displayNameOf'
  ])
  const { json, requireViewer, clientIp, overLimitOrClosed, uiSwitchOn, principalOf } = host
  // The host's runtime (`readWoRuntime` with its vision door), the one its executor and /ops read: keys and settings
  // from `/ops/wo` (env fallback), read per request so a change applies at once.
  const runtime = deps.runtime
  if (typeof runtime !== 'function') throw new TypeError('websiteOpportunitiesRoutes needs deps.runtime')
  const siteChecks = deps.siteChecks ?? null
  const socialStats = deps.socialStats ?? null
  const now = deps.now ?? Date.now
  // Google Places answers come from the cache both Finds share (`opportunities/places-cache.js`); every other
  // host goes straight to the network.
  const placesFetch = placesCacheFetch({
    fetchImpl: deps.fetchImpl ?? fetch,
    pool,
    now,
    days: async () => (await runtime()).settings.placesCacheDays
  })
  const domainDeps = () => ({
    fetch: placesFetch,
    ...(deps.resolve ? { resolve: deps.resolve } : {}),
    ...(config.overpassUrl ? { overpassEndpoints: [config.overpassUrl] } : {}),
    now
  })
  const origin = String(config.origin ?? '').replace(/\/+$/, '')
  // `WO_SHARED_RESEARCH` (config.js): a new research request is served by its place's job.
  const shared = config.woSharedResearch !== false
  const app = new Hono()
  // No proxy in front of a laptop stand, so its own egress address is the person's network.
  const localStand = /^(localhost|127\.0\.0\.1|.+\.test|.+\.localhost)$/i.test(hostOf(origin))

  const refuse = (c, status, code, next, extra = {}) => json(c, { code, next, ...extra }, status)
  const notFound = (c, what) => refuse(c, 404, 'NOT_FOUND', `Reload: this ${what} is gone or is not yours.`)
  const jobActive = (c, job) =>
    refuse(c, 409, 'JOB_ACTIVE', 'Wait for the running research, or cancel it first.', {
      job: job ? jobShape(job) : null
    })
  const featureOn = () => uiSwitchOn(pool, WO_SWITCH).catch(() => false)
  const featureOff = (c) =>
    refuse(c, 404, 'FEATURE_OFF', 'Website Opportunities is turned off on this deployment.')
  /** `{email, accountId}` (accountId null for a session with no account yet), or a Response. */
  async function caller(c, { create = false } = {}) {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const accountId = create ? (await ensureAccount(pool, email)).id : await principalOf(pool, email)
    return { email, accountId }
  }

  async function domainOr(c) {
    try {
      return await loadDomain()
    } catch (error) {
      const code = error?.code === 'DOMAIN_INCOMPATIBLE' ? 'DOMAIN_INCOMPATIBLE' : 'DOMAIN_UNAVAILABLE'
      return refuse(
        c,
        503,
        code,
        'The Website Opportunities plugin on this server is missing or out of date.'
      )
    }
  }

  async function body(c) {
    return c.req.json().catch(() => null)
  }

  const builder = deps.builder ?? null
  // The builder's half of a row's stage; without it the stage reads research alone (`opportunities/wo-journey.js`).
  const demoJourney = builder?.demoJourneySql ?? null

  // ── Settings ──────────────────────────────────────────────────────────────────────────────
  app.get(`${BASE}/settings`, async (c) => {
    const who = await caller(c)
    if (who instanceof Response) return who
    if (!(await featureOn())) return featureOff(c)
    const domain = await domainOr(c)
    if (domain instanceof Response) return domain
    // No builder: nothing here builds a demo, so there is no CMS to choose.
    return json(c, builder ? await builder.settingsOf(domain, who.accountId) : {})
  })

  app.put(`${BASE}/settings`, async (c) => {
    const who = await caller(c, { create: true })
    if (who instanceof Response) return who
    if (!(await featureOn())) return featureOff(c)
    const domain = await domainOr(c)
    if (domain instanceof Response) return domain
    if (!builder)
      return refuse(c, 404, 'NO_BUILDER', 'This deployment builds no demos: there is nothing to set.')
    const saved = await builder.saveSettings(domain, who.accountId, await body(c))
    return json(c, saved.body, saved.status)
  })

  // ── Capabilities ──────────────────────────────────────────────────────────────────────────
  app.get(`${BASE}/capabilities`, async (c) => {
    const who = await caller(c)
    if (who instanceof Response) return who
    if (!(await featureOn())) return featureOff(c)
    const domain = await domainOr(c)
    if (domain instanceof Response) return domain
    const { keys, settings } = await runtime()
    const connectors = domain.connectorsFor({ APIFY_TOKEN: keys.apify ?? undefined })
    const sources = {}
    for (const [source, connector] of Object.entries(connectors))
      sources[source] = connector.available
        ? { available: true }
        : { available: false, reason: connector.reason ?? 'unsupported' }
    return json(c, {
      contract: domain.CONTRACT,
      sources,
      discovery: { 'google-places': Boolean(keys.google), 'google-maps': Boolean(keys.apify), osm: true },
      kinds: kindsOf(domain),
      trades: tradesOf(domain),
      cuisines: cuisinesOf(domain),
      // The Build form's choices; no builder, no CMS to build on.
      templates: builder ? await builder.templateChoicesOf(settings) : {},
      // The browser key runs Maps JavaScript in the customer's page: public by design, referrer-restricted.
      maps: { browserKey: settings.googleMapsBrowserKey || null },
      // Which social pages get numbers here (`social-stats.js`): RapidAPI for every network, the
      // YouTube Data API on the Google key, Apify as the last tier. `dailyCap` is per account.
      socialStats: {
        networks: SOCIAL_STAT_NETWORKS,
        autoLimit: settings.socialStatsAutoLimit,
        dailyCap: settings.socialStatsPerAccountPerDay,
        providers: {
          rapidapi: config.woSocialRole !== 'client' && Boolean(keys.rapidapi),
          youtube: config.woSocialRole !== 'client' && Boolean(keys.google),
          apify: config.woSocialRole !== 'client' && Boolean(keys.apify)
        }
      },
      // What a search really runs with: the operator's `gmapsMaxPlaces` lowers each depth (POST /search).
      search: {
        maxRadiusM: MAX_RADIUS_M,
        depths: Object.fromEntries(
          Object.entries(DEPTH_LIMITS).map(([depth, n]) => [depth, Math.min(n, settings.gmapsMaxPlaces)])
        )
      }
    })
  })

  // ── Discovery ─────────────────────────────────────────────────────────────────────────────
  app.post(`${BASE}/search`, async (c) => {
    const who = await caller(c, { create: true })
    if (who instanceof Response) return who
    if (!(await featureOn())) return featureOff(c)
    const domain = await domainOr(c)
    if (domain instanceof Response) return domain
    const b = await body(c)
    const { keys, settings } = await runtime()
    const radiusM = b?.radiusM === undefined ? settings.defaultRadiusM : Number(b.radiusM)
    const byQuery = typeof b?.query === 'string' && b.query.trim() && b.query.length <= 200
    const byPoint =
      Number.isFinite(b?.lat) && Number.isFinite(b?.lon) && Math.abs(b.lat) <= 90 && Math.abs(b.lon) <= 180
    if ((!byQuery && !byPoint) || !Number.isFinite(radiusM) || radiusM <= 0 || radiusM > MAX_RADIUS_M)
      return refuse(
        c,
        400,
        'INVALID_SEARCH',
        `Send {"query": "<city or area>"} or {"lat", "lon"}, with "radiusM" up to ${MAX_RADIUS_M}.`
      )
    if (b.intent !== undefined && b.intent !== 'area' && b.intent !== 'place')
      return refuse(c, 400, 'INVALID_SEARCH', 'Send a supported search intent.')
    if (
      b.intent === 'place' &&
      (!byQuery ||
        (b.placeId !== undefined && !isPlaceId(b.placeId)) ||
        (b.sessionToken !== undefined && (typeof b.sessionToken !== 'string' || b.sessionToken.length > 100)))
    )
      return refuse(c, 400, 'INVALID_SEARCH', 'Send a place name or address with a valid optional place ID.')
    if (b.intent === 'place' && !keys.google)
      return refuse(c, 503, 'CREDENTIAL_MISSING', 'Google Places search is not configured.')
    const options = searchOptions(b, domain, radiusM)
    if (options.error)
      return refuse(
        c,
        400,
        'INVALID_SEARCH',
        `${options.error}: "trade" any|${tradesOf(domain).join('|') || 'food'} (a cuisine or kind means food), "kinds" ⊆ ${kindsOf(domain).join('|') || '(none)'}, "cuisines" ⊆ the capabilities list, "minRating" 0–5, "priceLevels" ⊆ 0–4, "openNow" and "includeChains" booleans, "depth" quick|standard.`
      )
    if (await overLimitOrClosed(pool, `wo:search:${who.accountId}`, SEARCHES_PER_HOUR, now()))
      return refuse(c, 429, 'RATE_LIMITED', 'Wait for the next hour before searching again.')
    // The depth says how far Text Search pages (quick 20, standard 60); the operator's
    // `gmapsMaxPlaces` can only lower that, never raise it past the depth.
    const limit = Math.min(DEPTH_LIMITS[options.depth], settings.gmapsMaxPlaces)
    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(Object.assign(new Error('timeout'), { code: 'SEARCH_TIMEOUT' })),
        SEARCH_TIMEOUT_MS
      )
    })
    try {
      const found = await Promise.race([
        (async () => {
          if (b.intent === 'place') {
            const named = await domain.searchNamedPlaces(
              {
                query: b.query.trim(),
                placeId: b.placeId,
                sessionToken: b.sessionToken,
                limit: Math.min(limit, 20),
                ...options.filters,
                // Any kind of business by name, unless the search is a food one (a cuisine or a food kind).
                anyKind: options.filters.trade !== 'food'
              },
              { ...domainDeps(), googleKey: keys.google }
            )
            if (!named.area)
              return {
                ...named,
                hiddenChains: 0,
                candidates: await decorateCandidates(domain, named.candidates, who.accountId, settings)
              }
            // A geographic Google result retains the existing nearby discovery path.
            b.lat = named.area.lat
            b.lon = named.area.lon
          }
          // A point wins: a picked suggestion sends its own coordinates and its label as `query`.
          const center =
            byPoint || b.intent === 'place'
              ? { label: byQuery ? b.query.trim() : null, lat: b.lat, lon: b.lon }
              : await domain.geocode(b.query.trim(), domainDeps())
          if (!center) return { center: null, candidates: [] }
          // Google Maps runs on Apify and counts against the account's search day; Places does not.
          const chainHasApify = ['auto', 'apify'].includes(settings.mapDiscoveryProvider)
          const paid =
            Boolean(keys.apify) &&
            chainHasApify &&
            !(await apifySearchDaySpent(host, pool, who.accountId, now(), settings.searchRunsPerDay))
          let found
          try {
            found = await domain.discoverRestaurants(
              // Asked around the cache cell's centre, so nearby searches share one kept answer.
              settings.placesCacheDays > 0
                ? { ...snapToCell(center, radiusM, settings.placesCacheCellMeters), radiusM }
                : { lat: center.lat, lon: center.lon, radiusM },
              {
                ...domainDeps(),
                ...(keys.google ? { googleKey: keys.google } : {}),
                ...(paid ? { token: keys.apify } : {}),
                provider: settings.mapDiscoveryProvider,
                limit,
                maxChargeUsd: settings.maxChargeUsdPerRun,
                filters: options.filters
              }
            )
          } finally {
            if (paid && found?.provider !== 'google-maps')
              await refundApifySearch(host, pool, who.accountId, now())
          }
          // Asked from the cache cell's centre: distances again from where this person searched.
          const near = (found.candidates ?? []).map((p) =>
            settings.placesCacheDays > 0 && Number.isFinite(p.lat) && Number.isFinite(p.lon)
              ? { ...p, distanceM: Math.round(domain.distanceM(center, p)) }
              : p
          )
          const unique = domain.dedupeCandidates(near)
          const marked = typeof domain.markChains === 'function' ? domain.markChains(unique) : unique
          // Only a sure chain is hidden; `chainSuspect` (same name twice in this set) stays and is shown.
          const kept = options.includeChains ? marked : marked.filter((cand) => cand.chain !== true)
          const candidates = await decorateCandidates(domain, kept, who.accountId, settings)
          return {
            center,
            provider: found.provider,
            ...(found.fallbackFrom ? { fallbackFrom: found.fallbackFrom } : {}),
            ...(Number.isFinite(found.pages) ? { pages: found.pages } : {}),
            hiddenChains: marked.length - kept.length,
            candidates
          }
        })(),
        timeout
      ])
      if (!found.center && b.intent !== 'place')
        return refuse(c, 404, 'PLACE_NOT_FOUND', 'Try a city or area name the map knows.')
      return json(c, found)
    } catch (error) {
      if (error?.code === 'SEARCH_TIMEOUT')
        return refuse(c, 504, 'SEARCH_TIMEOUT', 'Try a smaller radius: the map provider took too long.')
      return refuse(c, 502, 'DISCOVERY_FAILED', 'The map provider did not answer; try again shortly.')
    } finally {
      clearTimeout(timer)
    }
  })

  /**
   * Each candidate with what this account and this deployment already know about it: `status`
   * (`new` → `seen` once saved → `researched` once a research job completed → `demo` once a site was
   * built), `siteCheck` (the cached verdict on its website, read only — a search never queues one),
   * `socials` (with the pages that check found on the site), `social` (the cached numbers of those
   * pages per network, read only like the site check; null when none is known) and `score` (the
   * domain's opportunity score, `pending` while the check is still owed).
   */
  async function decorateCandidates(domain, candidates, accountId, settings) {
    const researchRows = await findResearchOf(pool, candidates, accountId, builder?.demoFactsOf)
    candidates = candidates.map((candidate, i) => withResearch(candidate, researchRows[i]))
    return decorateFindCandidates({
      domain,
      candidates,
      settings,
      siteChecks,
      socialStats,
      statuses: candidateStatuses(accountId, candidates),
      now
    })
  }

  /** `provider\nproviderId` → status, for the candidates this account already has rows for. */
  async function candidateStatuses(accountId, candidates) {
    const out = new Map()
    if (!accountId || candidates.length === 0) return out
    const byProvider = new Map()
    for (const cand of candidates) {
      if (!byProvider.has(cand.provider)) byProvider.set(cand.provider, [])
      byProvider.get(cand.provider).push(cand.providerId)
    }
    for (const [provider, ids] of byProvider) {
      const { rows } = await pool.query(
        `select o.id, o.provider_id,
           exists (select 1 from wo_job j where j.opportunity_id = o.id and j.kind = 'research' and j.state = 'completed') as researched
         from wo_opportunity o where o.account_id = $1 and o.provider = $2 and o.provider_id = any($3)`,
        [accountId, provider, ids]
      )
      // No builder: nothing here builds, so no candidate reaches `demo`.
      const facts =
        builder && rows.length
          ? await builder.demoFactsOf(
              accountId,
              rows.map((r) => r.id)
            )
          : new Map()
      for (const r of rows)
        out.set(
          `${provider}\n${r.provider_id}`,
          facts.get(r.id)?.built ? 'demo' : r.researched ? 'researched' : 'seen'
        )
    }
    return out
  }

  // ── Site checks ───────────────────────────────────────────────────────────────────────────
  // The background verdict on each candidate's current website (`site-checks.js`): what is known
  // now, and a queue for the rest. A browser polls until nothing it asked for is `queued`; the
  // answer carries checks only — the client scores with the shared domain function.
  app.post(`${BASE}/site-checks`, async (c) => {
    const who = await caller(c, { create: true })
    if (who instanceof Response) return who
    if (!(await featureOn())) return featureOff(c)
    const domain = await domainOr(c)
    if (domain instanceof Response) return domain
    const urls = (await body(c))?.urls
    const valid =
      Array.isArray(urls) &&
      urls.length <= SITE_CHECK_URLS_MAX &&
      urls.every((u) => typeof u === 'string' && u.length <= 2000 && urlKeyOf(u))
    if (!valid)
      return refuse(
        c,
        400,
        'INVALID_URLS',
        `Send {"urls": [<http(s) address>, …]}, at most ${SITE_CHECK_URLS_MAX}, as POST /search answered them.`
      )
    if (await overLimitOrClosed(pool, `wo:checks:${who.accountId}`, SITE_CHECK_CALLS_PER_HOUR, now()))
      return refuse(c, 429, 'RATE_LIMITED', 'Wait for the next hour: site checks are polled too often.')
    if (!siteChecks) return refuse(c, 503, 'CHECKS_UNAVAILABLE', 'Site checks are not configured here.')
    // Only the first `siteChecksAutoLimit` unknown addresses are queued per call (the client sends
    // them by score); the rest answer `not_queued` and are asked again on "Show more".
    const { settings } = await runtime()
    return json(c, { checks: await siteChecks.request(urls, { limit: settings.siteChecksAutoLimit }) })
  })

  // ── Social stats ──────────────────────────────────────────────────────────────────────────
  // Followers and posting dates of a candidate's social pages (`social-stats.js`): what is known
  // now, and a queue for the rest, polled like site checks. Only the first `socialStatsAutoLimit`
  // unknown or stale pages are queued per call (the client sends them by score); `force` (a row's
  // "Get social stats", ≤ 4 pages) queues all it names. The daily caps hold either way.
  app.post(`${BASE}/social-stats`, async (c) => {
    const who = await caller(c, { create: true })
    if (who instanceof Response) return who
    if (!(await featureOn())) return featureOff(c)
    const domain = await domainOr(c)
    if (domain instanceof Response) return domain
    const b = await body(c)
    const handles = b?.handles
    const force = b?.force === undefined ? false : b.force
    const valid =
      Array.isArray(handles) &&
      typeof force === 'boolean' &&
      handles.length <= (force ? SOCIAL_STAT_FORCE_MAX : SOCIAL_STAT_HANDLES_MAX) &&
      handles.every(
        (h) =>
          SOCIAL_STAT_NETWORKS.includes(h?.network) &&
          typeof h.url === 'string' &&
          h.url &&
          h.url.length <= 2000
      )
    if (!valid)
      return refuse(
        c,
        400,
        'INVALID_HANDLES',
        `Send {"handles": [{"network": ${SOCIAL_STAT_NETWORKS.join('|')}, "url": <profile URL>}, …]}, at most ${SOCIAL_STAT_HANDLES_MAX} (${SOCIAL_STAT_FORCE_MAX} with "force": true).`
      )
    if (await overLimitOrClosed(pool, `wo:social-calls:${who.accountId}`, SOCIAL_STAT_CALLS_PER_HOUR, now()))
      return refuse(c, 429, 'RATE_LIMITED', 'Wait for the next hour: social stats are polled too often.')
    if (!socialStats)
      return refuse(c, 503, 'SOCIAL_STATS_UNAVAILABLE', 'Social stats are not configured here.')
    const { settings } = await runtime()
    const stats = await socialStats.request(handles, {
      account: who.accountId,
      limit: force ? Number.POSITIVE_INFINITY : settings.socialStatsAutoLimit,
      force
    })
    return json(c, { stats })
  })

  // ── Place suggestions ─────────────────────────────────────────────────────────────────────
  // The Find box's autocomplete: Google Places Autocomplete (New) limited to areas, then the picked
  // suggestion's point through Place Details (id, name, address, location only). The browser's
  // `session` (a UUID per typing session) groups both into one billed Autocomplete session.
  async function suggestCaller(c) {
    const who = await caller(c)
    if (who instanceof Response) return who
    if (!(await featureOn())) return featureOff(c)
    const domain = await domainOr(c)
    if (domain instanceof Response) return domain
    const asked = suggestSession(c.req.query('session'), c.req.query('lang'))
    if (asked.refusal) return refuse(c, asked.refusal.status, asked.refusal.code, asked.refusal.next)
    return { who, domain, session: asked.session, lang: asked.lang }
  }

  /** The Google key, or the refusal: rate limit first, so a spent hour never reaches Google. */
  async function suggestKey(c, who) {
    if (
      await overLimitOrClosed(pool, `wo:suggest:${who.accountId ?? who.email}`, SUGGEST_CALLS_PER_HOUR, now())
    )
      return refuse(c, 429, 'RATE_LIMITED', 'Type the whole place name and press Search.')
    const { keys } = await runtime()
    if (!keys.google)
      return refuse(c, 503, 'CREDENTIAL_MISSING', 'Ask an admin to save a Google key on /ops/wo.')
    return keys.google
  }

  app.get(`${BASE}/places/suggest`, async (c) => {
    const ctx = await suggestCaller(c)
    if (ctx instanceof Response) return ctx
    const typed = suggestInput(c.req.query('q'))
    if (typed.refusal) return refuse(c, typed.refusal.status, typed.refusal.code, typed.refusal.next)
    if (typed.tooShort) return json(c, { suggestions: [] })
    const key = await suggestKey(c, ctx.who)
    if (key instanceof Response) return key
    try {
      const suggestions = await suggestFrom(
        ctx.domain,
        { input: typed.input, session: ctx.session, lang: ctx.lang },
        {
          ...domainDeps(),
          googleKey: key
        }
      )
      return json(c, { suggestions })
    } catch (error) {
      return providerRefusal(c, error)
    }
  })

  app.get(`${BASE}/places/suggest/:placeId`, async (c) => {
    const ctx = await suggestCaller(c)
    if (ctx instanceof Response) return ctx
    const placeId = c.req.param('placeId')
    if (!isPlaceId(placeId)) return refuse(c, 400, 'INVALID_PLACE_ID', 'Send the placeId of a suggestion.')
    const key = await suggestKey(c, ctx.who)
    if (key instanceof Response) return key
    try {
      const place = await resolveFrom(ctx.domain, placeId, ctx, { ...domainDeps(), googleKey: key })
      if (!place) return refuse(c, 404, 'PLACE_NOT_FOUND', 'Type the place name and press Search.')
      return json(c, place)
    } catch (error) {
      return providerRefusal(c, error)
    }
  })

  // ── Place photo ───────────────────────────────────────────────────────────────────────────
  // The listing's cover photo for the grid, streamed through this server so the browser never holds
  // a Places media URL. Google's terms forbid keeping photo names or bytes beyond the request, so
  // nothing is cached here: the browser keeps it for its session (`max-age=600`), and the client
  // passes the `name` it got from /search (`?name=`); the `:placeId` form looks the name up again
  // through Place Details with the `photos` mask only (`place-photo.js`, the Essentials IDs Only
  // SKU). A name Google no longer honours falls back to that lookup once.
  app.get(`${BASE}/places/photo`, async (c) => {
    const name = c.req.query('name')
    if (!isPhotoName(name))
      return refuse(c, 400, 'INVALID_PHOTO_NAME', 'Send ?name=<photo.name of a google-places candidate>.')
    return servePhoto(c, { name, placeId: placeIdOfPhotoName(name) })
  })

  app.get(`${BASE}/places/:placeId/photo`, async (c) => {
    const placeId = c.req.param('placeId')
    if (!isPlaceId(placeId))
      return refuse(c, 400, 'INVALID_PLACE_ID', 'Send the providerId of a google-places candidate.')
    return servePhoto(c, { name: null, placeId })
  })

  async function servePhoto(c, { name, placeId }) {
    const who = await caller(c)
    if (who instanceof Response) return who
    if (!(await featureOn())) return featureOff(c)
    const domain = await domainOr(c)
    if (domain instanceof Response) return domain
    const asked = Number(c.req.query('w'))
    const w = Math.round(
      Math.min(
        PHOTO_WIDTH.max,
        Math.max(PHOTO_WIDTH.min, Number.isFinite(asked) ? asked : PHOTO_WIDTH.default)
      )
    )
    const { keys } = await runtime()
    if (!keys.google)
      return refuse(c, 503, 'CREDENTIAL_MISSING', 'Ask an admin to save a Google key on /ops/wo.')
    if (await overLimitOrClosed(pool, `wo:photos:${who.accountId}`, PHOTOS_PER_HOUR, now()))
      return refuse(c, 429, 'RATE_LIMITED', 'Wait for the next hour: too many photos were asked for.')
    const lookUp = async () => {
      try {
        return await fetchPlacePhotoName(placeId, {
          googleKey: keys.google,
          fetchLimited: domain.fetchLimited,
          ...domainDeps()
        })
      } catch (error) {
        return providerRefusal(c, error)
      }
    }
    const download = (photoName) =>
      domain.fetchPlacePhoto(photoName, {
        ...domainDeps(),
        googleKey: keys.google,
        maxWidthPx: w,
        maxBytes: PHOTO_MAX_BYTES
      })
    let photo = name ? { name, credit: null } : await lookUp()
    if (photo instanceof Response) return photo
    if (!photo)
      return refuse(c, 404, 'NO_PHOTO', 'Show the placeholder: this listing has no photo on Google.')
    let got
    try {
      got = await download(photo.name)
    } catch (error) {
      // The name the client held may have expired at Google (400/404): look it up once more.
      const expired = name && error?.code === 'PROVIDER_ERROR' && [400, 404].includes(error?.status)
      if (!expired) return providerRefusal(c, error)
      photo = await lookUp()
      if (photo instanceof Response) return photo
      if (!photo)
        return refuse(c, 404, 'NO_PHOTO', 'Show the placeholder: this listing has no photo on Google.')
      try {
        got = await download(photo.name)
      } catch (again) {
        return providerRefusal(c, again)
      }
    }
    const credit = photo.credit ?? creditOf(got.attributions)
    return new Response(got.bytes, {
      status: 200,
      headers: {
        'content-type': got.mime,
        'cache-control': 'private, max-age=600',
        // Google requires the authors' credit wherever the photo is shown (also in /search's
        // `photo.credit`); percent-encoded, since a header cannot carry a name outside Latin-1.
        'x-photo-credit': encodeURIComponent(`${credit ? `${credit} · ` : ''}Google`),
        'x-content-type-options': 'nosniff'
      }
    })
  }

  function providerRefusal(c, error) {
    const r = providerRefusalOf(error)
    return refuse(c, r.status, r.code, r.next)
  }

  // ── Approximate location ──────────────────────────────────────────────────────────────────
  // What "Use my location" falls back to when the browser gives no position: city-level, from the
  // network address, like a map does. Cloudflare's visitor-location headers first (no third party),
  // then a geo-IP lookup of `cf-connecting-ip`; a local stand (no Cloudflare in front) asks about its
  // own public address, which is the person's own network there.
  app.get(`${BASE}/approx-location`, async (c) => {
    const who = await caller(c, { create: true })
    if (who instanceof Response) return who
    if (!(await featureOn())) return featureOff(c)
    const domain = await domainOr(c)
    if (domain instanceof Response) return domain
    const lat = Number(c.req.header('cf-iplatitude'))
    const lon = Number(c.req.header('cf-iplongitude'))
    if (c.req.header('cf-iplatitude') && Number.isFinite(lat) && Number.isFinite(lon)) {
      const country = c.req.header('cf-ipcountry') ?? null
      const label =
        [c.req.header('cf-ipcity'), c.req.header('cf-region'), country].filter(Boolean).join(', ') || null
      return json(c, { lat, lon, label, country, accuracy: 'city', provider: 'cloudflare' })
    }
    if (await overLimitOrClosed(pool, `wo:approx:${who.accountId}`, APPROX_LOCATIONS_PER_HOUR, now()))
      return refuse(c, 429, 'RATE_LIMITED', 'Type a city or area instead.')
    const ip = clientIp(c)
    const place = domain.isLocatableAddress(ip)
      ? await domain.approxLocationOf(ip, domainDeps())
      : localStand
        ? await domain.approxLocationOf(null, domainDeps())
        : null
    if (!place) return refuse(c, 404, 'LOCATION_UNKNOWN', 'Type a city or area instead.')
    return json(c, place)
  })

  // Refresh a restored Find list from stores only: never repeat map discovery or collector work.
  app.post(`${BASE}/find/refresh`, async (c) => {
    const who = await caller(c)
    if (who instanceof Response) return who
    if (!(await featureOn())) return featureOff(c)
    const b = await body(c)
    if (
      !Array.isArray(b?.candidates) ||
      b.candidates.length > 100 ||
      b.candidates.some((row) => !row || typeof row !== 'object')
    )
      return refuse(c, 400, 'INVALID_CANDIDATES', 'Send at most 100 Find candidates.')
    const parsed = b.candidates.map(candidateFields)
    if (parsed.some((row) => !row))
      return refuse(c, 400, 'INVALID_CANDIDATES', 'Send each place identity and name.')
    const domain = await domainOr(c)
    if (domain instanceof Response) return domain
    const { settings } = await runtime()
    return json(c, {
      candidates: await decorateCandidates(
        domain,
        parsed.map((row) => row.candidate),
        who.accountId,
        settings
      )
    })
  })

  // Several links of one business (`link-fields.js`): the create door and Build from my business.
  const linkFields = createLinkFields({ domainDeps, runtime, candidateFields })

  /**
   * One research of an opportunity under a request id, joined to its place's shared research when the place is
   * known (`place-requests.js`). `{job}` when started or already running, `{refusal}` otherwise.
   */
  async function startResearch({ accountId, opp, requestId, force, only, again, parts }) {
    const same = await pool.query('select * from wo_job where account_id = $1 and request_id = $2', [
      accountId,
      requestId
    ])
    if (same.rows[0]) {
      if (same.rows[0].opportunity_id !== opp.id)
        return {
          refusal: {
            status: 409,
            code: 'REQUEST_ID_REUSED',
            next: 'Send a new requestId for another opportunity.'
          }
        }
      return { job: same.rows[0] }
    }
    const active = await activeJobOf(pool, opp.id)
    if (active) return { job: active, active: true }
    if (force !== undefined && typeof force !== 'boolean')
      return {
        refusal: {
          status: 400,
          code: 'INVALID_FORCE',
          next: 'Send "force" as true or false, or leave it out.'
        }
      }
    // `only`: refresh one part of a researched place and nothing else (the Retry of the logo, or of one source's row).
    if (only !== undefined && !ONLY_PARTS.includes(only))
      return {
        refusal: {
          status: 400,
          code: 'INVALID_ONLY',
          next: `Send "only" as one of ${ONLY_PARTS.join(', ')}, or leave it out.`
        }
      }
    if (only !== undefined && !(shared && identityOf(opp.provider, opp.provider_id)))
      return {
        refusal: {
          status: 409,
          code: 'ONLY_UNSUPPORTED',
          next: 'Only a place the server researched for everyone can refresh one part.'
        }
      }
    if (only?.endsWith('-search')) {
      const { keys } = await runtime()
      if (!(keys.scrapecreators || keys.jina || keys.firecrawl))
        return {
          refusal: {
            status: 409,
            code: 'ONLY_UNAVAILABLE',
            next: `${only} needs a web search provider set up on this deployment.`
          }
        }
    }
    if (GOOGLE_PARTS.includes(only) && !(await canCollectGooglePart(opp, only)))
      return {
        refusal: {
          status: 409,
          code: 'ONLY_UNAVAILABLE',
          next: `${only} is not collected for this place on this deployment.`
        }
      }
    if (again !== undefined && typeof again !== 'boolean')
      return {
        refusal: {
          status: 400,
          code: 'INVALID_AGAIN',
          next: 'Send "again" as true or false, or leave it out.'
        }
      }
    if (again && (force === true || only !== undefined))
      return {
        refusal: {
          status: 400,
          code: 'INVALID_AGAIN',
          next: 'Research again looks only at what is due: send it without "force" or "only".'
        }
      }
    if (again && !(shared && identityOf(opp.provider, opp.provider_id)))
      return {
        refusal: {
          status: 409,
          code: 'AGAIN_UNSUPPORTED',
          next: 'Only a place the server researched for everyone can be researched again.'
        }
      }
    // `parts`: Research again limited to those parts ("Read menu again" sends `menu-file` and `menu-photos`).
    const limited = againPartsOf(parts)
    if ('error' in limited || (limited.parts && !again))
      return {
        refusal: {
          status: 400,
          code: 'INVALID_PARTS',
          next: 'error' in limited ? limited.error : 'Send "parts" only with "again": true.'
        }
      }
    let againDeps = null
    if (again) {
      const rt = await runtime()
      againDeps = {
        keys: rt.keys,
        settings: rt.settings,
        domain: await loadDomain().catch(() => null),
        onlyParts: limited.parts
      }
    }
    if (shared && identityOf(opp.provider, opp.provider_id)) {
      try {
        const { job, plan, joined } = await requestResearch(pool, {
          again: againDeps,
          accountId,
          opportunity: opp,
          requestId,
          force: force === true,
          onlySource: only ?? null,
          requiredSources: reviewSourcesRequired(await runtime()),
          now,
          newPlaceAllowed: async () => {
            const { settings } = await runtime()
            return !(await newPlacesDaySpent(
              host,
              pool,
              accountId,
              now(),
              settings.newPlacesPerAccountPerDay
            ))
          }
        })
        if (job.opportunity_id !== opp.id)
          return {
            refusal: {
              status: 409,
              code: 'REQUEST_ID_REUSED',
              next: 'Send a new requestId for another opportunity.'
            }
          }
        return { job: (await jobOf(pool, accountId, job.id)) ?? job, plan, joined }
      } catch (error) {
        if (error instanceof NothingDueError)
          return {
            refusal: {
              status: 409,
              code: 'NOTHING_DUE',
              next: 'Everything about this place is up to date; nothing to look at again yet.',
              extra: { plan: againShape(error.plan) }
            }
          }
        if (error instanceof AgainLimitError)
          return {
            refusal: {
              status: 429,
              code: 'RESEARCH_AGAIN_LIMIT',
              next: 'Come back tomorrow: today’s Research again runs are used up.'
            }
          }
        if (error instanceof NewPlacesLimitError)
          return {
            refusal: {
              status: 429,
              code: 'NEW_PLACES_LIMIT',
              next: 'Come back tomorrow: today’s new places are used up.'
            }
          }
        if (!(error instanceof JobActiveError)) throw error
        return { job: error.job ?? (await activeJobOf(pool, opp.id)), active: true }
      }
    }
    try {
      return { job: (await insertJob(pool, accountId, opp.id, requestId)).row }
    } catch (error) {
      // A research that started between the check and the insert (index `wo_job_one_active`).
      if (error?.code !== '23505' || error?.constraint !== 'wo_job_one_active') throw error
      return { job: await activeJobOf(pool, opp.id), active: true }
    }
  }

  // ── Opportunities ─────────────────────────────────────────────────────────────────────────
  app.post(BASE, async (c) => {
    const who = await caller(c, { create: true })
    if (who instanceof Response) return who
    if (!(await featureOn())) return featureOff(c)
    const domain = await domainOr(c)
    if (domain instanceof Response) return domain
    const b = await body(c)
    let fields
    if (b?.candidate && typeof b.candidate === 'object') {
      fields = candidateFields(b.candidate)
      if (!fields)
        return refuse(c, 400, 'INVALID_CANDIDATE', 'Send a candidate exactly as POST /search answered it.')
    } else {
      const asked = linkRequestOf(b)
      if (!asked)
        return refuse(
          c,
          400,
          'INVALID_REQUEST',
          'Send {"candidate": {...}}, {"links": ["https://…", …]} or {"url": "https://…"}.'
        )
      if (asked.error) return refuse(c, asked.error.status, asked.error.code, asked.error.next)
      const made = await linkFields(domain, asked)
      if (made.refusal) {
        const { status, code, next, extra } = made.refusal
        return refuse(c, status, code, next, extra)
      }
      const { row, created } = await insertOpportunity(pool, who.accountId, made.fields)
      await saveListingSource(pool, row.id, made.listings)
      return json(c, { opportunity: opportunityShape(row), links: made.links }, created ? 201 : 200)
    }
    const { row, created } = await insertOpportunity(pool, who.accountId, fields)
    return json(c, { opportunity: opportunityShape(row) }, created ? 201 : 200)
  })

  app.get(BASE, async (c) => {
    const who = await caller(c)
    if (who instanceof Response) return who
    const query = listQuery(c.req.query())
    if ('error' in query) return refuse(c, 400, query.error, query.next)
    // No new parameter → the old answer, whole list, for a client on a host not yet rebuilt.
    if (!query.paged) {
      if (!who.accountId) return json(c, { opportunities: [] })
      const { rows } = await listOpportunities(pool, who.accountId, { demoJourney })
      return json(c, {
        opportunities: await withOutreach(
          pool,
          who.accountId,
          await scoredRows(who.accountId, await listedRows(who.accountId, rows)),
          host
        )
      })
    }
    if (!who.accountId)
      return json(c, { opportunities: [], counts: emptyCounts(), nextCursor: null, total: 0 })
    const { stage, attention, q, cursor, limit, ids } = query
    const [{ rows, nextCursor }, counts, total] = await Promise.all([
      listOpportunities(
        pool,
        who.accountId,
        ids ? { ids, demoJourney } : { stage, attention, q, cursor, limit, demoJourney }
      ),
      countStages(pool, who.accountId, { q, demoJourney }),
      ids ? null : countMatching(pool, who.accountId, { stage, attention, q, demoJourney })
    ])
    const opportunities = await withOutreach(
      pool,
      who.accountId,
      await scoredRows(who.accountId, await listedRows(who.accountId, rows)),
      host
    )
    return json(c, { opportunities, counts, nextCursor, total: total ?? rows.length })
  })

  /** Listed rows in their answer shape, with the builder's demo columns when this deployment builds. */
  async function listedRows(accountId, rows) {
    const demos = builder
      ? await builder.listedDemoOf(
          accountId,
          rows.map((r) => r.id)
        )
      : new Map()
    return rows.map((r) => listedShape(r, demos.get(r.id)))
  }

  /**
   * Listed rows with what Find shows for the same place (decided 19/10: the Opportunity column): `score`,
   * and the cached `siteCheck`, `social` and `socials` it rests on, through `decorateCandidates` over
   * each row's stored candidate — cache reads only, one lookup for the page. A row with no stored
   * candidate, or a server whose domain or cache cannot be read, answers them null: the list never
   * fails for a score.
   */
  async function scoredRows(accountId, listed) {
    const blank = (row) => ({ ...row, score: null, siteCheck: null, social: null })
    const scorable = listed.filter(
      (r) => r.candidate && typeof r.candidate === 'object' && r.provider && r.providerId
    )
    if (scorable.length === 0) return listed.map(blank)
    let decorated
    try {
      const domain = await loadDomain()
      const { settings } = await runtime()
      const candidates = scorable.map((r) => ({
        ...r.candidate,
        provider: r.provider,
        providerId: r.providerId
      }))
      decorated = await decorateCandidates(domain, candidates, accountId, settings)
    } catch (error) {
      console.warn(`[website-opportunities] list without scores: ${error?.message ?? error}`)
      return listed.map(blank)
    }
    const byId = new Map(scorable.map((r, i) => [r.id, decorated[i]]))
    return listed.map((row) => {
      const d = byId.get(row.id)
      if (!d) return blank(row)
      return {
        ...row,
        score: d.score ?? null,
        siteCheck: d.siteCheck ?? null,
        social: d.social ?? null,
        socials: d.socials ?? null
      }
    })
  }

  // ── Jobs ──────────────────────────────────────────────────────────────────────────────────
  // Resume or cancel many jobs (plan D4 as amended 19/10): picked job ids, or a filter the server turns
  // into the latest job of each matching row once, at the press. One job at a time, each through the
  // same store function and checks as its single door; the same requestId answers the stored result.
  app.post(`${BASE}/jobs/bulk`, async (c) => {
    const who = await caller(c)
    if (who instanceof Response) return who
    const b = await body(c)
    const action = b?.action
    if (action !== 'resume' && action !== 'cancel')
      return refuse(c, 400, 'INVALID_ACTION', 'Send action as "resume" or "cancel".')
    if (!REQUEST_ID.test(String(b?.requestId ?? '')))
      return refuse(
        c,
        400,
        'INVALID_REQUEST_ID',
        'Send a requestId of 8–100 letters, digits, ".", "_", ":" or "-".'
      )
    const selection = bulkSelection(b)
    if ('error' in selection) return refuse(c, selection.status, selection.error, selection.next)
    if (action === 'resume' && !(await featureOn())) return featureOff(c)
    if (!who.accountId) return json(c, { results: [], done: 0, skipped: 0, failed: 0 })
    const hash = createHash('sha256')
      .update(JSON.stringify({ action, ...selection }))
      .digest('hex')
    const claim = await claimBulkRequest(pool, who.accountId, b.requestId, action, hash)
    if (claim.state === 'replay') return json(c, claim.result)
    if (claim.state === 'reused')
      return refuse(c, 409, 'REQUEST_ID_REUSED', 'Send a new requestId for another selection or action.')
    if (claim.state === 'pending')
      return refuse(c, 409, 'BULK_PENDING', 'Wait a moment: this request is still running.')
    if (await overLimitOrClosed(pool, `wo:bulk:${who.accountId}`, BULK_PER_HOUR, now())) {
      await releaseBulkRequest(pool, who.accountId, b.requestId)
      return refuse(c, 429, 'RATE_LIMITED', 'Wait for the next hour before another bulk action.')
    }
    let jobIds = selection.jobIds
    if (!jobIds) {
      jobIds = await latestJobIdsMatching(pool, who.accountId, { ...selection.filter, demoJourney }, BULK_MAX)
      if (jobIds.length > BULK_MAX) {
        await releaseBulkRequest(pool, who.accountId, b.requestId)
        return tooMany(c)
      }
    }
    const results = []
    for (const jobId of jobIds) results.push(await bulkOne(action, who.accountId, jobId))
    const result = {
      results,
      done: results.filter((r) => r.ok).length,
      skipped: results.filter((r) => !r.ok && BULK_SKIPPED.has(r.code)).length,
      failed: results.filter((r) => !r.ok && !BULK_SKIPPED.has(r.code)).length
    }
    await finishBulkRequest(pool, who.accountId, b.requestId, result)
    return json(c, result)
  })

  /** One job of a bulk press: `{jobId, ok, code?}` with the code its single door would answer. */
  async function bulkOne(action, accountId, jobId) {
    try {
      if (!(await jobOf(pool, accountId, jobId))) return { jobId, ok: false, code: 'NOT_FOUND' }
      if (action === 'cancel')
        return (await cancelRequest(pool, accountId, jobId))
          ? { jobId, ok: true }
          : { jobId, ok: false, code: 'JOB_FINISHED' }
      return (await resumeRequest(pool, accountId, jobId, {
        shared,
        now,
        requiredSources: reviewSourcesRequired(await runtime())
      }))
        ? { jobId, ok: true }
        : { jobId, ok: false, code: 'JOB_NOT_RESUMABLE' }
    } catch (error) {
      if (error instanceof JobActiveError) return { jobId, ok: false, code: 'JOB_ACTIVE' }
      console.warn(
        `[website-opportunities] bulk ${action} of job ${jobId} failed: ${error?.message ?? error}`
      )
      return { jobId, ok: false, code: 'ERROR' }
    }
  }

  const tooMany = (c) =>
    refuse(c, 422, 'TOO_MANY', `Narrow the selection: one bulk action takes at most ${BULK_MAX} jobs.`)

  app.post(`${BASE}/jobs/:jobId/cancel`, async (c) => {
    const who = await caller(c)
    if (who instanceof Response) return who
    const id = c.req.param('jobId')
    const job = who.accountId && UUID.test(id) ? await jobOf(pool, who.accountId, id) : null
    if (!job) return notFound(c, 'job')
    const cancelled = await cancelRequest(pool, who.accountId, id)
    if (!cancelled)
      return refuse(c, 409, 'JOB_FINISHED', 'This job has already ended.', { job: jobShape(job) })
    return json(c, { job: jobShape(cancelled) })
  })

  app.post(`${BASE}/jobs/:jobId/resume`, async (c) => {
    const who = await caller(c)
    if (who instanceof Response) return who
    const id = c.req.param('jobId')
    const job = who.accountId && UUID.test(id) ? await jobOf(pool, who.accountId, id) : null
    if (!job) return notFound(c, 'job')
    if (!(await featureOn())) return featureOff(c)
    let resumed
    try {
      resumed = await resumeRequest(pool, who.accountId, id, {
        shared,
        now,
        requiredSources: reviewSourcesRequired(await runtime())
      })
    } catch (error) {
      if (!(error instanceof JobActiveError)) throw error
      return jobActive(c, error.job)
    }
    if (!resumed)
      return refuse(c, 409, 'JOB_NOT_RESUMABLE', 'Only a paused, blocked, failed or cancelled job resumes.', {
        job: jobShape(job)
      })
    return json(c, { job: jobShape(resumed) })
  })

  // ── Media ─────────────────────────────────────────────────────────────────────────────────
  app.get(`${BASE}/media/:mediaId`, async (c) => {
    const who = await caller(c)
    if (who instanceof Response) return who
    const id = c.req.param('mediaId')
    // The account's own row, else a place's picture it may read through one of its opportunities.
    const media =
      who.accountId && UUID.test(id)
        ? ((await mediaById(pool, who.accountId, id)) ?? (await placeMediaOf(pool, who.accountId, id)))
        : null
    if (!media) return notFound(c, 'media')
    if (media.revoked_at)
      return refuse(c, 404, 'MEDIA_NOT_STORED', 'This picture was withdrawn and is no longer shown.', {
        reason: 'revoked',
        sourceUrl: media.source_url
      })
    if (media.status !== 'stored' || !media.object_key)
      return refuse(c, 404, 'MEDIA_NOT_STORED', 'Open the source address: these bytes were not kept.', {
        reason: media.reason,
        sourceUrl: media.source_url
      })
    if (!objects) return refuse(c, 503, 'STORE_UNAVAILABLE', 'The file store is not configured here.')
    c.header('cache-control', 'private, no-store')
    const direct = await objects.publicUrl(media.object_key)
    if (direct) return c.redirect(direct, 302)
    const res = await objects.get(media.object_key)
    if (!res?.ok || !res.body)
      return refuse(c, 502, 'STORE_READ_FAILED', 'Try again: the file store did not answer.')
    return new Response(res.body, {
      status: 200,
      headers: {
        'content-type': media.mime ?? 'application/octet-stream',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff'
      }
    })
  })

  // ── The builder's doors (`opportunities-build/route.js`), fixed paths before `/:id` ──────────────
  builder?.routes(app, {
    caller,
    refuse,
    notFound,
    featureOn,
    featureOff,
    domainOr,
    domainDeps,
    runtime,
    body,
    candidateFields,
    linkFields,
    linkRequestOf,
    saveListingSource,
    jobShape,
    startResearch,
    UUID,
    REQUEST_ID
  })

  app.get(`${BASE}/:id/outreach`, async (c) => {
    const who = await caller(c)
    if (who instanceof Response) return who
    const id = c.req.param('id')
    if (!UUID.test(id) || !who.accountId) return notFound(c, 'opportunity')
    const { rows } = await listOpportunities(pool, who.accountId, { ids: [id], demoJourney })
    if (!rows.length) return notFound(c, 'opportunity')
    const shaped = await listedRows(who.accountId, rows)
    const [row] = await withOutreach(pool, who.accountId, await scoredRows(who.accountId, shaped), host)
    if (!row.outreach)
      return refuse(c, 409, 'DEMO_NOT_READY', 'Finish the site check, or reopen the demo before sharing it.')
    return json(c, { outreach: row.outreach })
  })

  // The place profile (ADR 0037): the place's research as the template-independent document, nothing of the
  // account's brief or demo. The same owner check as the Details door.
  app.get(`${BASE}/:id/place-profile`, async (c) => {
    const who = await caller(c)
    if (who instanceof Response) return who
    const id = c.req.param('id')
    const opp = who.accountId && UUID.test(id) ? await opportunityOf(pool, who.accountId, id) : null
    if (!opp) return notFound(c, 'opportunity')
    // 🔒 One decision per fact (#1791): the profile the latest brief revision froze, judged at the time and with the
    // dates its assessment used and the owner's choices of today, listing exactly the facts that brief states. Before
    // any revision (or with a host that keeps none), the place profile of the current research.
    const frozen =
      (await deps.host?.frozenPlaceProfileOf?.(pool, { accountId: who.accountId, opportunityId: opp.id })) ??
      null
    const profile = frozen?.profile ?? (await readPlaceProfile(pool, { opportunityId: opp.id }))
    if (!profile || !validatePlaceProfile(profile).ok)
      return refuse(c, 502, 'PROFILE_UNAVAILABLE', 'The place profile could not be read. Try again later.')
    const decided = factDecisions(profile, {
      overrides: opp.candidate?.factOverrides ?? null,
      origin: frozen?.origin ?? 'research',
      at: frozen?.at ?? new Date().toISOString(),
      seenAt: frozen?.seenAt ?? {}
    })
    const food = briefTradeOf({ candidate: opp.candidate ?? {}, googlePlace: null }) === 'food'
    const stated = new Set(frozen?.factIds ?? [])
    const decisions = briefFactsOf(profile, { food, decisions: decided })
      .filter((f) => !frozen?.factIds || stated.has(f.id))
      .map((f) => ({
        factId: f.id,
        field: f.field,
        confidence: f.confidence,
        onSite: f.onSite,
        decidedBy: f.decidedBy,
        reasons: f.reasons
      }))
    // While the name is held (the brief froze it off and the owner has not shown it since), the card names the neutral
    // identity the site goes by instead (`siteNameOf`), so it never reads as the name on the site.
    const nameOff = decisions.some((d) => d.field === 'name' && d.onSite === false)
    return json(c, {
      profile,
      decisions,
      ...(frozen ? { revisionId: frozen.revisionId } : {}),
      ...(nameOff && frozen?.siteName ? { siteName: frozen.siteName } : {})
    })
  })

  // ── One opportunity (after the fixed paths above) ─────────────────────────────────────────
  app.get(`${BASE}/:id`, async (c) => {
    const who = await caller(c)
    if (who instanceof Response) return who
    const id = c.req.param('id')
    const opp = who.accountId && UUID.test(id) ? await opportunityOf(pool, who.accountId, id) : null
    if (!opp) return notFound(c, 'opportunity')
    // A researched place: its current snapshot with this account's overlay (`place-view.js`); else the
    // per-account rows, as before shared research.
    const view = opp.place_id ? await placeViewOf(pool, opp) : null
    // The research card lists every source the place's run tried (`view.shown`), Google and Tripadvisor too.
    const [[sources, profile, media, jobs], demo] = await Promise.all([
      Promise.all([
        view ? view.shown : sourcesOf(pool, opp.id),
        view
          ? { profile: view.profile, brand: view.brand }
          : profileOf(pool, opp.id).then(
              (held) =>
                held && {
                  ...held,
                  profile: cleanProfileLinks(
                    withPhoneDecision(
                      withRatingDecision(
                        withHoursDecision(
                          withNameDecision(held.profile, { opportunity: opp, brand: held.brand }),
                          { opportunity: opp }
                        ),
                        { opportunity: opp }
                      ),
                      { opportunity: opp }
                    )
                  )
                }
            ),
        view ? view.media : mediaOf(pool, opp.id),
        jobsOfOpportunity(pool, opp.id)
      ]),
      // No builder: the demo fields are left out of the answer.
      builder ? builder.detailOf(opp, who.accountId) : {}
    ])
    const links = pastedLinkResults(opp, {
      sources: view ? [...view.snapshot.sources.map((s) => ({ ...s, shared: true })), ...sources] : sources,
      media,
      finished: jobs[0]?.state === 'completed'
    })
    const linkResult = { links, requiresLinkReview: requiresLinkReview(links) }
    return json(c, {
      opportunity: opportunityShape(opp),
      ...linkResult,
      demo: demo.demo,
      place: view
        ? { id: opp.place_id, snapshotId: view.snapshot.id, publishedAt: view.snapshot.published_at }
        : null,
      // The Menu (`place-view.js menuViewOf`): null when the place is not a food or drink business and holds no dishes.
      menu: view?.menu ?? null,
      sources: sources.map((s) => ({
        source: s.source,
        // A social page's address as Tracy shows it, without share tracking (`social-links.mjs`).
        ref: SOCIAL_SOURCES.includes(s.source) ? untrackedUrl(s.ref, s.source) : s.ref,
        status: s.status,
        reason: s.reason,
        coverage: s.coverage,
        resumable: Boolean(s.cursor),
        updatedAt: s.updated_at,
        ...(view ? { shared: s.shared === true } : {}),
        // The two search rows: the pages found, with their verdicts (new optional fields).
        ...searchRowPages(s)
      })),
      // With the trade the brief speaks in (`trades.mjs briefTradeOf`), so Details words a food business as today and any
      // other business neutrally (#1780).
      profile: profile
        ? {
            ...profile.profile,
            brand: profile.brand ?? null,
            trade: briefTradeOf({
              candidate: opp.candidate ?? {},
              googlePlace: profile.profile?.googlePlace ?? null,
              menuItems: profile.profile?.menuItems
            })
          }
        : null,
      media: media.map((m) => ({
        id: m.id,
        kind: m.kind,
        category: m.category,
        width: m.width,
        height: m.height,
        sourceUrl: m.source_url,
        source: m.source,
        status: m.status,
        reason: m.reason,
        postedAt: m.posted_at,
        // Why it is not shown as a photograph (`media-junk.js`), or null: kept, listed behind "Show them".
        hidden: mediaJunk(m),
        ...(['tripadvisor', 'google-maps'].includes(m.source)
          ? { postId: m.post_id, credit: m.credit ?? null }
          : {}),
        ...(m.origin ? { origin: m.origin } : {})
      })),
      jobs: jobs.map((job) => ({ ...jobShape(job), result: linkResult })),
      progress: demo.progress,
      revisions: demo.revisions,
      brief: demo.brief,
      demoAction: demo.demoAction,
      usage: demo.usage,
      builds: demo.builds
    })
  })

  // The name on the site, as the person checked it on the Profile card: final for every later brief and build.
  app.put(`${BASE}/:id/name`, async (c) => {
    const who = await caller(c)
    if (who instanceof Response) return who
    const id = c.req.param('id')
    const opp = who.accountId && UUID.test(id) ? await opportunityOf(pool, who.accountId, id) : null
    if (!opp) return notFound(c, 'opportunity')
    const b = await body(c)
    const name = typeof b?.name === 'string' ? b.name.replace(/\s+/g, ' ').trim() : ''
    if (!name || name.length > NAME_PICK_MAX)
      return refuse(
        c,
        400,
        'INVALID_NAME',
        `Send "name" as the business's name, 1 to ${NAME_PICK_MAX} characters.`
      )
    const row = await saveNamePick(pool, who.accountId, opp.id, name)
    if (!row) return notFound(c, 'opportunity')
    return json(c, { opportunity: opportunityShape(row) })
  })

  // The opening hours on the site, as the person checked them on the Profile card: keep the hours waiting for a
  // check, leave them off, or type them. Final for every later brief, build and site check.
  app.put(`${BASE}/:id/hours`, async (c) => {
    const who = await caller(c)
    if (who instanceof Response) return who
    const id = c.req.param('id')
    const opp = who.accountId && UUID.test(id) ? await opportunityOf(pool, who.accountId, id) : null
    if (!opp) return notFound(c, 'opportunity')
    const b = await body(c)
    const choice = b?.choice
    if (choice !== 'keep' && choice !== 'leave' && choice !== 'edit')
      return refuse(c, 400, 'INVALID_CHOICE', 'Send "choice" as "keep", "leave" or "edit".')
    const hours = choice === 'edit' ? readableHours(b.hours) : null
    if (choice === 'edit' && !hours)
      return refuse(
        c,
        400,
        'INVALID_HOURS',
        'These hours cannot be read. Send one line per group of days, such as "Mo-Fr 09:00-18:00" or "Sa closed".'
      )
    const row = await saveHoursPick(pool, who.accountId, opp.id, { choice, ...(hours ? { hours } : {}) })
    if (!row) return notFound(c, 'opportunity')
    return json(c, { opportunity: opportunityShape(row) })
  })

  // Google's rating on the site, as the person chose on the Profile card: show it (a rating from few reviews is left
  // off until then) or leave it off. Final for every later brief, build and site check.
  app.put(`${BASE}/:id/rating`, async (c) => {
    const who = await caller(c)
    if (who instanceof Response) return who
    const id = c.req.param('id')
    const opp = who.accountId && UUID.test(id) ? await opportunityOf(pool, who.accountId, id) : null
    if (!opp) return notFound(c, 'opportunity')
    const b = await body(c)
    const choice = b?.choice
    if (choice !== 'show' && choice !== 'leave')
      return refuse(c, 400, 'INVALID_CHOICE', 'Send "choice" as "show" or "leave".')
    const row = await saveRatingPick(pool, who.accountId, opp.id, { choice })
    if (!row) return notFound(c, 'opportunity')
    return json(c, { opportunity: opportunityShape(row) })
  })

  // The reading on the Profile card (#1780): Remove (or restore) an item the site would show, and Show on the site (or
  // hide) a person named only in reviews. Final for every later brief, build and site check; never blocks Build.
  app.put(`${BASE}/:id/reading`, async (c) => {
    const who = await caller(c)
    if (who instanceof Response) return who
    const id = c.req.param('id')
    const opp = who.accountId && UUID.test(id) ? await opportunityOf(pool, who.accountId, id) : null
    if (!opp) return notFound(c, 'opportunity')
    const b = await body(c)
    if (typeof b?.item !== 'string' || !/^[a-z]{2}_[a-z0-9]{1,40}$/.test(b.item))
      return refuse(c, 400, 'INVALID_ITEM', 'Send "item" as the id of an item of the reading.')
    if (!['remove', 'restore', 'show', 'hide'].includes(b?.choice))
      return refuse(c, 400, 'INVALID_CHOICE', 'Send "choice" as "remove", "restore", "show" or "hide".')
    const row = await saveReadingPick(pool, who.accountId, opp.id, b.item, b.choice)
    if (!row) return notFound(c, 'opportunity')
    return json(c, { opportunity: opportunityShape(row) })
  })

  // One fact on or off the site, as the owner chose on the Profile card (#1791): `onSite` true or false wins over the
  // rule for every later brief, build and site check, Research again included; null lets the rule decide again.
  app.put(`${BASE}/:id/facts`, async (c) => {
    const who = await caller(c)
    if (who instanceof Response) return who
    const id = c.req.param('id')
    const opp = who.accountId && UUID.test(id) ? await opportunityOf(pool, who.accountId, id) : null
    if (!opp) return notFound(c, 'opportunity')
    const read = readFactOverride(await body(c))
    if (read.error === 'INVALID_FACT')
      return refuse(c, 400, 'INVALID_FACT', 'Send "factId" as the id of a fact of the place profile.')
    if (read.error) return refuse(c, 400, 'INVALID_ON_SITE', 'Send "onSite" as true, false or null.')
    let row
    try {
      row = await saveFactOverride(pool, who.accountId, opp.id, read.factId, read.onSite)
    } catch (error) {
      if (error?.code !== 'TOO_MANY_FACT_OVERRIDES') throw error
      return refuse(
        c,
        400,
        'TOO_MANY_FACT_OVERRIDES',
        `At most ${FACT_OVERRIDES_MAX} facts can be switched on or off by hand. Send "onSite": null for one to let the rule decide it again.`
      )
    }
    if (!row) return notFound(c, 'opportunity')
    return json(c, { opportunity: opportunityShape(row) })
  })

  // The key messages as the owner edited them on the Profile card (#1791). A save MERGES into the stored picks under a
  // row lock (`saveKeyMessagePicks`): `removed` accumulates (a removed message stays removed), each label sent replaces
  // that message's label, and `order`, when sent, replaces the order. A key message's facts and quotes are not editable.
  // Final for every later brief and build.
  app.put(`${BASE}/:id/key-messages`, async (c) => {
    const who = await caller(c)
    if (who instanceof Response) return who
    const id = c.req.param('id')
    const opp = who.accountId && UUID.test(id) ? await opportunityOf(pool, who.accountId, id) : null
    if (!opp) return notFound(c, 'opportunity')
    const picks = readKeyMessagePicks(await body(c))
    if (picks.error)
      return refuse(
        c,
        400,
        'INVALID_KEY_MESSAGES',
        `Send "removed" and "order" as lists of key message ids and "labels" as key message ids with a label of 1 to ${KEY_MESSAGE_LABEL_MAX} characters.`
      )
    const row = await saveKeyMessagePicks(pool, who.accountId, opp.id, picks)
    if (!row) return notFound(c, 'opportunity')
    return json(c, { opportunity: opportunityShape(row) })
  })

  /** Whether a run here can collect this Google or Tripadvisor part of the place: a Retry that cannot is refused. */
  async function canCollectGooglePart(opp, part) {
    const rt = await runtime()
    if (part === 'tripadvisor') return part in reviewSourcesRequired(rt)
    if (identityOf(opp.provider, opp.provider_id)?.namespace !== 'google') return false
    return part === 'google-places' ? Boolean(rt.keys.google) : part in reviewSourcesRequired(rt)
  }

  app.post(`${BASE}/:id/research`, async (c) => {
    const who = await caller(c)
    if (who instanceof Response) return who
    const id = c.req.param('id')
    const opp = who.accountId && UUID.test(id) ? await opportunityOf(pool, who.accountId, id) : null
    if (!opp) return notFound(c, 'opportunity')
    if (!(await featureOn())) return featureOff(c)
    const b = await body(c)
    if (!REQUEST_ID.test(String(b?.requestId ?? '')))
      return refuse(
        c,
        400,
        'INVALID_REQUEST_ID',
        'Send a requestId of 8–100 letters, digits, ".", "_", ":" or "-".'
      )
    const started = await startResearch({
      accountId: who.accountId,
      opp,
      requestId: b.requestId,
      force: b.force,
      only: b.only,
      again: b.again,
      parts: b.parts
    })
    if (started.refusal)
      return refuse(
        c,
        started.refusal.status,
        started.refusal.code,
        started.refusal.next,
        started.refusal.extra
      )
    if (started.active) return jobActive(c, started.job)
    return json(
      c,
      {
        job: jobShape(started.job),
        ...(started.plan ? { again: { ...againShape(started.plan), joined: Boolean(started.joined) } } : {})
      },
      202
    )
  })

  // Research again, before the press: what would run, why, and the most it may cost; who pays.
  app.get(`${BASE}/:id/research-again`, async (c) => {
    const who = await caller(c)
    if (who instanceof Response) return who
    const id = c.req.param('id')
    const opp = who.accountId && UUID.test(id) ? await opportunityOf(pool, who.accountId, id) : null
    if (!opp) return notFound(c, 'opportunity')
    if (!(await featureOn())) return featureOff(c)
    const domain = await domainOr(c)
    if (domain instanceof Response) return domain
    const limited = againPartsOf(c.req.query('parts'))
    if ('error' in limited) return refuse(c, 400, 'INVALID_PARTS', limited.error)
    const { keys, settings } = await runtime()
    const placeId = shared && identityOf(opp.provider, opp.provider_id) ? opp.place_id : null
    const plan = placeId
      ? await placeAgainPlan(pool, placeId, { now: now(), keys, settings, domain, onlyParts: limited.parts })
      : { run: [], kept: [], ceilingCents: 0, researched: false }
    return json(c, {
      plan: againShape(plan),
      payer: 'account',
      limit: {
        perDay: settings.researchAgainPerAccountDay,
        usedToday: await againRunsToday(pool, who.accountId, now())
      }
    })
  })

  return app
}

/** The place kinds the domain groups Google's types into; empty on a domain without them. */
function kindsOf(domain) {
  return Array.isArray(domain.KINDS) ? domain.KINDS.filter((k) => typeof k === 'string') : []
}

/** The kinds of business an area search can be narrowed to (`trade-search.mjs`); empty on a food-only domain. */
function tradesOf(domain) {
  return Array.isArray(domain.SEARCH_TRADES) ? domain.SEARCH_TRADES.filter((k) => typeof k === 'string') : []
}

function cuisinesOf(domain) {
  return Array.isArray(domain.CUISINES) ? domain.CUISINES.filter((k) => typeof k === 'string') : []
}

/** A list of distinct strings from `allowed` (or any short string when `allowed` is empty); null when not one. */
function subsetOf(value, allowed) {
  if (!Array.isArray(value)) return null
  const out = []
  for (const v of value) {
    if (typeof v !== 'string' || v.length > 40) return null
    if (allowed.length > 0 && !allowed.includes(v)) return null
    if (!out.includes(v)) out.push(v)
  }
  return out
}

/**
 * The search body's options (Find spec §2, §5): the filters Google applies,
 * the depth (quick 20 / standard 60, by radius unless sent) and whether chains stay. `{error}`
 * names the first field that is not what it should be.
 */
function searchOptions(b, domain, radiusM) {
  const kinds = b?.kinds === undefined ? kindsOf(domain) : subsetOf(b.kinds, kindsOf(domain))
  if (!kinds) return { error: 'kinds' }
  const cuisines = b?.cuisines === undefined ? [] : subsetOf(b.cuisines, cuisinesOf(domain))
  if (!cuisines) return { error: 'cuisines' }
  const minRating = b?.minRating === undefined || b?.minRating === null ? null : Number(b.minRating)
  if (minRating !== null && !(Number.isFinite(minRating) && minRating >= 0 && minRating <= 5))
    return { error: 'minRating' }
  let priceLevels = []
  if (b?.priceLevels !== undefined) {
    if (!Array.isArray(b.priceLevels) || !b.priceLevels.every((p) => PRICE_LEVELS.includes(p)))
      return { error: 'priceLevels' }
    priceLevels = [...new Set(b.priceLevels)]
  }
  const openNow = b?.openNow === undefined ? false : b.openNow
  if (typeof openNow !== 'boolean') return { error: 'openNow' }
  const includeChains = b?.includeChains === undefined ? false : b.includeChains
  if (typeof includeChains !== 'boolean') return { error: 'includeChains' }
  const depth = b?.depth === undefined ? (radiusM <= QUICK_RADIUS_M ? 'quick' : 'standard') : b.depth
  if (!(depth in DEPTH_LIMITS)) return { error: 'depth' }
  // A cuisine or a narrower set of kinds is a food search; otherwise every kind of business unless one is sent.
  const foodOnly = cuisines.length > 0 || (b?.kinds !== undefined && kinds.length < kindsOf(domain).length)
  const trades = tradesOf(domain)
  const trade = !trades.length ? 'food' : b?.trade === undefined ? (foodOnly ? 'food' : 'any') : b.trade
  if (trade !== 'food' && !(trade === 'any' || trades.includes(trade))) return { error: 'trade' }
  if (foodOnly && trade !== 'food') return { error: 'trade' }
  return { filters: { trade, kinds, cuisines, minRating, priceLevels, openNow }, depth, includeChains }
}

/** A candidate as the client sent it, reduced to the fields a candidate has; null when it is not one. */
const CHAT_HOSTS = {
  zalo: ['zalo.me'],
  whatsapp: ['wa.me', 'whatsapp.com'],
  messenger: ['m.me'],
  line: ['line.me']
}

/** An http(s) URL on one of `hosts` (or a subdomain), else null. */
function httpsOn(value, hosts) {
  try {
    const u = new URL(String(value))
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    return /^https?:$/.test(u.protocol) && hosts.some((h) => host === h || host.endsWith(`.${h}`))
      ? u.href
      : null
  } catch {
    return null
  }
}

/** Chat links (Zalo, WhatsApp, Messenger, LINE) a candidate carries; anything else is dropped. */
function chatContacts(raw) {
  const out = {}
  for (const [net, hosts] of Object.entries(CHAT_HOSTS)) {
    const url = raw && typeof raw === 'object' ? httpsOn(raw[net], hosts) : null
    if (url) out[net] = url
  }
  return out
}

function candidateFields(raw) {
  const text = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
  const provider = text(raw.provider, 40)
  const providerId = text(raw.providerId, 200)
  const name = text(raw.name, 200)
  if (!provider || !providerId || !name) return null
  const refs = refsOfUrls([raw.website, ...Object.values(raw.socials ?? {})])
  const socials = {}
  for (const [source, url] of Object.entries(refs)) if (SOCIAL_SOURCES.includes(source)) socials[source] = url
  // A listing site's page (sent as the website, or in `listings`): kept as a listing, never as the website.
  const listings = mergeListings(
    [],
    [refs.listing, ...(Array.isArray(raw.listings) ? raw.listings.slice(0, 5).map((l) => l?.url) : [])]
      .filter((u) => typeof u === 'string' && sourceOfUrl(u) === 'listing')
      .map((u) => ({ url: normalizeUrl(u), source: listingSourceName(u) }))
  )
  const candidate = {
    provider,
    providerId,
    name,
    branch: text(raw.branch, 200),
    address: text(raw.address, 500),
    phone: text(raw.phone, 60),
    lat: Number.isFinite(raw.lat) ? raw.lat : null,
    lon: Number.isFinite(raw.lon) ? raw.lon : null,
    website: refs.website ?? null,
    socials,
    ...(listings.length ? { listings } : {}),
    contacts: chatContacts(raw.contacts),
    category: text(raw.category, 80),
    rating: Number.isFinite(raw.rating) ? raw.rating : null,
    reviews: Number.isFinite(raw.reviews) ? raw.reviews : null,
    mapsUrl: httpsOn(raw.mapsUrl, ['google.com', 'maps.google.com', 'goo.gl']),
    // The find screen's facts (Find spec §3), kept so a saved row can be
    // listed without another search. `kind` is only trusted from the server's own list.
    kind: KIND_NAMES.has(raw.kind) ? raw.kind : null,
    cuisine: text(raw.cuisine, 40),
    primaryType: text(raw.primaryType, 80),
    distanceM: Number.isFinite(raw.distanceM) && raw.distanceM >= 0 ? Math.round(raw.distanceM) : null,
    priceLevel: PRICE_LEVELS.includes(raw.priceLevel) ? raw.priceLevel : null,
    openNow: typeof raw.openNow === 'boolean' ? raw.openNow : null,
    chain: raw.chain === true,
    // What the brief and the template choice read (`trades.mjs`); absent = food, as before.
    ...(TRADE_NAMES.has(raw.trade) ? { trade: raw.trade } : {}),
    photo: PHOTO_NAME.test(raw.photo?.name ?? '')
      ? { name: raw.photo.name, credit: text(raw.photo.credit, 200) ?? '' }
      : null
  }
  return { name, branch: candidate.branch, provider, providerId, candidate }
}

/** The display name of a listing site (`LISTING_HOSTS`), else its host. */
function listingSourceName(url) {
  return linkKind(url)?.source ?? hostOf(url)
}

/** The six kinds of the find screen; the domain's `KINDS` says the same list (gated by the search). */
const KIND_NAMES = new Set(['restaurants', 'cafes', 'fast-food', 'bakeries', 'bars', 'nightlife'])
/** The domain's `TRADES` (`trades.mjs`); a candidate's trade is kept only from this list. */
const TRADE_NAMES = new Set([
  'food',
  'beauty',
  'health',
  'fitness',
  'hospitality',
  'travel',
  'professional',
  'creative',
  'education',
  'retail',
  'auto',
  'home',
  'events',
  'nonprofit',
  'other'
])
const PHOTO_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/

const BULK_MAX = 500
const BULK_PER_HOUR = 60
/** A job left as it was because its state did not allow the action: not a failure of the press. */
const BULK_SKIPPED = new Set(['JOB_FINISHED', 'JOB_NOT_RESUMABLE', 'JOB_ACTIVE'])

/**
 * `{jobIds}` or `{filter}` of a bulk press, exactly one of them.
 * @returns {{jobIds: string[]} | {filter: {stage?: string, attention?: boolean, q?: string}} |
 *   {status: number, error: string, next: string}}
 */
function bulkSelection(b) {
  const bad = {
    status: 400,
    error: 'INVALID_SELECTION',
    next: 'Send jobIds (job ids) or filter {stage, attention, q}, not both.'
  }
  if ((b.jobIds === undefined) === (b.filter === undefined)) return bad
  if (b.jobIds !== undefined) {
    if (
      !Array.isArray(b.jobIds) ||
      !b.jobIds.length ||
      !b.jobIds.every((id) => typeof id === 'string' && UUID.test(id))
    )
      return bad
    const jobIds = [...new Set(b.jobIds)]
    if (jobIds.length > BULK_MAX)
      return {
        status: 422,
        error: 'TOO_MANY',
        next: `Narrow the selection: one bulk action takes at most ${BULK_MAX} jobs.`
      }
    return { jobIds }
  }
  const f = b.filter
  if (!f || typeof f !== 'object' || Array.isArray(f)) return bad
  if (f.stage !== undefined && !STAGES.includes(f.stage)) return bad
  if (f.attention !== undefined && typeof f.attention !== 'boolean') return bad
  if (f.q !== undefined && (typeof f.q !== 'string' || f.q.trim().length > LIST_Q_MAX)) return bad
  const q = typeof f.q === 'string' && f.q.trim() ? f.q.trim() : undefined
  return { filter: { stage: f.stage, attention: f.attention, q } }
}

const LIST_LIMIT = Object.freeze({ min: 1, max: 100, default: 50 })
const LIST_IDS_MAX = 100
const LIST_Q_MAX = 100
const LIST_PARAMS = ['stage', 'attention', 'q', 'cursor', 'limit', 'ids']

function emptyCounts() {
  return Object.fromEntries(['all', ...STAGES, 'attention'].map((k) => [k, 0]))
}

/**
 * The list door's query (plan D3 as amended 19/10). `paged: false` when none of the new parameters
 * was sent: the caller answers the old whole-list shape.
 * @returns {{error: string, next: string} | {paged: boolean, stage?: string, attention?: boolean,
 *   q?: string, cursor?: object | null, limit: number, ids?: string[]}}
 */
export function listQuery(raw) {
  const paged = LIST_PARAMS.some((k) => raw[k] !== undefined)
  const stage = raw.stage || undefined
  if (stage && !STAGES.includes(stage))
    return { error: 'INVALID_STAGE', next: `Send stage as one of ${STAGES.join(', ')}.` }
  let attention
  if (raw.attention !== undefined && raw.attention !== '') {
    if (['1', 'true'].includes(raw.attention)) attention = true
    else if (['0', 'false'].includes(raw.attention)) attention = false
    else return { error: 'INVALID_ATTENTION', next: 'Send attention as 1 or 0.' }
  }
  const q = typeof raw.q === 'string' ? raw.q.trim() : ''
  if (q.length > LIST_Q_MAX)
    return { error: 'INVALID_QUERY', next: `Send a search of at most ${LIST_Q_MAX} characters.` }
  let limit = LIST_LIMIT.default
  if (raw.limit !== undefined) {
    limit = Number(raw.limit)
    if (!Number.isInteger(limit) || limit < LIST_LIMIT.min || limit > LIST_LIMIT.max)
      return { error: 'INVALID_LIMIT', next: `Send limit as a whole number from 1 to ${LIST_LIMIT.max}.` }
  }
  let cursor = null
  if (raw.cursor) {
    cursor = decodeCursor(raw.cursor)
    if (!cursor) return { error: 'INVALID_CURSOR', next: 'Send nextCursor exactly as the last page gave it.' }
  }
  let ids
  if (raw.ids !== undefined) {
    ids = [...new Set(String(raw.ids).split(',').filter(Boolean))]
    if (!ids.length || ids.length > LIST_IDS_MAX || !ids.every((id) => UUID.test(id)))
      return { error: 'INVALID_IDS', next: `Send ids as 1–${LIST_IDS_MAX} opportunity ids, comma-separated.` }
  }
  return { paged, stage, attention, q: q || undefined, cursor, limit, ids }
}

/**
 * A listed row's shape. `d` is the builder's demo columns of the row (`listedDemoOf`); an undefined
 * field is left out of the JSON, so a deployment without a builder answers no demo columns.
 */
function listedShape(r, d) {
  return {
    ...opportunityShape(r),
    job: r.job ? jobShape(r.job) : null,
    latestRevision: d?.latestRevision,
    sites: d?.sites,
    stage: r.stage,
    attention: r.attention,
    latestBuild: d?.latestBuild,
    demoAction: d?.demoAction,
    demo: d?.demo
  }
}

function opportunityShape(r) {
  return {
    id: r.id,
    name: r.name,
    branch: r.branch,
    provider: r.provider,
    providerId: r.provider_id,
    // As read today, whenever it was saved (`candidate-as-read.mjs`).
    candidate: candidateAsRead(r.candidate),
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

/** A job's progress without the executor's own record of its paid Apify run (`executor.js heldApifyRun`). */
function publicProgress(progress) {
  if (!progress || typeof progress !== 'object' || !('apifyRun' in progress)) return progress
  const { apifyRun: _run, ...rest } = progress
  return rest
}

function jobShape(j) {
  return {
    id: j.id,
    opportunityId: j.opportunity_id,
    kind: j.kind,
    requestId: j.request_id,
    state: j.state,
    stage: j.stage,
    progress: publicProgress(j.progress),
    attempt: j.attempt,
    lastError: j.last_error,
    // Shared research: the place run serving this request, and the snapshot that answered it.
    placeJobId: j.place_job_id ?? null,
    resultSnapshotId: j.result_snapshot_id ?? null,
    createdAt: j.created_at,
    updatedAt: j.updated_at
  }
}
