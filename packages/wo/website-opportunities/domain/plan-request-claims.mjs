// The checks a change request's model texts need beyond the copy guard (ticket #617, review of 2026-11-14), for
// `plan-request-guard.mjs`:
// - a count written out in several number words before a counted noun ("five hundred members"), or in one or more
//   before a currency word ("fifteen dollars"), in en, de, fr, es, it, pt (`copy-number-words.mjs`) and nl, held to the
//   numbers of the plan data: the copy guard reads one number word at a time, so "five hundred" passed as a known 5;
// - a "most <word>" superlative ("the most trusted club"), in the same languages, unless a known value says it;
// - the template's name, which no line of the plan names (the look check reads its colour and logo words only);
// - the distinctive words of a held person or held business name (`heldWordsOf`): a word of the held text that is no
//   common word of a business name and that no value the site shows uses, so "Brindlewick team" names the held
//   "Brindlewick Tennis Club" while "Tennis" alone does not.
// Pure.
import { COUNT_NOUNS } from './copy-claims.mjs'
import { NUMBER_WORD, numberWordValue } from './copy-number-words.mjs'
import { namesWords, wordsOf } from './plan-request-words.mjs'

const B = String.raw`(?<![\p{L}\p{N}])`
const E = String.raw`(?![\p{L}\p{N}])`
/** Dutch number words, two and up (`een` is also the article), with their values. */
const DUTCH = new Map(
  Object.entries({
    twee: 2,
    drie: 3,
    vier: 4,
    vijf: 5,
    zes: 6,
    zeven: 7,
    acht: 8,
    negen: 9,
    tien: 10,
    elf: 11,
    twaalf: 12,
    dertien: 13,
    veertien: 14,
    vijftien: 15,
    zestien: 16,
    zeventien: 17,
    achttien: 18,
    negentien: 19,
    twintig: 20,
    dertig: 30,
    veertig: 40,
    vijftig: 50,
    zestig: 60,
    zeventig: 70,
    tachtig: 80,
    negentig: 90,
    honderd: 100,
    duizend: 1000
  })
)
const DUTCH_NOUNS = String.raw`leden|klanten|leerlingen|studenten|prijzen|recensies|beoordelingen|projecten|jaar\s+ervaring`
const CURRENCY = String.raw`dollars?|bucks|euros?|pounds?|francs?|franken|pfund|dólares|dollari|libras?|sterline|reais|yen|rupees?`
const WORDS = `${NUMBER_WORD}|${[...DUTCH.keys()].join('|')}`
const SPOKEN = new RegExp(
  String.raw`${B}((?:${WORDS})(?:[\s-]+(?:and\s+|und\s+|et\s+|y\s+|e\s+|en\s+)?(?:${WORDS}))*)\s+(?:[\p{L}-]+\s+)?(${COUNT_NOUNS}|${DUTCH_NOUNS}|${CURRENCY})${E}`,
  'giu'
)
const MOST = new RegExp(
  String.raw`${B}(?:most|meest|am\s+meisten|(?:le|la|les)\s+plus|(?:el|la|los|las)\s+más|(?:il|la|i|le)\s+più|(?:o|a|os|as)\s+mais)\s+(?!of${E}|de${E}|di${E}|van${E})\p{L}+`,
  'giu'
)
const valueOf = (word) => numberWordValue(word) ?? DUTCH.get(String(word).toLowerCase())

/** The value of number words in a row: "five hundred" is 500, "two thousand five hundred" 2500. */
function spokenValue(words) {
  let total = 0
  let part = 0
  for (const word of words.split(/[\s-]+/)) {
    const v = valueOf(word)
    if (v === undefined) continue
    if (v === 100) part = (part || 1) * 100
    else if (v === 1000) {
      total += (part || 1) * 1000
      part = 0
    } else part += v
  }
  return total + part
}

/**
 * The claims of a model text these rules find and the plan data does not hold.
 * @param {string} text
 * @param {{numbers: Set<string>, prices: Set<string>, known: string}} facts the numbers the plan data writes, the
 *   amounts of its prices, and every known value, lower case
 * @returns {Array<{what: 'number' | 'price' | 'award', text: string}>}
 */
export function spokenClaimsOf(text, { numbers, prices, known }) {
  const found = []
  for (const m of String(text).matchAll(SPOKEN)) {
    const price = new RegExp(`^(?:${CURRENCY})$`, 'iu').test(m[2])
    if (!price && m[1].trim().split(/[\s-]+/).length < 2) continue
    if (!(price ? prices : numbers).has(String(spokenValue(m[1]))))
      found.push({ what: price ? 'price' : 'number', text: m[0] })
  }
  for (const m of String(text).matchAll(MOST))
    if (!known.includes(m[0].toLowerCase())) found.push({ what: 'award', text: m[0] })
  return found
}

/** Common words of a business name, never distinctive of one business. */
const COMMON = new Set(
  'the and und et y e en of de la le les el los las der die das du des di del da do van von club team studio shop store cafe café restaurant bar salon school academy centre center company co ltd inc llc gmbh ag sa srl bv group house home'.split(
    ' '
  )
)
const NO_WORDS = /\S*(?:[:/@]|\.[\p{L}]{2,})\S*/gu

/**
 * The distinctive words of the held texts: three letters at least, no common word of a business name, and used by
 * no value the site shows (links and emails aside, which show no words).
 * @param {string[]} held the held people and the held business name (`heldTextsOf`)
 * @param {string[]} shown every value of the facts and items the site may show
 */
export function heldWordsOf(held, shown) {
  const used = new Set(shown.flatMap((v) => wordsOf(String(v).replace(NO_WORDS, ' '))))
  return [...new Set(held.flatMap(wordsOf))].filter(
    (w) => [...w].length >= 3 && !COMMON.has(w) && !used.has(w) && !/^\p{N}+$/u.test(w)
  )
}

/** Whether a text names the template: its name as whole words. */
export const namesTemplate = (text, template) =>
  wordsOf(template?.name).length > 0 && namesWords(text, template.name)
