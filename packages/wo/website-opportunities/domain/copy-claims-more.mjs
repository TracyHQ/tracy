// More claims of written copy the plan data must hold (#594 review W6), read by `claimsOf` (`copy-claims.mjs`) on the
// copy with its emails, links, phones and money taken out:
//   - a superlative of place: "the best bakery in town", "die beste Bäckerei der Stadt", "le meilleur atelier de
//     Valbrune", "el mejor taller de la ciudad", "il miglior studio di Milano", "o melhor estúdio de Lisboa"; a
//     superlative alone ("the best crumb") is no claim;
//   - a count after "over", "more than", "über", "plus de", "más de", "oltre", "più di", "mais de" (any number);
//   - a count of three digits or more written right before a plural noun ("300 loaves", "1.000 allievi"; never
//     "Room 101 is ready").
// A claim passes when the plan data holds its number (or, for a superlative, its words). Pure.
import { NUMBER_WORD, numberWordValue } from './copy-number-words.mjs'

const B = String.raw`(?<![\p{L}\p{N}])`
const E = String.raw`(?![\p{L}\p{N}])`
const re = (source) => new RegExp(source, 'giu')

const SUPERLATIVE = String.raw`best|beste[nrs]?|meilleure?s?|mejor(?:es)?|miglior[ei]?|melhor(?:es)?`
/** Where a superlative of place points: the town, the city, the area, or a place name. */
const PLACE = String.raw`(?:in|im|of|der|des|de|du|di|della|del|da|do|en)\s+(?:(?:the\s+|la\s+|le\s+)?(?:town|city|area|region|Stadt|Region|ville|région|ciudad|zona|città|cidade)${E}|\p{Lu}\p{L}+)`
const PLACE_CLAIM = re(String.raw`${B}(?:${SUPERLATIVE})${E}(?:\s+[\p{L}'-]+){0,4}?\s+${PLACE}`)
const NUMBER = String.raw`\d+(?:[.,\s]\d{3})*(?:[.,]\d+)?|${NUMBER_WORD}`
const OVER = re(
  String.raw`${B}(?:over|more\s+than|über|mehr\s+als|plus\s+de|más\s+de|oltre|più\s+di|mais\s+de)\s+(${NUMBER})${E}`
)
/** A plural noun right after the number: lowercase, ending as plurals do ("300 loaves", "1.000 allievi"). */
const BIG_COUNT = re(String.raw`${B}(\d{3,}|\d{1,3}(?:[.,\s]\d{3})+)\s*\+?\s+\p{Ll}{2,}(?:s|i|e|n|x)${E}`)
const YEAR = /^(?:1[89]\d\d|20\d\d)$/

/** A written number as the form `numbersOf` gives: `5 000`, `1.000` and `1,000` are `5000` and `1000`. */
const formOf = (written) => {
  const word = numberWordValue(written)
  return word === undefined ? String(written).replace(/[.,\s](?=\d{3}(?!\d))/g, '') : String(word)
}
const plain = (text) =>
  String(text)
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/**
 * The claims of `text` these rules find and the plan data does not hold.
 * @param {string} text the copy, emails, links, phones and money taken out
 * @param {{numbers: Set<string>}} facts what the plan data holds (`page-writer-data-guard.mjs`)
 * @param {string} known every known value, plain (lowercase, no accents)
 * @returns {Array<{what: 'award' | 'number', text: string, key: string}>} `key`: the words or number the claim rests on
 */
export function moreClaimsOf(text, facts, known) {
  const found = []
  for (const m of text.matchAll(PLACE_CLAIM))
    if (!known.includes(plain(m[0]))) found.push({ what: 'award', text: m[0], key: m[0] })
  const counted = new Set()
  for (const m of text.matchAll(OVER)) {
    counted.add(m.index + m[0].length - m[1].length)
    if (!facts.numbers.has(formOf(m[1]))) found.push({ what: 'number', text: m[0], key: m[1] })
  }
  for (const m of text.matchAll(BIG_COUNT)) {
    if (counted.has(m.index) || YEAR.test(m[1])) continue
    if (!facts.numbers.has(formOf(m[1]))) found.push({ what: 'number', text: m[0].trim(), key: m[1] })
  }
  return found
}
