// Which pages to audit: every page the content map declares, plus a same-host link crawl.
import { normHref } from './normalize.mjs'

const NOT_A_PAGE =
  /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|zip|rar|gz|mp4|webm|mp3|wav|docx?|xlsx?|pptx?|css|js|json|xml|txt)(\?|$)/i
const NOT_PUBLIC =
  /\/administrator\b|[?&](task|format|tmpl|print|layout=edit|return)=|\/component\/(users|mailto|ajax)|logout/i
// Pagination (`?start=N`) and author pages are crawled: their intro images and author names are demo content too.
// Menu item types that never render a page of their own.
const NO_PAGE_TYPES = new Set(['alias', 'separator', 'heading', 'url'])

export class PagePlan {
  constructor(siteUrl, contract, cap = 150) {
    this.site = new URL(siteUrl)
    this.cap = cap
    this.queue = [] // {url, origin:'map'|'crawl', mapPage?}
    this.seen = new Set() // normalized request URLs
    this.byFinal = new Map() // normalized final URL -> page record
    this.skipped = []
    this.capReached = false
    for (const p of contract.pages) {
      if (NO_PAGE_TYPES.has(p.type)) {
        this.skipped.push({
          entity: p.entity,
          route: p.route,
          reason: `menu type ${p.type} has no page of its own`
        })
        continue
      }
      if (p.published !== undefined && String(p.published) !== '1') {
        this.skipped.push({
          entity: p.entity,
          route: p.route,
          reason: `menu item not published (${p.published})`
        })
        continue
      }
      const url = new URL(p.openAs ?? `index.php?Itemid=${p.sourceId}`, this.site).href
      this.seen.add(normHref(url, siteUrl))
      this.queue.push({ url, origin: 'map', mapPage: p })
    }
    const home = new URL('./', this.site).href
    if (!this.seen.has(normHref(home, siteUrl))) {
      this.seen.add(normHref(home, siteUrl))
      this.queue.push({ url: home, origin: 'crawl' })
    }
  }

  get visited() {
    return this.byFinal.size
  }

  next() {
    if (this.visited >= this.cap) {
      if (this.queue.length) this.capReached = true
      return null
    }
    return this.queue.shift() ?? null
  }

  /**
   * Record where a request landed. Returns the existing page when two requests
   * (e.g. `?Itemid=101` and `/`) land on the same final URL, else null.
   */
  land(job, finalUrl) {
    const key = normHref(finalUrl, this.site.href)
    const existing = this.byFinal.get(key)
    if (existing) {
      if (job.mapPage) existing.mapPages.push(job.mapPage)
      return existing
    }
    const rec = {
      key,
      url: finalUrl,
      requested: job.url,
      origin: job.origin,
      mapPages: job.mapPage ? [job.mapPage] : []
    }
    this.byFinal.set(key, rec)
    return null
  }

  /** Queue the same-host page links found on a rendered page. */
  addLinks(hrefs, fromUrl) {
    for (const h of hrefs) {
      let u
      try {
        u = new URL(h, fromUrl)
      } catch {
        continue
      }
      if (u.host !== this.site.host || !/^https?:$/.test(u.protocol)) continue
      u.hash = ''
      const href = u.href
      if (NOT_A_PAGE.test(href) || NOT_PUBLIC.test(href)) continue
      const key = normHref(href, this.site.href)
      if (this.seen.has(key) || this.byFinal.has(key)) continue
      this.seen.add(key)
      this.queue.push({ url: href, origin: 'crawl' })
    }
  }
}
