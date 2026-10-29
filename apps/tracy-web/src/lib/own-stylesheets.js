/**
 * The site's own stylesheets a set of served pages loads. Shared by the demo-leftover check (`opportunities-build`) and the
 * Joomla brief engine's outside-map writer (`sites/brief-engines`), which both read the backgrounds those sheets paint.
 */

/** The most stylesheets of the site read for the backgrounds its template settings paint (C10, #196). */
export const MAX_STYLES = 8

/** The site's own stylesheets the pages load (same site, no other host), in order, once each. */
export function ownStylesheets(pages) {
  const out = new Set()
  for (const { html } of pages)
    for (const [tag] of String(html).matchAll(/<link\b[^>]*>/gi)) {
      if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) continue
      const href = /\shref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.replace(/&amp;/g, '&')
      if (href?.startsWith('/') && !href.startsWith('//')) out.add(href)
    }
  return [...out].slice(0, MAX_STYLES)
}
