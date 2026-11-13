// The shape of a name (decision D46, #609): a name or value field of a reading (a service, an audience, a person, a
// role, a place, a price) is exempt from the echo guard only while it has the shape of a name or value. A field that
// holds a sentence of the owner instead is prose: its fact goes to `ownerFacts` ("say it in other words") and the field
// never reaches copy as it was typed. Pure; imports the echo guard only. Table: section 6.2 of
// `docs/references/building-a-site-from-a-business.md`.
//
// 🔒 THE RULE, per field, by weight (`owner-echo.mjs tokensOf`: a word is 1, a Han character 1/2, a Thai one 1/4).
//   - ECHO (every item): a field that copies the owner by a run of weight 7 or more, or holds in order 60% of an owner
//     sentence of weight 8 or more and weight 7 of it, is prose. A field of six words or fewer never fails it: an owner
//     item's name is taken from the owner's words, so a name of six words is always a run of six.
//   - For an item the owner's statement stands on only (a public text's long name is that text's, not the owner's):
//     WORDS, a field heavier than its limit (`NAME_SHAPE_LIMITS`); and three cheap signals (English for the third):
//     CUT, a value at the reading's cap (`LABEL_CAP`) that ends inside a word; TWO SENTENCES, a word of three lower case
//     letters or more ending a sentence, then more words (`Rd. Velmora` and `Mrs. Vey` stay names); CLAUSE, a value
//     of weight 4 or more that opens with a subject pronoun, or whose first one or two words are followed by `is`,
//     `are`, `was` or `were` (`Mira Solent is our ...`; `people who are new` stays a name).
import { copiesOwner, tokensOf } from './owner-echo.mjs'

/** The heaviest each name or value field may be (a service name, a price, a person, a role, a place, an audience). */
export const NAME_SHAPE_LIMITS = Object.freeze({
  services: Object.freeze({ label: 8, price: 6 }),
  audience: Object.freeze({ label: 6 }),
  team: Object.freeze({ label: 5, role: 6 }),
  serviceAreas: Object.freeze({ label: 6 })
})
/** The echo limits of a name: heavier than the copy limits (`copiesOwner`), so a short name taken whole stands. */
export const NAME_ECHO_LIMITS = Object.freeze({ run: 7, sentence: 8, least: 7, min: 7 })
/** The reading's cap on a label (`business-reading.mjs MAX_LABEL`): a value this long may have been cut. */
export const LABEL_CAP = 80
/** Why a name field was taken out (`ownerEchoDropped[].why`). */
export const NAME_SHAPE_WHY = 'owner_prose_in_name_field'

const weightOf = (text) => tokensOf(text).reduce((n, x) => n + x.w, 0)
const WORDLIKE = /[\p{L}\p{N}]/u
const TWO_SENTENCES = /\p{Ll}{3,}[.!?]\s+[\p{L}\p{N}]|[。！？]\s*[\p{L}\p{N}]/u
const PRONOUN = /^(?:we|i|you|they|he|she|it|us|our team)\s+\p{L}/iu
const COPULA = /^\S+(?:\s+(?!(?:who|that|which)\s)\S+)?\s+(?:is|are|was|were)\s/iu

/**
 * A value as whole words (pure): a value at the reading's cap that ends inside a word of the quote it was read from
 * (or of no quote) loses that part of a word. Shorter values, or ones that end on a whole word, are as they are.
 * @param {string} text
 * @param {string[]} quotes the owner's quotes the item stands on
 */
export function wholeWordsOf(text, quotes = []) {
  const value = String(text ?? '')
  if (value.length < LABEL_CAP || !WORDLIKE.test(value.at(-1) ?? '')) return value
  const low = value.toLowerCase()
  const at = quotes.map((q) => [String(q), String(q).toLowerCase().indexOf(low)]).find(([, n]) => n >= 0)
  if (at && !WORDLIKE.test(at[0][at[1] + value.length] ?? '')) return value
  return value.replace(/\s*[\p{L}\p{N}]+$/u, '').trim()
}

/**
 * Whether a name or value field is no name (the rule above), or false.
 * @param {string} value
 * @param {{group: string, field: string, echo?: object, publicTexts?: string[], owner?: boolean, quotes?: string[]}} at
 * @returns {false | {rule: 'words' | 'run' | 'sentence' | 'cut' | 'two-sentences' | 'clause', weight: number}}
 */
export function nameShapeProblem(
  value,
  { group, field, echo, publicTexts = [], owner = false, quotes = [] }
) {
  const limit = NAME_SHAPE_LIMITS[group]?.[field]
  if (!limit || typeof value !== 'string' || !value.trim()) return false
  const weight = weightOf(value)
  if (owner && weight > limit) return { rule: 'words', weight }
  const echoed = echo ? copiesOwner(value, echo, publicTexts, NAME_ECHO_LIMITS) : false
  if (echoed) return echoed
  if (!owner) return false
  if (wholeWordsOf(value, quotes) !== value) return { rule: 'cut', weight }
  if (TWO_SENTENCES.test(value.trim().replace(/[.!?。！？]+$/u, ''))) return { rule: 'two-sentences', weight }
  if (weight >= 4 && (PRONOUN.test(value.trim()) || COPULA.test(value.trim())))
    return { rule: 'clause', weight }
  return false
}
