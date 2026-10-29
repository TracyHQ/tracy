// Sharper reads of three leftover kinds (ticket #192 of spec #189): the demo offering card (C03), the decorative words of a
// label (C09) and the demo fact (C17). They add to the slot reads of `demo-leftovers.mjs` what a content map cannot say, and
// leave out what is no leftover. Rules by role and by the words of the page, never by template. Pure.
//
//   C03  filler text (lorem ipsum) on a page that is no sample page: a card the demo wrote and nobody rewrote
//   C09  a label is a leftover only when its demo sample holds a word of its own (`demoWordsOf`): "View more", "About us"
//        or "Contact" are interface words every business uses, "Try a boxing class" is the demo's
//   C17  a price on the page the brief does not hold, wherever the content map has no slot for it
import { demoWordsOf, wordsOf } from './honest-written.mjs'
import { pageRole } from './page-plan.mjs'

const LOREM = /\blorem ipsum\b/
/** A price as a page prints it: a currency sign or code beside a figure. */
const PRICE = /(?:[$€£¥]\s?\d[\d.,]*|\b\d[\d.,]*\s?(?:usd|eur|gbp|aed|chf)\b)/g

const isSample = (page) =>
  page.path !== '/' && pageRole({ id: page.path.replace(/^\/+|\/+$/g, '') }) === 'sample'

/** C03: the offering cards' slot findings, and filler text on a page of the site. */
export function offeringLeftovers(ctx, slotFindings) {
  const out = [...slotFindings]
  for (const page of ctx.served)
    if (!isSample(page) && LOREM.test(page.text))
      out.push({ page: page.path, place: 'lorem ipsum', found: 'lorem ipsum' })
  return out
}

/** C09: the label findings whose demo sample holds a word of the demo's own (no interface word, no word of the brief). */
export function labelLeftovers(ctx, slotFindings) {
  const own = new Set(wordsOf(ctx.demo.own))
  const sampleOf = new Map(ctx.demo.slots.map(({ slot }) => [slot.key, slot.sample]))
  return slotFindings.filter((f) => demoWordsOf(sampleOf.get(f.place), own).length > 0)
}

/** C17: a printed price the brief does not hold, beside the fact findings already made. */
export function priceLeftovers(ctx, findings) {
  const out = [...findings]
  const ownDigits = ctx.demo.own.replace(/\D+/g, '')
  for (const page of ctx.served)
    for (const price of new Set(page.text.match(PRICE) ?? [])) {
      const digits = price.replace(/\D+/g, '')
      if (digits === '' || ownDigits.includes(digits)) continue
      if (out.some((f) => f.page === page.path && String(f.found).includes(price.trim()))) continue
      out.push({ page: page.path, place: 'price', found: price.trim() })
    }
  return out
}
