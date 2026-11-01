// Crawl the site, then shoot every live page at every width into `<out>/images`, and return the capture index.
// A block shared by several pages is cut once per width, on the first page that shows it.
import { join } from 'node:path'

import { capturePage, openKitContext } from './capture.mjs'
import { crawlSite, httpFetcher } from './crawl.mjs'
import { decideExclusions } from './exclude.mjs'
import { blockIdOf, pageIdOf } from './ids.mjs'
import { pathOfRoute, slugOfPath, urlOfPath } from './kit-paths.mjs'
import { assignedAt, indexMap } from './map-index.mjs'

const log = (...a) => console.error('[template-kit]', ...a)

const OFF = new Set([0, '0', false, -2, '-2'])

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

/** Fold one page's capture at one width into the page and block records. */
export function recordShot({ page, width, result, blocks }) {
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
    if (b.file) {
      at.image = `images/${b.file}`
      at.box = { width: b.width, height: b.height }
      at.details = result.details?.[b.block] ?? null
    }
  }
  page.widths[w] = {
    full: `images/${pageIdOf(page.slug)}-${w}.jpg`,
    height: result.height,
    truncated: result.truncated || undefined,
    blocks: order,
    hidden
  }
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
 * @param {{chromium: object, siteUrl: string, hostHeader?: string, map: object, out: string, widths: number[], cap: number, only?: string[], excludePaths?: string[]}} o
 */
export async function runCapture({
  chromium,
  siteUrl,
  hostHeader,
  map,
  out,
  widths,
  cap,
  only,
  excludePaths
}) {
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
  const dir = join(out, 'images')
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
      const ctx = await openKitContext(browser, { width, siteUrl, hostHeader })
      const cut = new Set()
      try {
        for (const page of pages) {
          const fileOf = (b) => {
            const id = blockIdOf(b.block, page.slug)
            return cut.has(id) ? null : `${id}-${width}.jpg`
          }
          const result = await capturePage(ctx, {
            url: urlOfPath(page.path, siteUrl),
            width,
            dir,
            fullName: `${pageIdOf(page.slug)}-${width}.jpg`,
            fileOf,
            assigned: assignedAt(idx, page.path),
            hide: { paths: kept.hide, hosts: aliasHosts }
          })
          if (result.error) {
            failures.push({ path: page.path, width, status: result.status, error: result.error })
            log('fail', width, page.path, result.error)
            continue
          }
          for (const b of result.blocks) if (b.file) cut.add(blockIdOf(b.block, page.slug))
          recordShot({ page, width, result, blocks })
          log(width, page.path, page.widths[width].blocks.length, 'blocks')
        }
      } finally {
        await ctx.close()
      }
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
    // In memory only, never written: the left-out paths, for later browser runs to remove links to them.
    hide: kept.hide,
    failures
  }
}
