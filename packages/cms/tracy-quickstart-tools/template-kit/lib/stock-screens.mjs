// `site.stockScreens` of a kit: the template's stock screens every plan drops. Some quickstarts carry screens no customer's content
// fills (a list of demo writers whose accounts and profiles are no contract content, a typography sample). Whether a model plan
// drops them is not guaranteed, so a person names them when packaging (`cli.mjs stock-screens`), after reading where a visitor
// reaches them; the site planner then drops each one after the model, its checker refuses a plan that keeps one, and the write
// step drops it like any page the plan drops: its menu item is unpublished unless a kept page needs its path, and a link to it in
// `site.hiddenPageLinks` containers is made plain text (apps/tracy-web/src/lib/stock-screens.js reads it with the same rules).
// A path is exact, or ends in `/*` for every page beneath it; it may name a page left out of the kit (`excludedPages`). A template
// with none declares an empty list with its reason (`--none --why`, `site.noneWhy`, none-why.mjs).
//
//   "stockScreens": [{ "path": "/pages/writers", "why": "<why no customer content fills it>" }]

import { clearNone, declareNone } from './none-why.mjs'

export const MAX_STOCK_SCREENS = 20

// A page address, optionally ending in `/*`; never the front page.
const STOCK_PATH = /^(?:\/[\w\-.~%]+)+(?:\/\*)?$/

/**
 * Adds one stock screen to a kit (once), or sets an empty list with `none` and its reason `why`. Changes the kit in place.
 * @param {object} kit
 * @param {{ path?: string, why?: string, none?: boolean }} order
 * @returns {{ error: string | null, changed: boolean }}
 */
export function declareStockScreen(kit, { path, why, none = false }) {
  if (!kit?.site || typeof kit.site !== 'object') return { error: 'the kit has no site part', changed: false }
  if (none) return declareNone(kit, 'stockScreens', why)
  const at = typeof path === 'string' ? path.trim() : ''
  if (!STOCK_PATH.test(at))
    return {
      error:
        'a stock screen is one page address such as /pages/writers, or one ending in /* for every page beneath it, never the front page',
      changed: false
    }
  if (typeof why !== 'string' || !why.trim())
    return { error: 'say why no customer content fills it (--why)', changed: false }
  const list = Array.isArray(kit.site.stockScreens) ? kit.site.stockScreens : []
  const index = list.findIndex((e) => e?.path === at)
  if (index === -1 && list.length >= MAX_STOCK_SCREENS)
    return { error: `a kit names at most ${MAX_STOCK_SCREENS} stock screens`, changed: false }
  const entry = { path: at, why: why.trim() }
  if (index !== -1 && list[index].why === entry.why) return { error: null, changed: false }
  if (index === -1) list.push(entry)
  else list[index] = entry
  kit.site.stockScreens = list
  clearNone(kit, 'stockScreens')
  return { error: null, changed: true }
}
