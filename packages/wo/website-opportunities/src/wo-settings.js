/**
 * Website Opportunities settings (`wo_ops_setting`): the deployment-wide discovery, research, picture, budget,
 * public Find and template pin settings, each capability group's provider order, and the provider keys the
 * pipeline runs with. Set on `/ops/wo`; the operator views that edit them stay in Tracy (`lib/wo-ops.js`).
 */

import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { WO_DOMAIN_DIR } from './domain-loader.js'

// The capability catalogue lives in the WO domain (`domain/capabilities.mjs`), copied beside this file in the image.
const capabilities = await import(pathToFileURL(path.join(WO_DOMAIN_DIR, 'capabilities.mjs')).href)

export const WO_PROVIDERS = Object.freeze([
  'deepseek',
  'firecrawl',
  'jina',
  'apify',
  'google',
  'rapidapi',
  'serpapi',
  'litescrape',
  'scrapecreators'
])

export const PROVIDER_COLUMN = Object.freeze({
  deepseek: 'deepseek_key_cipher',
  firecrawl: 'firecrawl_key_cipher',
  jina: 'jina_key_cipher',
  apify: 'apify_key_cipher',
  google: 'google_key_cipher',
  rapidapi: 'rapidapi_key_cipher',
  serpapi: 'serpapi_key_cipher',
  litescrape: 'litescrape_key_cipher',
  scrapecreators: 'scrapecreators_key_cipher'
})

