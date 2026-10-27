// One verdict per demo page and viewport: every page assertion of `assertions.mjs` over what `page-probe.mjs` read,
// against the profile's facts and the template's baseline. `judgePage` is pure; `judgeSite` walks the site in the
// watched browser (desktop and mobile, a reload of each page, a screenshot of each) and collects the checks.

import {
  bannedFillers,
  brokenImages,
  ctaProblems,
  layoutAgainst,
  orphanCurrency,
  pricesIn,
  restaurantWords,
  templateLeftovers,
  unsourcedPrices,
  zeroedStats
} from './assertions.mjs'
import { observe } from './page-probe.mjs'

/** The baseline page a URL path stands for: its route, or the home names a template uses for `/`. */
export function baselinePageOf(baseline, path) {
  const route = String(path).replace(/^\/+|\/+$/g, '')
  if (route && baseline.pages[route]) return { key: route, page: baseline.pages[route] }
  if (!route)
    for (const key of ['home', 'homepage', 'onepage', 'resources/home-variation'])
      if (baseline.pages[key]) return { key, page: baseline.pages[key] }
  return null
}

/**
 * @param {any} obs - one `observe()` result
 * @param {{ facts: ReturnType<typeof import('./profile-facts.mjs').profileFacts>,
 *   baseline: ReturnType<typeof import('./baseline.mjs').templateBaseline> | null,
 *   path: string }} ctx
 * @returns {{ name: string, pass: boolean, detail: any }[]}
 */
export function judgePage(obs, { facts, baseline, path }) {
  const checks = []
  const add = (name, problems, extra = {}) =>
    checks.push({ name, pass: problems.length === 0, detail: { problems: problems.slice(0, 12), ...extra } })
  add('no-banned-filler', bannedFillers(obs.text))
  add('no-restaurant-words', restaurantWords(obs.text, facts.trade), { trade: facts.trade })
  add('no-unsourced-price', unsourcedPrices(obs.text, facts))
  add('no-orphan-currency', orphanCurrency(obs.text))
  add('dash-not-zero', zeroedStats(obs.stats, facts))
  add('cta-real', ctaProblems(obs.ctas, facts))
  add('images-not-broken', brokenImages(obs.images))
  add('no-template-fact-left', baseline ? templateLeftovers(obs.text, baseline.factSamples, facts) : [])
  add('no-horizontal-scroll', obs.overflowX ? ['page is wider than the viewport'] : [])
  const target = baseline ? baselinePageOf(baseline, path) : null
  if (target)
    add('layout-kept', layoutAgainst(target.page, obs), {
      baselinePage: target.key,
      want: target.page.sections.length,
      got: obs.sections.length
    })
  else checks.push({ name: 'layout-kept', pass: true, detail: { skipped: 'no baseline page for this path' } })
  return checks
}

/**
 * Walk a demo: each path in both viewports, a reload, a screenshot, every check.
 * @param {Awaited<ReturnType<typeof import('../watched-browser.mjs').watchedRole>>} role
 * @param {{ origin: string, paths: string[], facts: any, baseline: any, runDir: string, tag: string }} demo
 */
export async function judgeSite(role, { origin, paths, facts, baseline, runDir, tag }) {
  const pages = []
  for (const path of paths)
    for (const vp of /** @type {const} */ (['desktop', 'mobile'])) {
      const url = `${origin}${path}`
      const first = await observe(role, url, vp)
      // E13: a reload shows the same page (no first-paint-only content, no client fill that disappears).
      const again = await observe(role, url, vp)
      const checks = judgePage(again, { facts, baseline, path })
      checks.push({
        name: 'reload-stable',
        pass: first.sections.length === again.sections.length && first.images.length === again.images.length,
        detail: {
          sections: [first.sections.length, again.sections.length],
          images: [first.images.length, again.images.length]
        }
      })
      const shot = await role.shot(runDir, `${tag}-${path.replace(/[^a-z0-9]+/gi, '_') || 'home'}-${vp}`)
      pages.push({
        url,
        viewport: vp,
        shot,
        sections: again.sections.length,
        fills: again.fills,
        prices: pricesIn(again.text).slice(0, 40),
        links: again.links,
        checks
      })
    }
  const failed = pages.flatMap((p) =>
    p.checks.filter((c) => !c.pass).map((c) => `${p.viewport} ${p.url}: ${c.name}`)
  )
  return { pages, failed }
}
