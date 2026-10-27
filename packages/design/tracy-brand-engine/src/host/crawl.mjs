/**
 * Phase 1 of "Fork a site from any URL": the site as a folder of static pages, so the rest of the
 * pipeline (phase 2, `prefetchFromHtml`) reads from disk instead of fetching again, and the agent has
 * a page list to write the customer's own content from (`pages.json`).
 *
 *   <dir>/pages/NN-<slug>.html   each page, scripts defused the way prefetch.ts saves page.html
 *   <dir>/pages/styles.css       the home page's linked stylesheets, concatenated (same caps as prefetch)
 *   <dir>/pages/pages.json       { schemaVersion, url, crawledAt, truncated, pages: [{ url, file, title, h1, depth, status }] }
 *
 * Breadth first over one site (apex and `www.` are one site), HTML only, bounded by `maxPages` and
 * `maxDepth`, never through an admin door. Every request goes through the harvester's SSRF guard
 * (`fetchExternalBrandAsset`) unless a test injects `fetch`. Deterministic: no LLM, no browser —
 * the rendered-DOM view of the same site is `recon.mjs`'s job.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { fetchExternalBrandAsset } from '@tracy/od-brand-engine'

export const PAGES_DIR = 'pages'

/** Bounds a fork's crawl: enough pages to see the site's page types, not the whole catalogue. */
export const CRAWL_DEFAULTS = Object.freeze({
  maxPages: 20,
  maxDepth: 2,
  /** Per page, bytes. prefetch.ts caps the home page at 6 MB; a folder of 20 needs a lower one. */
  pageCap: 2 * 1024 * 1024,
  /** Stylesheets of the home page: same caps as prefetch.ts (6 × 400 KB). */
  maxCss: 6,
  cssCap: 400 * 1024,
  timeoutMs: 8000
})

/** Doors and machinery that are not pages of the site. */
const SKIP_PATH =
  /(^|\/)(wp-admin|wp-login\.php|wp-json|xmlrpc\.php|administrator|admin|login|logout|signin|signout|cart|checkout|feed|rss|sitemap[^/]*\.xml)(\/|$)/i
/** A URL whose extension says it is not an HTML page — skipped without a request. */
const NOT_A_PAGE =
  /\.(pdf|zip|gz|tgz|rar|7z|jpe?g|png|gif|webp|avif|svg|ico|bmp|css|js|mjs|cjs|json|xml|rss|atom|mp4|webm|mp3|wav|woff2?|ttf|otf|eot|txt|csv|docx?|xlsx?|pptx?)$/i

const UA = { 'user-agent': 'Mozilla/5.0 (compatible; TracyBrandEngine/1.0; +https://tracy.ai)' }

/**
 * The key two hosts share when they are one site: lower-case, without a leading `www.`.
 * @param {string} host
 */
export function siteHostKey(host) {
  return String(host ?? '')
    .toLowerCase()
    .replace(/^www\./, '')
}

/**
 * A link as a page URL: absolute, http(s) only, no fragment, no query (a query is a view of the same
 * page, not another page). `null` for anything else.
 * @param {string} href
 * @param {string} base
 * @returns {string | null}
 */
