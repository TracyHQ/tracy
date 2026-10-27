import { crawlWebsiteWithFallback } from './website-browser.mjs'
import { resolveOrder } from './capabilities.mjs'
import { collectSocialProfile, PROFILE_TIERS } from './social-profile.mjs'

export const SOURCES = Object.freeze(['website', 'facebook', 'instagram', 'tiktok', 'youtube'])

const SOCIAL = Object.freeze(['facebook', 'instagram', 'tiktok', 'youtube'])

function unavailable(source, reason) {
  return {
    available: false,
    reason,
    async collect() {
      return {
        source,
        status: 'blocked',
        reason,
        cursor: null,
        posts: [],
        media: [],
        coverage: { fetched: 0 }
      }
    }
  }
}

const keyOf = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * One collect(handleOrUrl, {cursor, limit}, deps) per source; deps = {fetch, resolve, now, charge}.
 * Credentials come only from `env` on the server (`APIFY_TOKEN`, `SCRAPECREATORS_API_KEY`); nothing is mocked
 * when one is missing. A social source walks its capability group's provider order (`options.order`, the
 * operator's `providerOrder`; undeclared = the default order) through `collectSocialProfile`.
 */
export function connectorsFor(env = {}, options = {}) {
  const order = options.order ?? {}
  // Callers that predate provider order reserve the Apify run around collect() themselves.
  const callerCharges =
    options.order === undefined
      ? (spec, call) => {
          if (spec.provider !== 'apify')
            throw new TypeError(`${spec.provider}: a paid provider needs deps.charge`)
          return call()
        }
      : undefined
  const token = keyOf(env.APIFY_TOKEN)
  const keys = { apify: token, scrapecreators: keyOf(env.SCRAPECREATORS_API_KEY) }
  const social = (source) => {
    const ids = resolveOrder(order, source).order.filter((id) => PROFILE_TIERS[source][id])
    if (!ids.length) return unavailable(source, 'switched_off')
    const runnable = ids.find((id) => {
      const credential = PROFILE_TIERS[source][id].credential
      return !credential || keys[credential]
    })
    if (!runnable) return unavailable(source, 'credential_missing')
    return {
      available: true,
      provider: runnable,
      ...(runnable === 'youtube-public' ? { coverage: 'partial' } : {}),
      collect: (h, opts = {}, deps = {}) =>
        collectSocialProfile(source, h, opts, {
          ...deps,
          order: ids,
          keys,
          charge: deps.charge ?? callerCharges
        })
    }
  }
  return {
    website: {
      available: true,
      provider: token ? 'website+apify-browser' : 'website',
      collect: (url, { cursor = null, limit } = {}, deps = {}) =>
        crawlWebsiteWithFallback(url, { cursor, ...(limit ? { maxPages: limit } : {}) }, { ...deps, token })
    },
    ...Object.fromEntries(SOCIAL.map((s) => [s, social(s)]))
  }
}
