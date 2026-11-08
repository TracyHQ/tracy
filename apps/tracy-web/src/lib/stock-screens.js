// Shared by the site planner's normaliser and checker, the write step and the site check: the template's stock screens that every
// plan drops (`site.stockScreens`). Some quickstarts carry screens no customer's content fills: a list of demo writers whose
// accounts and profiles are no contract content, a typography sample. Whether a model plan drops them is not guaranteed, so a kit
// names them, a person declares them when packaging (`cli.mjs stock-screens`), and then:
// - the planner's answer is normalised so each such kit page is dropped (`withStockScreensDropped`), and the checker's R10a refuses
//   a plan that keeps one;
// - the write step treats each like a page the plan drops: its menu item is unpublished unless a kept page needs its path
//   (write-step/hide-plan.js `pageDependingOn`), and a link to it in the kit's `site.hiddenPageLinks` containers is made plain text;
// - the site check counts it among the hidden pages.
// A path is exact, or ends in `/*` for every page beneath it. A path that is no kit page (a showcase page left out of the kit,
// `excludedPages`) still names a hidden page by its address, as `stock-screen:<path>`. A kit without the field changes nothing.
//
//   "stockScreens": [{ "path": "/pages/writers", "why": "<why no customer content fills it>" }]

/** The id of a stock screen that is no kit page, as the write report's line names it. */
export const STOCK_SCREEN_ID = 'stock-screen:'

export const MAX_STOCK_SCREENS = 20

// A page address, optionally ending in `/*`; never the front page.
const STOCK_PATH = /^(?:\/[\w\-.~%]+)+(?:\/\*)?$/

const each = (value) => (Array.isArray(value) ? value : [])
const isNonBlank = (value) => typeof value === 'string' && value.trim() !== ''
const pathOf = (value) => {
  const path = String(value ?? '')
    .split('?')[0]
    .replace(/\/+$/, '')
  return path === '' ? '/' : path
}

/** Why a stock screen path cannot be declared, or null when it can. */
export function stockScreenPathProblem(path) {
  if (typeof path !== 'string' || !STOCK_PATH.test(path.trim()))
    return 'a stock screen is one page address such as /pages/writers, or one ending in /* for every page beneath it, never the front page'
  return null
}

/**
 * The kit's stock screens, and what keeps an entry out.
 * @param {any} kit
 * @returns {{ screens: { path: string, why: string }[], problems: string[] }}
 */
export function stockScreensOf(kit) {
  const screens = []
  const problems = []
  for (const entry of each(kit?.site?.stockScreens)) {
    const path = typeof entry?.path === 'string' ? entry.path.trim() : null
    const problem = stockScreenPathProblem(path)
    if (problem) problems.push(`the kit's stock screen ${JSON.stringify(entry?.path ?? null)}: ${problem}`)
    else if (!isNonBlank(entry?.why)) problems.push(`the kit's stock screen ${path} says no reason (why)`)
    else if (!screens.some((s) => s.path === path)) screens.push({ path, why: entry.why.trim() })
  }
  if (screens.length > MAX_STOCK_SCREENS) {
    problems.push(`the kit names ${screens.length} stock screens, over ${MAX_STOCK_SCREENS}`)
    return { screens: [], problems }
  }
  return { screens, problems }
}

/** The stock screen a page address is (a later page of a list, `?start=6`, is its list's), or null. */
export function stockScreenOf(path, screens) {
  const at = pathOf(path)
  return (
    each(screens).find((s) => (s.path.endsWith('/*') ? at.startsWith(s.path.slice(0, -1)) : at === s.path)) ??
    null
  )
}

/**
 * Every stock screen as a page the write step drops: each kit page a screen names, then each exact path no kit page holds.
 * @param {any} kit
 * @returns {{ id: string, path: string, why: string, inKit: boolean }[]}
 */
export function stockScreenPagesOf(kit) {
  const { screens } = stockScreensOf(kit)
  if (!screens.length) return []
  const out = []
  for (const page of each(kit?.pages)) {
    if (typeof page?.id !== 'string' || typeof page?.path !== 'string') continue
    const screen = stockScreenOf(page.path, screens)
    if (screen) out.push({ id: page.id, path: page.path, why: screen.why, inKit: true })
  }
  for (const screen of screens) {
    if (screen.path.endsWith('/*') || out.some((p) => p.path === screen.path)) continue
    out.push({ id: `${STOCK_SCREEN_ID}${screen.path}`, path: screen.path, why: screen.why, inKit: false })
  }
  return out
}

/**
 * The stock screens a plan does not keep, as pages `{ id, path }`: what the write step drops besides the plan's own drops. A
 * screen the plan keeps stays the plan's (the checker refuses such a plan before it gets here).
 */
export function stockScreensToDrop(kit, plan) {
  const kept = new Set(
    each(plan?.pages)
      .filter((p) => p?.decision === 'keep')
      .map((p) => p.id)
  )
  return stockScreenPagesOf(kit).filter((p) => !kept.has(p.id))
}

/** The words a forced drop gives as its reason. */
export const stockScreenWhy = (why) => `stock screen of the template, which every plan drops: ${why}`

/**
 * The plan with every stock screen of a kept page group dropped: a kept one becomes `{ id, decision: "drop", why }` (what a dropped
 * page carries), and one the plan leaves out is added so. A page of a dropped or undecided group stays out of `pages`, as the plan
 * shape wants. The same plan when nothing changes, so a kit without the field gives the plan back as it was.
 * @param {any} plan
 * @param {any} kit
 * @returns {any}
 */
export function withStockScreensDropped(plan, kit) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.pages)) return plan
  const stock = stockScreenPagesOf(kit).filter((p) => p.inKit)
  if (!stock.length) return plan
  const byId = new Map(stock.map((p) => [p.id, p]))
  const groupOf = new Map(each(kit?.pages).map((p) => [p?.id, p?.group]))
  const keptGroups = new Set(
    each(plan.pageGroups)
      .filter((g) => g?.decision === 'keep')
      .map((g) => g.id)
  )
  let changed = false
  const pages = plan.pages.map((p) => {
    const screen = byId.get(p?.id)
    if (!screen || p.decision === 'drop') return p
    changed = true
    return { id: p.id, decision: 'drop', why: stockScreenWhy(screen.why) }
  })
  const listed = new Set(pages.map((p) => p?.id))
  for (const screen of stock) {
    if (listed.has(screen.id) || !keptGroups.has(groupOf.get(screen.id))) continue
    pages.push({ id: screen.id, decision: 'drop', why: stockScreenWhy(screen.why) })
    changed = true
  }
  return changed ? { ...plan, pages } : plan
}