export function normalizePageUrl(href, base) {
  let u
  try {
    u = new URL(href, base)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  u.hash = ''
  u.search = ''
  return u.href
}

/**
 * Same as `prefetch.ts`'s `defuseScripts`: the saved page is evidence, never executed.
 * @param {string} html
 */
function defuseScripts(html) {
  return html.replace(/<script\b/gi, '<script type="text/od-defused-script"')
}

/** @param {string} s */
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

/** @param {string} fragment */
function textOf(fragment) {
  return decodeEntities(fragment.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * @param {string} html
 * @param {RegExp} re
 */
function firstMatch(html, re) {
  const m = re.exec(html)
  return m ? textOf(m[1] ?? '') : ''
}

/**
 * File-name slug for a page path: `/` → `home`, `/tools/hammer` → `tools-hammer`.
 * @param {string} url
 */
export function pageSlug(url) {
  const pathname = new URL(url).pathname.replace(/^\/+|\/+$/g, '')
  if (!pathname) return 'home'
  const slug = pathname
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug || 'page'
}

/** @param {string} html */
function linksOf(html) {
  const out = []
  const re = /<a\b[^>]*?\shref\s*=\s*["']([^"']+)["']/gi
  let m
  while ((m = re.exec(html)) !== null) out.push(decodeEntities(m[1] ?? ''))
  return out
}

/** @param {string} html */
function stylesheetsOf(html) {
  const out = []
  const re = /<link\b[^>]*>/gi
  let m
  while ((m = re.exec(html)) !== null) {
    const tag = m[0]
    if (!/\brel\s*=\s*["'][^"']*\bstylesheet\b/i.test(tag)) continue
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)
    if (href) out.push(decodeEntities(href[1] ?? ''))
  }
  return out
}

/**
 * @param {Response} res
 * @param {number} cap
 */
async function readCapped(res, cap) {
  const buf = Buffer.from(await res.arrayBuffer())
  return buf.subarray(0, cap).toString('utf8')
}

/** @type {typeof fetch} */
const guardedFetch = (url, init) => fetchExternalBrandAsset(String(url), init)

/**
 * @param {string} startUrl
 * @param {string} dir  the brand directory; pages land in `<dir>/pages/`, replaced whole
 * @param {{ fetch?: typeof fetch, maxPages?: number, maxDepth?: number, onProgress?: (step: string, detail?: string) => void, signal?: AbortSignal }} [o]
 * @returns {Promise<{ pages: { url: string, file: string, title: string, h1: string, depth: number, status: number }[], truncated: boolean, dir: string }>}
 */
export async function crawlSite(startUrl, dir, o = {}) {
  const fetchImpl = o.fetch ?? guardedFetch
  const maxPages = o.maxPages ?? CRAWL_DEFAULTS.maxPages
  const maxDepth = o.maxDepth ?? CRAWL_DEFAULTS.maxDepth
  const progress = o.onProgress ?? (() => {})
  const start = normalizePageUrl(startUrl, startUrl)
  if (start === null) throw new Error(`crawlSite: not an http(s) URL: ${String(startUrl).slice(0, 120)}`)

  const pagesDir = path.join(dir, PAGES_DIR)
  await fs.rm(pagesDir, { recursive: true, force: true })
  await fs.mkdir(pagesDir, { recursive: true })

  const siteKey = siteHostKey(new URL(start).host)
  const queue = [{ url: start, depth: 0 }]
  const seen = new Set([start])
  /** @type {{ url: string, file: string, title: string, h1: string, depth: number, status: number }[]} */
  const pages = []
  let truncated = false
  let css = null

  while (queue.length > 0) {
    if (o.signal?.aborted) throw new Error('crawlSite: aborted')
    if (pages.length >= maxPages) {
      truncated = true
      break
    }
    const next = queue.shift()
    if (!next) break
    const { url, depth } = next
    let res
    try {
      res = await fetchImpl(url, { headers: UA, signal: AbortSignal.timeout(CRAWL_DEFAULTS.timeoutMs) })
    } catch {
      continue
    }
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !/text\/html|application\/xhtml\+xml/i.test(type)) {
      if (res.body) await res.body.cancel().catch(() => {})
      continue
    }
    const html = await readCapped(res, CRAWL_DEFAULTS.pageCap)
    const effective = normalizePageUrl(res.url || url, url) ?? url
    const n = pages.length + 1
    const file = `${PAGES_DIR}/${String(n).padStart(2, '0')}-${pageSlug(effective)}.html`
    await fs.writeFile(path.join(dir, file), defuseScripts(html))
    pages.push({
      url,
      file,
      title: firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
      h1: firstMatch(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i),
      depth,
      status: res.status
    })
    progress('crawl', `${n} ${effective}`)

    if (n === 1) {
      const parts = []
      for (const href of stylesheetsOf(html).slice(0, CRAWL_DEFAULTS.maxCss)) {
        const cssUrl = normalizePageUrl(href, effective)
        if (cssUrl === null) continue
        try {
          const r = await fetchImpl(cssUrl, {
            headers: UA,
            signal: AbortSignal.timeout(CRAWL_DEFAULTS.timeoutMs)
          })
          if (r.ok) parts.push(await readCapped(r, CRAWL_DEFAULTS.cssCap))
          else if (r.body) await r.body.cancel().catch(() => {})
        } catch {
          /* one stylesheet fewer */
        }
      }
      css = parts.join('\n')
    }

    if (depth >= maxDepth) continue
    for (const href of linksOf(html)) {
      const link = normalizePageUrl(href, effective)
      if (link === null || seen.has(link)) continue
      const u = new URL(link)
      if (siteHostKey(u.host) !== siteKey) continue
      if (SKIP_PATH.test(u.pathname) || NOT_A_PAGE.test(u.pathname)) continue
      seen.add(link)
      queue.push({ url: link, depth: depth + 1 })
    }
  }

  await fs.writeFile(path.join(pagesDir, 'styles.css'), css ?? '')
  await fs.writeFile(
    path.join(pagesDir, 'pages.json'),
    `${JSON.stringify({ schemaVersion: 'tracy-site-pages/v1', url: start, crawledAt: new Date().toISOString(), truncated, pages }, null, 2)}\n`
  )
  return { pages, truncated, dir }
}
