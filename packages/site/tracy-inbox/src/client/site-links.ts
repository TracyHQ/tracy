/**
 * Where a site chip links: the site's live address, exactly as `GET /api/sites` hands it back
 * (`copyUrl`, built server-side by `apps/tracy-web/src/lib/site-address.js`), the same string My
 * Sites opens for "View live site". Never built here from the key: the address carries a prefix
 * per deployment that the client cannot know.
 *
 * A site the reader holds no accepted seat on (removed, left, a request still pending) has no
 * address in that answer, so its chip stays plain text rather than linking to a guess.
 */

/**
 * @param body - the `GET /api/sites` answer.
 * @returns site key → live address, http(s) only.
 */
export function siteLinks(body: unknown): Map<string, string> {
  const links = new Map<string, string>()
  const sites =
    body !== null && typeof body === 'object' && Array.isArray((body as { sites?: unknown }).sites)
      ? (body as { sites: unknown[] }).sites
      : []
  for (const row of sites) {
    if (row === null || typeof row !== 'object') continue
    const { siteKey, status, copyUrl } = row as { siteKey?: unknown; status?: unknown; copyUrl?: unknown }
    if (typeof siteKey !== 'string' || siteKey === '' || typeof copyUrl !== 'string') continue
    if (status !== undefined && status !== 'accepted') continue
    let url: URL
    try {
      url = new URL(copyUrl)
    } catch {
      continue
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue
    links.set(siteKey, url.href)
  }
  return links
}
