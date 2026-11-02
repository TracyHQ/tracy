// The READ pass: crawl the site, then open every live page at every width and read its DOM only (blocks, their boxes,
// links, rows, frames' places and the body skeleton). Nothing is shot here: the shoot pass (shoot-pass.mjs) shoots
// what the pack holds once the pages are grouped by layout.
import { openKitContext, openFrozen } from './capture.mjs'
import { crawlSite, httpFetcher } from './crawl.mjs'
import { decideExclusions } from './exclude.mjs'
import { blockIdOf } from './ids.mjs'
import { readDetails } from './read-details.js'
import { pathOfRoute, slugOfPath, urlOfPath } from './kit-paths.mjs'
import { assignedAt, indexMap } from './map-index.mjs'

const log = (...a) => console.error('[template-kit]', ...a)

const OFF = new Set([0, '0', false, -2, '-2'])
const TABS = 3 // pages read at once

/**
 * Does a map page open a page of its own? A menu heading or separator (no link), a `#` or empty URL, an alias
 * pointing nowhere (`Itemid=` with no id) or at another menu entry (`Itemid=<other>`) and an unpublished or trashed entry (when the map says so) do not:
 * crawling them only reports a dead path the visitor can never reach.
 */
export function opensPage(p, entity) {
  const link = String(p.link ?? '').trim()
  if (!link || link === '#' || /^javascript:/i.test(link)) return false
  if (/[?&]Itemid=(?:&|$)/.test(link) && !/[?&]option=/.test(link)) return false
  // An alias or URL entry pointing at another menu entry opens that entry's page, not a route of its own.
  const target = link.match(/[?&]Itemid=(\d+)/)?.[1]
  const own = String(entity?.sourceId ?? String(p.entity ?? '').match(/-(\d+)$/)?.[1] ?? '')
  if (target && own && target !== own) return false
  for (const v of [p.published, p.state, entity?.published, entity?.identity?.published])
    if (v != null && OFF.has(v)) return false
  return true
}

/** The crawl seeds: every map route that opens a page of its own, and the front page. */
export function seedsOf(map) {
  const entities = new Map((map.entities ?? []).map((e) => [e.key, e]))
  const seeds = (map.pages ?? [])
    .filter((p) => opensPage(p, entities.get(p.entity)))
    .map((p) => ({ path: pathOfRoute(p.route), from: 'content-map' }))
  if (!seeds.some((s) => s.path === '/')) seeds.unshift({ path: '/', from: 'front page' })
  return seeds
}

/** Fold one page's reading at one width into the page and block records (a block's box and details: first page). */
export function recordRead({ page, width, result, blocks }) {
  const w = String(width)
  const order = []
  const hidden = []
  for (const b of result.blocks) {
    if (b.note) continue // the page has no component area of its own: no block to record
    const id = blockIdOf(b.block, page.slug)
    const rec = (blocks[id] ??= {
      id,
      source: b.block,
      kind: b.kind,
      position: b.position ?? null,
      widths: {}
    })
    for (const c of b.contains ?? []) if (!(rec.contains ??= []).includes(c)) rec.contains.push(c)
    const at = (rec.widths[w] ??= { pages: [], hiddenOn: [] })
    if (!b.visible) {
      at.hiddenOn.push(page.slug)
      if (b.offCanvas) rec.offCanvas = true
      hidden.push(id)
      continue
    }
    order.push(id)
    at.pages.push(page.slug)
    if (!at.box) {
      at.box = { width: b.width, height: b.height }
      at.details = result.details?.[b.block] ?? null
    }
  }
  page.widths[w] = { height: result.height, blocks: order, hidden }
}

/**
 * Leave the crawl's test-data pages out (see exclude.mjs): drop them, the dead paths only they link to, and
 * every mention of them in `from`. What is left out is counted by reason, never named, so no trace of it
 * reaches the kit; the paths go back only to the browser run, which removes links to them from the pages.
 */
