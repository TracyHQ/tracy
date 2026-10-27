// The audit loop: pages from the map + crawl, render at two viewports, match, classify.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openContext, renderPage } from './render.mjs'
import { PagePlan } from './pages.mjs'
import { mergeViewports, annotate, count, emptyCounts, coverage } from './items.mjs'
import { createMatcher } from './match.mjs'
import { createClassifier } from './classify.mjs'
import { findHygiene } from './hygiene.mjs'
import { normText } from './normalize.mjs'

const log = (...a) => console.error('[audit]', ...a)
const signature = (cls) => {
  const item = String(cls ?? '').match(/\bitem(?:id)?-(\d+)\b/)
  const view = String(cls ?? '').match(/\bview-([a-z]+)\b/)
  return item && view ? `${item[1]}|${view[1]}` : null
}

/** For a page the map does not declare: does it at least render an entity the contract knows? */
export function guessEntity(contract, page) {
  const h1 = page.items.find((i) => i.kind === 'text' && i.tag === 'h1' && i.status === 'matched')
  if (!h1) return null
  const slot = contract.slotsByKey.get(h1.slots?.[0])
  return slot ? { entity: slot.entity, via: `h1 matches slot ${slot.key}` } : null
}

export async function runAudit({
  chromium,
  siteUrl,
  contract,
  dbIndex,
  sourceIndex,
  outDir,
  cap,
  viewports
}) {
  mkdirSync(join(outDir, 'shots'), { recursive: true })
  const match = createMatcher(contract, siteUrl)
  const classify = createClassifier(contract, dbIndex, sourceIndex)
  const plan = new PagePlan(siteUrl, contract, cap)
  const browser = await chromium.launch()
  const ctx = {}
  for (const vp of viewports) ctx[vp] = await openContext(browser, vp)
  const pages = []
  const failures = []
  const seedSigs = new Map()
  const duplicates = []
  try {
    for (let job = plan.next(); job; job = plan.next()) {
      const first = await renderPage(ctx[viewports[0]], job.url)
      if (first.error || !first.data || (first.status && first.status >= 400)) {
        failures.push({
          url: job.url,
          origin: job.origin,
          mapPage: job.mapPage?.entity,
          status: first.status,
          error: first.error
        })
        log('fail', first.status, job.url, first.error ?? '')
        continue
      }
      // Seeds open as `?Itemid=N`; the crawl finds the same page under its SEF URL. Joomla/T4 put
      // `item-N view-X` on <body>, so a crawled page with a seed's signature is that seed again.
      const sig = signature(first.data.bodyClass)
      // Only the seed's own route counts as the same page: `?start=6` or `/author/<name>` under a
      // listing share its body classes but show other items.
      const routeKey = (u) => {
        try {
          const x = new URL(u)
          return (
            (x.pathname.replace(/\/$/, '').replace(/^\/index\.php(?=\/|$)/, '') || '/').toLowerCase() +
            x.search.toLowerCase()
          )
        } catch {
          return u
        }
      }
      if (job.origin === 'map' && sig)
        seedSigs.set(sig, {
          entity: job.mapPage.entity,
          route: job.mapPage.route === 'home' ? '/' : '/' + String(job.mapPage.route).toLowerCase()
        })
      else if (
        sig &&
        seedSigs.has(sig) &&
        routeKey(first.finalUrl).split('?')[0] === seedSigs.get(sig).route &&
        !/[?&](start|limitstart)=/.test(first.finalUrl)
      ) {
        duplicates.push({ url: first.finalUrl, sameAs: seedSigs.get(sig).entity })
        continue
      }
      if (plan.land(job, first.finalUrl)) continue // same page reached twice
      const n = pages.length + 1
      plan.addLinks(
        first.data.items.filter((i) => i.kind === 'link' && i.source === 'a').map((i) => i.value),
        first.finalUrl
      )
      const results = { [viewports[0]]: first }
      for (const vp of viewports.slice(1)) results[vp] = await renderPage(ctx[vp], first.finalUrl)
      const shots = {}
      for (const [vp, r] of Object.entries(results)) {
        if (!r.shot) continue
        const file = `shots/${String(n).padStart(3, '0')}-${vp}.jpg`
        writeFileSync(join(outDir, file), r.shot)
        shots[vp] = {
          file,
          width: r.data?.docWidth,
          height: r.shotHeight,
          docHeight: r.data?.docHeight,
          truncated: r.truncated
        }
      }
      const items = annotate(
        mergeViewports(Object.fromEntries(Object.entries(results).map(([vp, r]) => [vp, r.data])), siteUrl),
        match,
        classify
      )
      const rec = plan.byFinal.get(plan.byFinal.size ? [...plan.byFinal.keys()].pop() : '')
      const page = {
        n,
        url: first.finalUrl,
        requested: job.url,
        origin: job.origin,
        status: first.status,
        title: first.data.title,
        mapPages: rec.mapPages.map((p) => ({ entity: p.entity, route: p.route })),
        shots,
        items,
        // Page hygiene: raw constants and placeholders in any viewport's items, PHP errors in the served HTML.
        hygiene: findHygiene({ html: first.html, items })
      }
      pages.push(page)
      const c = count(items)
      log(
        `#${n} ${page.mapPages.length ? 'map ' : 'CRAWL'} ${first.finalUrl}  text ${c.text.matched}/${c.text.total}  img ${c.images.matched}/${c.images.total}${page.hygiene.length ? `  hygiene ${page.hygiene.length}` : ''}`
      )
    }
  } finally {
    await browser.close()
  }
  // Pages reached twice keep every map entry on the first record; refresh them now.
  for (const p of pages) {
    const rec = [...plan.byFinal.values()].find((r) => r.url === p.url)
    if (rec) p.mapPages = rec.mapPages.map((m) => ({ entity: m.entity, route: m.route }))
    p.unmapped = p.mapPages.length === 0
    if (p.unmapped) p.rendersEntity = guessEntity(contract, p)
    p.counts = count(p.items)
  }
  return {
    pages,
    failures,
    duplicates,
    skipped: plan.skipped,
    capReached: plan.capReached,
    summary: summarize(pages)
  }
}

