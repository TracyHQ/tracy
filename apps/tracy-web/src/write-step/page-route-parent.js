// Two kinds of kept page the route stage could not rename through its own menu item (card P; page-route-stage.js).
//
// A page with no menu item of its own, reached through its parent's (an article under a category item: `/classes/tennis` is
// item `classes` plus the article's alias), takes the slug as its ARTICLE's alias through `content.update`, which the plugin
// opens for an article. A category view under its parent has no such door: the plugin keeps a category's alias closed (its
// path chain is derived from it), so that page is refused naming the missing door.
//
// A slug held by a sibling menu item of type url is freed first: a url item routes nothing, so its alias is only a label in the
// menu manager, and it takes `<slug>-link` (unique among its siblings). A routed sibling holding the slug is never touched.
import { articleOfPage, rowsOpening } from './page-meta-write.js'

const trimmed = (path) => String(path ?? '').replace(/^\/+|\/+$/g, '')
const aliasOf = (row) => String(row?.alias ?? trimmed(row?.path).split('/').at(-1) ?? '')

/** The plugin keeps `alias` closed on a category (JoomlaSiteWriter MAP), so a category view cannot take a slug. */
export const CATEGORY_DOOR =
  "the page is a category view, and the plugin's content.update does not take alias for a category, so renaming it needs that door"

/**
 * The order of a kept page no menu item of its own opens, or null when no item above it opens a page either. The nearest
 * ancestor an item opens is the parent: a blog post under a category blog item answers at the item, its category's path and
 * its own last part (`/our-blog/2-restaurant-business/4-world-coffee-day`), and only that last part is the article's. Where the
 * router prints the article's id before its alias (`4-`), the id stays and the slug follows it (`between`, `idPrefix`).
 * Dev lat32 (23/11/2026): JA Diner's three kept posts sat one category below the blog item, and each was refused as a page no
 * item opens (18 read-back blocks).
 * @returns {null | { via: 'article', articleId: number | null, parentItemId: number, parentRow: object, between?: string[],
 *   idPrefix?: string, reason?: string }}
 */
export function parentOrder(kitPage, { kit, rows, menutype }) {
  const parts = trimmed(kitPage.path).split('/')
  if (parts.length < 2) return null
  const articleId = articleOfPage(kitPage, kit)
  for (let cut = parts.length - 1; cut >= 1; cut--) {
    const [parentRow] = rowsOpening({ path: `/${parts.slice(0, cut).join('/')}` }, rows, menutype)
    if (!parentRow) continue
    const between = parts.slice(cut, -1)
    const idPrefix = articleId && parts.at(-1).startsWith(`${articleId}-`) ? `${articleId}-` : ''
    return {
      via: 'article',
      articleId,
      parentItemId: Number(parentRow.id),
      parentRow,
      ...(between.length ? { between } : {}),
      ...(idPrefix ? { idPrefix } : {}),
      ...(articleId ? {} : { reason: CATEGORY_DOOR })
    }
  }
  return null
}

/** Where an article page answers under its parent item's address once its article holds `slug`. */
export const articleAddress = (parentAddress, order) =>
  [
    String(parentAddress).replace(/\/+$/, ''),
    ...(order.between ?? []),
    `${order.idPrefix ?? ''}${order.slug}`
  ].join('/')

/** The alias an article page's article held on the demo: the last part of its address, without the id the router prints. */
export function demoArticleAlias(route) {
  const last = trimmed(route?.from).split('/').at(-1) ?? ''
  const prefix = route?.idPrefix ?? ''
  return prefix && last.startsWith(prefix) ? last.slice(prefix.length) : last
}

/** The alias a url sibling holding `slug` takes: `<slug>-link`, numbered when a sibling already answers at that. */
export function freeAlias(slug, siblings) {
  const held = new Set(siblings.map(aliasOf))
  for (let n = 1; n < 100; n++) {
    const alias = n === 1 ? `${slug}-link` : `${slug}-link-${n}`
    if (!held.has(alias)) return alias
  }
  return null
}

/** The url sibling takes its free alias; the answer must name it, as the route stage's own renames are judged. */
export async function freeHolder(call, applyId, clear) {
  const base = { itemId: clear.itemId, from: clear.from, to: clear.to }
  try {
    const answer = await call('content.update', {
      apply_id: applyId,
      kind: 'menuItem',
      id: clear.itemId,
      fields: { alias: clear.to }
    })
    return answer?.alias === clear.to
      ? { ...base, outcome: 'written' }
      : { ...base, outcome: 'refused', reason: `the plugin kept the alias ${answer?.alias ?? clear.from}` }
  } catch (error) {
    return { ...base, outcome: 'refused', reason: String(error?.message ?? error) }
  }
}
