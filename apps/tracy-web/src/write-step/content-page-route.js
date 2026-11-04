// How this template presents a content page, for the pages the write step creates (TracyHQ/tracy#379). What a page looks like comes
// from how Joomla reaches it, not from any setting on the page: an article opened under a category's menu item takes that item's
// `layout`, and a framework may give such a page a layout of its own (T4's sub layout). So the same words under a menu item of the
// article itself print whatever that template's default article prints, a second heading and share buttons among them. A created page
// therefore takes the route the template's own content pages take. The kit records it (`site.contentPages`, content-pages.mjs); a kit
// from before that record says the same through its article pages and the live menu. Nothing here names a template or a layout.
import { articleOfPage } from './page-meta-write.js'

const each = (value) => (Array.isArray(value) ? value : [])
const slashless = (path) =>
  String(path ?? '')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase()

/** The menu item that holds a created page's route, and where it sits in the address. */
export const ROUTE_ALIAS = 'site-pages'

const queryOf = (link) => new URLSearchParams(String(link ?? '').split('?')[1] ?? '')

/** The category menu item a page at this path is opened under, among rows of the menu. */
function categoryRowOver(path, rows) {
  const parent = slashless(path).split('/').slice(0, -1).join('/')
  if (!parent) return null
  const row = rows.find((r) => slashless(r?.path) === parent)
  if (!row) return null
  const query = queryOf(row.link)
  return query.get('option') === 'com_content' && query.get('view') === 'category' ? row : null
}

/** The kit's kept pages whose body is an article: what can show how this site's content pages look. */
function keptArticlePages({ plan, kit }) {
  const kept = new Set(
    each(plan?.pages)
      .filter((p) => p?.decision === 'keep')
      .map((p) => p.id)
  )
  return each(kit?.pages).filter((p) => kept.has(p?.id) && articleOfPage(p, kit) !== null)
}

/** Whether this kit and plan can name a content page at all: answered without asking the site anything. */
export function mayHaveContentRoute({ plan, kit }) {
  return each(kit?.site?.contentPages).length > 0 || keptArticlePages({ plan, kit }).length > 0
}

/**
 * The route of the template's content pages: the presentation most of the plan's kept pages use, else the kit's first.
 * @param {{ plan: object, kit: object, rows: object[] }} input `rows`: the site's menu
 * @returns {{ layout: string | null, from: string } | null} `layout`: what the category item names; null when the template's content
 *   pages are not opened under a category, and the page keeps a menu item of its own
 */
export function contentPageRoute({ plan, kit, rows }) {
  const recorded = each(kit?.site?.contentPages)
  if (recorded.length) {
    const kept = new Set(
      each(plan?.pages)
        .filter((p) => p?.decision === 'keep')
        .map((p) => p.id)
    )
    const score = (entry) => each(entry?.pages).filter((id) => kept.has(id)).length
    const best = [...recorded].sort((a, b) => score(b) - score(a))[0]
    return { layout: best.layout ?? null, from: `the kit's content pages under ${best.route}` }
  }
  const groups = new Map()
  for (const page of keptArticlePages({ plan, kit })) {
    const row = categoryRowOver(page.path, each(rows))
    if (row) groups.set(row, (groups.get(row) ?? 0) + 1)
  }
  if (!groups.size) return null
  const [row] = [...groups].sort((a, b) => b[1] - a[1])[0]
  return { layout: queryOf(row.link).get('layout'), from: `the kept pages under ${slashless(row.path)}` }
}

/** The link of the menu item a created page is opened under. */
export const routeLink = (route, category) =>
  `index.php?option=com_content&view=category${route.layout ? `&layout=${route.layout}` : ''}&id=${category}`

/** A created page's address under that item. */
export const routedAddress = ({ articleId, category, itemId }) =>
  `index.php?option=com_content&view=article&id=${articleId}&catid=${category}&Itemid=${itemId}`
