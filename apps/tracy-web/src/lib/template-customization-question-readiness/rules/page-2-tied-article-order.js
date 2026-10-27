/**
 * PAGE-2 on Joomla, added after the g59 test builds (10/10/2026): an article page's Previous / Next
 * links must lead where the demo's do. Joomla's `pagenavigation` plugin orders the published
 * articles of one category (and language) by the order the article view uses (`orderby_sec` of
 * com_content or of the menu item that lists the category: `rdate` = newest first by
 * `order_date`, `order`/empty = `ordering`, `alpha` = title) and takes the neighbours of the open
 * article. Two articles tied on that key have no defined order: the database may return them either
 * way, so Previous / Next change as soon as Tracy writes the rows (g59: JA Essence Joomla
 * `/detail/layout-1` lost its Next and pointed Previous at another article; category 9 shares one
 * `publish_up`). The template's fix is distinct dates (or `ordering`) inside a category.
 * Applies only when the plugin is enabled and com_content shows item navigation.
 */
import { demoTables } from '../readers/demo-tables.js'
import { listed } from '../readers/rule-findings.js'

/** A JSON params column, or {}. */
const paramsOf = (/** @type {unknown} */ raw) => {
  try {
    return JSON.parse(String(raw ?? '{}')) ?? {}
  } catch {
    return {}
  }
}

const NULL_DATE = /^(null|0000-00-00 00:00:00)?$/i

/** The value an article sorts by under one order method. */
function keyOf(
  /** @type {Record<string, any>} */ a,
  /** @type {string} */ method,
  /** @type {string} */ date
) {
  if (method === 'alpha' || method === 'ralpha') return String(a.title)
  if (method === 'date' || method === 'rdate') {
    const column = { created: 'created', modified: 'modified', published: 'publish_up' }[date] ?? 'publish_up'
    const value = String(a[column] ?? '')
    return NULL_DATE.test(value) ? String(a.created) : value
  }
  return String(a.ordering)
}

/**
 * @param {import('../index.js').RuleContext} context
 * @param {ReturnType<typeof import('../readers/rule-findings.js').findings>} f
 */
export async function joomlaTiedArticleOrder(context, f) {
  const t = await demoTables(context)
  const extensions = t.rows('extensions')
  const plugin = extensions.find((e) => e.element === 'pagenavigation' && e.folder === 'content')
  const content = paramsOf(extensions.find((e) => e.element === 'com_content')?.params)
  if (!plugin || String(plugin.enabled) !== '1' || String(content.show_item_navigation ?? '1') !== '1') return
  // The orders in use: com_content's, and those of menu items that list one category.
  const global = {
    method: String(content.orderby_sec || 'rdate'),
    date: String(content.order_date || 'published')
  }
  /** @type {Map<string, { method: string, date: string }[]>} */
  const orders = new Map()
  for (const m of t.rows('menu')) {
    // A layout may be hyphenated (Tracy Business j6 `layout=tb-projects`, `tb-news`).
    const cat = /option=com_content&view=category(?:&layout=[\w.:-]+)?&id=(\d+)/.exec(String(m.link))?.[1]
    if (!cat || String(m.published) !== '1') continue
    const p = paramsOf(m.params)
    if (p.orderby_sec || p.order_date)
      orders.set(cat, [
        ...(orders.get(cat) ?? []),
        { method: String(p.orderby_sec || global.method), date: String(p.order_date || global.date) }
      ])
  }
  /** @type {Map<string, Record<string, any>[]>} */
  const groups = new Map()
  for (const a of t.rows('content')) {
    if (String(a.state) !== '1') continue
    const g = `${a.catid}|${a.language}`
    groups.set(g, [...(groups.get(g) ?? []), a])
  }
  const tied = []
  for (const [g, articles] of groups) {
    if (articles.length < 2) continue
    const cat = g.split('|')[0]
    // An article reached from the menu item listing its category follows that item's order; the
    // global order only stands when no listing item sets one.
    for (const { method, date } of orders.get(cat) ?? [global]) {
      const by = new Map()
      for (const a of articles) {
        const k = keyOf(a, method, date)
        by.set(k, [...(by.get(k) ?? []), a.id])
      }
      const ties = [...by.values()].filter((ids) => ids.length > 1)
      if (ties.length) {
        tied.push(
          `category ${cat} by ${method === 'rdate' || method === 'date' ? date : method}: ${ties.map((ids) => `articles ${ids.join(', ')}`).join('; ')}`
        )
        break
      }
    }
  }
  if (tied.length)
    f.problem(
      `articles of one category tied on the order Previous / Next follow, so the neighbours of an article are undefined: ${listed(tied, 6)}`
    )
  const lists = moduleListTies(t.rows('modules'), t.rows('content'))
  if (lists.length)
    f.problem(
      `article modules whose shown articles tie on the column the module sorts by, so which ones show, and in what order, is undefined: ${listed(lists, 6)}`
    )
}

