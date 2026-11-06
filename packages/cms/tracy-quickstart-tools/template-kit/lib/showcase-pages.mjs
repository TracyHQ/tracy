// Template showcase pages: pages a quickstart carries only to show the template off (a typography sample, a
// picture of the offline or error page, a search results page). They are judged from structure, never from a list
// of names, and left out of the kit (`excludedPages`), so a planner never has to decide on them. The real error
// page stays in `site.systemPages.notFound`. What a CMS view means lives in its adapter (`showcaseViewOf`).

const parentOf = (path) => String(path).split('?')[0].split('/').slice(0, -1).join('/') || '/'

/**
 * @param {{pages: {path: string, kind: string, owner?: string|null, inMainMenu?: boolean|null}[], map: object,
 *   linksOf: (path: string) => object[]|null, viewOf: (kind: string) => string|null}} o
 *   `linksOf`: the links of a page's own body (null when not read)
 * @returns {Map<string, string>} path -> why it is a showcase page
 */
export function judgeShowcase({ pages, map, linksOf, viewOf }) {
  const demoOnly = new Set((map.entities ?? []).filter((e) => e.demoOnly === true).map((e) => e.key))
  const judged = new Map()
  for (const p of pages) {
    if (p.path.includes('?')) continue
    if (p.owner && demoOnly.has(p.owner))
      judged.set(p.path, 'its content is marked demo-only in the content map')
    else {
      const why = viewOf?.(p.kind)
      if (why) judged.set(p.path, why)
    }
  }
  // A menu section of showcase pages (two or more of its pages judged above) also holds articles that only show
  // the template (a picture of the offline page): an article with its own menu item there and no link of its own.
  const shown = new Map()
  for (const path of judged.keys()) shown.set(parentOf(path), (shown.get(parentOf(path)) ?? 0) + 1)
  for (const p of pages) {
    if (judged.has(p.path) || p.path.includes('?') || !String(p.kind).startsWith('article') || !p.inMainMenu)
      continue
    const links = linksOf(p.path)
    if ((shown.get(parentOf(p.path)) ?? 0) >= 2 && Array.isArray(links) && links.length === 0)
      judged.set(p.path, 'an article with no link of its own in a menu section of showcase pages')
  }
  return judged
}

/**
 * Self-check: every page judged a showcase page is out of the kit's pages and named in `excludedPages`. Returns
 * how many are not.
 */
export function showcaseChecks({ judged, pages, excludedPages = [], errors }) {
  const kept = new Set(pages.map((p) => p.path))
  const named = new Set(excludedPages.flatMap((e) => e.paths ?? []))
  let wrong = 0
  for (const [path, why] of judged) {
    if (!kept.has(path) && named.has(path)) continue
    wrong++
    errors.push({
      kind: 'showcase-page-kept',
      field: 'excludedPages',
      reason: `${path} is a template showcase page (${why}) but is ${kept.has(path) ? 'still in the kit' : 'not named in excludedPages'}`
    })
  }
  return wrong
}
