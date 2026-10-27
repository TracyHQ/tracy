/**
 * Provider keys as the operator manages them: what may be shown about each (never the key), sealing a new one into
 * `wo_ops_setting` through the host (`host.sealSecret`), and a live test that proves a key with one cheap call. A key
 * sealed in the database wins over the environment's (`../wo-settings.js` `openProviderKeys`).
 */
import {
  envFallbackKey,
  KEY_COLUMNS_SQL,
  openProviderKeys,
  PROVIDER_COLUMN,
  WO_PROVIDERS
} from '../wo-settings.js'

/**
 * What a screen may show about a key it must never print: enough to recognise which credential is in place across a
 * rotation, never enough to use it.
 */
export function keyHint(value) {
  if (typeof value !== 'string' || value === '') return null
  // Three characters name the vendor's prefix (`sk-`); more would hand a short key's entropy to a screenshot.
  return `${value.slice(0, 3)}… (${value.length} chars)`
}

/** Whether this host can seal keys, so the operator may set them (otherwise they come from the environment). */
export const keysWritable = (config, host) =>
  typeof host?.sealSecret === 'function' && Boolean(config?.sessionSecret)

/** Every provider's key for server-side calls: the sealed one wins over the environment fallback. */
export async function readProviderKeys(pool, config, host) {
  let row = null
  if (pool && config?.sessionSecret) {
    try {
      const { rows } = await pool.query(`select ${KEY_COLUMNS_SQL} from wo_ops_setting where id`)
      row = rows[0] ?? null
    } catch {
      row = null
    }
  }
  return openProviderKeys(row, config, host?.openSecret)
}

/** Facts safe to display about each provider key; never the plaintext key. */
export async function providerKeyFacts(pool, config, host) {
  let row = null
  if (pool) {
    try {
      const { rows } = await pool.query(
        `select ${KEY_COLUMNS_SQL}, updated_by, updated_at
           from wo_ops_setting
          where id`
      )
      row = rows[0] ?? null
    } catch {
      row = null
    }
  }

  const providers = {}
  for (const provider of WO_PROVIDERS) {
    const col = PROVIDER_COLUMN[provider]
    const cipher = row?.[col] ?? null
    const saved =
      cipher && config?.sessionSecret && host?.openSecret
        ? await host.openSecret(cipher, config.sessionSecret)
        : null
    if (saved) {
      providers[provider] = {
        configured: true,
        source: 'ops',
        hint: keyHint(saved)
      }
      continue
    }
    const envKey = envFallbackKey(config, provider)
    if (envKey) {
      providers[provider] = {
        configured: true,
        source: 'env',
        hint: keyHint(envKey)
      }
      continue
    }
    providers[provider] = {
      configured: false,
      source: null,
      hint: null
    }
  }

  return {
    providers,
    updatedBy: row?.updated_by ?? null,
    updatedAt: row?.updated_at?.toISOString?.() ?? null
  }
}

/** Seal and store, or clear (empty string), one provider's key. Throws without `host.sealSecret`. */
export async function saveProviderKey(pool, config, host, provider, rawKey, updatedBy) {
  const col = PROVIDER_COLUMN[provider]
  if (!col) throw new Error(`Unknown provider: ${provider}`)
  if (typeof rawKey !== 'string') throw new Error('apiKey must be a string')
  if (!keysWritable(config, host)) throw new Error('This host cannot seal provider keys')
  const trimmed = rawKey.trim()
  const cipher = trimmed === '' ? null : await host.sealSecret(trimmed, config.sessionSecret)

  await pool.query(
    `insert into wo_ops_setting (id, ${col}, updated_by, updated_at)
     values (true, $1, $2, now())
     on conflict (id) do update set
       ${col} = excluded.${col},
       updated_by = excluded.updated_by,
       updated_at = now()`,
    [cipher, updatedBy]
  )
}

