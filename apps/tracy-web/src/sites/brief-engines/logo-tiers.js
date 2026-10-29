/**
 * The two tiers of a logo Tracy makes (spec TracyHQ/tracy#189, COO 29/10/2026): the business name on top, and under it a
 * short descriptor line naming the kind of business ("BOXING GYM").
 *
 *   kindOf(business)    the kind of business a brief already states, in one to three words: its sub-trade's or trade's
 *                       noun (`website-opportunities` `businessWords`), a restaurant's single cuisine; null when the brief
 *                       says nothing reliable (no trade, or a trade whose noun is only "business")
 *   tiersOf(name, kind) the name and the descriptor: a name that already ends in its kind is split instead ("Saigon Iron
 *                       Boxing Gym" gives "Saigon Iron" over "Boxing Gym"); a name that holds the kind elsewhere gets no
 *                       descriptor (it would say the word twice)
 *
 * 🔒 NO WORD IS INVENTED: the descriptor is a fact of the brief or words of the name, never a model's.
 */
import { businessWords } from 'website-opportunities/domain/trade-words.mjs'

/** The most words a descriptor may hold. */
const MOST_WORDS = 3
/** Nouns that name no kind of business. */
const VAGUE = new Set(['business'])

const wordsOf = (/** @type {string} */ s) => s.trim().split(/\s+/).filter(Boolean)
const bare = (/** @type {string} */ w) => w.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

/** @param {any} business - the brief's `business` @returns {string | null} */
export function kindOf(business) {
  const trade = typeof business?.trade === 'string' ? business.trade.trim() : ''
  if (trade && trade !== 'unknown' && trade !== 'other') {
    const noun = String(businessWords(business)?.noun ?? '').trim()
    return noun && !VAGUE.has(noun) && wordsOf(noun).length <= MOST_WORDS ? noun : null
  }
  // A food brief states no trade (the trade is food by default); only its cuisine says it is a restaurant for certain.
  const cuisine = Array.isArray(business?.cuisine)
    ? business.cuisine.filter((c) => typeof c === 'string' && c.trim())
    : []
  if (!cuisine.length) return null
  const kind = cuisine.length === 1 ? `${cuisine[0].trim()} restaurant` : 'restaurant'
  return wordsOf(kind).length <= MOST_WORDS ? kind : 'restaurant'
}

/**
 * @param {string} name @param {string | null | undefined} kind
 * @returns {{name: string, descriptor: string | null}}
 */
export function tiersOf(name, kind) {
  const clean = String(name ?? '').trim()
  const words = wordsOf(clean)
  const kindWords = wordsOf(String(kind ?? '')).map(bare)
  const last = kindWords.at(-1)
  if (!last) return { name: clean, descriptor: null }
  const at = words.map(bare).lastIndexOf(last)
  if (at === -1) return { name: clean, descriptor: String(kind).trim() }
  if (at !== words.length - 1 || words.length < 2) return { name: clean, descriptor: null }
  // The name ends in its kind: the kind's word and the one before it (when two stay on top) go under.
  const cut = words.length >= 3 ? words.length - 2 : words.length - 1
  return { name: words.slice(0, cut).join(' '), descriptor: words.slice(cut).join(' ') }
}