export const DEFAULT_WO_OPS_SETTINGS = Object.freeze({
  defaultRadiusM: 2000,
  // 60 = the Standard depth of the approved spec (Find spec); the operator may lower it.
  gmapsMaxPlaces: 60,
  mapDiscoveryProvider: 'auto',
  googlePlacesPhotos: true,
  tripadvisorReviews: true,
  pageSpeedCheckEnabled: true,
  googleMapsEmbed: true,
  webSearchProvider: 'auto',
  websiteFetchChain: 'crawl-jina-firecrawl-deepseek',
  autoCollectSources: Object.freeze({
    website: true,
    facebook: true,
    instagram: true,
    tiktok: false,
    youtube: false
  }),
  depthPreset: 'standard',
  onPartialSource: 'complete',
  searchRunsPerDay: 15,
  researchRunsPerDay: 30,
  maxChargeUsdPerRun: 0.25,
  // Shared research is paid by Tracy, not the account (`opportunities/cost-ledger.js`): the most every
  // research call of one UTC day may cost together, and the most one research job may cost, in US
  // cents. A call is reserved at its ceiling before it goes out. 0 stops paid research.
  researchDailyCapCents: 2000,
  researchJobCapCents: 200,
  // Abuse limit, not a cost quota: how many places never researched before one account may send to
  // research a day (`apify-budget.js` newPlacesDaySpent).
  newPlacesPerAccountPerDay: 40,
  // How many Research again runs one account may start a day; joining a run
  // already going does not count. An abuse limit: the run is still Tracy's to pay.
  researchAgainPerAccountDay: 20,
  // Menu photos the vision model reads per place (`menu-photo-reading.js`), best first; 0 switches photo reading off.
  menuPhotosPerPlace: 24,
  defaultCms: 'emdash',
  // What a revision builds when the client names no template (`opportunities-build/revisions.js`): one
  // release tag per CMS; `strict` refuses a pin no longer offered, the fallback guesses a restaurant card.
  templatePinPolicy: 'fallback-any-restaurant',
  pinnedTemplates: Object.freeze({
    joomla: 'tracy-base/j6',
    wordpress: 'tracy-base/wp7',
    emdash: 'tracy-base/emdash-0.x'
  }),
  visionEnabled: true,
  maxVisionPictures: 80,
  missingHeroMode: 'outpaint-and-scene',
  handoffMaxPictures: 24,
  autoHandoff: 'auto-draft',
  // The find screen (Find spec): the Maps JavaScript key the customer's browser loads
  // (public, HTTP-referrer-restricted, so not sealed) and the mobile score under which a current
  // website counts as slow in the opportunity score.
  googleMapsBrowserKey: '',
  slowSiteThreshold: 50,
  // How many of a search's unchecked websites one poll may queue (the client sends them by score).
  siteChecksAutoLimit: 20,
  // Social stats (`opportunities/social-stats.js`): profiles one poll may queue, billable calls one
  // account may cause a day, and each provider's deployment-wide calls a day. The caps keep the free
  // RapidAPI tiers safe (~100–300 calls a month); 0 switches a provider off. Raise them with a plan.
  // No assumed free subscription: allocate its remaining calls and exact billing cycle in Ops.
  socialStatsProviderCycle: Object.freeze({}),
  socialStatsYouTubeDailyQuota: 0,
  socialStatsAutoLimit: 10,
  socialStatsPerAccountPerDay: 200,
  socialStatsProviderDailyCap: Object.freeze({
    'facebook-scraper3': 3,
    'facebook-scrapecreators': 10,
    'facebook-apify': 0,
    'instagram-scrapecreators': 10,
    'instagram-apify': 0,
    'tiktok-scrapecreators': 10,
    'tiktok-apify': 0,
    'instagram-looter2': 4,
    'instagram-stable': 0,
    'tiktok-api23': 3,
    'yt-api': 9,
    'youtube-official': 500
  }),
  // Demo retention (`opportunities-build/demo-retention.js`): an untouched demo freezes after its term, a
  // frozen one is torn down after the grace; the caps freeze the coldest demos first, never delete.
  demoRetentionEnabled: true,
  demoBuildsPerAccountPerDay: 20,
  // Add site's Build from my business (`opportunities-build/own-site.js`): sites a customer may start a day, paid by Tracy.
  ownSiteBuildsPerAccountPerDay: 3,
  demoTtlDays: 14,
  demoReviewTtlDays: 7,
  demoFreezeGraceDays: 7,
  demoMaxPerAccount: 50,
  demoMaxPerHost: 500,
  demoDiskHighWaterPct: 80,
  demoSweepBatch: 10,
  // The sign-in-free `/find` (`public/wo-find-page.js`): what strangers may spend. Searches are one
  // Google Text Search request each (~$35 per 1,000 at list price with website fields), so the
  // 500/day default bounds that door to roughly $17 a day; suggestions are Autocomplete calls
  // (~$2.83 per 1,000), 5,000/day roughly $14. A day cap of 0 closes its door.
  publicFindSearchesPerDay: 500,
  publicFindSearchesPerAddressHour: 60,
  publicFindSearchesPerAddressMinute: 10,
  publicFindSearchesPerMinute: 60,
  publicFindSuggestPerDay: 5000,
  publicFindSuggestPerAddressHour: 300,
  publicFindSuggestPerAddressMinute: 60,
  publicFindSuggestPerMinute: 60,
  // Google's answers kept in `wo_places_cache` (decided 23/10/2026: Google bills per call and lets
  // results be kept; a place's profile barely moves in six months). 0 keeps nothing.
  placesCacheDays: 183,
  // The cache cell a search is asked from, in metres; 0 = a fifth of the radius (at most a tenth of
  // the radius away from the visitor), larger = more hits and a less local answer.
  placesCacheCellMeters: 0,
  // Which provider each research capability asks first (`domain/capabilities.mjs`), set on /ops/wo ›
  // Settings: `{ [group]: providerId[] }`. A group left out runs its old order; `[]` switches it off.
  providerOrder: Object.freeze({}),
  // Research pressed on `/find` (the shared place job, `opportunities/place-jobs.js admitPublicResearch`):
  // only places nobody researched yet count. A wide safety switch, not a meter (decided 23/10/2026).
  publicResearchNewPlacesPerAddressDay: 50,
  publicResearchNewPlacesPerDay: 1000,
  // Reserved at `researchJobCapCents` per new place before it is queued; unset = a quarter of
  // `researchDailyCapCents`. Spent → strangers are asked to sign in; signed-in research is untouched.
  researchPublicDailyCapCents: 500,
  // Research again pressed on `/find`: how many such runs one place may have a UTC day (0 closes the button).
  publicResearchAgainPerPlacePerDay: 1
})

/**
 * The allowed range of each public Find limit; outside it `PUT` answers `INVALID_PUBLIC_FIND_LIMIT`.
 * Only a day cap takes 0 (that door closed); a per-minute or per-hour cap of 0 would close it silently.
 * The two cache settings take 0 too: no cache, and the automatic cell.
 */
export const PUBLIC_FIND_RANGES = Object.freeze({
  publicFindSearchesPerDay: [0, 1_000_000],
  publicFindSearchesPerAddressHour: [1, 1_000_000],
  publicFindSearchesPerAddressMinute: [1, 1_000_000],
  publicFindSearchesPerMinute: [1, 1_000_000],
  publicFindSuggestPerDay: [0, 1_000_000],
  publicFindSuggestPerAddressHour: [1, 1_000_000],
  publicFindSuggestPerAddressMinute: [1, 1_000_000],
  publicFindSuggestPerMinute: [1, 1_000_000],
  placesCacheDays: [0, 3650],
  placesCacheCellMeters: [0, 20_000],
  publicResearchNewPlacesPerAddressDay: [1, 1_000_000],
  publicResearchNewPlacesPerDay: [0, 1_000_000],
  researchPublicDailyCapCents: [0, 1_000_000],
  publicResearchAgainPerPlacePerDay: [0, 1_000]
})