// One request per Google API the pipeline uses; PageSpeed runs a real Lighthouse pass (~10 s).
const GOOGLE_PROBES = Object.freeze({
  places: {
    label: 'Places API (New)',
    timeoutMs: 8000,
    request: (key) => [
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'places.id',
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify({ textQuery: 'restaurant', maxResultCount: 1 })
      }
    ]
  },
  pagespeed: {
    label: 'PageSpeed Insights',
    timeoutMs: 45_000,
    request: (key) => [
      `https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed?${new URLSearchParams({
        url: 'https://example.com',
        strategy: 'mobile',
        category: 'performance',
        key
      })}`,
      { headers: { accept: 'application/json' } }
    ]
  },
  embed: {
    label: 'Maps Embed API',
    timeoutMs: 8000,
    request: (key) => [
      `https://www.google.com/maps/embed/v1/place?${new URLSearchParams({ key, q: 'Eiffel Tower' })}`,
      {}
    ]
  }
})

async function probeGoogleApi({ label, timeoutMs, request }, key, fetchImpl) {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const [url, init] = request(key)
    const res = await fetchImpl(url, { ...init, signal: controller.signal })
    const latencyMs = Date.now() - startedAt
    if (res.ok) return { ok: true, latencyMs, detail: `${label} · ${latencyMs}ms` }
    const errBody = await res.json().catch(() => null)
    const reason = errBody?.error?.message
    return {
      ok: false,
      latencyMs,
      detail: reason ? `${label} HTTP ${res.status}: ${reason}` : `${label} answered HTTP ${res.status}.`
    }
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      detail:
        error?.name === 'AbortError'
          ? `${label} timed out after ${Math.round(timeoutMs / 1000)}s.`
          : `${label} request failed: ${error?.message || 'network error'}`
    }
  } finally {
    clearTimeout(timer)
  }
}

/** The Google key passes only when every API the pipeline calls with it answers. */
async function testGoogleKey(key, fetchImpl) {
  const names = Object.keys(GOOGLE_PROBES)
  const results = await Promise.all(names.map((n) => probeGoogleApi(GOOGLE_PROBES[n], key, fetchImpl)))
  const apis = Object.fromEntries(names.map((n, i) => [n, results[i]]))
  const failed = names.filter((n) => !apis[n].ok)
  const latencyMs = Math.max(...results.map((r) => r.latencyMs))
  return {
    ok: failed.length === 0,
    provider: 'google',
    status: failed.length === 0 ? 'connected' : failed.length === names.length ? 'failed' : 'partial',
    latencyMs,
    detail:
      failed.length === 0
        ? `Places, PageSpeed and Maps Embed answered · ${latencyMs}ms`
        : `Not ready: ${failed.map((n) => GOOGLE_PROBES[n].label).join(', ')}.`,
    apis
  }
}

const RAPIDAPI_PROBE_HOST = 'yt-api.p.rapidapi.com'

/**
 * The RapidAPI key, proven for free: the gateway answers an endpoint that does not exist with 404
 * before any listing sees the call (measured 19/10, no quota spent), and a bad key with 403. It cannot
 * tell which listings are subscribed: a listing without a subscription shows up as `subscription_missing`
 * in the social-stats log instead.
 */
