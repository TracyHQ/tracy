// The search terms of every page (#575, plan stage restore of the step chain's `pages[].seo.searchTerms`,
// planner-prompt.md lines 343 and 412 to 413), made by code from the plan's data instead of the model: what the page
// offers (the names of the services, packages or dishes it shows, else the business's first ones) with the town of
// the address the site shows (`cityOf`, the research brief's own reading of a town), else the business name. The
// model writes only what the title and the description must get across (`titleIntent`, `descriptionIntent`). Pure.
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

/** Each page with its `seo`: the model's intents and the terms code makes; no `seo` on a page without a term. */
export function withSearchTerms(pages, data) {
  const shown = new Set(pages.flatMap((p) => p.blocks.flatMap((b) => b.data)))
  const address = data.facts.find((f) => f.kind === 'contact.address' && shown.has(f.id))?.value ?? null
  return pages.map((page) => {
    const searchTerms = searchTermsOf(page, { data, shownAddress: address })
    const { seo, ...rest } = page
    if (!searchTerms.length) return rest
    return { ...rest, seo: { ...seo, searchTerms } }
  })
}
