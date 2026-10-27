// What research can ask for (a capability group) and who can answer it (providers), in the order an
// operator sets on /ops/wo › Settings. See the shared research contract.

/** Credential names a provider needs; `null` in the catalogue = none (a direct read, a free public page). */
export const PROVIDER_CREDENTIALS = Object.freeze([
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

const p = (id, credential, label) => Object.freeze({ id, credential, label })
const group = (id, label, providers, defaultOrder = providers.map((x) => x.id)) =>
  Object.freeze({ id, label, providers: Object.freeze(providers), defaultOrder: Object.freeze(defaultOrder) })

/**
 * Each group's `defaultOrder` is what runs while the operator has not declared the group: the runtime
 * order before provider ordering existed. The social groups use the social stats chain (`SOCIAL_CHAINS`),
 * which the place profile now shares.
 */
export const CAPABILITY_GROUPS = Object.freeze([
  group('facebook', 'Facebook page', [
    p('scrapecreators', 'scrapecreators', 'ScrapeCreators'),
    p('rapidapi-scraper3', 'rapidapi', 'RapidAPI · Facebook Scraper3'),
    p('apify', 'apify', 'Apify')
  ]),
  group('instagram', 'Instagram profile', [
    p('scrapecreators', 'scrapecreators', 'ScrapeCreators'),
    p('rapidapi-looter2', 'rapidapi', 'RapidAPI · Instagram Looter2'),
    p('rapidapi-stable', 'rapidapi', 'RapidAPI · Instagram Scraper Stable'),
    p('apify', 'apify', 'Apify')
  ]),
  group('tiktok', 'TikTok profile', [
    p('scrapecreators', 'scrapecreators', 'ScrapeCreators'),
    p('rapidapi-api23', 'rapidapi', 'RapidAPI · TikTok API23'),
    p('apify', 'apify', 'Apify')
  ]),
  group('youtube', 'YouTube channel', [
    p('youtube-official', 'google', 'YouTube Data API'),
    p('rapidapi-yt-api', 'rapidapi', 'RapidAPI · yt-api'),
    p('apify', 'apify', 'Apify'),
    p('youtube-public', null, 'Public channel page')
  ]),
  group(
    'website-content',
    'Website content',
    [
      p('direct', null, 'Direct crawl'),
      p('apify-browser', 'apify', 'Apify browser'),
      p('jina', 'jina', 'Jina Reader'),
      p('firecrawl', 'firecrawl', 'Firecrawl')
    ]
    // The default is all four (product owner, 25/10/2026): Jina and Firecrawl after the readers research ran
    // before, so a thin page, and a menu page with no dish, is read again by default; /ops may reorder or drop them.
  ),
  // DeepSeek has no web search API; research ran only ScrapeCreators before this group was ordered.
  group(
    'web-search',
    'Web search',
    [
      p('scrapecreators-google', 'scrapecreators', 'ScrapeCreators Google search'),
      p('jina', 'jina', 'Jina search'),
      p('firecrawl', 'firecrawl', 'Firecrawl search'),
      p('serpapi-google-search', 'serpapi', 'SerpApi Google search')
    ],
    ['scrapecreators-google']
  ),
  group('tripadvisor', 'Tripadvisor reviews', [
    p('serpapi', 'serpapi', 'SerpApi'),
    p('rapidapi-tripadvisor', 'rapidapi', 'RapidAPI · TripAdvisor (OneAPI)'),
    p('litescrape', 'litescrape', 'Litescrape')
  ]),
  group('google-reviews', 'Google reviews', [
    p('google-places', 'google', 'Google Places API'),
    p('serpapi-google-maps', 'serpapi', 'SerpApi Google Maps')
  ]),
  group(
    'menu-links',
    'Menu links',
    [
      p('website', null, "The place's website"),
      p('serpapi-google-search', 'serpapi', 'SerpApi Google search'),
      p('scrapecreators-google', 'scrapecreators', 'ScrapeCreators Google search')
    ],
    ['website']
  ),
  group('menu-photos', 'Menu photos', [
    p('serpapi-google-maps', 'serpapi', 'SerpApi Google Maps (Menu photos)')
  ]),
  // Menu photos are read by the vision model assigned in /ops › Models & AI; off until an operator adds it here (decided 23/10/2026).
  group(
    'menu-items',
    'Menu dishes and prices',
    [
      p('document-text', null, 'Menu text (PDF and pages)'),
      p('photo-vision', null, 'Menu photos (vision model)')
    ],
    ['document-text']
  ),
  group('map-discovery', 'Find places in an area', [
    p('google', 'google', 'Google Places API'),
    p('apify', 'apify', 'Apify Google Maps'),
    p('osm', null, 'OpenStreetMap')
  ])
])

export const CAPABILITY_GROUP_IDS = Object.freeze(CAPABILITY_GROUPS.map((g) => g.id))

const GROUPS = new Map(CAPABILITY_GROUPS.map((g) => [g.id, g]))

/** The group, or a RangeError: a caller asking for an unknown group is a bug, not a setting. */
export function capabilityGroup(id) {
  const g = GROUPS.get(id)
  if (!g) throw new RangeError(`unknown capability group ${id}`)
  return g
}

/** Settings that ordered a group before `providerOrder` existed, read while that group is undeclared. */
const LEGACY = Object.freeze({
  'map-discovery': (s) =>
    ({ auto: ['google', 'apify', 'osm'], google: ['google', 'osm'], apify: ['apify', 'osm'], osm: ['osm'] })[
      s.mapDiscoveryProvider ?? 'auto'
    ],
  // The old picker never reached research; only its `off` is kept.
  'web-search': (s) => (s.webSearchProvider === 'off' ? [] : undefined)
})

/** What a group runs while undeclared. `legacy` = the deployment's settings (`mapDiscoveryProvider`, `webSearchProvider`). */
export function defaultOrderOf(groupId, legacy = {}) {
  const g = capabilityGroup(groupId)
  const old = LEGACY[groupId]?.(legacy ?? {})
  const known = new Set(g.providers.map((x) => x.id))
  return Array.isArray(old) && old.every((id) => known.has(id)) ? [...old] : [...g.defaultOrder]
}

/**
 * The order one group runs in: a declared list exactly as declared (`[]` = the group is off, nothing is
 * appended), else `defaultOrderOf`. `providerOrder` must already be valid (`parseProviderOrder`).
 */
export function resolveOrder(providerOrder, groupId, legacy = {}) {
  capabilityGroup(groupId)
  const declared = providerOrder && Object.hasOwn(providerOrder, groupId) ? providerOrder[groupId] : undefined
  return Array.isArray(declared)
    ? { order: [...declared], declared: true }
    : { order: defaultOrderOf(groupId, legacy), declared: false }
}

/**
 * `{ [group]: providerId[] }` as an operator sends it → `{ok, order}` or `{ok: false, message}`. Nothing
 * unknown, repeated or of the wrong type is kept or replaced by a default: the whole value is refused.
 */
export function parseProviderOrder(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { ok: false, message: 'providerOrder must be an object of capability groups.' }
  const order = {}
  for (const [groupId, list] of Object.entries(value)) {
    const g = GROUPS.get(groupId)
    if (!g) return { ok: false, message: `providerOrder: ${groupId} is not a capability group.` }
    if (!Array.isArray(list))
      return { ok: false, message: `providerOrder.${groupId} must be a list of providers.` }
    const known = new Set(g.providers.map((x) => x.id))
    const seen = new Set()
    for (const id of list) {
      if (typeof id !== 'string' || !known.has(id))
        return { ok: false, message: `providerOrder.${groupId}: ${String(id)} cannot answer this group.` }
      if (seen.has(id)) return { ok: false, message: `providerOrder.${groupId} names ${id} twice.` }
      seen.add(id)
    }
    order[groupId] = [...list]
  }
  return { ok: true, order }
}

// ── one call's result ─────────────────────────────────────────────────────────────────────────────

/** `status` of one provider call. `skipped` = it gave nothing (no key, refused, down); `reason` says why. */
export const ATTEMPT_STATUSES = Object.freeze(['complete', 'partial', 'not_found', 'skipped'])

/** Why a provider gave nothing. Each one lets the next provider try; `not_found` (a status) never does. */
export const FALLBACK_REASONS = Object.freeze([
  'credential_missing',
  'credential_invalid',
  'quota',
  'provider_error',
  'timeout'
])

/**
 * One provider call: `{provider, status, data, reason?}`. `data` is what it answered (null when skipped);
 * partial data is still data, kept with the provider that gave it.
 */
export function providerAnswer(provider, status, { data = null, reason } = {}) {
  if (!ATTEMPT_STATUSES.includes(status)) throw new RangeError(`unknown provider status ${status}`)
  return reason ? { provider, status, data, reason } : { provider, status, data }
}

/**
 * Runs `tryOne(providerId)` over `order` until one answers. A `skipped` answer falls to the next provider,
 * `not_found` and `complete` stop; `partial` stops unless `continueOnPartial` (the caller merges
 * `answers`). A thrown error (a refused budget, a bug) is not an answer and propagates.
 * Returns `{answer, answers, attempts, decisive}`: `answer` the last complete answer or the first partial
 * one; `attempts` each call without its data; `decisive` the call that best explains why nothing answered
 * (a provider that was really asked beats one skipped for a missing key).
 */
export async function runInOrder(order, tryOne, { continueOnPartial = false } = {}) {
  const answers = []
  const attempts = []
  let decisive = null
  for (const id of order) {
    const a = await tryOne(id)
    attempts.push(
      a.reason
        ? { provider: a.provider ?? id, status: a.status, reason: a.reason }
        : { provider: a.provider ?? id, status: a.status }
    )
    if (a.status === 'complete' || a.status === 'partial') answers.push(a)
    else if (!decisive || decisive.reason === 'credential_missing' || a.reason !== 'credential_missing')
      decisive = a
    if (a.status === 'complete' || a.status === 'not_found') break
    if (a.status === 'partial' && !continueOnPartial) break
  }
  const complete = answers.filter((a) => a.status === 'complete').at(-1)
  return { answer: complete ?? answers[0] ?? null, answers, attempts, decisive }
}
