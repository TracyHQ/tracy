// Kept pages take the plan's slug (ADR 0044, decision 20). The planner names each kept page after what it holds; until this
// stage the site still served it at the demo's address (a tennis page at /classes/group-boxing). It runs last of the writes,
// after the printed check read the pages back: every stage before it, and the kit, find a page by its demo address.
//
// For each kept page with a plan slug, the home page aside, the menu item that opens it takes the slug as its alias through
// `content.update`, and so does the article it prints when it prints one. The plugin renames the item's whole branch, keeps the
// undo, makes the value URL safe and refuses an alias a sibling holds. A plugin from before that door ignores or refuses the
// field: the line is failed with the release it needs, so the site check blocks on step 9 and nothing reads as renamed.
//
// The report keeps a route table, `[{ pageId, slug, itemId, from, to, outcome, ... }]`, and the kept pages at their new
// addresses, which the site check opens. On a rerun the route table of the last report is played back first (restoreRoutes):
// the item takes its demo alias again, so every stage before this one still finds its page, and this stage renames it again.
import { createHash } from 'node:crypto'
import { menuRows } from '../lib/joomla-menu-rows.js'
import { answerWords, doorCall } from './settings-door.js'
import { addressAfter, keptAt, routeLines, routeOrders } from './page-route-lines.js'
import { freeHolder } from './page-route-parent.js'
import { MENU_ITEM_ALIAS_DOOR } from './plugin-doors.js'
import { visibleText } from '../lib/site-copy/emphasis-markup.js'

/** The first release of the plugin whose `content.update` renames a menu item through `alias` (TracyHQ/claude-cowork#271). */
export const ALIAS_DOOR = `Claude Cowork for Joomla ${MENU_ITEM_ALIAS_DOOR.since}`
const each = (value) => (Array.isArray(value) ? value : [])
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32)
const OLDER = `the plugin took the call and kept the old alias; renaming a page needs ${ALIAS_DOOR} or later`
const lastPart = (path) =>
  String(path ?? '')
    .replace(/\/+$/, '')
    .split('/')
    .at(-1) ?? ''

/** The plugin's words for a refused rename, with the release it needs when the refusal is an older plugin's. */
const refusalOf = (error) => {
  const words = String(error?.message ?? error)
  return /no writable column/i.test(words) ? `${words}; renaming a page needs ${ALIAS_DOOR} or later` : words
}

/** One menu item to its slug: written, already, or refused with the plugin's words. */
async function renameItem(call, applyId, order) {
  if (order.alias === order.slug) return { outcome: 'already', evidence: { alias: order.alias } }
  try {
    const answer = await call('content.update', {
      apply_id: applyId,
      kind: 'menuItem',
      id: order.itemId,
      fields: { alias: order.slug }
    })
    if (answer?.alias === order.slug)
      return { outcome: 'written', evidence: { alias: answer.alias, before: order.alias } }
    return { outcome: 'refused', reason: OLDER, evidence: { answered: answer?.alias ?? null } }
  } catch (error) {
    return { outcome: 'refused', reason: refusalOf(error) }
  }
}

/** The article the item prints, to the same slug; Joomla's own Table makes it URL safe and keeps it unique in its category. */
async function renameArticle(call, applyId, id, slug) {
  try {
    const held = (await call('content.get', { kind: 'article', id }))?.item?.alias
    if (held === slug) return { id, outcome: 'already', evidence: { alias: held } }
    await call('content.update', { apply_id: applyId, kind: 'article', id, fields: { alias: slug } })
    const now = (await call('content.get', { kind: 'article', id }))?.item?.alias
    return now === slug
      ? { id, outcome: 'written', evidence: { alias: now, before: held ?? null } }
      : {
          id,
          outcome: 'refused',
          reason: `the site holds the alias ${now ?? '(none)'} after the write`,
          evidence: { answered: now ?? null }
        }
  } catch (error) {
    return { id, outcome: 'refused', reason: refusalOf(error) }
  }
}