/** The column `mod_articles_category` sorts by (`article_ordering`), as an article field. */
const CATEGORY_COLUMN = /** @type {Record<string, string>} */ ({
  'a.created': 'created',
  'a.publish_up': 'publish_up',
  'a.modified': 'modified',
  'a.title': 'title',
  'a.ordering': 'ordering',
  'a.hits': 'hits',
  'a.id': 'id'
})
/** The column `mod_articles_latest` sorts by (`ordering`). */
const LATEST_COLUMN = /** @type {Record<string, string>} */ ({
  c_dsc: 'created',
  p_dsc: 'publish_up',
  m_dsc: 'modified'
})

/**
 * The article modules (`mod_articles_category`, `mod_articles_latest`) whose shown articles tie on the column
 * the module itself sorts by (12/10/2026: JA Spa module 107 sorts by `a.created`, the check read `publish_up`), among
 * the articles it does not exclude (JA Essence module 133 excludes article 37, the title twin of 25).
 * A tie only matters among the articles the module shows (its `count`) and the ones just past the cut. Only the
 * columns Tracy cannot write count: before its first write Tracy pins tied `publish_up` and `ordering` keys to the
 * demo's order (`brief-engines/joomla-article-order.js`) and leaves `created`, `modified`, `title` and hits, which only
 * the template can make distinct.
 * @param {Record<string, any>[]} modules @param {Record<string, any>[]} content
 */
function moduleListTies(modules, content) {
  const out = []
  for (const m of modules) {
    if (String(m.published) !== '1' || String(m.client_id ?? '0') !== '0') continue
    const p = paramsOf(m.params)
    const column =
      m.module === 'mod_articles_category'
        ? CATEGORY_COLUMN[String(p.article_ordering ?? 'a.title')]
        : m.module === 'mod_articles_latest'
          ? LATEST_COLUMN[String(p.ordering ?? 'c_dsc')]
          : undefined
    if (!column || column === 'publish_up' || column === 'ordering' || column === 'id') continue
    const categories = new Set([p.catid ?? []].flat().map(String).filter(Boolean))
    // Joomla leaves out the articles the module excludes by id (`excluded_articles`, one id per line) before it sorts.
    const excluded = new Set(
      [p.excluded_articles ?? []]
        .flat()
        .flatMap((v) => String(v).split(/[\s,]+/))
        .filter(Boolean)
    )
    const articles = content.filter(
      (a) =>
        String(a.state) === '1' &&
        (categories.size === 0 || categories.has(String(a.catid))) &&
        !excluded.has(String(a.id))
    )
    const key = (/** @type {Record<string, any>} */ a) => String(a[column] ?? '')
    const desc =
      m.module === 'mod_articles_latest' ||
      String(p.article_ordering_direction ?? 'ASC').toUpperCase() === 'DESC'
    const sorted = [...articles].sort(
      (a, b) => (desc ? -1 : 1) * key(a).localeCompare(key(b), 'en', { numeric: true })
    )
    const count = Number(p.count ?? 0)
    const shown = new Set((count > 0 ? sorted.slice(0, count) : sorted).map(key))
    const by = new Map()
    for (const a of articles) if (shown.has(key(a))) by.set(key(a), [...(by.get(key(a)) ?? []), a.id])
    const ties = [...by.values()].filter((ids) => ids.length > 1)
    if (ties.length)
      out.push(
        `module ${m.id} (${m.module}) by ${column}: ${ties.map((ids) => `articles ${ids.join(', ')}`).join('; ')}`
      )
  }
  return out
}
