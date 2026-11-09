// The content coverage audit of an EmDash site: crawl the pages the content map declares with `X-Tracy-Preview: pick`,
// bind every visible text and picture to a slot through the provenance stamps (`emdash-bind.mjs`), and write the same
// `content-coverage.json` the Joomla and WordPress audits write, so Road to live judges it with the same policy.
// Read-only on the site: a browser request that is not GET/HEAD/OPTIONS is aborted.
import { createHash } from 'node:crypto'
import { failureCodeOf, holeKey, hygieneKey, percent, SCHEMA, TOOL_VERSION } from './coverage-file.mjs'
import { bindItems, indexOfMap, normLink, sourceIndexOf } from './emdash-bind.mjs'
import { extractEmdashPage } from './emdash-extract.mjs'
import { findHygiene } from './hygiene.mjs'
import { applyJudgeToLabelRules, labelRulesOf } from './label-rules.mjs'
import { normText } from './normalize.mjs'

export const VIEWPORTS = Object.freeze({
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 }
})
const NOT_A_PAGE =
  /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|zip|gz|css|js|json|xml|txt|mp4|webm|woff2?)(\?|$)|^\/(_emdash|_astro|api|brand|uploads)\//i
const MEDIA_FILE_PATH = '/_emdash/api/media/file/'
const PICK = { 'X-Tracy-Preview': 'pick' }
const cut = (s, n) => (String(s ?? '').length > n ? `${String(s).slice(0, n - 3)}...` : String(s ?? ''))
const pathOf = (url) => {
  try {
    const u = new URL(url)
    return u.pathname + u.search
  } catch {
    return String(url)
  }
}

/**
 * Which entry field holds each media file, from the site's own REST read (the agent token): file key -> slot keys.
 * Evidence for a picture the template prints without a stamp; absent without a token.
 * @returns {Promise<Map<string, string[]>>}
 */
export async function mediaIndexOf({ siteUrl, token, map }) {
  // A URL names a media key only if it is on the audited site, under the media route, as one whole segment.
  const mediaKeyOf = (url) => {
    try {
      const u = new URL(String(url ?? ''), siteUrl)
      if (u.origin !== new URL(siteUrl).origin || !u.pathname.startsWith(MEDIA_FILE_PATH)) return null
      const key = decodeURIComponent(u.pathname.slice(MEDIA_FILE_PATH.length))
      return key && !key.includes('/') ? key : null
    } catch {
      return null
    }
  }
  const out = new Map()
  const put = (key, slot) => out.set(key, [...(out.get(key) ?? []), slot])
  const collections = [...new Set((map.entities ?? []).map((e) => e.identity?.collection).filter(Boolean))]
  const isMedia = (v) =>
    v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    typeof v.id === 'string' &&
    (v.meta?.storageKey || v.filename)
  // A file is known by its STORAGE KEY alone. The media route serves a file by that key, exactly as stored
  // (vendor/emdash/emdash/packages/core/src/astro/routes/api/media/file/[...key].ts: `storage.download(key)`; the key is
  // `${ulid()}${extname}` at api/handlers/media-upload.ts:157, and the record's own url is `file/${storageKey}` at :60).
  // A record id is never a served file name, and no part of a key stands for the key.
  const keysOf = (v) => [v.meta?.storageKey].filter(Boolean)
  for (const collection of collections) {
    let cursor = null
    do {
      const url = new URL(`/_emdash/api/content/${collection}`, siteUrl)
      url.searchParams.set('limit', '100')
      if (cursor) url.searchParams.set('cursor', cursor)
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'X-EmDash-Request': '1' } })
      if (!r.ok) throw new Error(`REST read of ${collection} answered ${r.status}`)
      const page = (await r.json()).data
      cursor = page?.nextCursor ?? null
      for (const item of page?.items ?? []) {
        for (const [field, value] of Object.entries(item.data ?? {})) {
          const at = `${collection}.${item.slug}.${field}`
          if (isMedia(value)) for (const k of keysOf(value)) put(k, at)
          else if (Array.isArray(value))
            value.forEach((row, i) => {
              // A picture inside Portable Text: the block holds its file as `asset`.
              if (row?._type === 'image' && row.asset) {
                // Only the final segment of its own URL, when that URL is this site's media route: never the asset's id.
                for (const k of [mediaKeyOf(row.asset.url)].filter(Boolean)) put(k, at)
                return
              }
              for (const [sub, cell] of Object.entries(row && typeof row === 'object' ? row : {}))
                if (isMedia(cell)) for (const k of keysOf(cell)) put(k, `${at}[${i}].${sub}`)
            })
        }
      }
    } while (cursor)
  }
  return out
}

