/**
 * Read a built site (or its demo) over HTTP for the Template Customization Question Readiness built-site check: breadth first from `/`, same
 * origin only, up to `max` pages, every page kept with its status, HTML and the links it holds.
 *
 *   const site = await crawl('https://g59-ess-wp-full.tracy.site', { fetch, max: 160 })
 *   site.pages.get('/contact/')   // { status, html, title, links: ['/', ...] }
 *   await site.page('/detail/video/')   // fetched now when the crawl did not reach it
 *
 * `fetch` is passed in, so tests serve saved HTML and the audit never needs a network to be tested.
 * Files (images, PDFs, feeds) and paged duplicates past the first are not followed.
 */

const SKIP =
  /\.(pdf|jpe?g|png|gif|webp|svg|ico|zip|xml|json|css|js|mp4|webm|woff2?)(\?|$)|\/(wp-json|feed|_emdash\/api)\b|[?&](format=feed|type=rss|tmpl=component|print=1)/i

/**
 * @param {string} origin
 * @param {{ fetch: typeof globalThis.fetch, max?: number, seeds?: string[] }} opts
 */
export async function crawl(origin, { fetch, max = 160, seeds = [] }) {
  const base = origin.replace(/\/$/, '')
  /** @type {Map<string, { status: number, html: string, title: string | null, links: string[], location: string | null }>} */
  const pages = new Map()
  const get = async (/** @type {string} */ path) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop -- one retry after a gateway error.
        const r = await fetch(base + path, { redirect: 'manual' })
        if (r.status === 502 && attempt < 2) continue
        const html = await r.text()
        return { status: r.status, html, location: r.headers.get('location') }
      } catch {
        // retried
      }
    }
    return { status: 0, html: '', location: null }
  }
  const linksIn = (/** @type {string} */ html, /** @type {string} */ path) => {
    const out = []
    for (const m of html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/gi)) {
      const href = m[1].replace(/&amp;/g, '&')
      if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) continue
      try {
        const u = new URL(href, base + path)
        if (u.origin === new URL(base).origin && !SKIP.test(u.pathname + u.search))
          out.push(u.pathname + u.search)
      } catch {
        // not a link
      }
    }
    return out
  }
  const visit = async (/** @type {string} */ path) => {
    const r = await get(path)
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(r.html)?.[1]?.trim() ?? null
    const entry = { ...r, title, links: r.status === 200 ? linksIn(r.html, path) : [] }
    pages.set(path, entry)
    return entry
  }
  const queue = ['/', ...seeds]
  while (queue.length && pages.size < max) {
    const path = /** @type {string} */ (queue.shift())
    if (pages.has(path)) continue
    // eslint-disable-next-line no-await-in-loop -- a polite crawl, one page at a time.
    const entry = await visit(path)
    for (const l of entry.links) if (!pages.has(l) && !queue.includes(l)) queue.push(l)
  }
  return {
    origin: base,
    pages,
    /** A page by path, fetched now when the crawl did not reach it. */
    async page(/** @type {string} */ path) {
      return pages.get(path) ?? visit(path)
    },
    /** The text of a same-origin stylesheet, fetched once. */
    sheet: memo(
      async (/** @type {string} */ href) =>
        (await get(new URL(href, `${base}/`).pathname + new URL(href, `${base}/`).search)).html
    )
  }
}

/** One call per key. */
function memo(/** @type {(k: string) => Promise<string>} */ fn) {
  const cache = new Map()
  return (/** @type {string} */ k) => {
    if (!cache.has(k)) cache.set(k, fn(k))
    return cache.get(k)
  }
}
