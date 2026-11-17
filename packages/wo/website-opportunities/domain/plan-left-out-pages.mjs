// The model's left out pages as the owner reads them (#575 walk, second round: 12 of 22 left out lines were pages of
// the template, one per page, a single post, a single author and a single trainer among them):
// - a page entry is matched to the template's page type it names (`news-post page`, `News post page`, `Plans`), and
//   carries the page's name in `params.page`, so the plan card says it inside a sentence of the owner's language and
//   groups the pages left out for one reason into one line;
// - a detail page type (one page per item: a single post, a single author, a single trainer) is never listed: the
//   page of its list says it already. A type is a detail page when the template repeats it per item (`itemPageTypesOf`)
//   or when its pages lie under the pages of another type whose main block shows the same kind of item (the trainer
//   page under the trainers page). A recorded fix (`left_out_detail_page`): nothing the site shows changes;
// - a page whose main block shows a kind of item the business has none of says so in code's words
//   (`page_nothing_to_show`), the same reason for every such page, so they read as one line.
// Pure.
import { BLOCK_TYPES } from './place-content-roles.mjs'
import { itemPageTypesOf } from './write-order-targets.mjs'

export const PAGE_NOTHING_TO_SHOW = Object.freeze({
  code: 'page_nothing_to_show',
  reason: 'You have nothing yet for these pages to show.'
})
export const DETAIL_PAGE_FIX = 'left_out_detail_page'

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

/** The page type a left out page entry names, or null: its slug, or its words joined by hyphens, " page" set aside. */
export function pageTypeOfEntry(what, recipes) {
  const said = String(what ?? '')
    .trim()
    .toLowerCase()
  const bare = said.replace(/\s+page$/, '')
  for (const candidate of [said, bare, bare.replace(/\s+/g, '-')])
    if (recipes?.has(candidate)) return candidate
  return null
}

const pageNameOf = (pageType) => {
  const words = pageType.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * A model page entry as the owner reads it, or null when it is a detail page and is not listed.
 * @param {{what: string, reason: string}} entry
 * @param {{recipes?: Map<string, object>, blocks: Map<string, object>, data: object, at: string,
 *   fix: (entry: object) => void}} context
 * @returns {{what: string, page?: string, derived?: {code: string, reason: string}} | null}
 */
export function pageLeftOutOf(entry, { recipes, blocks, data, at, fix }) {
  const pageType = pageTypeOfEntry(entry.what, recipes)
  if (!pageType) return { what: entry.what }
  if (detailPageTypesOf(recipes, blocks).has(pageType)) {
    const rule =
      'a page of one item (a single post, a single author) is never listed: the page of its list says it'
    fix({ code: DETAIL_PAGE_FIX, at, rule, was: entry.what, now: null })
    return null
  }
  const page = pageNameOf(pageType)
  const kind = kindOfMain(recipes.get(pageType), blocks)
  const none = kind && !list(data?.items).some((i) => i.kind === kind)
  return { what: `${page} page`, page, ...(none ? { derived: PAGE_NOTHING_TO_SHOW } : {}) }
}
