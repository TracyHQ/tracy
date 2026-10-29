import { mainMenuRole, mainMenuTargets, menuPath } from './main-menu.mjs'

// The footer's link columns (COO decision, spec TracyHQ/tracy#189 item 12): the header main menu may be shorter and may
// group pages; the footer is ALWAYS complete. Every kept public page, each offering page under an offerings index among
// them, is linked from a footer link column, so the footer has at least as many links as the header.
//
// A content map declares its footer link columns as navigation groups (`navigationGroups`, quickstart-contract skill):
//   { id, placement: "footer", holds: "offerings" | "company" | "pages", heading: <slot key> | null,
//     container: <entity> | null, menu: <native menu name> | null, links: [<slot key>...] }
// `holds` says which pages the column is for: offerings (the offerings index and each offering page), company (home,
// about, team, contact, booking and every other page), or pages (any page no other column takes).

export const NAVIGATION_PLACEMENTS = Object.freeze(['footer'])
export const NAVIGATION_HOLDS = Object.freeze(['offerings', 'company', 'pages'])

/** Page roles that index the business's offerings; their child pages are the offering pages. */
const OFFERING_INDEX_ROLES = new Set(['services', 'menu', 'offerings'])
/** Page roles that are offerings themselves. */
const OFFERING_ROLES = new Set([...OFFERING_INDEX_ROLES, 'offering-detail'])

