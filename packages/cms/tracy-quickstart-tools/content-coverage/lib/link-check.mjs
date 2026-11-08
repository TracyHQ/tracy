// Every link the audited pages render, requested as a browser would follow it: the href resolved against the page that
// shows it, on this site. The crawl folds `/x` and `/index.php/x` into one page, so a link written `/pages/contact` on
// a site served without URL rewriting (404) looked reached through `/index.php/pages/contact` (200). A link that does
// not answer 2xx after redirects is a failure of the measure, named with the pages that show it.
import { NOT_PUBLIC } from './pages.mjs'

/**
 * The same-site links of the audited pages, each with the pages that render it (anchors only).
 * @param {{ url: string, items: any[] }[]} pages
 * @param {string} siteUrl
 * @param {{ isStandLink?: (href: string) => boolean }} [opts]
 * @returns {Map<string, string[]>} absolute href (no hash) -> page URLs
 */
export function renderedLinksOf(pages, siteUrl, { isStandLink = () => false } = {}) {
  const site = new URL(siteUrl)
  const out = new Map()
  for (const p of pages) {
    for (const i of p.items ?? []) {
      if (i.kind !== 'link' || i.source !== 'a' || typeof i.value !== 'string') continue
      if (isStandLink(i.value)) continue
      let u
      try {
        u = new URL(i.value, p.url)
      } catch {
        continue
      }
      if (u.host !== site.host || !/^https?:$/.test(u.protocol)) continue
      u.hash = ''
      if (NOT_PUBLIC.test(u.href)) continue
      const on = out.get(u.href) ?? []
      if (!on.includes(p.url)) on.push(p.url)
      out.set(u.href, on)
    }
  }
  return out
}

/**
 * Each link asked once; the ones that do not answer 2xx, as failures of the measure.
 * @param {Map<string, string[]>} links from `renderedLinksOf`
 * @param {(href: string) => Promise<number | null>} statusOf the final status after redirects, null when unreachable
 * @returns {Promise<{ url: string, status: number | null, error: string }[]>}
 */
export async function deadLinksOf(links, statusOf) {
  const dead = []
  for (const [href, on] of links) {
    const status = await statusOf(href)
    if (status !== null && status >= 200 && status < 300) continue
    const where = on.slice(0, 3).map((u) => new URL(u).pathname + new URL(u).search)
    dead.push({
      url: href,
      status,
      error: `dead link (${status ?? 'no answer'}) shown on ${on.length} page(s): ${where.join(', ')}${on.length > 3 ? ', ...' : ''}`
    })
  }
  return dead
}

/** The status a browser ends on: GET, redirects followed. */
export async function fetchStatus(href, { timeoutMs = 30000 } = {}) {
  try {
    const r = await fetch(href, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) })
    await r.body?.cancel()
    return r.status
  } catch {
    return null
  }
}
