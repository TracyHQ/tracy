// Provider chain per network: the next tier runs only when the previous one failed for a technical reason.
import { parseSocialUrl } from './handles.mjs'
import { PROVIDERS, SocialStatsError } from './providers.mjs'

/**
 * Codes that say nothing about the profile, so the next provider may still answer. `credential_missing` is
 * here too: each tier has its own credential (RapidAPI key, Google key, Apify token). `not_found` never is.
 */
export const ADVANCE_CODES = Object.freeze(
  new Set([
    'rate_limited',
    'quota_exhausted',
    'subscription_missing',
    'blocked',
    'provider_error',
    'timeout',
    'schema_error',
    'credential_missing'
  ])
)

export const SOCIAL_CHAINS = Object.freeze({
  instagram: Object.freeze([
    'instagram/scrapecreators',
    'instagram/looter2',
    'instagram/stable',
    'instagram/apify'
  ]),
  facebook: Object.freeze(['facebook/scrapecreators', 'facebook/scraper3', 'facebook/apify']),
  tiktok: Object.freeze(['tiktok/scrapecreators', 'tiktok/api23', 'tiktok/apify']),
  youtube: Object.freeze(['youtube/official', 'youtube/yt-api'])
})

/** A capability provider id (`domain/capabilities.mjs`) → this network's stats tier. */
const STATS_TIER = Object.freeze({
  facebook: Object.freeze({
    scrapecreators: 'facebook/scrapecreators',
    'rapidapi-scraper3': 'facebook/scraper3',
    apify: 'facebook/apify'
  }),
  instagram: Object.freeze({
    scrapecreators: 'instagram/scrapecreators',
    'rapidapi-looter2': 'instagram/looter2',
    'rapidapi-stable': 'instagram/stable',
    apify: 'instagram/apify'
  }),
  tiktok: Object.freeze({
    scrapecreators: 'tiktok/scrapecreators',
    'rapidapi-api23': 'tiktok/api23',
    apify: 'tiktok/apify'
  }),
  youtube: Object.freeze({ 'youtube-official': 'youtube/official', 'rapidapi-yt-api': 'youtube/yt-api' })
})

/** The stats tiers of an operator's provider order; providers with no stats adapter are left out. */
export function statsTiersOf(network, order) {
  const tiers = STATS_TIER[network]
  if (!tiers) throw new RangeError(`no social stats chain for network ${network}`)
  return order.map((id) => tiers[id]).filter(Boolean)
}

function apifyProvider(network) {
  return Object.freeze({
    network,
    provider: 'apify',
    credential: 'apify',
    async fetchProfile(target, deps = {}) {
      if (!deps.key)
        throw new SocialStatsError('credential_missing', 'apify: no Apify token', { provider: 'apify' })
      if (typeof deps.apifyProfile !== 'function')
        throw new SocialStatsError('provider_error', 'apify: durable runner unavailable', {
          provider: 'apify'
        })
      return deps.apifyProfile(target)
    }
  })
}
export const SOCIAL_PROVIDERS = Object.freeze({
  ...PROVIDERS,
  'instagram/apify': apifyProvider('instagram'),
  'facebook/apify': apifyProvider('facebook'),
  'tiktok/apify': apifyProvider('tiktok')
})

function keyFor(credential, deps) {
  if (credential === 'apify') return deps.apifyToken
  return deps.keys?.[credential]
}

/**
 * Runs the network's chain for one profile URL. `deps`: `{keys: {rapidapi, google}, apifyToken, fetch, timeoutMs,
 * now}`, `order` (the capability group's provider order, `domain/capabilities.mjs`), plus `providers`/`chains`
 * overrides for tests. Returns `{stat, provider, attempts, fallbackFrom?}`;
 * throws the deciding SocialStatsError with `attempts` (`[{provider, code}]`) when no tier answers.
 */
export async function fetchSocialStats({ network, url }, deps = {}) {
  const chain =
    deps.chains?.[network] ?? (deps.order ? statsTiersOf(network, deps.order) : SOCIAL_CHAINS[network])
  if (!chain) throw new RangeError(`no social stats chain for network ${network}`)
  if (!parseSocialUrl(url ?? '', { network })) {
    throw Object.assign(new SocialStatsError('not_found', `not a ${network} profile URL`), { attempts: [] })
  }
  const providers = { ...SOCIAL_PROVIDERS, ...deps.providers }
  const attempts = []
  let last
  for (const id of chain) {
    const p = providers[id]
    if (!p) continue
    try {
      const stat = await p.fetchProfile(
        { url },
        {
          key: keyFor(p.credential, deps),
          fetch: deps.fetch,
          timeoutMs: deps.timeoutMs,
          now: deps.now,
          apifyProfile: deps.apifyProfile
        }
      )
      return attempts.length
        ? { stat, provider: p.provider, attempts, fallbackFrom: attempts[0].provider }
        : { stat, provider: p.provider, attempts }
    } catch (e) {
      const code = e instanceof SocialStatsError ? e.code : 'provider_error'
      attempts.push({ provider: p.provider, code })
      last =
        e instanceof SocialStatsError
          ? e
          : new SocialStatsError('provider_error', `${p.provider}: unexpected failure`, {
              provider: p.provider
            })
      if (!ADVANCE_CODES.has(code)) break
    }
  }
  last ??= new SocialStatsError('provider_error', `no provider configured for ${network}`)
  last.attempts = attempts
  throw last
}
