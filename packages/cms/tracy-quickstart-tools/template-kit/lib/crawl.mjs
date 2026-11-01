// Every page of a site, none left out: start from the content map's routes, then follow every same-site
// link of every page reached until no new address appears. A page that does not answer 200 is listed as
// dead and never captured; addresses that land on the same page (a redirect, `/index.php/` or not, a
// trailing slash, query noise) merge into one page with aliases.
import http from 'node:http'
import https from 'node:https'

import { canonicalPath, urlOfPath } from './kit-paths.mjs'

/** Every `href` of an HTML document, as written (entities in the attribute decoded for `&amp;`). */
export function extractLinks(html) {
  const out = []
  for (const m of String(html ?? '').matchAll(/<a\b[^>]*?\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi))
    out.push((m[2] ?? m[3] ?? m[4] ?? '').replace(/&amp;/g, '&'))
  return out
}

/**
 * A page fetcher over plain HTTP: requests go to `siteUrl`, carrying `hostHeader` when the site is served
 * under another name; redirects are followed (a Location under that name is sent back to `siteUrl`).
 * @returns {(url: string) => Promise<{status: number, finalUrl: string, html: string}>}
 */
export function httpFetcher({ siteUrl, hostHeader, timeoutMs = 30000, maxRedirects = 5 }) {
  const base = new URL(siteUrl)
  const toBase = (u) => {
    const x = new URL(u, base)
    if (hostHeader && x.host.toLowerCase() === hostHeader.toLowerCase()) {
      x.protocol = base.protocol
      x.host = base.host
    }
    return x
  }
  const once = (url) =>
    new Promise((resolve) => {
      const lib = url.protocol === 'https:' ? https : http
      const headers = { 'user-agent': 'TracyTemplateKit/1.0', accept: 'text/html' }
      if (hostHeader) headers.host = hostHeader
      const req = lib.get(url, { headers, timeout: timeoutMs, rejectUnauthorized: false }, (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            location: res.headers.location,
            html: Buffer.concat(chunks).toString('utf8')
          })
        )
      })
      req.on('timeout', () => req.destroy(new Error('timeout')))
      req.on('error', (e) => resolve({ status: 0, error: e.message, html: '' }))
    })
  return async (url) => {
    let current = toBase(url)
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const r = await once(current)
      if (r.status >= 300 && r.status < 400 && r.location) {
        current = toBase(new URL(r.location, current).href)
        continue
      }
      return { status: r.status, finalUrl: current.href, html: r.html, error: r.error }
    }
    return { status: 0, finalUrl: current.href, html: '', error: 'too many redirects' }
  }
}

/**
 * Crawl from the seeds until no new same-site page appears.
 * @param {{seeds: {path: string, from: string}[], fetchPage: Function, siteUrl: string, aliasHosts?: string[], cap?: number, log?: Function}} o
 * @returns {Promise<{pages: object[], dead: object[], capReached: boolean}>}
 */
export async function crawlSite({ seeds, fetchPage, siteUrl, aliasHosts = [], cap = 400, log = () => {} }) {
  const sources = new Map() // path -> every page (or seed) it was found through
  const note = (path, from) => {
    const list = sources.get(path) ?? []
    if (!list.includes(from)) list.push(from)
    sources.set(path, list)
  }
  const queue = []
  const seen = new Set()
  const enqueue = (path, from) => {
    note(path, from)
    if (seen.has(path)) return
    seen.add(path)
    queue.push(path)
  }
  for (const s of seeds) enqueue(s.path, s.from)
  const byFinal = new Map()
  const dead = []
  let capReached = false
  while (queue.length) {
    if (byFinal.size >= cap) {
      capReached = true
      break
    }
    const path = queue.shift()
    const r = await fetchPage(urlOfPath(path, siteUrl))
    if (r.status !== 200) {
      dead.push({ path, status: r.status, error: r.error })
      log('dead', r.status, path)
      continue
    }
    const final = canonicalPath(r.finalUrl, siteUrl, aliasHosts) ?? path
    const known = byFinal.get(final)
    if (known) {
      if (final !== path && !known.aliases.includes(path)) known.aliases.push(path)
      continue
    }
    const links = [
      ...new Set(
        extractLinks(r.html)
          .map((h) => canonicalPath(h, r.finalUrl, aliasHosts))
          .filter(Boolean)
      )
    ]
    byFinal.set(final, { path: final, aliases: final === path ? [] : [path], links })
    seen.add(final)
    for (const p of links) enqueue(p, path)
  }
  // A page reached later through more links keeps every referrer it was given: `refs` all of them (for the
  // exclusion rule), `from` the first three (for the kit).
  const refsOf = (page) => [...new Set([page.path, ...page.aliases].flatMap((p) => sources.get(p) ?? []))]
  for (const page of byFinal.values()) {
    page.refs = refsOf(page).filter((r) => r !== page.path)
    page.from = page.refs.slice(0, 3)
  }
  for (const d of dead) {
    d.refs = sources.get(d.path) ?? []
    d.from = d.refs.slice(0, 3)
  }
  return { pages: [...byFinal.values()], dead, capReached }
}