/** One visit of one page at one viewport: its items, or the reason it failed. */
async function visit(context, url, viewport) {
  const page = await context.newPage()
  try {
    await page.setViewportSize(viewport)
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
    const status = response?.status() ?? 0
    if (status < 200 || status >= 300)
      return { failure: { url, code: 'page-not-rendered', status, error: `HTTP ${status}` } }
    // Lazy pictures load on scroll (E-031): walk the page once so every picture has its size.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 700) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 60))
      }
      window.scrollTo(0, 0)
    })
    await page.waitForLoadState('networkidle').catch(() => {})
    const html = await page.content()
    const data = await page.evaluate(`(${extractEmdashPage.toString()})()`)
    return { data, html, status, finalUrl: page.url() }
  } catch (error) {
    return {
      failure: { url, code: 'page-not-rendered', error: String(error?.message ?? error).slice(0, 300) }
    }
  } finally {
    await page.close()
  }
}

/**
 * The page a link opens, as the crawl queues it: the path with its WHOLE query (parameters sorted), so `/preview?mode=demo`
 * is a page of its own and never `/preview`. Null for another site or a file that is no page.
 */
export function crawlKeyOf(href, base, origin) {
  const u = new URL(href, base)
  if (u.origin !== origin || NOT_A_PAGE.test(u.pathname + u.search)) return null
  return normLink(u.href, origin)
}

/** The same item seen at several viewports (and cloned in a slider) becomes one item with a view per viewport. */
export function mergeViewports(byViewport) {
  const merged = new Map()
  for (const [vp, data] of Object.entries(byViewport)) {
    for (const it of data?.items ?? []) {
      const stampKey = it.stamp ? `${it.stamp.collection}:${it.stamp.slug}:${it.stamp.field ?? ''}` : ''
      const key =
        it.kind === 'image'
          ? `image|${it.value}|${stampKey}`
          : it.kind === 'link'
            ? `link|${it.value}|${stampKey}`
            : `text|${normText(it.value)}|${stampKey}`
      let m = merged.get(key)
      if (!m) {
        const { rect: _r, look: _l, natural: _n, ...rest } = it
        m = { key, ...rest, viewports: {} }
        if (it.kind === 'image' && it.natural)
          m.file = { width: it.natural.w, height: it.natural.h, alpha: null }
        merged.set(key, m)
      }
      // The first copy on a viewport is the one measured; a later copy (a slider clone) adds nothing.
      m.viewports[vp] ??= { visible: true, rect: it.rect, ...(it.look ? { look: it.look } : {}) }
    }
  }
  return [...merged.values()]
}

/**
 * Crawl and bind.
 * @param {{ chromium: any, siteUrl: string, map: any, themeDir: string, media?: Map<string, string[]> | null, viewports?: string[], cap?: number, onPage?: (url: string) => void }} input
 */
