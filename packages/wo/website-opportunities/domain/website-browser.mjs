import { fetchLimited } from './fetch-limited.mjs'
import { apifyRunUrl, redactToken } from './apify.mjs'
import { crawlWebsite, extractPage, keepFallbackCopy } from './website-crawler.mjs'

export const BROWSER_ACTOR = 'apify~website-content-crawler'
const RUN_SECS = 240
// Rendered pages run 0.5–0.8 MB of HTML each.
const MAX_BYTES = 48 * 1024 * 1024
// Below this much visible text across every page, the plain fetch most likely saw a JS shell.
export const THIN_TEXT_CHARS = 400
const BLOCKED_REASONS = new Set(['login_required', 'fetch_failed', 'rate_limited'])

/** True when a plain crawl result is worth retrying in a real browser. */
export function needsBrowser(result) {
  if (!result) return false
  if (result.status === 'failed') return BLOCKED_REASONS.has(result.reason)
  const chars = (result.pages ?? []).reduce((n, p) => n + (p.text?.length ?? 0), 0)
  return chars < THIN_TEXT_CHARS && (result.media?.length ?? 0) < 3
}

/**
 * Crawls a site through Apify's browser-based crawler and reads each rendered page with the same
 * `extractPage` the plain crawler uses, so media, socials and JSON-LD come out identically.
 */
export async function crawlWithBrowser(rootUrl, { maxPages = 20 } = {}, deps = {}) {
  const base = {
    source: 'website',
    provider: 'apify-browser',
    cursor: null,
    pages: [],
    media: [],
    menus: [],
    socials: {},
    profile: {},
    coverage: { fetched: 0, provider: 'apify-browser' }
  }
  const { token } = deps
  if (!token) return { ...base, status: 'blocked', reason: 'credential_missing' }
  let res
  try {
    res = await fetchLimited(
      apifyRunUrl(BROWSER_ACTOR, { runSecs: RUN_SECS, maxChargeUsd: deps.maxChargeUsd }),
      {
        fetch: deps.fetch,
        resolve: deps.resolve,
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          startUrls: [{ url: rootUrl }],
          maxCrawlPages: maxPages,
          crawlerType: 'playwright:adaptive',
          saveHtml: true,
          saveMarkdown: false
        }),
        maxBytes: MAX_BYTES,
        timeoutMs: deps.timeoutMs ?? (RUN_SECS + 30) * 1000
      }
    )
  } catch (err) {
    return {
      ...base,
      status: 'failed',
      reason: err?.code === 'TIMEOUT' ? 'timeout' : 'network',
      error: redactToken(err?.message, token)
    }
  }
  if (res.status === 401 || res.status === 403)
    return { ...base, status: 'blocked', reason: 'credential_invalid' }
  if (res.status === 402) return { ...base, status: 'failed', reason: 'quota' }
  if (res.status < 200 || res.status >= 300)
    return { ...base, status: 'failed', reason: 'provider_error', error: `HTTP ${res.status}` }
  let items
  try {
    items = JSON.parse(new TextDecoder().decode(res.bytes))
  } catch {
    return { ...base, status: 'failed', reason: 'provider_error', error: 'invalid JSON from provider' }
  }
  if (!Array.isArray(items) || items.length === 0) return { ...base, status: 'failed', reason: 'not_found' }

  return renderedPagesResult(items, base, res.truncated ? 'partial' : 'complete')
}

/** Plain crawl first; a blocked or JS-only site is retried in a real browser when a token exists. */
export async function crawlWebsiteWithFallback(rootUrl, opts = {}, deps = {}) {
  const plain = await crawlWebsite(rootUrl, opts, deps)
  // A resumed crawl or a site that is simply gone never goes to the paid browser.
  if (opts.cursor || !deps.token || !needsBrowser(plain)) return plain
  const browser = await crawlWithBrowser(rootUrl, { maxPages: opts.maxPages }, deps)
  if (browser.status === 'complete' || browser.status === 'partial')
    return { ...browser, fallbackFrom: { status: plain.status, reason: plain.reason ?? null } }
  return { ...plain, fallback: { provider: 'apify-browser', status: browser.status, reason: browser.reason } }
}

/**
 * Rendered pages (`[{url, html, metadata?, text?}]`) read with the plain crawler's `extractPage`, so a
 * browser or a reader service gives the same media, socials, menus and JSON-LD facts as a direct crawl.
 */
export function renderedPagesResult(items, base, status = 'complete') {
  const out = { ...base, status }
  const seenMedia = new Set()
  const listedImages = new Map()
  for (const it of items) {
    if (typeof it?.url !== 'string' || typeof it.html !== 'string') continue
    const page = extractPage(it.html, it.url)
    out.pages.push({
      url: page.url,
      title: page.title || it.metadata?.title || '',
      text: page.text || it.text || ''
    })
    if (out.pages.length === 1)
      out.logos = page.logos.slice(0, 12).map((l) => ({ ...l, sourceUrl: page.url }))
    if (out.pages.length === 1)
      out.profile = {
        name: page.business?.name ?? page.siteName ?? page.title,
        bio: page.description ?? it.metadata?.description ?? undefined
      }
    const b = page.business
    if (b) {
      out.profile.phone ??= b.telephone
      out.profile.email ??= b.email
      out.profile.address ??= b.address
      if (b.openingHours.length) out.profile.hours ??= b.openingHours
    }
    if (!out.profile.phone && page.phones[0]) out.profile.phone = page.phones[0]
    for (const [net, u] of Object.entries(page.socials)) out.socials[net] ??= u
    for (const p of page.pdfs) if (p.menu) out.menus.push({ url: p.url, sourceUrl: page.url })
    for (const img of page.images) {
      // The same original seen on another page may bring a wider copy to fall back on.
      if (seenMedia.has(img.url)) {
        const listed = listedImages.get(img.url)
        if (listed) keepFallbackCopy(listed, img.fallbackUrl)
        continue
      }
      seenMedia.add(img.url)
      const item = {
        url: img.url,
        ...(img.fallbackUrl ? { fallbackUrl: img.fallbackUrl } : {}),
        kind: 'image',
        sourceUrl: page.url,
        ...(img.alt ? { caption: img.alt } : {})
      }
      listedImages.set(img.url, item)
      out.media.push(item)
    }
    for (const v of page.videos) {
      if (seenMedia.has(v.url)) continue
      seenMedia.add(v.url)
      out.media.push({ url: v.url, kind: 'video', sourceUrl: page.url })
    }
  }
  out.profile = Object.fromEntries(
    Object.entries(out.profile).filter(([, v]) => v !== undefined && v !== null && v !== '')
  )
  out.coverage = { fetched: out.pages.length, provider: base.provider }
  return out
}
