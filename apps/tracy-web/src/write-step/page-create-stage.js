// The pages a plan asks to create (TracyHQ/tracy#375, ADR 0044), for any template: an article with the copy's words and a menu item
// that gives it an address, made through `content.batch` before the link stage, which points the plan's links at that address.
//
// Nothing here names a kind of page. The plan asks through `site.legalPages[]` with `use: "create"`, the only way it has today.
// Every row carries the mark in its `note`: the plugin does not count such a row as a row the site gained, so the contract reads no
// drift, and a rerun finds its own rows, with or without a report. The menu item is left out of the printed menus (`menu_show: 0`):
// it only gives the page its route, and the row a visitor sees is the template's own, which the link stage points at it. It lives in
// the menu of the plan's link, or the home item's when no menu prints that link. The article sits in a category of its own, since
// a template can list any category it ships (JA Boxing's plans page lists Uncategorised).
//
// When the template's content pages are opened under a category's menu item (content-page-route.js), a created page takes the same
// route, under one hidden item of its own category that holds the same category layout and the same article layout: it then prints
// as they do. It has no item of its own then, so its title lives on the article, and an item an earlier run made for it is unpublished.
import { createHash } from 'node:crypto'
import {
  contentPageRoute,
  legalLayoutOf,
  mayHaveContentRoute,
  ROUTE_ALIAS,
  routedAddress,
  routeLink
} from './content-page-route.js'
import { NO_LAST } from './no-last-report.js'
import { heldByLast, linesOf, MARK, orderOf } from './page-create-lines.js'
import { menuRows } from '../lib/joomla-menu-rows.js'
import { paramsOf } from './page-meta-write.js'
import { opens, PAGE_CREATE_DOOR } from './plugin-doors.js'
import { answerWords, doorCall } from './settings-door.js'

const each = (value) => (Array.isArray(value) ? value : [])
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32)
const CATEGORY_NOTE = `${MARK}category`
const ROUTE_NOTE = `${MARK}route`
const PAGE_ROWS = 25
// What an article prints around its words by default. A page of the site is not a post: no author, date or category.
export const NOT_A_POST = Object.fromEntries(
  [
    'show_category',
    'show_parent_category',
    'show_author',
    'show_create_date',
    'show_modify_date',
    'show_publish_date',
    'show_hits',
    'show_tags',
    'show_vote',
    'show_item_navigation'
  ].map((name) => [name, '0'])
)
const OLDER =
  'the plugin on this site is older than page creation (info.page_create), and on it a created page would read as drift on every contract call, so no page was created'

const slugOf = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** @returns {{ id: string, slug: string }[]} the pages this plan asks the write step to create */
export function pagesToCreate(plan) {
  return each(plan?.site?.legalPages)
    .filter((page) => page?.use === 'create')
    .map((page) => {
      const id = typeof page.id === 'string' ? page.id : `legal:${page.kind}`
      return { id, slug: slugOf(page.slug || id.split(':').at(-1)) }
    })
}

/** @returns {string[]} the pages to create the copy holds no words for: its export's `pages`, by page id */
export function pagesWithoutCopy(plan, pages) {
  return pagesToCreate(plan)
    .map((page) => page.id)
    .filter((id) => {
      const words = pages?.[id]
      return !words?.title?.trim() || !each(words.body).some((paragraph) => paragraph.trim())
    })
}

/** The rows of a kind, whole: a list row of an article or a category names no note. */
async function wholeRows(call, kind) {
  const rows = []
  for (let offset = 0; offset < 5000; offset += PAGE_ROWS) {
    const answer = await call('content.list', { kind, limit: PAGE_ROWS, offset, include_body: true })
    const items = each(answer?.items)
    rows.push(...items)
    if (items.length < PAGE_ROWS) break
  }
  return rows
}

/** The menu that holds the page's item: the one of the plan's first link to it that a menu item carries, else the home item's. */
function menutypeFor(page, { owners, kit, rows }) {
  const links = new Map(
    each(kit?.blocks)
      .flatMap((block) => each(block?.links))
      .map((link) => [link?.id, link])
  )
  const byId = new Map(rows.map((row) => [Number(row.id), row]))
  for (const claim of owners.values()) {
    if (claim.kind !== 'link' || claim.content !== page.id) continue
    const item = String(links.get(claim.slot)?.menuItem ?? '').replace(/^menuItem-/, '')
    const menutype = byId.get(Number(item))?.menutype
    if (menutype) return menutype
  }
  const home = rows.find((row) => Number(row.home) === 1)?.menutype
  if (home) return home
  throw new Error('the site has no home menu item, so no menu to hold this page')
}