export async function runEmdashAudit({
  chromium,
  siteUrl,
  map,
  themeDir,
  media = null,
  viewports = ['desktop', 'phone'],
  cap = 150,
  onPage
}) {
  const origin = new URL(siteUrl).origin
  const index = indexOfMap(map)
  const source = sourceIndexOf(themeDir)
  const browser = await chromium.launch()
  const pages = []
  const failures = []
  // The crawl: every page the map declares, then every same-site page they link to (and those pages link to), up to
  // `cap` pages. A page outside the map that answers 2xx is audited like any other (its DOM is bound and judged);
  // one that does not answer is a dead link.
  const keyOf = (href, base) => crawlKeyOf(href, base, origin)
  const queue = (map.pages ?? []).map((p) => ({
    key: keyOf(p.openAs, `${origin}/`),
    mapPage: p.entity,
    from: null
  }))
  const queued = new Set(queue.map((q) => q.key))
  let capReached = false
  try {
    const context = await browser.newContext({ extraHTTPHeaders: PICK })
    await context.route('**/*', (route) => {
      const m = route.request().method()
      return m === 'GET' || m === 'HEAD' || m === 'OPTIONS' ? route.continue() : route.abort()
    })
    for (let i = 0; i < queue.length; i++) {
      if (i >= cap) {
        capReached = true
        break
      }
      const { key, mapPage, from } = queue[i]
      const url = new URL(key, `${origin}/`).href
      onPage?.(url)
      const seen = {}
      let html = ''
      let status = 200
      let failed = null
      for (const vp of viewports) {
        const r = await visit(context, url, VIEWPORTS[vp])
        if (r.failure) {
          failed = mapPage
            ? { ...r.failure, mapPage }
            : {
                ...r.failure,
                code: 'dead-link',
                origin: 'link',
                error: `dead link (${r.failure.status ?? 'no answer'}) shown on ${from}`
              }
          break
        }
        seen[vp] = r.data
        html = r.html
        status = r.status
      }
      if (failed) {
        failures.push(failed)
        continue
      }
      for (const href of Object.values(seen).flatMap((d) => d.links)) {
        const next = keyOf(href, url)
        if (next && !queued.has(next)) {
          queued.add(next)
          queue.push({ key: next, mapPage: null, from: pathOf(url) })
        }
      }
      const items = mergeViewports(seen)
      bindItems(items, index, { source, origin, media })
      const hygiene = findHygiene({
        html,
        items: items
          .filter((i) => i.kind === 'text')
          .map((i) => ({ ...i, kind: 'text', visibleAnywhere: true }))
      })
      pages.push({
        url,
        status,
        requested: url,
        mapPages: mapPage ? [{ entity: mapPage }] : [],
        owner: seen.desktop?.owner ?? null,
        items,
        hygiene,
        counts: countOf(items)
      })
    }
  } finally {
    await browser.close()
  }
  return { pages, failures, capReached, summary: summarize(pages, map) }
}

export function countOf(items) {
  const c = { matched: 0, hole: 0, locked: 0, ignored: 0 }
  for (const it of items) c[it.status] = (c[it.status] ?? 0) + 1
  return c
}

function summarize(pages, map) {
  const bound = {}
  for (const p of pages)
    for (const it of p.items) if (it.status === 'matched') bound[it.matchBy] = (bound[it.matchBy] ?? 0) + 1
  const inMap = pages.filter((p) => p.mapPages.length > 0).length
  return {
    pages: pages.length,
    mappedPages: inMap,
    unmappedPages: pages.length - inMap,
    bound,
    mapPages: (map.pages ?? []).length
  }
}

const emptyBucket = () => ({
  total: 0,
  matched: 0,
  locked: 0,
  capture: 0,
  captureLocked: 0,
  template: 0,
  core: 0,
  unknown: 0,
  catalogue: 0,
  ignored: 0
})
const bucketOf = (kind) => (kind === 'image' ? 'images' : kind === 'link' ? 'links' : 'text')

/**
 * The coverage file of one run.
 * @param {{ result: any, map: any, contractId: string, mapSha256: string, previous?: any, measuredAt?: string, site?: string }} input
 */