/** The allowed range of each demo retention number; outside it `PUT` answers `INVALID_DEMO_RETENTION`. */
export const DEMO_RETENTION_RANGES = Object.freeze({
  demoBuildsPerAccountPerDay: [0, 100_000],
  ownSiteBuildsPerAccountPerDay: [0, 1_000],
  demoTtlDays: [1, 365],
  demoReviewTtlDays: [1, 365],
  demoFreezeGraceDays: [1, 365],
  demoMaxPerAccount: [0, 100_000],
  demoMaxPerHost: [0, 1_000_000],
  demoDiskHighWaterPct: [50, 95],
  demoSweepBatch: [1, 100]
})

/** The budgets `socialStatsProviderDailyCap` names, one per provider listing. */
export const SOCIAL_STATS_BUDGETS = Object.freeze(
  Object.keys(DEFAULT_WO_OPS_SETTINGS.socialStatsProviderDailyCap)
)
const SOCIAL_STATS_CAP_MAX = 1_000_000
/** $1,000,000: a research cap above this is a typo, not a budget. */
const RESEARCH_CAP_MAX_CENTS = 100_000_000
const RESEARCH_CAPS = ['researchDailyCapCents', 'researchJobCapCents']

const VALID_MAP_DISCOVERY_PROVIDERS = new Set(['auto', 'google', 'apify', 'osm'])
const VALID_WEB_SEARCH_PROVIDERS = new Set(['auto', 'deepseek', 'jina', 'firecrawl', 'off'])
const VALID_FETCH_CHAINS = new Set(['crawl-jina-firecrawl-deepseek', 'crawl-firecrawl-jina', 'crawl-only'])
const VALID_DEPTH_PRESETS = new Set(['fast', 'standard', 'deep'])
const VALID_PARTIAL_POLICIES = new Set(['complete', 'pause'])
export const WO_CMS_ORDER = Object.freeze(['joomla', 'wordpress', 'emdash'])
const VALID_CMS = new Set(WO_CMS_ORDER)
export const TEMPLATE_PIN_POLICIES = Object.freeze(['fallback-any-restaurant', 'strict'])
const VALID_PIN_POLICIES = new Set(TEMPLATE_PIN_POLICIES)
// Policies saved before pins were wired (#1436): `refuse` meant what `strict` does now.
const LEGACY_PIN_POLICIES = Object.freeze({ refuse: 'strict', 'ignore-hidden': 'fallback-any-restaurant' })
/** A release tag, `<slug>/<platform-slug>` (`tracy-base/emdash-0.x`). */
const TEMPLATE_TAG = /^[a-z0-9][a-z0-9._-]{0,63}\/[a-z0-9][a-z0-9._-]{0,63}$/

/** A stored pin: a release tag, else the default (a slug saved before #1436 can match no tag). */
export function pinOf(value, cms) {
  const tag = typeof value === 'string' ? value.trim() : ''
  return TEMPLATE_TAG.test(tag) ? tag : DEFAULT_WO_OPS_SETTINGS.pinnedTemplates[cms]
}
const VALID_MISSING_HERO_MODES = new Set(['outpaint-and-scene', 'outpaint', 'real-only'])
const VALID_AUTO_HANDOFF = new Set(['auto-draft', 'manual'])

/**
 * Merge stored JSONB settings with defaults, discarding any invalid or out-of-range fields.
 */
