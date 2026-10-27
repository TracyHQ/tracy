// joomla-design-merge.mjs — one design for a style whose routes are served different stylesheet lists
// (issue #67). T3 compiles module CSS per page, so the pages of one template style are not all served
// the same `t3-assets/css/*` sheets. Each distinct list is a cascade of its own (resolved by from-joomla's
// styleDesign); a value is the style's only when every list gives it, the same, at every variant. A list
// that has no design (a sheet not read, an import not followed) means nothing is established across the
// style's routes: no value is published, and the gap names the routes.

const SHOWN_ROUTES = 3
const labelOf = (routes) => `routes ${routes.slice(0, SHOWN_ROUTES).join(', ')}${routes.length > SHOWN_ROUTES ? ` and ${routes.length - SHOWN_ROUTES} more` : ''}`

/**
 * Group the served pages of a style by the template and compiled sheets they are recorded as served
 * (`servedList(hrefs, tplName, origin, basePath)` — the reading linkedSheets compares): `[{ label, key,
 * routes, served }]`, or null when no page has a record. A page with no record is added to every group's
 * `served` (its sheets are not known; the group's plan reports it), never to a group of its own.
 */
export function routeGroups(served, { tplName, origin, basePath, servedList }) {
  const pages = served ?? []
  const recorded = pages.filter((p) => p.hrefs)
  if (!recorded.length) return null
  const unrecorded = pages.filter((p) => !p.hrefs)
  const groups = new Map()
  for (const p of recorded) {
    const r = servedList(p.hrefs, tplName, origin, basePath)
    const key = r.error ? `error ${r.error}` : JSON.stringify(r.ordered)
    const g = groups.get(key) ?? { key, pages: [] }
    g.pages.push(p)
    groups.set(key, g)
  }
  return [...groups.values()].map((g) => {
    const routes = g.pages.map((p) => p.route ?? p.page)
    return { key: g.key, routes, label: labelOf(routes), served: [...g.pages, ...unrecorded] }
  })
}

/**
 * The design every group agrees on. `runs`: `[{ label, design: { rules, tokens, gaps, unresolvedTokens },
 * unplaced }]`; `variants` and `roles` as from-joomla's DESIGN_VARIANTS and DESIGN_ROLES. Returns the same
 * shape as one design.
 */
export function mergeDesigns(runs, { variants, roles }) {
  const gaps = []
  const empty = () => ({ rules: [], tokens: Object.fromEntries(variants.map((v) => [v.id, {}])), gaps, unresolvedTokens: [...new Set(runs.flatMap((r) => r.design.unresolvedTokens))].sort() })
  const open = runs.filter((r) => r.unplaced || (!r.design.rules.length && !Object.values(r.design.tokens).some((t) => Object.keys(t).length)))
  if (open.length) {
    gaps.push(`no design value is established across the style's routes: ${open.map((r) => r.label).join('; ')} resolve no value (their sheets are not fully read), and the other routes' values cannot stand for them`)
    return empty()
  }
  const rules = []
  for (const role of roles) {
    const found = runs.map((r) => r.design.rules.find((x) => x.role === role.role))
    if (found.every((x) => !x)) {
      gaps.push(`${role.role} (${role.category}): no declaration resolves in any route group`)
      continue
    }
    if (found.some((x) => !x)) {
      gaps.push(`${role.role} (${role.category}): resolved for ${runs.filter((_, i) => found[i]).map((r) => r.label).join('; ')} but not for ${runs.filter((_, i) => !found[i]).map((r) => r.label).join('; ')}; not published`)
      continue
    }
    const selectors = [...new Set(found.map((x) => x.selector))]
    if (selectors.length > 1) {
      gaps.push(`${role.role} (${role.category}): the route groups resolve it on different selectors (${selectors.join(', ')}); not published`)
      continue
    }
    const props = Object.keys(found[0].styles[variants[0].id] ?? {})
    const agreed = []
    for (const p of props) {
      const same = variants.every((v) => found.every((x) => x.styles[v.id]?.[p] !== undefined && x.styles[v.id][p] === found[0].styles[v.id][p]))
      if (same) agreed.push(p)
      else gaps.push(`${selectors[0]} ${p}: the route groups resolve different values or some do not resolve it; left out`)
    }
    if (!agreed.length) continue
    rules.push({
      role: role.role,
      category: role.category,
      selector: selectors[0],
      styles: Object.fromEntries(variants.map((v) => [v.id, Object.fromEntries(agreed.map((p) => [p, found[0].styles[v.id][p]]))])),
      from: [...new Set(found.flatMap((x) => x.from))].sort()
    })
  }
  const tokens = {}
  const differ = new Set()
  for (const v of variants) {
    const [first, ...rest] = runs.map((r) => r.design.tokens[v.id] ?? {})
    const names = new Set(runs.flatMap((r) => Object.keys(r.design.tokens[v.id] ?? {})))
    tokens[v.id] = {}
    for (const n of names) {
      if (first[n] !== undefined && rest.every((t) => t[n] === first[n])) tokens[v.id][n] = first[n]
      else differ.add(n)
    }
  }
  if (differ.size) gaps.push(`${differ.size} token(s) are not the same in every route group (or not resolved in one): ${[...differ].sort().slice(0, 12).join(', ')}${differ.size > 12 ? ', …' : ''}; left out`)
  return { rules, tokens, gaps, unresolvedTokens: [...new Set(runs.flatMap((r) => r.design.unresolvedTokens))].sort() }
}