export function buildEmdashCoverageFile({
  result,
  map,
  contractId,
  mapSha256,
  previous = null,
  measuredAt = new Date().toISOString()
}) {
  const accepted = new Map()
  for (const h of Array.isArray(previous?.holes) ? previous.holes : [])
    if (typeof h?.accepted === 'string' && h.accepted.trim()) accepted.set(holeKey(h), h.accepted.trim())
  const unique = new Map()
  const where = new Map()
  for (const p of result.pages)
    for (const it of p.items) {
      if (!unique.has(it.key)) unique.set(it.key, it)
      if (it.status !== 'hole') continue
      const seen = where.get(it.key) ?? { n: 0, first: pathOf(p.url) }
      seen.n += 1
      where.set(it.key, seen)
    }
  const counts = { text: emptyBucket(), images: emptyBucket(), links: emptyBucket() }
  const holes = []
  for (const it of unique.values()) {
    const c = counts[bucketOf(it.kind)]
    if (it.status === 'ignored' && it.class !== 'core') {
      c.ignored += 1
      continue
    }
    c.total += 1
    if (it.status === 'matched' || it.status === 'locked') {
      c[it.status] += 1
      continue
    }
    const cls = it.class ?? 'unknown'
    c[cls] = (c[cls] ?? 0) + 1
    if (cls === 'core') continue
    const hole = {
      kind: it.kind,
      value: cut(it.pattern ?? it.value, 200),
      class: cls,
      ...(cls === 'capture' ? { lock: 'undeclared' } : {}),
      cause: it.cause,
      evidence: cut(it.selector ?? '', 160),
      pages: where.get(it.key)?.n ?? 0,
      firstPage: where.get(it.key)?.first ?? null
    }
    const reason = accepted.get(holeKey(hole))
    if (reason) hole.accepted = reason
    const same = holes.find((h) => holeKey(h) === holeKey(hole))
    if (same) same.pages += hole.pages
    else holes.push(hole)
  }
  const order = { capture: 0, template: 1, unknown: 2, catalogue: 3 }
  holes.sort(
    (a, b) =>
      order[a.class] - order[b.class] || a.cause.localeCompare(b.cause) || a.value.localeCompare(b.value)
  )

  const previousReasons = new Map(
    (Array.isArray(previous?.hygiene) ? previous.hygiene : [])
      .filter((h) => typeof h?.accepted === 'string' && h.accepted.trim())
      .map((h) => [hygieneKey(h), h.accepted.trim()])
  )
  const hygieneByKey = new Map()
  for (const p of result.pages)
    for (const f of p.hygiene) {
      const key = hygieneKey(f)
      const seen = hygieneByKey.get(key)
      if (seen) {
        seen.pages += 1
        continue
      }
      const reason = previousReasons.get(key)
      hygieneByKey.set(key, {
        kind: f.kind,
        value: cut(f.value, 300),
        where: f.where,
        visible: f.visible === true,
        ...(f.token ? { token: f.token } : {}),
        evidence: cut(f.evidence ?? '', 160),
        pages: 1,
        firstPage: pathOf(p.url),
        ...(reason ? { accepted: reason } : {})
      })
    }
  const failed = result.failures
  const opened = new Map(
    result.pages.filter((p) => p.mapPages.length > 0).map((p) => [p.mapPages[0].entity, p])
  )
  const broken = new Map(failed.filter((f) => f.mapPage).map((f) => [f.mapPage, f]))
  return {
    schemaVersion: SCHEMA,
    tool: { name: '@tracy/quickstart-tools content-coverage (emdash)', version: TOOL_VERSION },
    platform: 'emdash',
    contract: { id: contractId, contentMapSha256: mapSha256, presentationLockSha256: null },
    measuredAt,
    viewports: Object.keys(VIEWPORTS),
    bound: result.summary.bound,
    // Pictures of the template's own public folder, counted as design: listed so a demo photo cannot hide among them.
    lockedFiles: [...new Set(unique.values())]
      .filter((it) => it.status === 'locked')
      .map((it) => pathOf(it.value))
      .sort(),
    pages: {
      audited: result.summary.pages,
      inMap: result.summary.mappedPages,
      notInMap: result.summary.unmappedPages,
      failed: failed.length,
      failures: failed.map((f) => ({
        url: pathOf(f.url),
        code: failureCodeOf(f),
        ...(f.mapPage ? { mapPage: f.mapPage } : {}),
        ...(f.status ? { status: f.status } : {}),
        ...(f.error ? { error: String(f.error).slice(0, 300) } : {})
      })),
      capReached: result.capReached === true
    },
    counts,
    coverage: Object.fromEntries(Object.entries(counts).map(([k, c]) => [k, percent(c)])),
    holes,
    hygiene: [...hygieneByKey.values()],
    sitePages: (map.pages ?? []).map((p) => ({
      entity: p.entity,
      title: p.title,
      route: p.route,
      opens: opened.has(p.entity) ? 'live' : broken.has(p.entity) ? 'broken' : 'not-checked',
      status: opened.get(p.entity)?.status ?? broken.get(p.entity)?.status ?? null
    })),
    labelRules: applyJudgeToLabelRules(
      labelRulesOf({
        map,
        pages: result.pages,
        holes: [...unique.values()]
          .filter((it) => it.status === 'hole')
          .map((it) => ({ kind: it.kind, value: String(it.value ?? ''), class: it.class ?? 'unknown' }))
      }),
      null
    )
  }
}

export const sha256Of = (text) => createHash('sha256').update(text).digest('hex')

/**
 * The findings as `measureSlotFit` reads them: a text measures a slot only when it shows that slot's words whole, which
 * for a stamped item is the case when its words are the slot's sample (markup aside).
 */
export function fitFindingsOf(result, map) {
  const samples = new Map((map.slots ?? []).map((s) => [s.key, normText(s.sample)]))
  return {
    pages: result.pages.map((p) => ({
      ...p,
      items: p.items.map((it) =>
        it.kind === 'text' &&
        it.status === 'matched' &&
        it.slots?.length === 1 &&
        samples.get(it.slots[0]) === normText(it.value)
          ? { ...it, matchBy: 'exact' }
          : it
      )
    }))
  }
}