export function normalizeWoOpsSettings(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const sources =
    src.autoCollectSources && typeof src.autoCollectSources === 'object' ? src.autoCollectSources : {}
  const pins = src.pinnedTemplates && typeof src.pinnedTemplates === 'object' ? src.pinnedTemplates : {}

  return {
    defaultRadiusM: clampInt(src.defaultRadiusM, 250, 10000, DEFAULT_WO_OPS_SETTINGS.defaultRadiusM),
    gmapsMaxPlaces: clampInt(src.gmapsMaxPlaces, 5, 100, DEFAULT_WO_OPS_SETTINGS.gmapsMaxPlaces),
    mapDiscoveryProvider: VALID_MAP_DISCOVERY_PROVIDERS.has(src.mapDiscoveryProvider)
      ? src.mapDiscoveryProvider
      : DEFAULT_WO_OPS_SETTINGS.mapDiscoveryProvider,
    tripadvisorReviews:
      typeof src.tripadvisorReviews === 'boolean'
        ? src.tripadvisorReviews
        : DEFAULT_WO_OPS_SETTINGS.tripadvisorReviews,
    googlePlacesPhotos:
      typeof src.googlePlacesPhotos === 'boolean'
        ? src.googlePlacesPhotos
        : DEFAULT_WO_OPS_SETTINGS.googlePlacesPhotos,
    pageSpeedCheckEnabled:
      typeof src.pageSpeedCheckEnabled === 'boolean'
        ? src.pageSpeedCheckEnabled
        : DEFAULT_WO_OPS_SETTINGS.pageSpeedCheckEnabled,
    googleMapsEmbed:
      typeof src.googleMapsEmbed === 'boolean'
        ? src.googleMapsEmbed
        : DEFAULT_WO_OPS_SETTINGS.googleMapsEmbed,
    webSearchProvider: VALID_WEB_SEARCH_PROVIDERS.has(src.webSearchProvider)
      ? src.webSearchProvider
      : DEFAULT_WO_OPS_SETTINGS.webSearchProvider,
    websiteFetchChain: VALID_FETCH_CHAINS.has(src.websiteFetchChain)
      ? src.websiteFetchChain
      : DEFAULT_WO_OPS_SETTINGS.websiteFetchChain,
    autoCollectSources: {
      website:
        typeof sources.website === 'boolean'
          ? sources.website
          : DEFAULT_WO_OPS_SETTINGS.autoCollectSources.website,
      facebook:
        typeof sources.facebook === 'boolean'
          ? sources.facebook
          : DEFAULT_WO_OPS_SETTINGS.autoCollectSources.facebook,
      instagram:
        typeof sources.instagram === 'boolean'
          ? sources.instagram
          : DEFAULT_WO_OPS_SETTINGS.autoCollectSources.instagram,
      tiktok:
        typeof sources.tiktok === 'boolean'
          ? sources.tiktok
          : DEFAULT_WO_OPS_SETTINGS.autoCollectSources.tiktok,
      youtube:
        typeof sources.youtube === 'boolean'
          ? sources.youtube
          : DEFAULT_WO_OPS_SETTINGS.autoCollectSources.youtube
    },
    depthPreset: VALID_DEPTH_PRESETS.has(src.depthPreset)
      ? src.depthPreset
      : DEFAULT_WO_OPS_SETTINGS.depthPreset,
    onPartialSource: VALID_PARTIAL_POLICIES.has(src.onPartialSource)
      ? src.onPartialSource
      : DEFAULT_WO_OPS_SETTINGS.onPartialSource,
    searchRunsPerDay: clampInt(src.searchRunsPerDay, 1, 500, DEFAULT_WO_OPS_SETTINGS.searchRunsPerDay),
    researchRunsPerDay: clampInt(src.researchRunsPerDay, 1, 500, DEFAULT_WO_OPS_SETTINGS.researchRunsPerDay),
    maxChargeUsdPerRun: clampFloat(
      src.maxChargeUsdPerRun,
      0.05,
      5.0,
      DEFAULT_WO_OPS_SETTINGS.maxChargeUsdPerRun
    ),
    researchDailyCapCents: clampInt(
      src.researchDailyCapCents,
      0,
      RESEARCH_CAP_MAX_CENTS,
      DEFAULT_WO_OPS_SETTINGS.researchDailyCapCents
    ),
    researchJobCapCents: clampInt(
      src.researchJobCapCents,
      0,
      RESEARCH_CAP_MAX_CENTS,
      DEFAULT_WO_OPS_SETTINGS.researchJobCapCents
    ),
    newPlacesPerAccountPerDay: clampInt(
      src.newPlacesPerAccountPerDay,
      0,
      10_000,
      DEFAULT_WO_OPS_SETTINGS.newPlacesPerAccountPerDay
    ),
    researchAgainPerAccountDay: clampInt(
      src.researchAgainPerAccountDay,
      0,
      10_000,
      DEFAULT_WO_OPS_SETTINGS.researchAgainPerAccountDay
    ),
    menuPhotosPerPlace: clampInt(src.menuPhotosPerPlace, 0, 60, DEFAULT_WO_OPS_SETTINGS.menuPhotosPerPlace),
    defaultCms: VALID_CMS.has(src.defaultCms) ? src.defaultCms : DEFAULT_WO_OPS_SETTINGS.defaultCms,
    templatePinPolicy: VALID_PIN_POLICIES.has(src.templatePinPolicy)
      ? src.templatePinPolicy
      : (LEGACY_PIN_POLICIES[src.templatePinPolicy] ?? DEFAULT_WO_OPS_SETTINGS.templatePinPolicy),
    pinnedTemplates: {
      joomla: pinOf(pins.joomla, 'joomla'),
      wordpress: pinOf(pins.wordpress, 'wordpress'),
      emdash: pinOf(pins.emdash, 'emdash')
    },
    visionEnabled:
      typeof src.visionEnabled === 'boolean' ? src.visionEnabled : DEFAULT_WO_OPS_SETTINGS.visionEnabled,
    maxVisionPictures: clampInt(src.maxVisionPictures, 10, 200, DEFAULT_WO_OPS_SETTINGS.maxVisionPictures),
    missingHeroMode: VALID_MISSING_HERO_MODES.has(src.missingHeroMode)
      ? src.missingHeroMode
      : DEFAULT_WO_OPS_SETTINGS.missingHeroMode,
    handoffMaxPictures: clampInt(src.handoffMaxPictures, 6, 60, DEFAULT_WO_OPS_SETTINGS.handoffMaxPictures),
    autoHandoff: VALID_AUTO_HANDOFF.has(src.autoHandoff)
      ? src.autoHandoff
      : DEFAULT_WO_OPS_SETTINGS.autoHandoff,
    googleMapsBrowserKey: browserKeyOf(src.googleMapsBrowserKey),
    slowSiteThreshold: clampInt(src.slowSiteThreshold, 1, 99, DEFAULT_WO_OPS_SETTINGS.slowSiteThreshold),
    siteChecksAutoLimit: clampInt(
      src.siteChecksAutoLimit,
      0,
      60,
      DEFAULT_WO_OPS_SETTINGS.siteChecksAutoLimit
    ),
    socialStatsAutoLimit: clampInt(
      src.socialStatsAutoLimit,
      0,
      40,
      DEFAULT_WO_OPS_SETTINGS.socialStatsAutoLimit
    ),
    socialStatsPerAccountPerDay: clampInt(
      src.socialStatsPerAccountPerDay,
      0,
      SOCIAL_STATS_CAP_MAX,
      DEFAULT_WO_OPS_SETTINGS.socialStatsPerAccountPerDay
    ),
    socialStatsProviderDailyCap: providerCapsOf(src.socialStatsProviderDailyCap),
    socialStatsProviderCycle: providerCyclesOf(src.socialStatsProviderCycle),
    socialStatsYouTubeDailyQuota: clampInt(src.socialStatsYouTubeDailyQuota, 0, 10000, 0),
    providerOrder: storedProviderOrder(src.providerOrder),
    demoRetentionEnabled:
      typeof src.demoRetentionEnabled === 'boolean'
        ? src.demoRetentionEnabled
        : DEFAULT_WO_OPS_SETTINGS.demoRetentionEnabled,
    ...Object.fromEntries(
      Object.entries(PUBLIC_FIND_RANGES).map(([key, [min, max]]) => [
        key,
        clampInt(src[key], min, max, DEFAULT_WO_OPS_SETTINGS[key])
      ])
    ),
    researchPublicDailyCapCents: clampInt(
      src.researchPublicDailyCapCents,
      ...PUBLIC_FIND_RANGES.researchPublicDailyCapCents,
      Math.min(
        PUBLIC_FIND_RANGES.researchPublicDailyCapCents[1],
        Math.round(
          clampInt(
            src.researchDailyCapCents,
            0,
            RESEARCH_CAP_MAX_CENTS,
            DEFAULT_WO_OPS_SETTINGS.researchDailyCapCents
          ) / 4
        )
      )
    ),
    ...Object.fromEntries(
      Object.entries(DEMO_RETENTION_RANGES).map(([key, [min, max]]) => [
        key,
        clampInt(src[key], min, max, DEFAULT_WO_OPS_SETTINGS[key])
      ])
    )
  }
}

