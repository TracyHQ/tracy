/**
 * The Joomla articles that go with the pages the customer unticked.
 *
 * 🔒 AN UNTICKED PAGE'S ARTICLES GO, EXCEPT THOSE A KEPT PAGE STILL LISTS OR LINKS (PAGE-7 with D11, product owner 08/10 and
 * 11/10/2026, TCH #1013). Unpublishing a blog's or a list's menu entry takes the list off its address, but every article it
 * listed still answered at its own, so an unticked News kept its stories reachable: the articles of the category behind an
 * entry that goes (and of the categories under it) are unpublished in the same tidy-up transaction, as is the article an entry
 * that goes shows on its own page. An article stays while something the visitor still reaches lists or links it:
 * - an entry that stays lists its category or a category above it, or is the article's own entry;
 * - a front page that stays shows it as featured;
 * - an articles module (`mod_articles_category`, `_latest`, `_news`, `mod_articles`…) lists its category on a page that stays
 *   (D11: JA Essence "Category Style 1" unticked, its Health articles are still listed on Category Blog and Home 1 by modules
 *   113 and 119, so they stay; measured 10/10/2026 on dev g59-ess-j-full, unpublishing 21 and 22 cost layout-1 its demo
 *   "Previous");
 * - it is the Previous or Next of an article whose own entry stays (Joomla links it from that page).
 * Unticking Tracy Business "News" or JA Phio "Blog", which nothing else lists, still takes their articles off. An article
 * already off is not written again.
 *
 * An article that stays published but whose only route went with the page (a featured article of an unticked category) is
 * named in `routes`: it gets an entry of its own (`joomla-article-routes.js`), or Joomla prints its links from the page the
 * visitor is on, and they answer 404.
 */
import { neighboursOf, rulesOf } from './joomla-article-order.js'
import { contentOf, routed } from './joomla-article-routes.js'
import { pool } from './shared.js'

/** A listing page that carries whole rows (`include_body`); the door's own ceiling for one. */
const WHOLE_PAGE = 25
/** How many listing pages are read at once. */
const READERS = 4
/** A module that lists articles (not `mod_articles_categories`, which lists categories). */
const LISTS_ARTICLES = /^mod_articles(?:_category|_latest|_news|_popular|_archive)?$/

/** The categories a module's params name (`catid`: an array, one id, or none = every category). */
const categoriesOf = (/** @type {any} */ params) => {
  const raw = params?.catid
  const list = (Array.isArray(raw) ? raw : raw === undefined || raw === null || raw === '' ? [] : [raw])
    .map(String)
    .filter((id) => id !== '' && id !== '0')
  return list
}
/**
 * The order an articles module lists in, as Joomla sorts it: `mod_articles_latest` and `mod_articles_news` newest first,
 * `mod_articles_popular` by hits, `mod_articles_category` and `mod_articles` by `article_ordering` and its direction.
 * @param {string} module @param {any} params
 */
function moduleOrder(module, params) {
  const time = (/** @type {any} */ a) => Date.parse(String(a.publish_up ?? a.created ?? '')) || 0
  const newest = (/** @type {any} */ a, /** @type {any} */ b) =>
    time(b) - time(a) || Number(b.id) - Number(a.id)
  if (module === 'mod_articles_latest' || module === 'mod_articles_news') return newest
  if (module === 'mod_articles_popular')
    return (/** @type {any} */ a, /** @type {any} */ b) =>
      Number(b.hits ?? 0) - Number(a.hits ?? 0) || newest(a, b)
  const field = String(params.article_ordering ?? 'a.title').replace(/^a\./, '')
  const sign = /^desc$/i.test(String(params.article_ordering_direction ?? 'ASC')) ? -1 : 1
  return (/** @type {any} */ a, /** @type {any} */ b) => {
    const x =
      field === 'title'
        ? String(a.title ?? '')
        : /date|publish|created|modified/.test(field)
          ? time(a)
          : Number(a[field] ?? 0)
    const y =
      field === 'title'
        ? String(b.title ?? '')
        : /date|publish|created|modified/.test(field)
          ? time(b)
          : Number(b[field] ?? 0)
    return (x < y ? -1 : x > y ? 1 : Number(a.id) - Number(b.id)) * sign
  }
}
const paramsOf = (/** @type {any} */ row) => {
  if (row?.params && typeof row.params === 'object') return row.params
  try {
    return JSON.parse(String(row?.params ?? '{}'))
  } catch {
    return {}
  }
}