/** Site-wide numbers: every distinct item once (header/footer are not counted per page). */
export function summarize(pages) {
  const unique = new Map()
  for (const p of pages) for (const it of p.items) if (!unique.has(it.key)) unique.set(it.key, it)
  const site = count([...unique.values()])
  const perPage = emptyCounts()
  for (const p of pages) count(p.items, perPage)
  const cov = Object.fromEntries(Object.entries(site).map(([k, v]) => [k, coverage(v)]))
  return {
    pages: pages.length,
    mappedPages: pages.filter((p) => !p.unmapped).length,
    unmappedPages: pages.filter((p) => p.unmapped).length,
    uniqueItems: site,
    coverage: cov,
    itemsSummedOverPages: perPage,
    holeValuesByClass: Object.fromEntries(
      ['a', 'b', 'c', 'd'].map((k) => [
        k,
        [...unique.values()].filter((i) => i.status === 'hole' && i.class === k).length
      ])
    ),
    // Class a split: the value sits in a field the presentation lock pins (locked, not editable) or in one the contract never saw.
    classAByLock: Object.fromEntries(
      ['locked', 'undeclared'].map((k) => [
        k,
        new Set(
          [...unique.values()]
            .filter((i) => i.status === 'hole' && i.class === 'a' && (i.lockState ?? 'undeclared') === k)
            .map((i) => normText(i.remainder ?? i.value))
        ).size
      ])
    ),
    note: 'uniqueItems counts each distinct text/image/link once across the whole site (key: kind + normalized value).',
    sampleHoles: [...unique.values()]
      .filter((i) => i.status === 'hole' && i.class !== 'c')
      .slice(0, 5)
      .map((i) => normText(i.remainder ?? i.value).slice(0, 80))
  }
}
