// The audit loop: pages from the map + crawl, render at two viewports, match, classify.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { layoutFindingsOf, planLayoutCheck } from './article-layout.mjs'
import { createClassifier } from './classify.mjs'
import { findHygiene } from './hygiene.mjs'
import { annotate, count, coverage, emptyCounts, mergeViewports } from './items.mjs'
import { deadLinksOf, fetchStatus, renderedLinksOf } from './link-check.mjs'
import { createMatcher } from './match.mjs'
import { normText } from './normalize.mjs'
import { PagePlan } from './pages.mjs'
import { openContext, renderPage } from './render.mjs'
import { standUserFilter } from './stand-users.mjs'

const log = (...a) => console.error('[audit]', ...a)
const pathOfUrl = (url) => {
  try {
    const u = new URL(url)
    return u.pathname + u.search
  } catch {
    return String(url)
  }
}
const signature = (cls) => {
  const item = String(cls ?? '').match(/\bitem(?:id)?-(\d+)\b/)
  const view = String(cls ?? '').match(/\bview-([a-z]+)\b/)
  return item && view ? `${item[1]}|${view[1]}` : null
}

/** For a page the map does not declare: does it at least render an entity the contract knows? */
export function guessEntity(contract, page) {
  const h1 = page.items.find((i) => i.kind === 'text' && (i.tag === 'h1' || i.h1) && i.status === 'matched')
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
  viewports,
  webroot = null
}) {
  mkdirSync(join(outDir, 'shots'), { recursive: true })
  const match = createMatcher(contract, siteUrl)
  const classify = createClassifier(contract, dbIndex, sourceIndex)
  const plan = new PagePlan(siteUrl, contract, cap)
  // The stand's own accounts (absent from the release database) are never crawled nor reported.
  const stand = standUserFilter({ users: dbIndex?.users ?? null })
  // Articles that ask for a template layout, and the root classes that prove it rendered (article-layout.mjs).
  const layoutPlan =
    contract.platform === 'joomla' && webroot && dbIndex?.layoutAsks?.length
      ? planLayoutCheck({ articles: dbIndex.layoutAsks, webroot, template: contract.template })
      : null
  const layoutProbes = new Map()
  const browser = await chromium.launch()
  const ctx = {}
  for (const vp of viewports) ctx[vp] = await openContext(browser, vp, { siteUrl })
  const pages = []
  const failures = []
  const seedSigs = new Map()
  const duplicates = []
  // The header for the site map: the home page's (desktop, the first viewport), else the first page that has one.
  let header = null
  let headerFromHome = false
  const homeUrl = new URL('./', siteUrl).href
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
      if (plan.leftSite(job, first.finalUrl)) {
        log('offsite', job.url, '->', first.finalUrl)
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
        first.data.items
          .filter((i) => i.kind === 'link' && i.source === 'a' && !stand.isStandLink(i.value))
          .map((i) => i.value),
        first.finalUrl
      )
      const results = { [viewports[0]]: first }
      for (const vp of viewports.slice(1)) results[vp] = await renderPage(ctx[vp], first.finalUrl)
      {
        const vps = Object.keys(results).filter((vp) => results[vp]?.data?.items)
        const kept = stand.dropItems(vps.map((vp) => results[vp].data.items))
        vps.forEach((vp, i) => {
          results[vp].data.items = kept[i]
        })
      }
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
        classify,
        { url: first.finalUrl }
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
      const isHome = job.url === homeUrl || job.mapPage?.home === true
      if (first.data.header?.found && (!header || (isHome && !headerFromHome))) {
        header = { ...first.data.header, measuredOn: pathOfUrl(first.finalUrl), viewport: viewports[0] }
        headerFromHome = isHome
      }
      if (layoutPlan)
        layoutProbes.set(page.url, { bodyClass: first.data.bodyClass, served: layoutPlan.probe(first.html) })
      pages.push(page)
      const c = count(items)
      log(
        `#${n} ${page.mapPages.length ? 'map ' : 'CRAWL'} ${first.finalUrl}  text ${c.text.matched}/${c.text.total}  img ${c.images.matched}/${c.images.total}${page.hygiene.length ? `  hygiene ${page.hygiene.length}` : ''}`
      )
    }
  } finally {
    await browser.close()
  }
  // Every link the pages render, asked as the browser follows it: a dead one fails the measure (link-check.mjs).
  {
    const links = renderedLinksOf(pages, siteUrl, { isStandLink: stand.isStandLink })
    const dead = await deadLinksOf(links, (href) => fetchStatus(href))
    for (const d of dead) log('dead link', d.status, d.url)
    failures.push(...dead.map((d) => ({ ...d, origin: 'link' })))
    log(`links checked ${links.size}, dead ${dead.length}`)
  }
  // Pages reached twice keep every map entry on the first record; refresh them now.
  for (const p of pages) {
    const rec = [...plan.byFinal.values()].find((r) => r.url === p.url)
    if (rec) p.mapPages = rec.mapPages.map((m) => ({ entity: m.entity, route: m.route }))
    p.unmapped = p.mapPages.length === 0
    if (p.unmapped) p.rendersEntity = guessEntity(contract, p)
    p.counts = count(p.items)
  }
  // An article's page that does not show the layout the article asks for fails the measure, like a dead link.
  let articleLayouts = null
  if (layoutPlan) {
    const r = layoutFindingsOf({
      plan: layoutPlan,
      mapPages: contract.pages,
      pages: pages.map((p) => ({ url: p.url, mapPages: p.mapPages, ...layoutProbes.get(p.url) }))
    })
    for (const m of r.mismatches) log('layout not served', m.asked, m.url)
    failures.push(...r.mismatches.map((m) => ({ url: m.url, origin: 'layout', error: m.error })))
    articleLayouts = { checked: r.checked, mismatched: r.mismatches.length, cannotCheck: r.cannotCheck }
    log(
      `article layouts checked ${r.checked}, not served ${r.mismatches.length}, cannot check ${r.cannotCheck.length}`
    )
  }
  return {
    articleLayouts,
    pages,
    failures,
    duplicates,
    skipped: plan.skipped,
    offsite: plan.offsite,
    capReached: plan.capReached,
    header,
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
      ['a', 'b', 'c', 'd', 'e'].map((k) => [
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
