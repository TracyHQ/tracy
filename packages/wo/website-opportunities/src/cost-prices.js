/**
 * The most one billable research call may cost, in whole US cents, rounded UP: what
 * `cost-ledger.js` reserves before the call goes out. A ceiling, not a bill: a settled call counts
 * what it really cost when the provider says so.
 *
 * Every number carries its source. `UNVERIFIED` = not checked against the provider's price page or a
 * measured bill in this repo; each such ceiling is set above the list price we remember, so a wrong
 * guess holds too much (research pauses early), never too little (Tracy is billed past the cap).
 * Re-check them against the invoices once the ledger has a month of rows.
 */

/** Apify actors, per item returned (the run bills per result), plus a run start fee. */
const APIFY_ACTORS = Object.freeze({
  // Measured 18/10/2026 (`domain/apify.mjs`): 200 Facebook posts cost $1.00 → 0.5¢ a post.
  'apify~facebook-posts-scraper': { perItemCents: 0.5 },
  // Measured 18/10/2026: 200 Instagram posts cost $0.54 → 0.27¢ a post.
  'apify~instagram-scraper': { perItemCents: 0.27 },
  // UNVERIFIED: no TikTok bill measured; held at twice the dearest measured actor.
  'clockworks~tiktok-scraper': { perItemCents: 1 },
  // UNVERIFIED: no YouTube bill measured; held at twice the dearest measured actor.
  'streamers~youtube-scraper': { perItemCents: 1 }
})
// UNVERIFIED: Apify's compute for starting one run (memory × seconds), held at 1¢.
const APIFY_START_CENTS = 1
const APIFY_UNKNOWN_ACTOR = { perItemCents: 1 }

/** Fixed-price calls: provider → operation → cents a call. */
const FIXED = Object.freeze({
  // Checked 21/10/2026: https://litescrape.com/pricing ($0.15 / 1,000 requests).
  // The integer-cent ledger rounds each request UP to 1 cent, including unknown timeout outcomes.
  // Checked 21/10/2026: https://rapidapi.com/oneapiproject/api/tripadvisor-api1/pricing
  // Basic: 500/month hard limit; Pro overage $0.004/request (0.4 cents). Reserve 1 cent per
  // actual attempt, including failures. Subscription invoices/bandwidth are not reconciled here.
  // UNVERIFIED: the social-stats RapidAPI listings (facebook-scraper3, instagram-looter2/stable, tiktok-api23,
  // yt-api) are flat monthly plans; held at 1 cent a request like Tripadvisor.
  rapidapi: Object.freeze({
    'tripadvisor-search': 1,
    'tripadvisor-place': 1,
    'tripadvisor-reviews': 1,
    'social-stats:facebook': 1,
    'social-stats:instagram': 1,
    'social-stats:tiktok': 1,
    'social-stats:youtube': 1
  }),
  // SerpApi Starter: $25/1,000 searches (checked 2026-10-21, serpapi.com/pricing).
  // Reserve 3 cents; subscription/free credits are not reconciled invoice costs.
  serpapi: Object.freeze({
    'tripadvisor-search': 3,
    'tripadvisor-place': 3,
    'tripadvisor-reviews': 3,
    'google-maps-place': 3,
    'google-maps-overview': 3,
    'google-maps-menu': 3,
    'google-search': 3,
    // The same Google search, made by the social page search (`web-search` group) rather than the menu links.
    'web-search': 3
  }),
  litescrape: Object.freeze({ search: 1, place: 1, reviews: 1 }),
  // Checked 22/10/2026 (vendor pricing page): $47 per 25,000 credits, one
  // credit a request ($0.00188). Each request is rounded UP to 1 cent; a profile = its requests.
  scrapecreators: Object.freeze({
    'facebook-profile': 2,
    'instagram-profile': 1,
    'tiktok-profile': 2,
    'google-search': 1,
    // Social stats (`social-stats.js`) count each request on its own: one credit, rounded up to 1 cent.
    'social-stats:facebook': 1,
    'social-stats:instagram': 1,
    'social-stats:tiktok': 1
  }),
  // UNVERIFIED: Jina Search bills tokens (~10k a search at well under 1¢); held at 1¢ a search.
  // UNVERIFIED: a Reader page is ~a few thousand tokens; held at 1¢ a page.
  jina: Object.freeze({ search: 1, read: 1 }),
  // UNVERIFIED: Firecrawl Search bills about a credit per result (8 results, Hobby ~0.5¢ a credit); held at 5¢.
  // UNVERIFIED: a Firecrawl scrape is one credit (~0.5¢ on Hobby); held at 1¢.
  firecrawl: Object.freeze({ search: 5, read: 1 }),
  google: Object.freeze({
    // Verified 2026-10-20: Text Search Enterprise $35/1000; held at 5 cents per page.
    // https://developers.google.com/maps/billing-and-pricing/pricing
    'place-search-text': 5,
    // Conservative ceiling for the location-only Place Details request used for branch matching.
    'place-location': 3,
    // UNVERIFIED: Places API (New) Place Details with the Atmosphere field mask (`GPLACES_DETAIL_FIELDS`)
    // bills the Enterprise + Atmosphere SKU, list price ~$25 per 1000 calls (2.5¢) → 3¢.
    'place-details': 3,
    // UNVERIFIED: Place Photos (New), list price ~$7 per 1000 calls (0.7¢) → 1¢.
    'place-photo': 1,
    // The YouTube Data API (social stats' `youtube-official` tier) is free within its daily quota; counted at 0.
    'social-stats:youtube': 0,
    // UNVERIFIED: the PageSpeed Insights API is free with a daily quota; nothing to reserve, the row
    // still counts the call.
    pagespeed: 0
  })
})

