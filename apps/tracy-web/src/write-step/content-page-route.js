// How this template presents a content page, for the pages the write step creates (TracyHQ/tracy#379). What a page looks like comes
// from how Joomla reaches it, on two counts:
// - The page's frame: a framework may give an article opened under a category's menu item a layout of its own (T4's sub layout).
// - The file that prints the article: Joomla's article view takes `article_layout` from the article's `attribs`, else from the active
//   menu item's `params`, else from the component's setting. A category link's `layout=` only picks the category's own file and never
//   reaches an article, and neither does `layout=` in the address.
// So the same words anywhere else print whatever that template's default article prints, a second heading and share buttons among
// them. A created page therefore takes the route the template's own content pages take, with the file they print through. The kit
// records the route (`site.contentPages`, content-pages.mjs); a kit from before that record says the same through its article pages
// and the live menu. The file is read from the site, since a content map holds no menu settings. Nothing here names a template or a
// layout.
import { articleOfPage, paramsOf } from './page-meta-write.js'

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
 * @returns {{ layout: string | null, from: string, item: object | null, articles: number[] } | null} `layout`: what the category item's
 *   link names; `item`: that menu row; `articles`: the content pages under it. Null when the template's content pages are not opened
 *   under a category, and the page keeps a menu item of its own
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
    const itemId = Number(String(best.menuItem ?? '').replace(/^menuItem-/, ''))
    return {
      layout: best.layout ?? null,
      from: `the kit's content pages under ${best.route}`,
      item: each(rows).find((r) => Number(r?.id) === itemId) ?? null,
      articles: each(best.articles).map((a) => Number(String(a).replace(/^article-/, '')))
    }
  }
  const groups = new Map()
  for (const page of keptArticlePages({ plan, kit })) {
    const row = categoryRowOver(page.path, each(rows))
    if (row) groups.set(row, [...(groups.get(row) ?? []), articleOfPage(page, kit)])
  }
  if (!groups.size) return null
  const [row, articles] = [...groups].sort((a, b) => b[1].length - a[1].length)[0]
  return {
    layout: queryOf(row.link).get('layout'),
    from: `the kept pages under ${slashless(row.path)}`,
    item: row,
    articles
  }
}

const named = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null)

/**
 * The file the template's content pages print through, as Joomla's article view picks it: an article's own `article_layout` wins over
 * its menu item's. An article that cannot be read says nothing, and the item answers.
 * @param {{ layout: string | null, item: object | null, articles: number[] }} route
 * @param {(action: string, params: object) => Promise<object>} call
 * @returns {Promise<string | null>} null: they name none and print through the component's setting, as a created page will
 */
export async function articleLayoutOf(route, call) {
  const [first] = route.articles
  if (first) {
    const answer = await call('content.get', { kind: 'article', id: first }).catch(() => null)
    const own = named(paramsOf(answer?.item?.attribs).article_layout)
    if (own) return own
  }
  return named(paramsOf(route.item?.params).article_layout)
}

/**
 * The file a created legal page prints its article through (card AN): the one the kit names for legal pages
 * (`site.createdPageLayouts.legal.articleLayout`), else none, so Joomla prints the template's plain default article. Never the
 * file of the template's content pages: a class page's prints its booking bars, which a legal page must not show.
 * @returns {string | null}
 */
export const legalLayoutOf = (kit) => named(kit?.site?.createdPageLayouts?.legal?.articleLayout)

/** The link of the menu item a created page is opened under. */
export const routeLink = (route, category) =>
  `index.php?option=com_content&view=category${route.layout ? `&layout=${route.layout}` : ''}&id=${category}`

/** A created page's address under that item. */
export const routedAddress = ({ articleId, category, itemId }) =>
  `index.php?option=com_content&view=article&id=${articleId}&catid=${category}&Itemid=${itemId}`
