// The stylesheets a site's template serves, read as a visitor reads them from every page the site lists, since a template can
// merge a different sheet for each page. The brand's own style is left out, so a run on a site written before reads the same
// template as the first run did. Reads only; it never goes past the site's own address.
import { keptPaths } from '../site-check/host-pages.js'
import { designSystemSiteReaders } from '../sites/design-system-site-readers.js'

const MAX_PAGES = 40
const MAX_SHEETS = 40
const TIMEOUT_MS = 20_000
const BRAND_STYLE = /<style\b[^>]*\bid=["']tracy-ds-slot["'][^>]*>[\s\S]*?<\/style>/gi

const attr = (tag, name) => new RegExp(`\\b${name}=["']([^"']+)["']`, 'i').exec(tag)?.[1] ?? null

/** Each stylesheet link and each inline style of a page's markup, in page order, the brand's own style left out. */
export function sheetsOfPage(html) {
  const links = []
  const inline = []
  const clean = String(html).replace(BRAND_STYLE, '')
  for (const tag of clean.match(/<link\b[^>]*>/gi) ?? [])
    if (/\brel=["']?stylesheet/i.test(tag) && attr(tag, 'href')) links.push(attr(tag, 'href'))
  for (const m of clean.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) inline.push(m[1])
  return { links, inline }
}

/** A site's page as Joomla answers it when URL rewriting is off. */
const pageUrl = (origin, platform, p) =>
  new URL(platform === 'joomla' && p !== '/' && !p.startsWith('/index.php') ? `/index.php${p}` : p, origin)

/**
 * @param {{ origin: string | URL, publicOrigin?: string | URL | null, platform?: string, paths: string[],
 *   text: (url: URL) => Promise<string | null> }} input `text` answers null for a page or sheet that would not answer
 * @returns {Promise<string[]>} the sheets, each once; it throws when no page or no sheet could be read
 */
export async function readSiteSheets({ origin, publicOrigin = null, platform, paths, text }) {
  const own = new Set([new URL(origin).host, ...(publicOrigin ? [new URL(publicOrigin).host] : [])])
  const seen = new Set()
  const sheets = []
  let pages = 0
  for (const p of paths.slice(0, MAX_PAGES)) {
    const html = await text(pageUrl(origin, platform, p))
    if (html === null) continue
    pages++
    const { links, inline } = sheetsOfPage(html)
    for (const href of links) {
      const url = new URL(href, origin)
      if (!own.has(url.host)) continue
      const local = new URL(`${url.pathname}${url.search}`, origin)
      // A page's merged sheet may carry a new query for the same bytes, so the path alone names it.
      if (seen.has(url.pathname) || seen.size >= MAX_SHEETS) continue
      seen.add(url.pathname)
      const css = await text(local)
      if (css !== null) sheets.push(css)
    }
    for (const css of inline)
      if (!seen.has(css)) {
        seen.add(css)
        sheets.push(css)
      }
  }
  if (!pages) throw new Error('no page of the site could be read')
  if (!sheets.length) throw new Error('the site serves no stylesheet')
  return sheets
}

/**
 * The bench's reader: the pages the site lists, at the address the site is read at.
 * @param {{ siteOf: (siteKey: string) => Promise<object | null>, config: object, fetchImpl?: typeof fetch }} deps
 * @returns {(input: { door: { apply: Function }, siteKey: string }) => Promise<string[]>}
 */
export function siteSheetsReader({ siteOf, config, fetchImpl = fetch }) {
  const readers = designSystemSiteReaders({ config, fetchImpl })
  return async ({ door, siteKey }) => {
    const site = await siteOf(siteKey)
    if (!site) throw new Error(`no site ${siteKey}`)
    const inspect = await door.apply({
      siteKey,
      action: 'content.contract',
      params: { operation: 'inspect' }
    })
    if (!inspect?.ok) throw new Error(inspect?.message ?? inspect?.error ?? 'the site gave no page list')
    const listed = keptPaths(inspect)
    return readSiteSheets({
      origin: readers.readOrigin(site),
      publicOrigin: readers.publicOf(site),
      platform: site.platform,
      paths: listed.includes('/') ? listed : ['/', ...listed],
      text: async (url) => {
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
        return res.ok ? res.text() : null
      }
    })
  }
}