/**
 * Which articles go with the menu entries `causes`, and which of those entries each goes with.
 * @param {object} input
 * @param {any[]} input.rows - the menu as `readMenu` read it
 * @param {number[]} input.causes - the entries of the pages the customer unticked
 * @param {number[]} input.gone - every entry the tidy-up takes off (`causes` and what goes with them)
 * @param {Set<string>} input.visible - the language tags a visitor can reach
 * @param {any[]} input.articles - the site's articles (`id`, `catid`, `state`, `featured`, `ordering`)
 * @param {any[]} input.categories - the site's categories (`id`, `parent_id`)
 * @param {any[]} [input.modules] - the site's modules (`id`, `module`, `published`, `params`)
 * @param {Map<number, number[] | null>} [input.assignments] - module id → the menu ids it shows on (`#__modules_menu`: 0 every
 *   page, -N every page but N); null or absent = not read, taken as shown
 * @returns {{ ids: number[], by: Map<number, number[]>, routes: any[] }} `by`: article id → the entries of `causes` it goes
 *   with; `routes`: the articles that stay published with no entry left that the router finds
 */
export function articlesGoing({
  rows,
  causes,
  gone,
  visible,
  articles,
  categories,
  modules = [],
  assignments = new Map()
}) {
  const off = new Set(gone)
  const parentOf = new Map(categories.map((c) => [String(c.id), String(c.parent_id ?? '')]))
  /** A category and every one under it. */
  const within = (/** @type {string} */ id) => {
    const out = new Set([id])
    for (let grew = true; grew; ) {
      grew = false
      for (const [child, parent] of parentOf)
        if (out.has(parent) && !out.has(child)) {
          out.add(child)
          grew = true
        }
    }
    return out
  }
  const reachable = (/** @type {any} */ row) => {
    const language = String(row.language ?? '*')
    return language === '*' || visible.has(language)
  }
  const staying = rows.filter(
    (row) => Number(row.published) === 1 && Number(row.id) > 1 && !off.has(Number(row.id)) && reachable(row)
  )
  const stayingIds = new Set(staying.map((row) => Number(row.id)))
  /** What the pages that stay still show: categories (with those under them), articles, the featured ones. */
  const shownCats = new Set()
  const shownArticles = new Set()
  let featured = false
  for (const row of staying) {
    const to = contentOf(row)
    if (to?.view === 'category' && to.id) for (const id of within(to.id)) shownCats.add(id)
    if (to?.view === 'article' && to.id) shownArticles.add(to.id)
    if (to?.view === 'featured') featured = true
  }
  /** Whether a module shows on a page that stays: every page, a page that stays, or every page but some. */
  const onKeptPage = (/** @type {number} */ id) => {
    const menus = assignments.get(id)
    if (menus === undefined || menus === null) return true
    if (menus.length === 0) return false
    if (menus.includes(0)) return true
    if (menus.some((m) => m > 0 && stayingIds.has(m))) return true
    const excluded = new Set(menus.filter((m) => m < 0).map((m) => -m))
    return excluded.size > 0 && staying.some((row) => !excluded.has(Number(row.id)))
  }
  /**
   * The articles the articles modules on kept pages list: those of the categories each names, through its featured filter,
   * and only the first `count` in its own order (a "Latest" module on every page lists five articles, not the site).
   */
  const listed = new Set()
  for (const m of modules) {
    if (
      Number(m.published) !== 1 ||
      !LISTS_ARTICLES.test(String(m.module ?? '')) ||
      Number(m.client_id ?? 0) !== 0 ||
      !reachable(m) ||
      !onKeptPage(Number(m.id))
    )
      continue
    const params = paramsOf(m)
    const named = new Set(categoriesOf(params).flatMap((id) => [...within(id)]))
    const excludes = String(params.category_filtering_type ?? '1') === '0'
    const front = String(params.show_front ?? 'show')
    const shown = articles.filter((a) => {
      if (Number(a.state) !== 1) return false
      if ((front === 'only' || front === '1') && Number(a.featured) !== 1) return false
      if ((front === 'hide' || front === '0') && Number(a.featured) === 1) return false
      if (named.size === 0) return true
      return excludes ? !named.has(String(a.catid)) : named.has(String(a.catid))
    })
    const count = Number(params.count ?? 0)
    for (const a of count > 0 ? shown.sort(moduleOrder(String(m.module), params)).slice(0, count) : shown)
      listed.add(Number(a.id))
  }
  /** The Previous and Next of every article whose own entry stays: Joomla links them from that page. */
  const linkedByNeighbour = new Set()
  const rules = rulesOf(rows)
  for (const id of shownArticles)
    for (const n of neighboursOf(articles, Number(id), rules)) if (n !== null) linkedByNeighbour.add(n)
  /** @type {Map<number, number[]>} */
  const by = new Map()
  const add = (/** @type {number} */ article, /** @type {number} */ entry) =>
    by.set(article, [...new Set([...(by.get(article) ?? []), entry])])
  const byId = new Map(rows.map((row) => [Number(row.id), row]))
  for (const entry of causes) {
    const to = byId.has(entry) ? contentOf(byId.get(entry)) : null
    if (!to?.id) continue
    if (to.view === 'category') {
      const cats = within(to.id)
      for (const a of articles) if (cats.has(String(a.catid))) add(Number(a.id), entry)
    } else if (to.view === 'article') add(Number(to.id), entry)
  }
  const ofId = new Map(articles.map((a) => [Number(a.id), a]))
  const routes = []
  for (const id of by.keys()) {
    const a = ofId.get(id)
    const stays =
      !a ||
      Number(a.state) !== 1 ||
      shownCats.has(String(a.catid)) ||
      shownArticles.has(String(id)) ||
      (featured && Number(a.featured) === 1) ||
      listed.has(id) ||
      linkedByNeighbour.has(id)
    if (!stays) continue
    by.delete(id)
    if (a && Number(a.state) === 1 && !routed(staying, a, parentOf)) routes.push(a)
  }
  return { ids: [...by.keys()], by, routes }
}

