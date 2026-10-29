// The lines of an offering's card or page that talk about the business's OTHER offerings (spec TracyHQ/tracy#189). Measured
// 29/10/2026 on a local brief build (a coaching club on a Joomla T4 template): the "Swimming lessons" card read "Pick tennis,
// padel, swimming or fitness and train one to one", because the writer was told the whole business and not the card's
// offering. A card is written from its own offering; a line that names another offering of the brief is flagged, wherever
// it came from (the writer, a fallback, the business's own description).
//
// The binding is the site plan's (`honesty.cardNames`): a card's group id, or `<record>.offering` for an offering's own page.
// Rules by words only, never by trade or template. Pure and deterministic.
import { GENERIC_LABEL_WORDS, wordsOf } from './honest-written.mjs'

/**
 * The words that name each offering and no other: a word two offerings share ("lessons" in "Swimming lessons" and
 * "Fitness lessons") names neither, nor does an interface word.
 * @param {string[]} names
 * @returns {Map<string, Set<string>>}
 */
export function offeringWords(names) {
  const unique = [...new Set(names.filter((n) => typeof n === 'string' && n.trim() !== ''))]
  const own = new Map(
    unique.map((name) => [
      name,
      new Set(wordsOf(name).filter((w) => /^\p{L}{3,}$/u.test(w) && !GENERIC_LABEL_WORDS.has(w)))
    ])
  )
  /** @type {Map<string, number>} */
  const seen = new Map()
  for (const words of own.values()) for (const w of words) seen.set(w, (seen.get(w) ?? 0) + 1)
  for (const words of own.values()) for (const w of words) if ((seen.get(w) ?? 0) > 1) words.delete(w)
  return own
}

/**
 * The offering a slot belongs to, read from the card names, or null.
 * @param {{entity?: string, group?: {id?: string} | null}} slot
 * @param {Record<string, string>} cardNames
 */
export function offeringOfSlot(slot, cardNames) {
  const named = (key) =>
    typeof cardNames?.[key] === 'string' && cardNames[key].trim() !== '' ? cardNames[key] : null
  return named(String(slot?.group?.id ?? '')) ?? named(`${slot?.entity ?? ''}.offering`)
}

/**
 * The other offerings a line names, given the offering its card is about (empty when it names none).
 * @param {string} text
 * @param {string} offering
 * @param {Map<string, Set<string>>} words - `offeringWords` of every offering
 * @returns {string[]}
 */
export function otherOfferingsIn(text, offering, words) {
  const said = new Set(wordsOf(text))
  return [...words]
    .filter(([name, own]) => name !== offering && [...own].some((w) => said.has(w)))
    .map(([name]) => name)
}

/**
 * Every text line of an offering's card or page that names another offering of the business.
 * @param {object} input
 * @param {Array<{key: string, entity?: string, type?: string, group?: any}>} input.slots
 * @param {Record<string, string>} input.written - the words about to be written, by slot key
 * @param {Record<string, string> | null | undefined} input.cardNames - the site plan's (`honesty.cardNames`)
 * @returns {Array<{key: string, offering: string, names: string[]}>}
 */
export function offeringCrossTalk({ slots, written, cardNames }) {
  const words = offeringWords(Object.values(cardNames ?? {}))
  if (words.size < 2) return []
  const out = []
  for (const slot of slots) {
    const text = written?.[slot.key]
    if (slot.type !== 'text' || typeof text !== 'string') continue
    const offering = offeringOfSlot(slot, cardNames ?? {})
    if (!offering) continue
    const names = otherOfferingsIn(text, offering, words)
    if (names.length > 0) out.push({ key: slot.key, offering, names })
  }
  return out
}
