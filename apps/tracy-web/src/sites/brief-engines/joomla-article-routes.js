/**
 * An address for each Joomla article a page that stays still shows, once the entry that routed it went with an unticked page.
 *
 * 🔒 A KEPT ARTICLE KEEPS AN ADDRESS THAT OPENS (spec "Template Customization Question Readiness", PAGE-4 and PAGE-7).
 * Joomla's router gives an article the menu entry of the article itself, else one of its category or a category above it
 * (`MenuRules::preprocess`). With none left it falls back to the entry of the page the visitor stands on, and from a category
 * page of another category it prints `/<that page>/<article alias>`, which that page cannot read back: 404. Measured 10/10/2026
 * on dev (JA Essence j6 1.0.3, Category Style 1 unticked): the front page still featured four Health articles and every
 * link to them from another blog page answered 404. Each such article gets an entry of its own, in a menu of its own that no
 * module shows (`menu_show` off as well), so the router finds it wherever the link is printed and no menu lists it.
 * `apply.revert` takes the entries and the menu away with the rest of the tidy-up.
 */

/** The menu that holds those entries (`#__menu_types.menutype`, at most 24 characters). */
export const ROUTES_MENU = 'tracy-article-routes'

/** The com_content view and id a menu entry routes to, or null for any other entry. */
export const contentOf = (/** @type {any} */ row) => {
  if (row.type !== 'component') return null
  const query = new URLSearchParams(String(row.link ?? '').split('?')[1] ?? '')
  if (query.get('option') !== 'com_content') return null
  return { view: String(query.get('view') ?? ''), id: String(query.get('id') ?? '') }
}

/**
 * Whether the router finds an entry for `article` among `entries` (the entries that stay published).
 * @param {any[]} entries
 * @param {any} article - `id`, `catid`
 * @param {Map<string, string>} parentOf - category id → its parent's id
 */
export function routed(entries, article, parentOf) {
  const chain = new Set()
  for (let at = String(article.catid ?? ''); at && at !== '0' && !chain.has(at); at = parentOf.get(at) ?? '')
    chain.add(at)
  return entries.some((row) => {
    const to = contentOf(row)
    if (to?.view === 'article') return to.id === String(article.id)
    return to?.view === 'category' && chain.has(to.id)
  })
}

/**
 * The writes that give each of `articles` an entry of its own: the menu first when the site has none yet, then one entry
 * per article, top level, under the article's alias (with its id when a top-level entry already holds that alias).
 * @param {object} input
 * @param {any[]} input.rows - the menu as `readMenu` read it
 * @param {any[]} input.articles - `id`, `title`, `alias`, `language`
 * @returns {Array<{ kind: string, id: number, fields: Record<string, string | number> }>}
 */
export function routeSteps({ rows, articles }) {
  if (articles.length === 0) return []
  const taken = new Set(rows.filter((row) => String(row.parent_id) === '1').map((row) => String(row.alias)))
  /** @type {Array<{ kind: string, id: number, fields: Record<string, string | number> }>} */
  const steps = []
  if (!rows.some((row) => row.menutype === ROUTES_MENU))
    steps.push({
      kind: 'menutype',
      id: 0,
      fields: {
        menutype: ROUTES_MENU,
        title: 'Article addresses',
        description:
          'Addresses of articles a page still shows after the page that routed them was taken off. No module shows this menu.',
        client_id: 0
      }
    })
  for (const article of articles) {
    const own = String(article.alias || `article-${article.id}`)
    const alias = taken.has(own) ? `${own}-${article.id}` : own
    taken.add(alias)
    steps.push({
      kind: 'menuItem',
      id: 0,
      fields: {
        menutype: ROUTES_MENU,
        title: String(article.title || alias),
        alias,
        link: `index.php?option=com_content&view=article&id=${article.id}`,
        // The component works its `component_id` out of the link (the router looks entries up by it).
        type: 'component',
        parent_id: 1,
        published: 1,
        access: 1,
        language: String(article.language || '*'),
        params: JSON.stringify({ menu_show: 0 })
      }
    })
  }
  return steps
}
