// Reader services of the "website-content" capability group (`capabilities.mjs`): each returns the root
// page's rendered HTML, read by `renderedPagesResult` exactly like the Apify browser's pages, in the
// crawler's result shape (`status`, `reason`, `pages`, `media`, `menus`, `socials`, `profile`).
import { renderedPagesResult } from './website-browser.mjs'

const TIMEOUT_MS = 45_000

const baseOf = (provider) => ({
  source: 'website',
  provider,
  cursor: null,
  pages: [],
  media: [],
  menus: [],
  socials: {},
  profile: {},
  coverage: { fetched: 0, provider }
})

async function read(
  provider,
  key,
  request,
  pageOf,
  { fetch = globalThis.fetch, timeoutMs = TIMEOUT_MS, html = false } = {}
) {
  const base = baseOf(provider)
  if (!key) return { ...base, status: 'blocked', reason: 'credential_missing' }
  let res
  try {
    res = await fetch(request.url, {
      ...request.init,
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs)
    })
  } catch (e) {
    return {
      ...base,
      status: 'failed',
      reason: e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : 'network'
    }
  }
  if (res.status === 401 || res.status === 403)
    return { ...base, status: 'blocked', reason: 'credential_invalid' }
  if (res.status === 402 || res.status === 429) return { ...base, status: 'failed', reason: 'quota' }
  if (!res.ok) return { ...base, status: 'failed', reason: 'provider_error', error: `HTTP ${res.status}` }
  const body = await res.json().catch(() => null)
  const page = body ? pageOf(body) : null
  if (!page?.html) return { ...base, status: 'failed', reason: 'not_found' }
  // The page itself, for a reader of its own (`menu-reader.mjs` `renderers`).
  if (html) return { ...base, status: 'complete', url: page.url, html: page.html }
  return renderedPagesResult([page], base, 'complete')
}

/** Jina Reader (`r.jina.ai`) asked for the rendered HTML of one page. */
export function readWithJina(url, { key, fetch, timeoutMs, html } = {}) {
  return read(
    'jina',
    key,
    {
      url: `https://r.jina.ai/${url}`,
      init: {
        headers: { authorization: `Bearer ${key}`, accept: 'application/json', 'x-return-format': 'html' }
      }
    },
    (b) =>
      typeof (b.data?.html ?? b.data?.content) === 'string'
        ? { url: b.data.url ?? url, html: b.data.html ?? b.data.content, metadata: { title: b.data.title } }
        : null,
    { fetch, timeoutMs, html }
  )
}

/** Firecrawl scrape (`/v1/scrape`) of one page, raw HTML. */
export function readWithFirecrawl(url, { key, fetch, timeoutMs, html } = {}) {
  return read(
    'firecrawl',
    key,
    {
      url: 'https://api.firecrawl.dev/v1/scrape',
      init: {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify({ url, formats: ['rawHtml'], onlyMainContent: false })
      }
    },
    (b) =>
      typeof b.data?.rawHtml === 'string'
        ? { url: b.data.metadata?.sourceURL ?? url, html: b.data.rawHtml, metadata: b.data.metadata }
        : null,
    { fetch, timeoutMs, html }
  )
}
