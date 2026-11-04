// Where each kept page should answer once it takes its plan slug (ADR 0044, decision 20), and what the report says of it
// (page-route-stage.js). The planner names every kept page after what it holds (`plan.pages[].slug`); the kit and the site's menu
// still call it by the demo's address. Nothing here calls the site: the menu rows come in, the orders and the lines go out.
import { rowsOpening } from './page-meta-write.js'
import { readRow } from './settings-door.js'

const each = (value) => (Array.isArray(value) ? value : [])
const trimmed = (path) => String(path ?? '').replace(/^\/+|\/+$/g, '')

/** A slug as Joomla keeps an alias: ASCII, lower case, words joined by one hyphen. */
export const slugOf = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** A menu row's own alias, or the last part of its path when the row came without one. */
const aliasOf = (row) => String(row?.alias ?? trimmed(row?.path).split('/').at(-1) ?? '')

/** The address of a menu row once the aliases in `renamed` (by row id) are its and its parents'. */
export function addressAfter(row, rows, renamed = new Map()) {
  const byId = new Map(rows.map((r) => [Number(r.id), r]))
  const parts = []
  for (let node = row, hops = 0; node && Number(node.id) > 1 && hops < 20; hops++) {
    parts.unshift(renamed.get(Number(node.id)) ?? aliasOf(node))
    node = byId.get(Number(node.parent_id))
  }
  return `/${parts.join('/')}`
}

const sameLanguage = (a, b) => a === b || a === '*' || b === '*' || !a || !b
const articleOfLink = (link) =>
  /[?&]view=article\b/.test(String(link ?? ''))
    ? Number(/[?&]id=(\d+)/.exec(String(link))?.[1] ?? 0) || null
    : null

/**
 * One order per kept page the plan gives a slug, the home page aside: the menu item that opens it, its article when the item
 * prints one article, the demo address and the address it takes. An order that cannot be sent carries `reason`.
 * @param {{ plan: object, kit: object, rows: object[], menutype?: string | null }} input
 * @returns {{ pageId: string, slug: string, itemId: number | null, articleId: number | null, alias: string | null,
 *   from: string, to: string | null, reason?: string }[]}
 */
export function routeOrders({ plan, kit, rows, menutype = null }) {
  const kitPages = new Map(each(kit?.pages).map((p) => [p?.id, p]))
  const orders = []
  for (const page of each(plan?.pages)) {
    if (page?.decision !== 'keep') continue
    const kitPage = kitPages.get(page.id)
    const slug = slugOf(page.slug)
    if (!kitPage || typeof kitPage.path !== 'string' || !slug || trimmed(kitPage.path) === '') continue
    const from = `/${trimmed(kitPage.path)}`
    const [row] = rowsOpening(kitPage, rows, menutype)
    if (!row) {
      orders.push({
        pageId: page.id,
        slug,
        itemId: null,
        articleId: null,
        alias: null,
        from,
        to: null,
        reason: `no published menu item opens ${page.id} at ${from}, so it cannot take the address ${slug}`
      })
      continue
    }
    orders.push({
      pageId: page.id,
      slug,
      itemId: Number(row.id),
      articleId: articleOfLink(row.link),
      alias: aliasOf(row),
      from,
      to: null,
      row
    })
  }
  // Every rename at once: a page under a renamed parent answers under the parent's new name too.
  const renamed = new Map(orders.filter((o) => o.itemId).map((o) => [o.itemId, o.slug]))
  for (const order of orders) {
    if (!order.itemId) continue
    order.to = addressAfter(order.row, rows, renamed)
    const parent = Number(order.row.parent_id)
    const language = String(order.row.language ?? '*')
    // Joomla keeps one alias per parent and language; a sibling at that alias would refuse the write, so it is said first.
    const holder = rows.find(
      (r) =>
        Number(r.id) !== order.itemId &&
        Number(r.parent_id) === parent &&
        Number(r.client_id ?? 0) === 0 &&
        (renamed.get(Number(r.id)) ?? aliasOf(r)) === order.slug &&
        sameLanguage(String(r.language ?? '*'), language)
    )
    if (holder && order.alias !== order.slug)
      order.reason = `menu item ${holder.id} under the same parent already answers at ${order.slug}`
  }
  return orders.map(({ row: _row, ...order }) => order)
}

/**
 * The report's lines of the route stage: one per page for its menu item, one per page for the article it prints, each read back
 * on the row it was written to (site-check/read-back.js).
 * @param {object[]} routes the route table (page-route-stage.js)
 */
export function routeLines(routes) {
  const line = (slot, part, ordered, outcome, readFrom) => ({
    slot,
    key: null,
    owner: 'plan',
    part,
    status: outcome.status,
    reason: outcome.reason ?? null,
    readBack: null,
    ordered,
    ...(readFrom && outcome.status === 'written' ? { readFrom } : {}),
    outcome: outcome.outcome,
    ...(outcome.evidence ? { evidence: outcome.evidence } : {})
  })
  const statusOf = (outcome) => (outcome === 'written' || outcome === 'already' ? 'written' : 'failed')
  return each(routes).flatMap((route) => [
    line(
      `${route.pageId}:slug`,
      'page-slug',
      route.slug,
      { ...route, status: statusOf(route.outcome) },
      route.itemId ? readRow('menuItem', route.itemId, 'alias') : null
    ),
    ...(route.article
      ? [
          line(
            `${route.pageId}:article-slug`,
            'article-slug',
            route.slug,
            { ...route.article, status: statusOf(route.article.outcome) },
            readRow('article', route.article.id, 'alias')
          )
        ]
      : [])
  ])
}

/**
 * The kept pages at the addresses the site answers them at now: a page whose item, or an item above it, took its slug.
 * @param {{ id: string, path: string }[]} keptPages
 * @param {{ kit: object, rows: object[], landed: Map<number, string>, menutype?: string | null }} site
 */
export function keptAt(keptPages, { kit, rows, landed, menutype = null }) {
  if (!landed.size) return keptPages
  const kitPages = new Map(each(kit?.pages).map((p) => [p?.id, p]))
  return each(keptPages).map((page) => {
    const kitPage = kitPages.get(page.id)
    if (!kitPage || trimmed(page.path) === '') return page
    const [row] = rowsOpening(kitPage, rows, menutype)
    return row ? { ...page, path: addressAfter(row, rows, landed) } : page
  })
}