/** Headings a template ships to name a column of links, never the business's words. */
const GENERIC_HEADINGS =
  /^(?:site ?map|links?|quick links|useful links|menu|navigation|pages|explore|information|info)$/i

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const fold = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** Whether a kept page indexes offerings (its role, refined like the main menu's). */
export const isOfferingIndex = (page) => OFFERING_INDEX_ROLES.has(mainMenuRole(page))

/** The column a page belongs in, by its role. */
export const footerColumnOf = (page) =>
  OFFERING_ROLES.has(page.role ?? mainMenuRole(page)) ? 'offerings' : 'company'

/** The footer link columns a content map declares, in declaration order. */
export function footerNavigationGroups(contentMap) {
  const groups = Array.isArray(contentMap?.navigationGroups) ? contentMap.navigationGroups : []
  return groups.filter((g) => object(g) && g.placement === 'footer' && NAVIGATION_HOLDS.includes(g.holds))
}

/** The demo words of the declared footer columns: each heading's and each link's shipped sample. */
export function footerDemoWords(contentMap) {
  const slots = new Map((contentMap?.slots ?? []).map((s) => [s.key, s]))
  const headings = new Set()
  const links = new Set()
  for (const group of footerNavigationGroups(contentMap)) {
    const heading = fold(slots.get(group.heading)?.sample)
    if (heading) headings.add(heading)
    for (const key of group.links ?? []) {
      const label = fold(slots.get(key)?.sample)
      if (label) links.add(label)
    }
  }
  return { headings, links }
}

/**
 * Structural check of a content map's navigation groups. `footerColumns`: the native link columns the capture found in
 * the footer (entity keys); every one must be declared by exactly one group.
 * @param {any} contentMap
 * @param {string[]} [footerColumns]
 * @returns {string[]}
 */
export function navigationGroupProblems(contentMap, footerColumns = []) {
  const errors = []
  const slots = new Map((contentMap?.slots ?? []).map((s) => [s.key, s]))
  const raw = contentMap?.navigationGroups
  if (raw !== undefined && !Array.isArray(raw)) return ['navigationGroups must be an array']
  const groups = raw ?? []
  const ids = new Set()
  const taken = new Map()
  for (const group of groups) {
    if (!object(group) || typeof group.id !== 'string' || !group.id) {
      errors.push('a navigation group has no id')
      continue
    }
    const named = `navigation group "${group.id}"`
    if (ids.has(group.id)) errors.push(`${named} is declared twice`)
    ids.add(group.id)
    if (!NAVIGATION_PLACEMENTS.includes(group.placement))
      errors.push(`${named} has unknown placement ${JSON.stringify(group.placement)}`)
    if (!NAVIGATION_HOLDS.includes(group.holds))
      errors.push(`${named} has unknown holds ${JSON.stringify(group.holds)}`)
    if (group.heading !== null && group.heading !== undefined && slots.get(group.heading)?.type !== 'text')
      errors.push(`${named} heading must name a text slot`)
    if (!Array.isArray(group.links)) errors.push(`${named} links must be an array of slot keys`)
    for (const key of group.links ?? []) {
      if (slots.get(key)?.role !== 'editorial.menu_label')
        errors.push(`${named} link "${key}" must name an editorial.menu_label slot`)
      if (taken.has(key)) errors.push(`${named} link "${key}" is already in "${taken.get(key)}"`)
      taken.set(key, group.id)
    }
    if (group.container !== undefined && group.container !== null && typeof group.container !== 'string')
      errors.push(`${named} container must be an entity key`)
  }
  const declared = new Set(groups.filter(object).map((g) => g.container))
  for (const column of footerColumns)
    if (!declared.has(column))
      errors.push(`footer link column "${column}" is not declared as a navigation group`)
  return errors
}

/**
 * Which kept pages each declared footer column lists. Every kept page lands in exactly one column: the first column
 * holding its kind, else the first `pages` column, else the first column. A column left with nothing is taken off.
 * @param {{sitePlan: any, groups: Array<{id: string, holds: string}>, items?: Array<{pageId?: string, path: string}>,
 *   offeringPages?: Array<{id: string, path: string, label?: string}>}} input
 *   `items`: native routes of kept pages; `offeringPages`: the published pages of each offering under an offerings index
 * @returns {{columns: Array<{id: string, holds: string, links: Array<{pageId: string, path: string | null, role: string,
 *   label?: string}>}>, off: string[], targets: any[]}}
 */
export function planFooterNavigation({ sitePlan, groups, items = [], offeringPages = [] }) {
  const targets = [
    ...mainMenuTargets(sitePlan, items).map((p) => ({ pageId: p.id, path: p.path, role: p.role })),
    ...offeringPages.map((o) => ({
      pageId: o.id,
      path: o.path,
      role: 'offering-detail',
      label: o.label,
      ...(o.planned ? { planned: true } : {})
    }))
  ]
  const columns = groups.map((g) => ({ id: g.id, holds: g.holds, links: [] }))
  if (!columns.length) return { columns, off: [], targets }
  for (const target of targets) {
    const kind = footerColumnOf(target)
    const column =
      columns.find((c) => c.holds === kind) ?? columns.find((c) => c.holds === 'pages') ?? columns[0]
    column.links.push(target)
  }
  return {
    columns: columns.filter((c) => c.links.length),
    off: columns.filter((c) => !c.links.length).map((c) => c.id),
    targets
  }
}

/** Why a column heading cannot stand: empty, too long, a demo heading or a generic one. */
export function invalidFooterHeading(value, { max = 40, demo = new Set() } = {}) {
  const heading = String(value ?? '').trim()
  if (!heading) return 'empty-heading'
  if ([...heading].length > max || /[<>\n\r]/.test(heading)) return 'invalid-heading'
  if (demo.has(fold(heading))) return 'demo-heading'
  if (GENERIC_HEADINGS.test(heading)) return 'generic-heading'
  return null
}

/** The offering pages an offerings index links to: its own child routes, one level below it. */
export function offeringPagesLinkedFrom(indexPath, hrefs) {
  const base = menuPath(indexPath)
  if (!base || base === '/') return []
  return [
    ...new Set(
      hrefs
        .map((href) => menuPath(href))
        .filter((p) => p.startsWith(`${base}/`) && !p.slice(base.length + 1).includes('/'))
    )
  ]
}
