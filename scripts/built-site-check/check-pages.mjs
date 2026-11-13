// Pages and menu items of the plan missing on the built site, and the reverse (ticket #601). The plan's pages are
// found by address: the alias the write gave each page's menu item (`menuItem.create` of the write result), else the
// alias the write makes from the page name (`slugOf`). A menu item is a link inside a menu (`nav`, a navigation role,
// a class or id naming a menu) on any rendered page; it is matched by the page it opens, never by its words, which
// are the customer's. The reverse, pages and menu items the plan does not have (demo leftovers), is reported apart.
import { pagePathOf } from './site-pages.mjs'

const EXCERPT = 40
const firstSegment = (p) => p.split('/').filter(Boolean)[0] ?? ''
const cut = (text, n = EXCERPT) => {
  const chars = [...String(text ?? '')]
  return chars.length > n ? `${chars.slice(0, n - 3).join('')}...` : chars.join('')
}

/** The site address a link opens, below the base; null for another site, a mail or phone link, or an anchor only. */
export function linkPathOf(href, page, base) {
  if (!href || href.startsWith('#') || /^(mailto|tel|javascript|data|sms):/i.test(href)) return null
  let url
  try {
    url = new URL(href, page.abs)
  } catch {
    return null
  }
  if (url.origin !== base.origin) return null
  return pagePathOf(url.pathname, base.pathname)
}

/**
 * The pages check.
 * @param {{expected?: object[], others?: object[], pages: object[], base: URL}} input `expected`: the plan's pages
 *   (`expectedPagesOf`), `others`: the menu items of other menus the write made; `pages` with `tree` and `links`
 */
export function checkPages({ expected, others = [], pages, base }) {
  if (!expected)
    return { status: 'not_run', reason: 'plan_missing: the plan says which pages the site has', findings: [] }
  if (!pages.length) return { status: 'not_run', reason: 'no_pages: no rendered page was read', findings: [] }
  const findings = []
  const shown = pages.filter((p) => p.status === 200)
  const shownPaths = new Set(shown.map((p) => p.path))
  const aliases = new Set(expected.map((e) => firstSegment(e.path)))
  const menu = new Map()
  for (const page of shown)
    for (const link of page.links ?? []) {
      if (!link.menu) continue
      const to = linkPathOf(link.href, page, base)
      if (to && !menu.has(to)) menu.set(to, { on: page.path, label: link.label })
    }
  for (const e of expected) {
    if (!shownPaths.has(e.path)) {
      const got = pages.find((p) => p.path === e.path)
      findings.push({
        kind: 'plan_page_missing',
        page: e.page,
        place: { pageType: e.pageType, path: e.path },
        status: got ? got.status : null,
        ...(got?.note ? { note: got.note } : {})
      })
    }
    if (!menu.has(e.path))
      findings.push({ kind: 'plan_menu_item_missing', page: e.page, place: { menu: 'main', path: e.path } })
  }
  for (const item of others)
    if (!menu.has(item.path))
      findings.push({
        kind: 'plan_menu_item_missing',
        page: expected.find((e) => e.path === item.path)?.page ?? null,
        place: { menu: item.menutype, item: item.key, path: item.path }
      })
  for (const page of shown)
    if (page.path !== '/' && !aliases.has(firstSegment(page.path)))
      findings.push({ kind: 'site_page_not_in_plan', page: page.path, place: { path: page.path } })
  for (const [to, link] of menu)
    if (to !== '/' && !aliases.has(firstSegment(to)))
      findings.push({
        kind: 'site_menu_item_not_in_plan',
        page: link.on,
        place: { path: to },
        excerpt: cut(link.label)
      })
  return { status: 'ran', notes: [`${expected.length} plan page(s), ${shown.length} page(s) read`], findings }
}