/** A stored `providerOrder`: each group that still validates (the catalogue may have changed since). */
function storedProviderOrder(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const kept = {}
  for (const [group, list] of Object.entries(raw)) {
    const parsed = capabilities.parseProviderOrder({ [group]: list })
    if (parsed.ok) kept[group] = parsed.order[group]
  }
  return kept
}

/**
 * THE resolver research reads a capability group's provider order through: `{order, declared}`. Undeclared =
 * the order the runtime used before (the legacy `mapDiscoveryProvider` / `webSearchProvider` included);
 * `[]` = the group is off; a declared list runs exactly as declared.
 * @param {ReturnType<typeof normalizeWoOpsSettings>} settings @param {string} group
 */
export function resolveProviderOrder(settings, group) {
  return capabilities.resolveOrder(settings?.providerOrder ?? {}, group, settings ?? {})
}

/**
 * The rendered readers a menu page with no dish is read again through, in the website-content order (/ops/wo):
 * Jina and Firecrawl as that order names them, the default naming both, Jina first (product owner, 25/10/2026).
 * Only a reader with a key is named; an order the operator declared without them names none.
 */
export function menuRendererOrder(settings, keys) {
  const { order } = resolveProviderOrder(settings, 'website-content')
  return order.filter((id) => (id === 'jina' || id === 'firecrawl') && keys?.[id])
}

/** Every group's resolved order, as `connectorsFor(env, {order})` and the social stats chain take it. */
export function providerOrderFor(settings) {
  return Object.fromEntries(
    capabilities.CAPABILITY_GROUP_IDS.map((g) => [g, resolveProviderOrder(settings, g).order])
  )
}