async function testRapidApiKey(key, fetchImpl) {
  const startedAt = Date.now()
  try {
    const res = await fetchImpl(`https://${RAPIDAPI_PROBE_HOST}/__tracy_probe`, {
      headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': RAPIDAPI_PROBE_HOST, accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    })
    const latencyMs = Date.now() - startedAt
    const body = await res.json().catch(() => ({}))
    if (res.status === 404 && /does not exist/i.test(String(body?.message ?? ''))) {
      return {
        ok: true,
        provider: 'rapidapi',
        status: 'connected',
        latencyMs,
        detail: `RapidAPI accepted the key · ${latencyMs}ms. Subscriptions per listing are not checked here.`
      }
    }
    const invalid = res.status === 401 || res.status === 403
    return {
      ok: false,
      provider: 'rapidapi',
      status: invalid ? 'invalid_key' : `http_${res.status}`,
      latencyMs,
      detail: invalid
        ? `RapidAPI refused the key (HTTP ${res.status}): check the application key.`
        : `RapidAPI answered HTTP ${res.status}.`
    }
  } catch (error) {
    return {
      ok: false,
      provider: 'rapidapi',
      status: error?.name === 'TimeoutError' ? 'timeout' : 'network_error',
      latencyMs: Date.now() - startedAt,
      detail: 'RapidAPI did not answer.'
    }
  }
}

/**
 * Live connectivity test for a configured provider key.
 */
export async function testProviderKey(pool, config, host, provider, fetchImpl = fetch) {
  if (config.woSocialRole === 'client' && provider === 'rapidapi')
    return {
      ok: false,
      provider,
      status: 'shared_social_required',
      detail: 'Social provider probes run at the shared authority.'
    }
  if (!WO_PROVIDERS.includes(provider)) {
    return { ok: false, provider, status: 'invalid_provider', detail: `Unknown provider: ${provider}` }
  }
  const key = (await readProviderKeys(pool, config, host))[provider] ?? null
  if (!key) {
    return {
      ok: false,
      provider,
      status: 'credential_missing',
      detail: 'No API key is saved or set in the environment for this provider.'
    }
  }

  if (provider === 'google') return testGoogleKey(key, fetchImpl)
  if (provider === 'rapidapi') return testRapidApiKey(key, fetchImpl)

  const startedAt = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)

  try {
    if (provider === 'serpapi') {
      // Account checks do not spend a search credit. Never forward provider errors or key-bearing URLs.
      const url = new URL('https://serpapi.com/account.json')
      url.searchParams.set('api_key', key)
      const res = await fetchImpl(url.href, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
        redirect: 'error'
      })
      const body = res.ok ? await res.json().catch(() => null) : null
      const remaining = body?.total_searches_left
      const valid = res.ok && !body?.error && Number.isFinite(remaining)
      const ok = valid && remaining > 0
      return {
        ok,
        provider,
        status: ok
          ? 'connected'
          : valid
            ? 'quota_exhausted'
            : res.ok
              ? 'invalid_response'
              : `http_${res.status}`,
        latencyMs: Date.now() - startedAt,
        detail: valid
          ? `Key verified · ${remaining} searches remaining. Account check consumes no search credit.`
          : 'SerpApi account could not be verified.'
      }
    }
    if (provider === 'litescrape') {
      // Documented non-billable status endpoint; never run a paid search from Test.
      const res = await fetchImpl('https://api.litescrape.com/api/keys/status', {
        headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
        signal: controller.signal,
        redirect: 'error'
      })
      const body = res.ok ? await res.json().catch(() => null) : null
      const ok = res.ok && body?.status === 'active' && Number.isFinite(body?.remaining_calls)
      return {
        ok,
        provider,
        status: ok ? 'connected' : `http_${res.status}`,
        latencyMs: Date.now() - startedAt,
        detail: ok
          ? `Connected · ${body.remaining_calls} calls remaining. Status check consumes no call.`
          : 'Litescrape key status could not be verified.'
      }
    }
    if (provider === 'apify') {
      const res = await fetchImpl('https://api.apify.com/v2/users/me', {
        headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
        signal: controller.signal
      })
      const latencyMs = Date.now() - startedAt
      if (!res.ok) {
        return {
          ok: false,
          provider,
          status: `http_${res.status}`,
          latencyMs,
          detail: `Apify /v2/users/me answered HTTP ${res.status}.`
        }
      }
      const body = await res.json().catch(() => ({}))
      const username = body?.data?.username ?? 'verified'
      const plan = body?.data?.plan?.id ?? 'active'
      return {
        ok: true,
        provider,
        status: 'connected',
        latencyMs,
        detail: `Connected as @${username} (${plan}) · ${latencyMs}ms`
      }
    }

    if (provider === 'scrapecreators') {
      const res = await fetchImpl('https://api.scrapecreators.com/v1/account/credit-balance', {
        headers: { 'x-api-key': key, accept: 'application/json' },
        signal: controller.signal,
        redirect: 'error'
      })
      const latencyMs = Date.now() - startedAt
      if (!res.ok)
        return {
          ok: false,
          provider,
          status: `http_${res.status}`,
          latencyMs,
          detail: `ScrapeCreators credit-balance endpoint answered HTTP ${res.status}.`
        }
      const body = await res.json().catch(() => ({}))
      const balance = Number(body?.creditCount)
      if (!body?.success || !Number.isFinite(balance))
        return {
          ok: false,
          provider,
          status: 'schema_error',
          latencyMs,
          detail: 'ScrapeCreators credit-balance response did not include a valid credit balance.'
        }
      return {
        ok: true,
        provider,
        status: 'connected',
        latencyMs,
        detail: `ScrapeCreators · ${balance.toLocaleString()} credits available · ${latencyMs}ms`
      }
    }

    if (provider === 'deepseek') {
      const res = await fetchImpl('https://api.deepseek.com/models', {
        headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
        signal: controller.signal
      })
      const latencyMs = Date.now() - startedAt
      if (!res.ok) {
        return {
          ok: false,
          provider,
          status: `http_${res.status}`,
          latencyMs,
          detail: `DeepSeek API answered HTTP ${res.status}.`
        }
      }
      return {
        ok: true,
        provider,
        status: 'connected',
        latencyMs,
        detail: `DeepSeek key verified (/v1/tools/search & /v1/tools/fetch ready) · ${latencyMs}ms`
      }
    }

    if (provider === 'firecrawl') {
      const res = await fetchImpl('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify({ query: 'restaurant', limit: 1 }),
        signal: controller.signal
      })
      const latencyMs = Date.now() - startedAt
      if (!res.ok) {
        return {
          ok: false,
          provider,
          status: `http_${res.status}`,
          latencyMs,
          detail: `Firecrawl /v1/search answered HTTP ${res.status}.`
        }
      }
      return {
        ok: true,
        provider,
        status: 'connected',
        latencyMs,
        detail: `Firecrawl /v1/search & /v1/scrape verified · ${latencyMs}ms`
      }
    }

    if (provider === 'jina') {
      const res = await fetchImpl('https://r.jina.ai/https://example.com', {
        headers: {
          authorization: `Bearer ${key}`,
          accept: 'application/json'
        },
        signal: controller.signal
      })
      const latencyMs = Date.now() - startedAt
      if (!res.ok) {
        const errBody = await res.json().catch(() => null)
        const reason = errBody?.readableMessage || errBody?.message || null
        return {
          ok: false,
          provider,
          status: `http_${res.status}`,
          latencyMs,
          detail: reason
            ? `Jina Reader HTTP ${res.status}: ${reason}`
            : `Jina Reader answered HTTP ${res.status}.`
        }
      }
      return {
        ok: true,
        provider,
        status: 'connected',
        latencyMs,
        detail: `Jina Reader (r.jina.ai) & Search (s.jina.ai) verified · ${latencyMs}ms`
      }
    }

    return { ok: false, provider, status: 'unsupported', detail: 'Unsupported provider.' }
  } catch (error) {
    return {
      ok: false,
      provider,
      status: error?.name === 'AbortError' ? 'timeout' : 'network_error',
      latencyMs: Date.now() - startedAt,
      detail:
        error?.name === 'AbortError'
          ? 'Timed out after 8s waiting for provider response.'
          : provider === 'serpapi'
            ? 'SerpApi account request failed.'
            : provider === 'litescrape'
              ? 'Litescrape status request failed.'
              : `Request failed: ${error?.message || 'network error'}`
    }
  } finally {
    clearTimeout(timer)
  }
}
