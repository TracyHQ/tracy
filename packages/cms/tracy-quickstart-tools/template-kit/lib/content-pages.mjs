// How this template presents a content page (TracyHQ/tracy#379): what a page prints comes from how Joomla reaches it, so the record is
// the route, read from the template's own item pages. An article opened under a category's menu item takes that item's `layout`, and
// a framework may give such a page a layout of its own. A page the write step creates takes the same route and prints the same way.
// One entry per category item, biggest first; the write step takes the one its plan's kept pages use. Nothing here names a template.
import { neutralKey } from './ids.mjs'

const INDEX = /^\/index\.php(?=\/|$)/

/**
 * Record the routes on `kit.site.contentPages`; a template with no item pages has none.
 * @param {object} kit changed in place
 * @param {{map: object}} o the content map (`itemPages`, `pages`)
 */
export function settleContentPages(kit, { map }) {
  const pagesByPath = new Map((kit.pages ?? []).map((p) => [p.path, p.id]))
  const items = new Map((map.pages ?? []).map((p) => [p.entity, p]))
  const routes = new Map()
  for (const [article, page] of Object.entries(map.itemPages ?? {})) {
    const item = items.get(page.categoryPage)
    if (!item) continue
    const id = pagesByPath.get(String(page.path).replace(INDEX, ''))
    if (!id) continue
    const query = new URLSearchParams(String(item.link ?? '').split('?')[1] ?? '')
    if (query.get('view') !== 'category') continue
    const entry = routes.get(page.categoryPage) ?? {
      menuItem: page.categoryPage,
      route: page.categoryRoute,
      layout: query.get('layout'),
      pages: [],
      articles: []
    }
    entry.pages.push(id)
    entry.articles.push(neutralKey(article))
    routes.set(page.categoryPage, entry)
  }
  kit.site ??= {}
  const found = [...routes.values()].sort((a, b) => b.pages.length - a.pages.length)
  if (found.length) kit.site.contentPages = found
  else delete kit.site.contentPages
  return kit
}