/** The first demo retention field sent out of its range or of the wrong type, or null. */
function demoRetentionRefusal(candidate) {
  if (candidate.demoRetentionEnabled !== undefined && typeof candidate.demoRetentionEnabled !== 'boolean')
    return 'demoRetentionEnabled must be true or false.'
  for (const [key, [min, max]] of Object.entries(DEMO_RETENTION_RANGES)) {
    const value = candidate[key]
    if (value === undefined) continue
    if (!Number.isInteger(value) || value < min || value > max)
      return `${key} must be a whole number from ${min} to ${max}.`
  }
  return null
}

/** Each known budget's cap: a valid stored value, else the default; unknown names are dropped. */
function providerCapsOf(raw) {
  const given = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const defaults = DEFAULT_WO_OPS_SETTINGS.socialStatsProviderDailyCap
  return Object.fromEntries(
    SOCIAL_STATS_BUDGETS.map((b) => [b, clampInt(given[b], 0, SOCIAL_STATS_CAP_MAX, defaults[b])])
  )
}

const RAPID_BUDGETS = ['facebook-scraper3', 'instagram-looter2', 'instagram-stable', 'tiktok-api23', 'yt-api']
function validProviderCycle(c) {
  return (
    c &&
    Number.isInteger(c.limit) &&
    c.limit >= 0 &&
    c.limit <= SOCIAL_STATS_CAP_MAX &&
    Number.isInteger(c.used) &&
    c.used >= 0 &&
    c.used <= c.limit &&
    typeof c.startsAt === 'string' &&
    typeof c.endsAt === 'string' &&
    Number.isFinite(Date.parse(c.startsAt)) &&
    Number.isFinite(Date.parse(c.endsAt)) &&
    Date.parse(c.endsAt) > Date.parse(c.startsAt) &&
    Date.parse(c.endsAt) - Date.parse(c.startsAt) <= 366 * 86400000
  )
}
function providerCyclesOf(raw) {
  return Object.fromEntries(
    RAPID_BUDGETS.filter((b) => validProviderCycle(raw?.[b])).map((b) => [
      b,
      {
        limit: raw[b].limit,
        used: raw[b].used,
        startsAt: new Date(raw[b].startsAt).toISOString(),
        endsAt: new Date(raw[b].endsAt).toISOString()
      }
    ])
  )
}

/** A Google API key as Google issues them (`AIza` + 35 URL-safe characters); the stored form is trimmed. */
const GOOGLE_BROWSER_KEY = /^AIza[0-9A-Za-z_-]{20,96}$/

function browserKeyOf(value) {
  const key = typeof value === 'string' ? value.trim() : ''
  return GOOGLE_BROWSER_KEY.test(key) ? key : ''
}

function clampInt(val, min, max, fallback) {
  const n = typeof val === 'number' ? Math.trunc(val) : Number.parseInt(String(val ?? ''), 10)
  if (!Number.isFinite(n) || n < min || n > max) return fallback
  return n
}

function clampFloat(val, min, max, fallback) {
  const n = typeof val === 'number' ? val : Number.parseFloat(String(val ?? ''))
  if (!Number.isFinite(n) || n < min || n > max) return fallback
  return Math.round(n * 100) / 100
}

/**
 * Validate a settings payload sent to `PUT /api/ops/wo/settings`.
 */
