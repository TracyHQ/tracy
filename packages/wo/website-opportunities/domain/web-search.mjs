// Web search providers of the "web-search" capability group (`capabilities.mjs`). Each returns
// `{title, url, description}[]` (http(s) only) or throws `{code}`: CREDENTIAL_MISSING, CREDENTIAL_INVALID,
// QUOTA, TIMEOUT or PROVIDER_ERROR — the codes `social-search.mjs` falls through to the next provider on.
// `country` (ISO 3166-1 alpha-2) searches as from that country.

const TIMEOUT_MS = 20_000
const LIMIT = 8

const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const fail = (code, message) => Object.assign(new Error(message), { code })

async function call(name, url, init, key, timeoutMs) {
  if (!key) throw fail('CREDENTIAL_MISSING', `${name}: no key`)
  const signal = AbortSignal.timeout(timeoutMs)
  let res
  try {
    res = await init.fetch(url, { ...init.request, redirect: 'error', signal })
  } catch (e) {
    if (signal.aborted || e?.name === 'TimeoutError' || e?.name === 'AbortError')
      throw fail('TIMEOUT', `${name}: timed out`)
    throw fail('PROVIDER_ERROR', `${name}: request failed`)
  }
  const body = await res.json().catch(() => undefined)
  if (res.status === 401 || res.status === 403)
    throw fail('CREDENTIAL_INVALID', `${name}: HTTP ${res.status}`)
  if (res.status === 402 || res.status === 429) throw fail('QUOTA', `${name}: HTTP ${res.status}`)
  if (!res.ok || !body) throw fail('PROVIDER_ERROR', `${name}: HTTP ${res.status}`)
  return body
}

const rowsOf = (list) =>
  (Array.isArray(list) ? list : [])
    .filter((r) => typeof r?.url === 'string' && /^https?:\/\//i.test(r.url))
    .slice(0, LIMIT)
    .map((r) => ({ title: text(r.title) ?? '', url: r.url, description: text(r.description) ?? '' }))

/** Jina Search (`s.jina.ai`), JSON answer. */
export async function jinaSearch(
  query,
  { key, country, fetch = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}
) {
  const url = new URL('https://s.jina.ai/')
  url.searchParams.set('q', String(query))
  if (text(country)) url.searchParams.set('gl', country.trim().toLowerCase())
  const body = await call(
    'jina',
    url,
    {
      fetch,
      request: {
        headers: {
          authorization: `Bearer ${key}`,
          accept: 'application/json',
          'x-respond-with': 'no-content'
        }
      }
    },
    key,
    timeoutMs
  )
  return rowsOf(body.data)
}

/** Firecrawl Search (`/v1/search`), results only (no page scraping). */
export async function firecrawlSearch(
  query,
  { key, country, fetch = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}
) {
  const body = await call(
    'firecrawl',
    'https://api.firecrawl.dev/v1/search',
    {
      fetch,
      request: {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify({
          query: String(query),
          limit: LIMIT,
          ...(text(country) ? { country: country.trim().toLowerCase() } : {})
        })
      }
    },
    key,
    timeoutMs
  )
  return rowsOf(body.data)
}

/** SerpApi Google search (`engine=google`), organic results only. */
export async function serpapiGoogleSearch(
  query,
  { key, country, fetch = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}
) {
  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('engine', 'google')
  url.searchParams.set('q', String(query))
  if (text(country)) url.searchParams.set('gl', country.trim().toLowerCase())
  url.searchParams.set('num', String(LIMIT))
  url.searchParams.set('api_key', String(key ?? ''))
  const body = await call(
    'serpapi',
    url,
    { fetch, request: { headers: { accept: 'application/json' } } },
    key,
    timeoutMs
  )
  return rowsOf(
    (body.organic_results ?? []).map((r) => ({ title: r?.title, url: r?.link, description: r?.snippet }))
  )
}
