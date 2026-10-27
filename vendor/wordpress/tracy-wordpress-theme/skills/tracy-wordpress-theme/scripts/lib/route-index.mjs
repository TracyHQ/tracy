// route-index.mjs — the ONE index of a page group's routes. A page answers to its page-map path (`/team`) and to its seeded
// path (`/our-team/`); contract selection, the route plan and the verdict all resolve through this index, so a route that two
// pages answer to is refused by name in every tool instead of being settled by whichever lookup came first.

export const bareRoute = (x) => (String(x).length > 1 ? String(x).replace(/\/+$/, '') : String(x))

/**
 * A route's identity: the path without its trailing slash, plus its query. The query is part of the identity because the
 * search view is measured at `/?s=<term>` — dropping it would put the search page and the home page on one route.
 */
export const routeKey = (x) => {
  const [route, ...query] = String(x).split('?')
  const q = query.join('?')
  // parameter order is not identity: `/?s=a&b=1` and `/?b=1&s=a` are one route
  return bareRoute(route) + (query.length ? `?${q.split('&').filter(Boolean).sort().join('&')}` : '')
}

/** The forms (route keys) one contract page answers to. */
export const routeForms = (p) => [...new Set([p?.path, p?.pagemapPath].filter((x) => typeof x === 'string' && x).map(routeKey))]

const paramsOf = (query) => String(query).split('&').filter(Boolean).map((x) => { const i = x.indexOf('='); return i < 0 ? [x, ''] : [x.slice(0, i), x.slice(i + 1)] })
const canon = (route, params) => `${route}?${params.map(([k, v]) => `${k}=${v}`).sort().join('&')}`

/** Index over contract pages ({ id, path, pagemapPath }): form → page. Throws when two pages claim one form or one id. */
export function routeIndex(pages) {
  const byForm = new Map()
  const ids = new Set()
  for (const p of pages ?? []) {
    if (ids.has(p.id)) throw new Error(`route index is ambiguous: two pages carry the id ${p.id}`)
    ids.add(p.id)
    for (const f of routeForms(p)) {
      const other = byForm.get(f)
      if (other && other !== p) throw new Error(`route index is ambiguous: pages ${other.id} and ${p.id} both answer to ${f}`)
      byForm.set(f, p)
    }
  }
  // the query parameters that tell the indexed pages of one path apart, and the pages by path + those parameters
  const identityKeys = new Map()
  const byCanon = new Map()
  for (const [f, page] of byForm) {
    const [route, query] = f.split('?')
    if (query === undefined) continue
    const params = paramsOf(query)
    identityKeys.set(route, new Set([...(identityKeys.get(route) ?? []), ...params.map(([k]) => k)]))
    byCanon.set(canon(route, params), page)
  }
  return {
    byForm,
    /**
     * The page asked for by either form, or null when none answers to it. Only the query parameters that tell indexed pages
     * of one path apart (`s` of `/?s=steel`) take part: `/about?utm=1` is `/about`, `/?utm_source=x` is the home page,
     * `/?s=other` is neither the home page nor the search page.
     */
    resolve: (asked) => {
      const key = routeKey(asked)
      if (byForm.has(key)) return byForm.get(key)
      const [route, query] = key.split('?')
      if (query === undefined) return null
      const keys = identityKeys.get(route)
      const mine = keys ? paramsOf(query).filter(([k]) => keys.has(k)) : []
      if (!mine.length) return byForm.get(route) ?? null
      return byCanon.get(canon(route, mine)) ?? null
    }
  }
}

/** Effective reference.kind per WordPress path: the page's own kind over the pack's (spec-pack.md §3). Duplicate page-map paths are refused. */
export function effectiveKinds(pageMap, reference) {
  const byFile = new Map((reference.pages ?? []).map((p) => [p.page, p]))
  const out = new Map()
  for (const p of pageMap.pages ?? []) {
    if (out.has(p.path)) throw new Error(`page-map is ambiguous: two entries carry the path ${p.path}`)
    out.set(p.path, byFile.get(p.file)?.kind ?? reference.kind ?? null)
  }
  return out
}
