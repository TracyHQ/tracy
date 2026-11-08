// The browser side of the site part: every page opened read-only at desktop width, read in the theme it opens in and
// again after switching to the template's other theme (in this browser only), its logos read at phone width too,
// plus one address that does not exist.
// Also fetches the stylesheets the pages serve, for the colour measure.
import { openFrozen, openKitContext } from '../capture.mjs'
import { httpFetcher } from '../crawl.mjs'
import { canonicalPath, urlOfPath } from '../kit-paths.mjs'
import { assignedAt } from '../map-index.mjs'
import { readLogos, switchTheme } from './read-logos.js'
import { readPage } from './read-page.js'
import { CONTACT_PATTERN } from './site-parts.mjs'

const PHONE = 390
const STYLE_LINK = /<link\b[^>]*rel\s*=\s*["']?stylesheet[^>]*>/gi
const INLINE_STYLE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi

/** The same-site stylesheet paths and the inline style blocks of an HTML page. */
export function stylesOfHtml(html, siteUrl, aliasHosts = []) {
  const base = new URL(siteUrl)
  const hosts = new Set([base.host, ...aliasHosts.map((h) => h.toLowerCase())])
  const links = []
  for (const tag of String(html).match(STYLE_LINK) ?? []) {
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]
    if (!href) continue
    const u = new URL(href.replace(/&amp;/g, '&'), base)
    if (hosts.has(u.host.toLowerCase())) links.push(u.pathname + u.search)
  }
  const inline = [...String(html).matchAll(INLINE_STYLE)].map((m) => m[1])
  return { links, inline }
}

/** Every stylesheet the pages serve, fetched once: `[{from, css, pages}]` (inline blocks named by their page). */
export async function fetchStyles({ pages, siteUrl, hostHeader }) {
  const fetchPage = httpFetcher({ siteUrl, hostHeader })
  const aliasHosts = hostHeader ? [hostHeader] : []
  const styles = []
  const seen = new Map()
  const htmls = []
  for (const p of pages) {
    const r = await fetchPage(urlOfPath(p.path, siteUrl))
    if (r.status !== 200) continue
    htmls.push({ pageId: p.pageId, html: r.html })
    const { links, inline } = stylesOfHtml(r.html, siteUrl, aliasHosts)
    for (const [i, css] of inline.entries())
      styles.push({ from: `${p.path} inline style ${i + 1}`, css, pages: [p.path] })
    for (const href of links) {
      if (seen.has(href)) {
        seen.get(href)?.pages.push(p.path)
        continue
      }
      const s = await fetchPage(new URL(href, siteUrl).href)
      const style = s.status === 200 ? { from: href.split('?')[0], css: s.html, pages: [p.path] } : null
      seen.set(href, style)
      if (style) styles.push(style)
    }
  }
  return { styles, htmls }
}

/**
 * @param {{browser: object, siteUrl: string, hostHeader?: string, idx: object, pages: Array<{pageId: string, path: string, slug: string}>, logoFiles: string[], siteName: string|null, brand: string[], log?: Function}} o
 */
export async function browseSite({
  browser,
  siteUrl,
  hostHeader,
  idx,
  pages,
  logoFiles,
  siteName,
  brand,
  log = () => {}
}) {
  const ctx = await openKitContext(browser, { width: 1440, siteUrl, hostHeader })
  const reads = []
  const logoReads = []
  const failures = []
  try {
    for (const p of pages) {
      const opened = await openFrozen(ctx, urlOfPath(p.path, siteUrl), assignedAt(idx, p.path), null, {
        wake: 'quick'
      })
      if (!opened.page) {
        failures.push({ path: p.path, reason: opened.error })
        continue
      }
      const page = opened.page
      try {
        const facts = await page.evaluate(readPage, { siteName, contactPattern: CONTACT_PATTERN })
        const first = await page.evaluate(readLogos, { logoFiles, siteName, brand })
        const theme = first.opensOn.markers[0] ?? 'base'
        reads.push({
          ...p,
          ...facts,
          ...first,
          blocks: opened.blocks.map((b) => b.block),
          blockCount: opened.blocks.filter((b) => b.visible).length
        })
        logoReads.push({ pageId: p.pageId, theme, opening: true, logos: first.logos })
        // A logo the template shows only on a phone (a smaller mark in the bar) is read at phone width.
        await page.setViewportSize({ width: PHONE, height: 900 })
        await page.waitForTimeout(250)
        const phone = await page.evaluate(readLogos, { logoFiles, siteName, brand: [] })
        logoReads.push({ pageId: p.pageId, theme, opening: true, width: PHONE, logos: phone.logos })
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.waitForTimeout(250)
        const other = await page.evaluate(switchTheme)
        if (other) {
          await page.waitForTimeout(250)
          const second = await page.evaluate(readLogos, { logoFiles, siteName, brand: [] })
          logoReads.push({ pageId: p.pageId, theme: other, opening: false, logos: second.logos })
        }
        log('read', p.path, first.logos.length, 'logos')
      } finally {
        await page.close().catch(() => {})
      }
    }
    const notFound = await readMissing(ctx, siteUrl, siteName)
    // A link of the not-found page to this site names its path, never the address the site was read at (a WordPress
    // page prints its links absolute, with the site's own host name).
    for (const l of notFound.read?.links ?? []) {
      const path = canonicalPath(l.href, siteUrl, hostHeader ? [hostHeader] : [])
      if (path) l.href = path
    }
    return { reads, logoReads, notFound, failures }
  } finally {
    await ctx.close()
  }
}

/** The answer of an address no page has, read like a page. */
async function readMissing(ctx, siteUrl, siteName) {
  const page = await ctx.newPage()
  try {
    const resp = await page.goto(urlOfPath('/tracy-kit-no-such-page-7f3c', siteUrl), {
      waitUntil: 'load',
      timeout: 60000
    })
    const read = await page.evaluate(readPage, { siteName, contactPattern: CONTACT_PATTERN })
    return { status: resp?.status() ?? null, siteUrl, read }
  } catch (e) {
    return { status: null, error: String(e.message ?? e).split('\n')[0] }
  } finally {
    await page.close().catch(() => {})
  }
}