/**
 * `articlesGoing`, read from the site: its articles, categories and modules, whole rows (the summary carries no category),
 * and where each articles module shows (`moduleAssignment`). Never rejects; what cannot be read leaves every article as it
 * is, said; a module whose pages cannot be read is taken as shown, so its articles stay.
 * @param {object} input
 * @param {(call: { siteKey: string, action: string, params: Record<string, unknown> }) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {any[]} input.rows
 * @param {number[]} input.causes
 * @param {number[]} input.gone
 * @param {Set<string>} input.visible
 * @returns {Promise<{ ids: number[], by: Map<number, number[]>, routes: any[], note: string | null }>}
 */
export async function unpickedArticles({ apply, siteKey, rows, causes, gone, visible }) {
  const none = { ids: /** @type {number[]} */ ([]), by: new Map(), routes: /** @type {any[]} */ ([]) }
  if (causes.length === 0) return { ...none, note: null }
  try {
    const [articles, categories, modules] = await Promise.all([
      listWhole(apply, siteKey, 'article'),
      listWhole(apply, siteKey, 'category'),
      listWhole(apply, siteKey, 'module').catch(() => /** @type {any[]} */ ([]))
    ])
    const listers = modules.filter(
      (m) => Number(m.published) === 1 && LISTS_ARTICLES.test(String(m.module ?? ''))
    )
    /** @type {Map<number, number[] | null>} */
    const assignments = new Map()
    const read = await pool(
      listers.map((m) => async () => {
        const got = await apply({
          siteKey,
          action: 'content.get',
          params: { kind: 'moduleAssignment', id: Number(m.id) }
        })
        const menus = JSON.parse(String(got?.item?.menuids ?? 'null'))
        return Array.isArray(menus) ? menus.map(Number) : null
      }),
      READERS
    )
    listers.forEach((m, i) => assignments.set(Number(m.id), read[i].ok ? read[i].value : null))
    return {
      ...articlesGoing({ rows, causes, gone, visible, articles, categories, modules, assignments }),
      note: null
    }
  } catch (error) {
    return {
      ...none,
      note: `the articles of the pages you did not pick could not be read, so they stay: ${error instanceof Error ? error.message : error}`
    }
  }
}

/** The writes that take the articles `ids` off the site. @param {number[]} ids */
export const articleSteps = (ids) => ids.map((id) => ({ kind: 'article', id, fields: { state: 0 } }))

/** Every row of one kind, whole, read a few pages at a time. Throws the site's own words. */
export async function listWhole(
  /** @type {(call: any) => Promise<any>} */ apply,
  /** @type {string} */ siteKey,
  /** @type {string} */ kind
) {
  /** @type {any[]} */
  const rows = []
  for (let offset = 0; offset < 5000; offset += WHOLE_PAGE * READERS) {
    const pages = await pool(
      Array.from({ length: READERS }, (_, i) => async () => {
        const answer = await apply({
          siteKey,
          action: 'content.list',
          params: { kind, limit: WHOLE_PAGE, offset: offset + i * WHOLE_PAGE, include_body: true }
        })
        if (answer?.ok === false) throw new Error(String(answer.message ?? answer.error ?? 'refused'))
        return Array.isArray(answer?.items) ? answer.items : []
      }),
      READERS
    )
    for (const page of pages) {
      if (!page.ok) throw page.error
      rows.push(...page.value)
    }
    if (pages.some((page) => page.ok && page.value.length < WHOLE_PAGE)) break
  }
  return rows
}