// The item's title and `page_heading` carry the page heading (the copy's `pages[].title`); `page_title` is Joomla's browser title,
// so it carries the seo title. A template or patch that prints `page_heading` then prints the short heading, never the tab title.
const itemParams = (order, kept = {}) => ({
  ...kept,
  ...NOT_A_POST,
  menu_show: 0,
  page_heading: order.title,
  ...(order.seo ? { page_title: order.seo.title, 'menu-meta_description': order.seo.description } : {})
})
const articleLink = (id) => `index.php?option=com_content&view=article&id=${id}`
const articleOfLink = (link) => Number(/[?&]id=(\d+)/.exec(String(link ?? ''))?.[1] ?? 0)

/** The columns of `row` that differ from `fields`. */
function differing(row, fields) {
  return Object.fromEntries(
    Object.entries(fields).filter(([name, value]) => String(row[name]) !== String(value))
  )
}

/** Makes what the site lacks of one page and corrects what differs; a row already right gets no write. */
async function writePage({ order, call, write, make, rows, owners, kit, category }) {
  const item = rows.find((row) => row.note === order.note)
  const wanted = {
    title: order.title,
    introtext: order.html,
    metadesc: order.seo?.description ?? '',
    state: 1
  }
  let article = null
  if (articleOfLink(item?.link)) {
    const answer = await call('content.get', { kind: 'article', id: articleOfLink(item.link) })
    article = answer?.item ?? null
  } else {
    article = (await wholeRows(call, 'article')).find((row) => row.note === order.note) ?? null
  }
  const articleId = article
    ? Number(article.id)
    : await make('article', {
        ...wanted,
        alias: order.slug,
        fulltext: '',
        catid: await category(),
        featured: 0,
        language: '*',
        access: 1,
        attribs: JSON.stringify(NOT_A_POST),
        note: order.note
      })
  if (article) {
    const fields = differing(article, wanted)
    if (Object.keys(fields).length) await write('article', articleId, fields)
  }
  if (!item)
    return {
      articleId,
      itemId: await make('menuItem', {
        title: order.title,
        alias: order.slug,
        menutype: menutypeFor(order, { owners, kit, rows }),
        type: 'component',
        link: articleLink(articleId),
        published: 1,
        language: '*',
        access: 1,
        note: order.note,
        params: JSON.stringify(itemParams(order))
      })
    }
  const kept = paramsOf(item.params)
  const params = itemParams(order, kept)
  const fields = differing(item, { title: order.title, link: articleLink(articleId), published: 1 })
  if (JSON.stringify(params) !== JSON.stringify(kept)) fields.params = JSON.stringify(params)
  if (Object.keys(fields).length) await write('menuItem', Number(item.id), fields)
  return { articleId, itemId: Number(item.id) }
}

/** A page on the template's route: its article under the one hidden item of the category, no item of its own. */
async function writeRoutedPage({ order, call, write, make, rows, owners, kit, category, routeItem }) {
  const own = rows.find((row) => row.note === order.note)
  const catid = await category()
  const wanted = {
    title: order.title,
    introtext: order.html,
    metadesc: order.seo?.description ?? '',
    state: 1,
    catid
  }
  const pageTitle = order.seo ? { article_page_title: order.seo.title } : {}
  const article = articleOfLink(own?.link)
    ? ((await call('content.get', { kind: 'article', id: articleOfLink(own.link) }))?.item ?? null)
    : ((await wholeRows(call, 'article')).find((row) => row.note === order.note) ?? null)
  const articleId = article
    ? Number(article.id)
    : await make('article', {
        ...wanted,
        alias: order.slug,
        fulltext: '',
        featured: 0,
        language: '*',
        access: 1,
        attribs: JSON.stringify({ ...NOT_A_POST, ...pageTitle }),
        note: order.note
      })
  if (article) {
    const fields = differing(article, wanted)
    const kept = paramsOf(article.attribs)
    const next = { ...kept, ...NOT_A_POST, ...pageTitle }
    if (Object.keys(next).some((name) => String(kept[name]) !== String(next[name])))
      fields.attribs = JSON.stringify(next)
    if (Object.keys(fields).length) await write('article', articleId, fields)
  }
  const item = await routeItem(order, { owners, kit, rows })
  // Left published, the earlier item would still print the page the old way at its old address.
  if (own && Number(own.published) !== 0) await write('menuItem', Number(own.id), { published: 0 })
  return { articleId, itemId: item.id, routeLink: item.link, articleLayout: item.articleLayout }
}

/**
 * @param {{ door: { apply: Function }, siteKey: string, kit: object, plan: object, owners: Map<string, object>, extras: object,
 *   last?: object }} input
 * @returns {Promise<{ pages: Map<string, { url?: string, reason?: string }>, results: [string, object][], lines: object[],
 *   kept: { id: string, path: string }[], opened: { id: string, itemId: number }[] }>} `pages`: each page's address or why it
 *   has none; `results`: by report line slot; `kept`: the pages the site check should open; `opened`: the menu item that opens each
 *   page (its own, or the category's hidden item on the template's route), which the created page hide rule is scoped by (card AT)
 */