/** Whether the plan gives any kept page a slug; without one the stage has nothing to do and does not run. */
export const hasPlanSlugs = (plan) =>
  each(plan?.pages).some((p) => p?.decision === 'keep' && String(p?.slug ?? '').trim())

/**
 * @param {{ door: { apply: Function }, siteKey: string, kit: object, plan: object, keptPages: { id: string, path: string }[],
 *   menutype?: string | null }} input `menutype`: the main menu, whose item a page is renamed through when several open it
 * @returns {Promise<{ routes: object[], lines: object[], keptPages: { id: string, path: string }[] }>} `routes` is empty when
 *   no kept page has a plan slug to take
 */
export async function runRouteStage({
  door,
  siteKey,
  kit,
  plan,
  keptPages,
  menutype = null,
  copySlots = []
}) {
  if (!hasPlanSlugs(plan)) return { routes: [], lines: [], keptPages }
  const call = doorCall(door, siteKey)
  let rows
  try {
    rows = await menuRows(call)
  } catch (error) {
    const reason = `the menu could not be read: ${error.message}`
    const routes = each(plan.pages)
      .filter((p) => p?.decision === 'keep' && String(p?.slug ?? '').trim())
      .map((p) => ({
        pageId: p.id,
        slug: p.slug,
        itemId: null,
        from: null,
        to: null,
        outcome: 'refused',
        reason
      }))
    return { routes, lines: routeLines(routes), keptPages }
  }
  const orders = routeOrders({ plan, kit, rows, menutype })
  const words = new Map(copySlots.map((s) => [s.slot, visibleText(s.items.join(' '))]))
  const titles = new Map(each(kit?.pages).map((p) => [p.id, words.get(p.titleSlot)]))
  // content.update owns Joomla's tree move and its undo. Read the parent back before changing any address.
  for (const order of orders) {
    if (!order.move || order.reason) continue
    try {
      await call('content.update', {
        apply_id: `page-route-${digest(order.pageId)}`,
        kind: 'menuItem',
        id: order.itemId,
        fields: { parent_id: order.move.after }
      })
      const current = (await call('content.get', { kind: 'menuItem', id: order.itemId }))?.item
      if (Number(current?.parent_id) !== order.move.after)
        throw new Error('the plugin did not move the menu item to the planned parent')
      order.move.outcome = 'written'
      rows = rows.map((r) => (Number(r.id) === order.itemId ? { ...r, parent_id: order.move.after } : r))
    } catch (error) {
      order.move.outcome = 'refused'
      order.reason = `the page could not take its planned menu parent: ${error.message}`
    }
  }
  const landed = new Map(orders.filter((o) => o.move?.outcome === 'written').map((o) => [o.itemId, o.alias]))
  const routes = []
  const articlePages = []
  for (const order of orders) {
    const { alias: _alias, clear, ...entry } = order
    if (order.reason) {
      routes.push({ ...entry, outcome: 'refused' })
      continue
    }
    const applyId = `page-route-${digest(order.pageId)}`
    // A page its parent item opens takes the slug as its article's alias (card P).
    if (order.via === 'article') {
      const { id: _id, ...article } = await renameArticle(call, applyId, order.articleId, order.slug)
      routes.push({ ...entry, ...article })
      if (article.outcome !== 'refused') articlePages.push(order)
      continue
    }
    // A url sibling holding the slug takes another alias first; when it cannot, the page is not renamed (card P).
    if (clear) {
      entry.cleared = await freeHolder(call, applyId, clear)
      if (entry.cleared.outcome === 'refused') {
        const reason = `menu item ${clear.itemId}, a url item, holds the alias ${order.slug} and could not take ${clear.to}: ${entry.cleared.reason}`
        routes.push({ ...entry, outcome: 'refused', reason })
        continue
      }
    }
    const item = await renameItem(call, applyId, order)
    if (item.outcome !== 'refused') landed.set(order.itemId, order.slug)
    // Breadcrumbs print the menu title, rather than its SEO title. Use the writer's actual page heading.
    let title = null
    const name = titles.get(order.pageId)
    if (name) {
      try {
        await call('content.update', {
          apply_id: applyId,
          kind: 'menuItem',
          id: order.itemId,
          fields: { title: name }
        })
        const held = (await call('content.get', { kind: 'menuItem', id: order.itemId }))?.item?.title
        if (held !== name) throw new Error('the menu kept its demo title after the write')
        title = { ordered: name, outcome: 'written' }
      } catch (error) {
        title = { ordered: name, outcome: 'refused', reason: error.message }
      }
    }
    const article = order.articleId ? await renameArticle(call, applyId, order.articleId, order.slug) : null
    routes.push({ ...entry, ...item, ...(title ? { title } : {}), ...(article ? { article } : {}) })
  }
  const at = keptAt(keptPages, { kit, rows, landed, menutype })
  const where = new Map(at.map((p) => [p.id, p.path]))
  const byId = new Map(rows.map((r) => [Number(r.id), r]))
  for (const order of articlePages) {
    const parent = byId.get(order.parentItemId)
    if (parent) where.set(order.pageId, `${addressAfter(parent, rows, landed)}/${order.slug}`)
  }
  at.forEach((p, i) => {
    if (where.get(p.id) !== p.path) at[i] = { ...p, path: where.get(p.id) }
  })
  // `to` is where the page answers now: the plan's address when its rename landed, the demo's when it did not, and under its
  // parent's new address when only the parent was renamed (card AE).
  for (const route of routes) route.to = where.get(route.pageId) ?? route.to
  return { routes, lines: routeLines(routes), keptPages: at }
}