export function applyExclusions(crawl, { map, patterns = [] }) {
  const routes = new Set((map.pages ?? []).map((p) => pathOfRoute(p.route)))
  const left = decideExclusions({ pages: crawl.pages, map, routes, patterns })
  const keep = (list) => list.filter((r) => !left.has(r))
  const clean = (x) => {
    const { links: _links, refs, ...rest } = x
    return { ...rest, from: keep(refs ?? x.from ?? []).slice(0, 3) }
  }
  const excluded = {}
  for (const reason of left.values()) excluded[reason] = (excluded[reason] ?? 0) + 1
  return {
    pages: crawl.pages.filter((p) => !left.has(p.path)).map(clean),
    dead: crawl.dead.filter((d) => !d.refs?.length || keep(d.refs).length).map(clean),
    excluded: Object.entries(excluded).map(([reason, count]) => ({ reason, count })),
    hide: [...left.keys()]
  }
}

/**
 * @param {{chromium: object, siteUrl: string, hostHeader?: string, map: object, widths: number[], cap: number, only?: string[], excludePaths?: string[]}} o
 * @returns the capture index without images, and `hide` (the left-out paths, in memory only)
 */
export async function readSite({ chromium, siteUrl, hostHeader, map, widths, cap, only, excludePaths }) {
  const aliasHosts = hostHeader ? [hostHeader] : []
  const crawl = await crawlSite({
    seeds: seedsOf(map),
    fetchPage: httpFetcher({ siteUrl, hostHeader }),
    siteUrl,
    aliasHosts,
    cap,
    log
  })
  const kept = applyExclusions(crawl, { map, patterns: excludePaths })
  const hide = kept.hide
  log(
    'crawl',
    kept.pages.length,
    'live pages,',
    kept.dead.length,
    'dead paths,',
    kept.hide.length,
    'left out'
  )
  const idx = indexMap(map)
  const targets = only?.length ? kept.pages.filter((p) => only.includes(p.path)) : kept.pages
  const slugs = new Set()
  const pages = targets.map((p) => {
    let slug = slugOfPath(p.path)
    while (slugs.has(slug)) slug += '_'
    slugs.add(slug)
    return { ...p, slug, widths: {} }
  })
  const blocks = {}
  const failures = []
  const browser = await chromium.launch()
  try {
    for (const width of widths) {
      // DOM only: pictures, video and fonts are never fetched; TABS pages are read at once.
      const ctx = await openKitContext(browser, {
        width,
        siteUrl,
        hostHeader,
        skip: ['image', 'media', 'font']
      })
      const results = new Map()
      const readOne = async (page) => {
        const opened = await openFrozen(
          ctx,
          urlOfPath(page.path, siteUrl),
          assignedAt(idx, page.path),
          { paths: hide, hosts: aliasHosts },
          { wake: 'quick' }
        )
        if (!opened.page) return results.set(page.slug, { error: opened })
        try {
          const details = await opened.page.evaluate(readDetails)
          results.set(page.slug, { result: { ...opened, height: opened.docHeight, details } })
        } finally {
          await opened.page.close().catch(() => {})
        }
      }
      try {
        const queue = [...pages]
        await Promise.all(
          Array.from({ length: TABS }, async () => {
            while (queue.length) await readOne(queue.shift())
          })
        )
      } finally {
        await ctx.close()
      }
      // Folded in crawl order, so a block's first page is the same whatever tab finished first.
      for (const page of pages) {
        const r = results.get(page.slug)
        if (r?.error) {
          failures.push({ path: page.path, width, status: r.error.status, error: r.error.error })
          log('fail', width, page.path, r.error.error)
        } else if (r) recordRead({ page, width, result: r.result, blocks })
      }
      log('read', width, pages.length, 'pages')
    }
  } finally {
    await browser.close()
  }
  return {
    widths,
    crawledPages: kept.pages.length,
    capReached: crawl.capReached,
    excluded: kept.excluded,
    pages,
    blocks,
    dead: kept.dead,
    failures,
    hide: kept.hide
  }
}