export async function createPages({ door, siteKey, kit, plan, owners, extras, last = NO_LAST, phones = [] }) {
  const out = { pages: new Map(), results: [], lines: [], kept: [], opened: [] }
  const finish = (order, done) => {
    const words = linesOf(order, done)
    out.results.push(...words.results)
    out.lines.push(...words.lines)
    const category = articleOfLink(done.routeLink)
    out.pages.set(
      order.id,
      done.reason
        ? { reason: done.reason }
        : {
            url: done.routeLink
              ? routedAddress({ articleId: done.articleId, category, itemId: done.itemId })
              : `index.php?Itemid=${done.itemId}`
          }
    )
    if (!done.reason) {
      out.kept.push({
        id: order.id,
        path: done.routeLink ? `/${ROUTE_ALIAS}/${order.slug}` : `/${order.slug}`
      })
      if (Number(done.itemId) > 0) out.opened.push({ id: order.id, itemId: Number(done.itemId) })
    }
  }
  const orders = pagesToCreate(plan).map((page) => orderOf(page, extras, { phones }))
  const routed = mayHaveContentRoute({ plan, kit })
  const fresh = []
  for (const order of orders) {
    const held = heldByLast(order, last, routed, legalLayoutOf(kit))
    if (held) finish(order, held)
    else fresh.push(order)
  }
  if (!fresh.length) return out

  const call = doorCall(door, siteKey)
  let cannot = null
  try {
    const answer = await door.apply({ siteKey, action: 'info', params: {} })
    if (answer?.ok === false)
      cannot = `the plugin could not say whether it creates pages: ${answerWords(answer)}`
    else if (!opens(PAGE_CREATE_DOOR, answer?.info)) cannot = OLDER
  } catch (error) {
    cannot = `the plugin could not say whether it creates pages: ${String(error?.message ?? error)}`
  }
  if (cannot) {
    for (const order of fresh) finish(order, { reason: cannot })
    return out
  }

  let rows
  try {
    rows = await menuRows(call)
  } catch (error) {
    for (const order of fresh) finish(order, { reason: `the menu could not be read: ${error.message}` })
    return out
  }
  // A kept page of a route the template does not use names no category: the page keeps its own item.
  const route = contentPageRoute({ plan, kit, rows })
  // Every page created today is a legal page (site.legalPages), so it prints as the kit says a legal page does (card AN).
  const articleLayout = route ? legalLayoutOf(kit) : null
  const printsAs = articleLayout ? { article_layout: articleLayout } : {}
  let categoryId = null
  let routeRow = null
  for (const order of fresh) {
    const applyId = `page-${digest(order.id)}`
    const write = (kind, id, fields) => call('content.update', { apply_id: applyId, kind, id, fields })
    // A batch answers the same request again with the same row, after a reply that was lost.
    const make = async (kind, fields) => {
      const answer = await call('content.batch', {
        apply_id: applyId,
        request_id: `${kind}-${digest(fields)}`,
        operations: [{ kind, id: 0, key: 'row', fields }]
      })
      return Number(answer.ids.row)
    }
    const category = async () => {
      categoryId ??=
        Number((await wholeRows(call, 'category')).find((row) => row.note === CATEGORY_NOTE)?.id ?? 0) ||
        (await make('category', {
          title: 'Site pages',
          published: 1,
          language: '*',
          access: 1,
          note: CATEGORY_NOTE
        }))
      return categoryId
    }
    const routeItem = async (page, where) => {
      const link = routeLink(route, await category())
      routeRow ??= rows.find((row) => row.note === ROUTE_NOTE) ?? null
      if (!routeRow) {
        const params = JSON.stringify({ ...NOT_A_POST, menu_show: 0, ...printsAs })
        const id = await make('menuItem', {
          title: 'Site pages',
          alias: ROUTE_ALIAS,
          menutype: menutypeFor(page, where),
          type: 'component',
          link,
          published: 1,
          language: '*',
          access: 1,
          note: ROUTE_NOTE,
          params
        })
        routeRow = { id, link, published: 1, note: ROUTE_NOTE, params }
      }
      const fields = differing(routeRow, { link, published: 1 })
      const held = paramsOf(routeRow.params)
      if (articleLayout && held.article_layout !== articleLayout)
        fields.params = JSON.stringify({ ...held, ...printsAs })
      else if (!articleLayout && held.article_layout) {
        // A file an earlier run set, which the kit does not name for this page, comes off (card AN).
        const { article_layout: _gone, ...rest } = held
        fields.params = JSON.stringify(rest)
      }
      if (Object.keys(fields).length) {
        await write('menuItem', Number(routeRow.id), fields)
        routeRow = { ...routeRow, ...fields }
      }
      return { id: Number(routeRow.id), link, articleLayout }
    }
    try {
      const context = { order, call, write, make, rows, owners, kit, category }
      finish(order, await (route ? writeRoutedPage({ ...context, routeItem }) : writePage(context)))
    } catch (error) {
      finish(order, { reason: error.message })
    }
  }
  return out
}