/**
 * Vision models, per million tokens. UNVERIFIED: DeepSeek's `deepseek-chat` list price as remembered
 * (~$0.27 in / $1.10 out per million), held at about twice that. A model not listed is held at the
 * `unknown` rate, ten times DeepSeek's.
 */
const VISION_MODELS = Object.freeze({
  'deepseek-chat': { inCentsPerM: 60, outCentsPerM: 250 },
  // Checked 20/10/2026 against api-docs.deepseek.com/quick_start/pricing (`quality-prices.json`); cache hits not discounted.
  'deepseek-flash': { inCentsPerM: 30, outCentsPerM: 120 },
  unknown: { inCentsPerM: 600, outCentsPerM: 2500 }
})
// UNVERIFIED: one batch of 8 thumbnails of 512px plus the prompt, ~12k tokens in and ~1.5k out.
const VISION_TOKENS_PER_CALL = { promptTokens: 12_000, completionTokens: 1_500 }

/**
 * The ceiling of one Apify actor run asking for `items` results with Apify's own `maxTotalChargeUsd`.
 * The larger of the two bounds: the charge cap binds a pay-per-event actor, `maxItems` a
 * pay-per-result one, and which one an actor is can change without notice.
 * @param {string} actor @param {{items: number, maxChargeUsd?: number}} run
 */
export function apifyCeilingCents(actor, { items, maxChargeUsd = 0 }) {
  const rate = APIFY_ACTORS[actor] ?? APIFY_UNKNOWN_ACTOR
  const perItem = APIFY_START_CENTS + Math.max(0, items) * rate.perItemCents
  const cap = Number.isFinite(maxChargeUsd) && maxChargeUsd > 0 ? maxChargeUsd * 100 : 0
  return Math.ceil(Math.max(perItem, cap))
}

/**
 * The ceiling of one fixed-price call, or of one vision call (`provider` 'vision', `operation` the model).
 * @param {string} provider @param {string} operation
 */
export function ceilingCents(provider, operation) {
  if (provider === 'vision') return visionCostCents(operation, VISION_TOKENS_PER_CALL)
  const cents = FIXED[provider]?.[operation]
  if (cents === undefined) throw new Error(`cost-prices: no price for ${provider}/${operation}`)
  return cents
}

/**
 * What a vision call cost from the usage its answer reports, rounded up to a whole cent.
 * @param {string} model @param {{promptTokens: number, completionTokens: number}} usage
 */
export function visionCostCents(model, { promptTokens, completionTokens }) {
  const rate = VISION_MODELS[model] ?? VISION_MODELS.unknown
  const cents = (promptTokens * rate.inCentsPerM + completionTokens * rate.outCentsPerM) / 1_000_000
  return Math.ceil(cents)
}
