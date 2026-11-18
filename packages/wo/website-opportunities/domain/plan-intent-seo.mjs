// The search terms of every page (#575, plan stage restore of the step chain's `pages[].seo.searchTerms`,
// planner-prompt.md lines 343 and 412 to 413), made by code from the plan's data instead of the model: what the page
// offers (the names of the services, packages or dishes it shows, else the business's first ones) with the town of
// the address the site shows (`cityOf`, the research brief's own reading of a town), else the business name. The
// model writes only what the title and the description must get across (`titleIntent`, `descriptionIntent`).
//
// The owner may add and take off terms on the plan card (#575): a page then keeps its marks, `seo.ownerAdded` (the
// terms the owner typed) and `seo.ownerRemoved` (terms code makes that the owner took off). Each time the terms are
// made again from the data, the terms code makes stay made again (a renamed service reads its new name), except those
// the owner took off, and the owner's own terms follow them: an edit never writes over the owner's choice. Pure.
import { cityOf } from './brief.mjs'

const OFFER_KINDS = new Set(['service', 'package', 'menu_item'])
/** At most this many terms a page, each at most this long (Contract B `searchTerms[]`). */
const TERMS_MAX = 4
const TERM_LENGTH = 60

const fits = (term) => [...term].length <= TERM_LENGTH

/**
 * The search terms of one page.
 * @param {object} page a plan page
 * @param {{data: object, shownAddress: string | null}} context
 * @returns {string[]}
 */
export function searchTermsOf(page, { data, shownAddress }) {
  const offerOf = (id) => {
    const record = data.byId.get(id)
    return record?.what === 'item' && OFFER_KINDS.has(record.kind) ? record.entry.label : null
  }
  const own = page.blocks.flatMap((b) => b.data.map(offerOf)).filter(Boolean)
  const all = data.items.filter((i) => OFFER_KINDS.has(i.kind)).map((i) => i.label)
  const offers = [...new Set(own.length ? own : all)].slice(0, TERMS_MAX)
  const town = shownAddress ? cityOf(shownAddress) : null
  const terms = offers.map((o) => (town && fits(`${o} ${town}`) ? `${o} ${town}` : o)).filter(fits)
  if (terms.length) return terms
  const name = data.facts.find((f) => f.kind === 'business.name')?.value
  const named = [name && town ? `${name} ${town}` : name].filter((t) => t && fits(t))
  return named.length ? named : name ? [[...name].slice(0, TERM_LENGTH).join('').trim()] : []
}

/** The most search terms a page holds once the owner added their own. */
export const SEARCH_TERMS_MAX = 10

const list = (value) => (Array.isArray(value) ? value : [])

/** The address a page's terms name the town of: the address some page shows. */
function shownAddressOf(pages, data) {
  const shown = new Set(pages.flatMap((p) => p.blocks.flatMap((b) => b.data)))
  return data.facts.find((f) => f.kind === 'contact.address' && shown.has(f.id))?.value ?? null
}

/**
 * A page's terms from the terms code makes and the owner's marks: code's terms but those the owner took off, then the
 * owner's own. Code's terms alone when the marks would leave none (the data changed under them).
 */
function markedTerms(made, seo) {
  const removed = new Set(list(seo?.ownerRemoved))
  const kept = made.filter((t) => !removed.has(t))
  const terms = [...new Set([...kept, ...list(seo?.ownerAdded)])].slice(0, SEARCH_TERMS_MAX)
  return terms.length ? terms : made
}

/** The marks a page keeps, true to its terms: an added term among them, a taken off one not. */
function marksOf(seo, terms) {
  const added = list(seo?.ownerAdded).filter((t) => terms.includes(t))
  const removed = list(seo?.ownerRemoved).filter((t) => !terms.includes(t))
  return {
    ...(added.length ? { ownerAdded: added } : {}),
    ...(removed.length ? { ownerRemoved: removed } : {})
  }
}

/**
 * The marks of the terms the owner set on one page: `typed` is the page's new list, `made` the terms code makes for
 * it, `before` the page's seo before the edit. A typed term code does not make is the owner's; a term code makes and
 * the owner left out is taken off, and stays off until the owner types it again.
 */
export function ownerTermsOf(typed, made, before) {
  const ownerAdded = typed.filter((t) => !made.includes(t))
  const ownerRemoved = [
    ...new Set([...list(before?.ownerRemoved), ...made.filter((t) => !typed.includes(t))])
  ].filter((t) => !typed.includes(t))
  return { ownerAdded, ownerRemoved }
}

/** The terms code makes for each page of `pages`, by page id, before the owner's marks. */
export function madeTermsOf(pages, data) {
  const shownAddress = shownAddressOf(pages, data)
  return new Map(pages.map((p) => [p.id, searchTermsOf(p, { data, shownAddress })]))
}

/** Each page with its `seo`: the model's intents and the terms code makes; no `seo` on a page without a term. */
export function withSearchTerms(pages, data) {
  const made = madeTermsOf(pages, data)
  return pages.map((page) => {
    const searchTerms = markedTerms(made.get(page.id) ?? [], page.seo)
    const { seo, ...rest } = page
    if (!searchTerms.length) return rest
    const { ownerAdded: _added, ownerRemoved: _removed, ...intents } = seo ?? {}
    return { ...rest, seo: { ...intents, searchTerms, ...marksOf(seo, searchTerms) } }
  })
}