export function parseWoOpsSettingsInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'INVALID_BODY', message: 'Expected a JSON object.' }
  }
  const candidate = body.settings && typeof body.settings === 'object' ? body.settings : body
  if (
    candidate.mapDiscoveryProvider !== undefined &&
    !VALID_MAP_DISCOVERY_PROVIDERS.has(candidate.mapDiscoveryProvider)
  ) {
    return {
      ok: false,
      error: 'INVALID_MAP_DISCOVERY_PROVIDER',
      message: 'mapDiscoveryProvider must be auto, google, apify, or osm.'
    }
  }
  if (
    candidate.webSearchProvider !== undefined &&
    !VALID_WEB_SEARCH_PROVIDERS.has(candidate.webSearchProvider)
  ) {
    return {
      ok: false,
      error: 'INVALID_WEB_SEARCH_PROVIDER',
      message: 'webSearchProvider must be auto, deepseek, jina, firecrawl, or off.'
    }
  }
  if (candidate.websiteFetchChain !== undefined && !VALID_FETCH_CHAINS.has(candidate.websiteFetchChain)) {
    return {
      ok: false,
      error: 'INVALID_FETCH_CHAIN',
      message: 'Invalid websiteFetchChain value.'
    }
  }
  if (candidate.defaultCms !== undefined && !VALID_CMS.has(candidate.defaultCms)) {
    return {
      ok: false,
      error: 'INVALID_DEFAULT_CMS',
      message: 'defaultCms must be joomla, wordpress, or emdash.'
    }
  }
  // Money is refused when wrong, never replaced by the default: a typo must not set Tracy's budget.
  for (const field of RESEARCH_CAPS) {
    const v = candidate[field]
    if (v !== undefined && !(Number.isInteger(v) && v >= 0 && v <= RESEARCH_CAP_MAX_CENTS)) {
      return {
        ok: false,
        error: 'INVALID_RESEARCH_CAP',
        message: `${field} must be a whole number of US cents from 0 to ${RESEARCH_CAP_MAX_CENTS}.`
      }
    }
  }
  if (candidate.templatePinPolicy !== undefined && !VALID_PIN_POLICIES.has(candidate.templatePinPolicy)) {
    return {
      ok: false,
      error: 'INVALID_TEMPLATE_PIN_POLICY',
      message: 'templatePinPolicy must be fallback-any-restaurant or strict.'
    }
  }
  if (candidate.pinnedTemplates !== undefined) {
    const pins = candidate.pinnedTemplates
    const bad =
      !pins || typeof pins !== 'object' || Array.isArray(pins)
        ? ['pinnedTemplates']
        : Object.entries(pins).filter(
            ([cms, tag]) =>
              !VALID_CMS.has(cms) ||
              (tag !== '' && (typeof tag !== 'string' || !TEMPLATE_TAG.test(tag.trim())))
          )
    if (bad.length > 0) {
      return {
        ok: false,
        error: 'INVALID_PINNED_TEMPLATE',
        message: 'Each pinned template is a release tag like tracy-base/wp7, or empty for the default.'
      }
    }
  }
  if (candidate.googleMapsBrowserKey !== undefined) {
    const key =
      typeof candidate.googleMapsBrowserKey === 'string' ? candidate.googleMapsBrowserKey.trim() : null
    if (key === null || (key !== '' && !GOOGLE_BROWSER_KEY.test(key))) {
      return {
        ok: false,
        error: 'INVALID_GOOGLE_MAPS_BROWSER_KEY',
        message: 'googleMapsBrowserKey must look like AIza… (a Google API key), or be empty.'
      }
    }
  }
  if (
    candidate.socialStatsProviderCycle !== undefined &&
    (!candidate.socialStatsProviderCycle ||
      typeof candidate.socialStatsProviderCycle !== 'object' ||
      Array.isArray(candidate.socialStatsProviderCycle) ||
      Object.entries(candidate.socialStatsProviderCycle).some(
        ([b, c]) => !RAPID_BUDGETS.includes(b) || !validProviderCycle(c)
      ))
  )
    return {
      ok: false,
      error: 'INVALID_SOCIAL_QUOTA',
      message: 'Each RapidAPI allocation requires a limit, used calls, and an exact billing cycle.'
    }
  if (
    candidate.socialStatsYouTubeDailyQuota !== undefined &&
    !(
      Number.isInteger(candidate.socialStatsYouTubeDailyQuota) &&
      candidate.socialStatsYouTubeDailyQuota >= 0 &&
      candidate.socialStatsYouTubeDailyQuota <= 10000
    )
  )
    return {
      ok: false,
      error: 'INVALID_SOCIAL_QUOTA',
      message: 'YouTube allocation must be a whole number from 0 to 10000 units per Pacific day.'
    }
  if (candidate.providerOrder !== undefined) {
    const parsed = capabilities.parseProviderOrder(candidate.providerOrder)
    if (!parsed.ok) return { ok: false, error: 'INVALID_PROVIDER_ORDER', message: parsed.message }
  }
  const retention = demoRetentionRefusal(candidate)
  if (retention) return { ok: false, error: 'INVALID_DEMO_RETENTION', message: retention }
  for (const [key, [min, max]] of Object.entries(PUBLIC_FIND_RANGES)) {
    const value = candidate[key]
    if (value !== undefined && !(Number.isInteger(value) && value >= min && value <= max))
      return {
        ok: false,
        error: 'INVALID_PUBLIC_FIND_LIMIT',
        message: `${key} must be a whole number from ${min} to ${max}.`
      }
  }
  return { ok: true, settings: normalizeWoOpsSettings(candidate) }
}

/**
 * Read the deployment's Website Opportunities settings from `wo_ops_setting`.
 * Falls back to defaults when the table or row is absent.
 */
export async function readWoOpsSettings(pool) {
  const defaults = normalizeWoOpsSettings({})
  if (!pool) return { settings: defaults, updatedBy: null, updatedAt: null }
  try {
    const { rows } = await pool.query('select settings, updated_by, updated_at from wo_ops_setting where id')
    if (!rows[0]) return { settings: defaults, updatedBy: null, updatedAt: null }
    return {
      settings: normalizeWoOpsSettings(rows[0].settings),
      updatedBy: rows[0].updated_by ?? null,
      updatedAt: rows[0].updated_at?.toISOString?.() ?? null
    }
  } catch {
    return { settings: defaults, updatedBy: null, updatedAt: null }
  }
}

