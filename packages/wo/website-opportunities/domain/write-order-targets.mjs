// The page a derived link of the write order opens (ticket #597). Pure and deterministic: the same plan always gives
// the same target.
//
//   the page of the row   a row keyed to a page opens its planned row's page (#615); a block field keyed with a
//                         `pageType` opens the first page of that type; else the page it is on.
//   the page address      an item that is a page (a menu entry) opens that page.
//   the item page address the item's own page: a page other than the home page that shows that item and no other
//                         item, looked for over the whole plan; a page of a type the template repeats per item (its
//                         recipe declares `pages` or `variants`) first, then plan order. Never the first page that
//                         merely shows the item in a list.
import { KEYED } from './ai-quickstart-field-keys.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/** The plan items a page shows, over all its blocks. */
function itemsOnPage(page, data) {
  const items = new Set()
  for (const block of list(page.blocks))
    for (const id of list(block.data)) if (data.byId.get(id)?.what === 'item') items.add(id)
  return items
}

/** The page types the template repeats per item, from its page recipes. */
export function itemPageTypesOf(pageRecipes) {
  const recipes = list(pageRecipes?.recipes ?? pageRecipes)
  return new Set(
    recipes.filter((r) => Number(r?.pages) > 1 || list(r?.variants).length > 0).map((r) => r.pageType)
  )
}

/** The item's own page, or null. */
export function itemPageOf(item, { pages, data, itemPageTypes = new Set() }) {
  const own = pages.filter((p, n) => {
    if (n === 0 || p.pageType === 'home') return false
    const items = itemsOnPage(p, data)
    return items.size === 1 && items.has(item)
  })
  return (own.find((p) => itemPageTypes.has(p.pageType)) ?? own[0])?.id ?? null
}

/** The page a derived link opens, or null. `ctx.pages`: the plan pages in order, the home page first. */
export function targetOf(at, field, ctx) {
  const { pages, page } = ctx
  if (field.derived === KEYED) {
    if (at.row) {
      const planned = ctx.plannedRows?.get(`${at.item ?? ''}|${at.row}`)?.page
      if (typeof planned === 'string') return pages.some((p) => p.id === planned) ? planned : null
      // A plan without planned rows (before #615): row n of a list keyed to the pages is the n-th page.
      return ctx.plannedRows?.size ? null : (pages[at.rank - 1]?.id ?? null)
    }
    if (field.pageType !== undefined) return pages.find((p) => p.pageType === field.pageType)?.id ?? null
    return page.id
  }
  if (at.item === undefined) return null
  if (field.derived === 'the page address' && pages.some((p) => p.id === at.item)) return at.item
  return itemPageOf(at.item, ctx)
}
