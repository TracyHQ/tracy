/**
 * The menu checks of the Template Customization Question Readiness built-site check (final decisions of 12/10/2026):
 * - `menuLinks`: every link of a page's menus (header or any `nav`) and footer, with where it sits;
 * - `agreedLabel`: true when the menu and the footer both link a path, all by one label (a label the
 *   site uses consistently for that page is accepted as a NOTE by `label-targets-consistent`);
 * - `categoryTitle`: the category a category listing page shows (WordPress `/category/<slug>/` or
 *   body class `category`, Joomla `view-category`, any `/category/` route), or null for another page;
 *   `menu-category-names` (ABOUT-2) compares a menu label with it.
 */
import { pathOf } from './links.mjs'

const text = (/** @type {any} */ el) =>
  String(el?.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim()
const FOOTER = 'footer, [class*=footer], [id*=footer]'
const MENU = 'header, nav, [role=navigation], .t4-megamenu, .wp-block-navigation, .menu'
const NOT_MENU = '.breadcrumb, [aria-label*=readcrumb], [class*=pagination], .page-numbers, .pagenavigation'

/**
 * The links of a page's menus and footer, as paths on the page's origin.
 * @returns {{ path: string, label: string, where: 'menu' | 'footer' }[]}
 */
export function menuLinks(/** @type {any} */ doc, /** @type {string} */ origin) {
  const out = []
  for (const a of doc.querySelectorAll('a')) {
    if (a.closest(NOT_MENU)) continue
    const where = a.closest(FOOTER) ? 'footer' : a.closest(MENU) ? 'menu' : null
    const path = pathOf(a.getAttribute('href') ?? '', origin)
    const label = text(a) || String(a.getAttribute('aria-label') ?? '')
    if (where && path && label) out.push({ path, label, where: /** @type {'menu' | 'footer'} */ (where) })
  }
  return out
}

/** True when the page's menu and footer both link `path`, and every one of those links reads `label`. */
export function agreedLabel(
  /** @type {ReturnType<typeof menuLinks>} */ links,
  /** @type {string} */ path,
  /** @type {string} */ label
) {
  const to = links.filter((l) => l.path === path)
  const same = (/** @type {string} */ s) => s.toLowerCase() === label.toLowerCase()
  return (
    to.some((l) => l.where === 'menu') &&
    to.some((l) => l.where === 'footer') &&
    to.every((l) => same(l.label))
  )
}

/** The category a category listing page shows, or null when the page is not one. */
export function categoryTitle(/** @type {any} */ doc, /** @type {string} */ path) {
  const body = String(doc.body?.getAttribute('class') ?? '')
  if (!/\bview-category\b|(^|\s)category(\s|$)/.test(body) && !/\/category\/[^/]+\/?$/.test(path)) return null
  const shown = text(
    doc.querySelector(
      '.subheading-category, .wp-block-query-title, .archive-title, .page-title, .category-title, main h1, h1'
    )
  )
  return shown || String(doc.querySelector('title')?.textContent ?? '').split(/\s[–—|-]\s/)[0] || null
}