/**
 * Save updated Website Opportunities settings into `wo_ops_setting`.
 */
export async function saveWoOpsSettings(pool, settings, updatedBy) {
  const normalized = normalizeWoOpsSettings(settings)
  await pool.query(
    `insert into wo_ops_setting (id, settings, updated_by, updated_at)
     values (true, $1::jsonb, $2, now())
     on conflict (id) do update set
       settings = $1::jsonb,
       updated_by = excluded.updated_by,
       updated_at = now()`,
    [JSON.stringify(normalized), updatedBy]
  )
  return normalized
}

export function envFallbackKey(config, provider) {
  if (provider === 'apify') {
    const k = config?.apifyToken
    return typeof k === 'string' && k.trim() !== '' ? k.trim() : null
  }
  if (provider === 'deepseek') {
    const modelKey = config?.deepseekApiKey || config?.model?.apiKey
    return typeof modelKey === 'string' && modelKey.trim() !== '' ? modelKey.trim() : null
  }
  if (provider === 'firecrawl') {
    const k = config?.firecrawlApiKey
    return typeof k === 'string' && k.trim() !== '' ? k.trim() : null
  }
  if (provider === 'jina') {
    const k = config?.jinaApiKey
    return typeof k === 'string' && k.trim() !== '' ? k.trim() : null
  }
  if (provider === 'google') {
    const k = config?.googleApiKey || config?.googlePlacesApiKey
    return typeof k === 'string' && k.trim() !== '' ? k.trim() : null
  }
  if (provider === 'serpapi') {
    const k = config?.serpapiApiKey
    return typeof k === 'string' && k.trim() !== '' ? k.trim() : null
  }
  if (provider === 'litescrape') {
    const k = config?.litescrapeApiKey
    return typeof k === 'string' && k.trim() !== '' ? k.trim() : null
  }
  if (provider === 'rapidapi') {
    const k = config?.rapidapiKey
    return typeof k === 'string' && k.trim() !== '' ? k.trim() : null
  }
  if (provider === 'scrapecreators') {
    const k = config?.scrapeCreatorsApiKey
    return typeof k === 'string' && k.trim() !== '' ? k.trim() : null
  }
  return null
}

export const KEY_COLUMNS_SQL = WO_PROVIDERS.map((p) => PROVIDER_COLUMN[p]).join(', ')

/**
 * Each provider's key: the one sealed in `row` wins over the environment fallback. `openSecret` is the host's
 * unsealing (`host.openSecret`); without it only the environment's keys are read.
 */
export async function openProviderKeys(row, config, openSecret) {
  const out = {}
  for (const provider of WO_PROVIDERS) {
    const cipher = row?.[PROVIDER_COLUMN[provider]] ?? null
    const opened =
      cipher && config?.sessionSecret && openSecret ? await openSecret(cipher, config.sessionSecret) : null
    out[provider] = opened || envFallbackKey(config, provider)
  }
  return out
}

let runtimeReadWarned = false

/**
 * What the Website Opportunities pipeline runs with: `{keys: {google, apify, firecrawl, jina,
 * deepseek, rapidapi}, settings}`. The only door `opportunities/*` reads keys and settings through. Read on
 * every call (one row, no cache) so a change on `/ops/wo` applies to the next search or job; a
 * database error falls back to env keys and defaults and is logged once, never thrown. `openSecret` is
 * `host.openSecret` (Tracy code calls `lib/wo-ops.js` `woRuntime`, which passes its own). `menuVisionDoor`
 * (`menu-photo-reading.js menuVisionDoorFor`) becomes `keys.menuVision`, resolved only when a Research again plan asks.
 */
export async function readWoRuntime(pool, config, { log = console, openSecret, menuVisionDoor } = {}) {
  let row = null
  let readable = true
  if (pool) {
    try {
      const { rows } = await pool.query(`select settings, ${KEY_COLUMNS_SQL} from wo_ops_setting where id`)
      row = rows[0] ?? null
    } catch (error) {
      readable = false
      if (!runtimeReadWarned) {
        runtimeReadWarned = true
        log.warn?.(`[wo-ops] settings unreadable, using env keys and defaults: ${error?.message ?? error}`)
      }
    }
  }
  const keys = await openProviderKeys(row, config, openSecret)
  if (typeof menuVisionDoor === 'function') keys.menuVision = menuVisionDoor
  return {
    keys,
    settings: normalizeWoOpsSettings(row?.settings),
    readable
  }
}
