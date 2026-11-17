// The pages of the template the plan does not keep, as the owner reads them in the left out list, written by code
// alone (#575 walk, fourth round: two identical walks showed 9 and 16 left out lines because the model named pages in
// the owner's language and a matcher read page names in English). Nothing here reads the model's words:
// - the pages left out are the template's page types (`recipes`) minus the page types the plan keeps, minus the ones a
//   caller already reports (`except`: a page the owner asked to remove);
// - a detail page type (one page per item: a single post, a single author, a single trainer) is never listed: the
//   page of its list says it already. A type is a detail page when the template repeats it per item (`itemPageTypesOf`)
//   or when its pages lie under the pages of another type whose main block shows the same kind of item (the trainer
//   page under the trainers page);
// - the reason comes from the data: a page whose main block shows a kind of item the business has none of has nothing
//   to show (`page_nothing_to_show`); any other page is one the plan does not need (`page_not_planned`). One reason per
//   kind of page, so the plan card says the pages left out for one reason in one line;
// - a page is named by the template's own name of its type ("News post" for `news-post`), carried in `params.page`:
//   site content, never translated by the card.
// The model's own left out entries of pages are dropped before (`plan-left-out-keyed.mjs`). Pure.
import { BLOCK_TYPES } from './place-content-roles.mjs'
import { itemPageTypesOf } from './write-order-targets.mjs'

export const PAGE_NOTHING_TO_SHOW = Object.freeze({
  code: 'page_nothing_to_show',
  reason: 'You have nothing yet for these pages to show.'
})
export const PAGE_NOT_PLANNED = Object.freeze({
  code: 'page_not_planned',
  reason: 'Your plan does not need these pages.'
})

const list = (value) => (Array.isArray(value) ? value : [])
const kindOfMain = (recipe, blocks) => BLOCK_TYPES[blocks?.get(recipe?.mainBlock)?.type]?.itemKind ?? null

/** The page types of the template that are one page per item. */
export function detailPageTypesOf(recipes, blocks) {
  const all = [...(recipes?.values?.() ?? [])]
  const detail = itemPageTypesOf(all)
  for (const recipe of all) {
    const kind = kindOfMain(recipe, blocks)
    const from = list(recipe.from)
    if (!kind || from.length === 0) continue
    const under = (other) =>
      other !== recipe &&
      kindOfMain(other, blocks) === kind &&
      from.every((page) => list(other.from).some((parent) => page.startsWith(`${parent}_`)))
    if (all.some(under)) detail.add(recipe.pageType)
  }
  return detail
}

/** The template's name of a page type: its words, the first one capitalised (`news-post` is "News post"). */
export function pageNameOf(pageType) {
  const words = String(pageType).replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The left out entries of the template's pages the plan does not keep, in the template's page order.
 * @param {{recipes: Map<string, object>, blocks: Map<string, object>, data: {items?: object[]}, pages: object[],
 *   except?: Set<string>}} input `pages`: the plan's final pages; `except`: page types reported already
 * @returns {Array<{what: string, kind: 'page', reason: string, code: string, params: {page: string}}>}
 */
export function kitPagesLeftOut({ recipes, blocks, data, pages, except = new Set() }) {
  const kept = new Set(list(pages).map((p) => p.pageType))
  const detail = detailPageTypesOf(recipes, blocks)
  const kinds = new Set(list(data?.items).map((i) => i.kind))
  const out = []
  for (const recipe of recipes?.values?.() ?? []) {
    const type = recipe?.pageType
    if (typeof type !== 'string' || kept.has(type) || except.has(type) || detail.has(type)) continue
    const kind = kindOfMain(recipe, blocks)
    const { code, reason } = kind && !kinds.has(kind) ? PAGE_NOTHING_TO_SHOW : PAGE_NOT_PLANNED
    const page = pageNameOf(type)
    out.push({ what: `${page} page`, kind: 'page', reason, code, params: { page } })
  }
  return out
}
