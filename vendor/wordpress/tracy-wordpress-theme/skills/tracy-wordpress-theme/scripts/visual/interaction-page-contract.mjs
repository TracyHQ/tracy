// The constants of interaction-parity.mjs that readers of its evidence share (no browser code here).
export const INTERACTION_TOOL = 'interaction-parity/7'
/** Header and control geometry may differ by this many CSS px (an exact 2.0 passes). */
export const GEOMETRY_PX = 2
export const MIN_TARGET_PX = 24
export const MIN_CONTRAST = 4.5
export const DRAWER_WIDTH = 390
export const TABLET_WIDTHS = Object.freeze([1024, 1180])
/** Every responsive tier the header and its buttons are compared at (visibility, label lines, geometry). */
export const HEADER_WIDTHS = Object.freeze([390, 768, 992, 1024, 1180, 1280, 1440])
/** The widths the drawer is opened at: a phone and a tablet, each in light and in dark. */
export const DRAWER_WIDTHS = Object.freeze([390, 768])
export const DRAWER_THEMES = Object.freeze(['light', 'dark'])
export const DESKTOP_WIDTH = 1440
export const DRAWER_DEPTH = 3
export const INTERACTION_KINDS = Object.freeze([
  'drawer-missing',
  'drawer-overlap',
  'drawer-model',
  'drawer-submenu-missing',
  'drawer-submenu-not-opened',
  'drawer-submenu-children-missing',
  'drawer-labels-differ',
  'menu-contrast',
  'touch-not-opened',
  'touch-target-small',
  'touch-target-obstructed',
  'toggle-missing',
  'toggle-first-click',
  'carousel-missing',
  'carousel-controls-missing',
  'carousel-unreachable',
  'header-height',
  'header-control-position',
  'header-control-missing',
  'header-control-extra',
  'nav-current-missing',
  'nav-current-wrong',
  'nav-current-extra',
  'drawer-back-inert',
  'drawer-back-duplicate',
  'responsive-visibility',
  'label-wrap',
  'form-missing',
  'form-extra-required',
  'form-missing-required',
  'form-control-missing',
  'form-submit-blocked',
  'form-disabled-indistinct',
  'interaction-not-measured'
])
export const CHECKS = Object.freeze(['drawer', 'contrast', 'touch', 'toggle', 'carousel', 'header', 'form'])
/** A coverage case records whether its source comparison was measured or is typed N/A. */
export const COVERAGE_STATUSES = Object.freeze(['measured', 'not-applicable'])

/** One measured case: a check on a route at a width and in a theme. The key a record lists and a validator owes. */

/** The checks that read the shared header: the probe reads them on the chrome pages (the first page of a run), not on every route. */
export const CHROME_CHECKS = Object.freeze(['drawer', 'contrast', 'touch', 'toggle'])
/** The tiers the probe is configured with: what a record says it ran with, and what a consumer holds it to. */
export const TIERS = Object.freeze({ drawerWidths: DRAWER_WIDTHS, drawerThemes: DRAWER_THEMES, tabletWidths: TABLET_WIDTHS, headerWidths: HEADER_WIDTHS, desktopWidth: DESKTOP_WIDTH })

/** The key of one case: a check on a route at a width and in a theme (null where the check has none). */
export const caseKey = (c) => `${c.check}|${c.route}|${c.width ?? ''}|${c.theme ?? ''}`

/**
 * Every case a run owes: the check × route × width × theme grid the probe walks. Chrome checks are owed on `chromePages`
 * (default: every page), the others on every page. One definition for the producer (which records each case) and the
 * validators (which hold a record to it).
 */
export function owedCases({ pages, chromePages = null, checks = CHECKS, headerWidths = HEADER_WIDTHS }) {
  const out = []
  for (const route of pages) {
    const chrome = !chromePages || chromePages.includes(route)
    const add = (check, width, theme = null) => out.push({ check, route, width, theme })
    if (checks.includes('drawer') && chrome) for (const w of DRAWER_WIDTHS) for (const t of DRAWER_THEMES) add('drawer', w, t)
    if (checks.includes('contrast') && chrome) {
      for (const w of DRAWER_WIDTHS) add('contrast', w, 'dark')
      add('contrast', DESKTOP_WIDTH, 'dark')
    }
    if (checks.includes('touch') && chrome) for (const w of TABLET_WIDTHS) add('touch', w)
    if (checks.includes('toggle') && chrome) add('toggle', DESKTOP_WIDTH)
    if (checks.includes('carousel')) add('carousel', DESKTOP_WIDTH)
    if (checks.includes('form')) add('form', DESKTOP_WIDTH)
    if (checks.includes('header')) for (const w of headerWidths) add('header', w)
  }
  return out
}