/**
 * Before the other stages of a rerun: each page the last report renamed takes its demo alias again, so the stages that find a
 * page by the kit's address find it. The route stage at the end renames it again.
 * @param {{ door: { apply: Function }, siteKey: string, routes: object[] | undefined }} input the last report's route table
 * @returns {Promise<{ restored: object[], stop?: { code: string, reason: string } }>}
 */
export async function restoreRoutes({ door, siteKey, routes }) {
  const renamed = each(routes).filter(
    (r) =>
      (r?.itemId || (r?.via === 'article' && r.articleId)) &&
      (r.move?.outcome === 'written' ||
        (['written', 'already'].includes(r.outcome) && lastPart(r.from) && lastPart(r.from) !== r.slug))
  )
  if (!renamed.length) return { restored: [] }
  const call = doorCall(door, siteKey)
  const restored = []
  for (const route of renamed) {
    const alias = lastPart(route.from)
    try {
      if (route.move?.outcome === 'written') {
        await call('content.update', {
          apply_id: `page-route-${digest(route.pageId)}`,
          kind: 'menuItem',
          id: route.itemId,
          fields: { parent_id: route.move.before }
        })
        const current = (await call('content.get', { kind: 'menuItem', id: route.itemId }))?.item
        if (Number(current?.parent_id) !== route.move.before)
          throw new Error('the original menu parent was not restored')
      }
      if (!route.itemId) {
        const back = await renameArticle(call, `page-route-${digest(route.pageId)}`, route.articleId, alias)
        if (back.outcome === 'refused') throw new Error(back.reason)
        restored.push(route)
        continue
      }
      const answer = await call('content.update', {
        apply_id: `page-route-${digest(route.pageId)}`,
        kind: 'menuItem',
        id: route.itemId,
        fields: { alias }
      })
      if (answer?.alias !== alias) throw new Error(answerWords(answer))
      restored.push(route)
    } catch (error) {
      return {
        restored,
        stop: {
          code: 'ROUTE_RESTORE_FAILED',
          reason: `${route.pageId} could not take its demo address ${route.from} back before the rerun: ${error.message}`
        }
      }
    }
  }
  return { restored }
}
