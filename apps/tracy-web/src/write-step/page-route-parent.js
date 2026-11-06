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
 * The order of a kept page no menu item of its own opens, or null when no parent item opens the page above it either.
 * @returns {null | { via: 'article', articleId: number | null, parentItemId: number, parentRow: object, reason?: string }}
 */
export function parentOrder(kitPage, { kit, rows, menutype }) {
  const parts = trimmed(kitPage.path).split('/')
  if (parts.length < 2) return null
  const [parentRow] = rowsOpening({ path: `/${parts.slice(0, -1).join('/')}` }, rows, menutype)
  if (!parentRow) return null
  const articleId = articleOfPage(kitPage, kit)
  return {
    via: 'article',
    articleId,
    parentItemId: Number(parentRow.id),
    parentRow,
    ...(articleId ? {} : { reason: CATEGORY_DOOR })
  }
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
