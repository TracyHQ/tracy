// What a created page should hold and what the report says of it (page-create-stage.js): its order from the frozen files, its lines
// once it is written, and whether the last report says the site holds it already. Nothing here calls the site.
import { callablePhones } from './phone-links.js'
import { readRow } from './settings-door.js'

/** How a row of a created page says so; the plugin holds the same mark (QuickstartContract::CREATED_PAGE_MARK). */
export const MARK = 'tracy-page:'
const each = (value) => (Array.isArray(value) ? value : [])
const escaped = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * What one page should hold on the site, from the frozen files. `phones`: the brief's phones, which its words carry as tel:
 * links (card AQ).
 */
export function orderOf(page, { pages, pageMeta }, { phones = [] } = {}) {
  const { title, body } = pages[page.id]
  return {
    ...page,
    note: `${MARK}${page.id}`,
    title,
    html: each(body)
      .filter((paragraph) => paragraph.trim())
      .map((paragraph) => `<p>${callablePhones(escaped(paragraph), phones)}</p>`)
      .join('\n'),
    seo: pageMeta?.[page.id] ?? null
  }
}

/** The report's words on one page: `results` stand for the lines the copy already gives it, `lines` are its own. */
export function linesOf(order, done) {
  const { articleId, itemId, reason, routeLink, articleLayout = null } = done
  const result = (ordered, read) =>
    reason
      ? { status: 'failed', reason, ordered }
      : { status: 'written', reason: null, ordered, readFrom: read }
  const results = [
    [order.id, result(order.html, readRow('article', articleId, 'introtext'))],
    ...(order.seo
      ? [
          [
            `${order.id}:title`,
            result(
              order.seo.title,
              // Opened under a category's item, the page's title lives on the article (page-meta-write.js).
              routeLink
                ? readRow('article', articleId, 'attribs', ['article_page_title'])
                : readRow('menuItem', itemId, 'params', ['page_title'])
            )
          ],
          [
            `${order.id}:description`,
            result(
              order.seo.description,
              routeLink
                ? readRow('article', articleId, 'metadesc')
                : readRow('menuItem', itemId, 'params', ['menu-meta_description'])
            )
          ]
        ]
      : [])
  ]
  const own = (slot, part, value) => ({ slot, key: null, owner: 'writer', part, readBack: null, ...value })
  return {
    results,
    lines: [
      own(`${order.id}:heading`, 'page-heading', result(order.title, readRow('article', articleId, 'title'))),
      own(`${order.id}:address`, 'page-address', result('1', readRow('menuItem', itemId, 'published'))),
      ...(routeLink
        ? [
            own(`${order.id}:route`, 'page-route', {
              ...result(routeLink, readRow('menuItem', itemId, 'link')),
              articleLayout
            })
          ]
        : []),
      ...(routeLink && articleLayout
        ? [
            own(
              `${order.id}:layout`,
              'page-layout',
              result(articleLayout, readRow('menuItem', itemId, 'params', ['article_layout']))
            )
          ]
        : [])
    ]
  }
}

/**
 * The page's rows as the last report says the site holds them, when every line of it stands and this order changes none. `routed`:
 * the template's content pages have a route of their own, and a report without a route line is of a page not yet on it, as one whose
 * route line does not say the article's layout is of a route that does not print as they do yet.
 */
export function heldByLast(order, last, routed = false, layout = null) {
  const same =
    last.same(order.id, order.html) &&
    last.same(`${order.id}:heading`, order.title) &&
    (!order.seo ||
      (last.same(`${order.id}:title`, order.seo.title) &&
        last.same(`${order.id}:description`, order.seo.description)))
  const address = last.line(`${order.id}:address`)
  if (!same || !address) return null
  const route = last.line(`${order.id}:route`)
  if (routed && route?.articleLayout === undefined) return null
  // A route the last run gave another file than the one this page prints through now is written again (card AN).
  if (route && route.articleLayout !== undefined && (route.articleLayout ?? null) !== layout) return null
  return {
    articleId: last.line(order.id).readFrom.params.id,
    itemId: address.readFrom.params.id,
    ...(route ? { routeLink: route.ordered, articleLayout: route.articleLayout ?? null } : {})
  }
}
