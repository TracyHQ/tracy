/**
 * How a brief build's copy reads across a whole site (spec TracyHQ/tracy#189, round 9 class F): the same few phrases
 * must not fill every page, a count the site states must be one the brief states, and headings are in sentence case.
 *
 * Measured 30/10/2026 on a local brief build of a coaching club: "all ages" 26 times and one coaching phrase 19 times over
 * nine pages (11 and 8 on the home page alone), a hero headline "One coach for the whole family" over a team of two, and a
 * Title Case body heading. Each rule here is by slot role and page, never by template, trade or business; the writers ask
 * these questions of an answer before it is written (`plan-joomla-contract.mjs`), and the same module serves any CMS.
 */

/**
 * At most this many slots of one page may carry the same key phrase. Two lets a phrase open a page and come back once
 * where it matters (a hero line and a detail), which is how an owner states a key message; a third is filler.
 */
export const PAGE_PHRASE_BUDGET = 2
/**
 * Across the site a phrase may come back about once per page, and never fewer than this many times: a three-page site
 * still names its key message on the home page, the about page and a call to action.
 */
export const SITE_PHRASE_FLOOR = 4

/** Words that carry no meaning of their own: a phrase of only these is no key phrase. English and short words. */
const FUNCTION_WORDS = new Set(
  (
    'a an the and or but nor for of to in on at by with from into onto over under about as is are was were be been being ' +
    'it its this that these those our your their his her my we you they he she i me us them all any each every some more ' +
    'most very so too not no can will would should could may might must do does did have has had than then there here who ' +
    'whom whose which what when where why how also just only own same such up out off again once'
  ).split(' ')
)

/** Function words a key phrase may open with: "all ages", "every family". */
const QUANTIFIERS = new Set(['all', 'every', 'each'])

const wordsOf = (text) =>
  String(text ?? '')
    .replace(/\[\[(?:br)?\]\]/g, ' ')
    .replace(/\[\[|\]\]/g, '')
    .replace(/<[^>]*>/g, ' ')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

/** A word that means something on its own: not a function word and long enough to be a noun or an adjective. */
const isContentWord = (word) => word.length >= 4 && !FUNCTION_WORDS.has(word)

/**
 * The key phrases of a text: every run of two or three words with at least one content word that does not start or end
 * with a function word other than a quantifier (so "all ages", "every family" and "European coaching" count, "of our" does not). Phrases inside
 * a `keep` text (the business's name, an offering's name) are its names, which a site repeats by design.
 * @param {unknown} text @param {string[]} [keep]
 * @returns {Set<string>}
 */
export function keyPhrases(text, keep = []) {
  const words = wordsOf(text)
  const kept = keep.map((k) => ` ${wordsOf(k).join(' ')} `).filter((k) => k.trim() !== '')
  const out = new Set()
  for (let size = 2; size <= 3; size += 1)
    for (let i = 0; i + size <= words.length; i += 1) {
      const run = words.slice(i, i + size)
      const [first, last] = [run[0], run[run.length - 1]]
      if (!run.some(isContentWord)) continue
      if ((FUNCTION_WORDS.has(first) && !QUANTIFIERS.has(first)) || FUNCTION_WORDS.has(last)) continue
      const phrase = run.join(' ')
      if (kept.some((k) => k.includes(` ${phrase} `))) continue
      out.add(phrase)
    }
  return out
}

/**
 * Counts the key phrases already written, per page and over the site, and says which ones a new value would push over
 * the budget. A slot on no page (a header, a footer, a module shown everywhere) is the template's chrome and not counted.
 * @param {{ pageOf?: (entity: string) => string[], pages?: number, keep?: string[] }} [options]
 */
export function phraseLedger({ pageOf = () => [], pages = 1, keep = [] } = {}) {
  const siteBudget = Math.max(SITE_PHRASE_FLOOR, pages)
  /** @type {Map<string, Map<string, number>>} scope -> phrase -> slots carrying it */
  const counts = new Map()
  const scopesOf = (slot) => {
    const own = pageOf(String(slot?.entity ?? ''))
    return own.length ? [...own.map((p) => `page:${p}`), 'site'] : []
  }
  const add = (slot, value, into) => {
    for (const scope of scopesOf(slot)) {
      const map = into.get(scope) ?? new Map()
      for (const phrase of keyPhrases(value, keep)) map.set(phrase, (map.get(phrase) ?? 0) + 1)
      into.set(scope, map)
    }
  }
  return {
    /**
     * The phrases of `value` that would go over budget with the values already recorded plus the ones earlier in
     * `batch` ({slot, value}), longest first, a phrase inside a longer one reported once.
     * @returns {Array<{ phrase: string, scope: string, count: number, budget: number }>}
     */
    over(slot, value, batch = []) {
      /** @type {Map<string, Map<string, number>>} */
      const seen = new Map([...counts].map(([scope, map]) => [scope, new Map(map)]))
      for (const b of batch) add(b.slot, b.value, seen)
      const found = []
      for (const scope of scopesOf(slot))
        for (const phrase of keyPhrases(value, keep)) {
          const count = (seen.get(scope)?.get(phrase) ?? 0) + 1
          const budget = scope === 'site' ? siteBudget : PAGE_PHRASE_BUDGET
          if (count > budget && !found.some((f) => f.phrase === phrase))
            found.push({ phrase, scope, count, budget })
        }
      found.sort((a, b) => b.phrase.length - a.phrase.length)
      return found.filter((f, i) => !found.slice(0, i).some((g) => ` ${g.phrase} `.includes(` ${f.phrase} `)))
    },
    /** Remember a value that was written. */
    record(slot, value) {
      add(slot, value, counts)
    }
  }
}

/**
 * The slots of an answer that carry a phrase the page or site already says too often, in slot order.
 * @param {any[]} slots @param {Record<string, unknown>} values @param {ReturnType<typeof phraseLedger>} ledger
 * @returns {Array<{ key: string, phrase: string, scope: string, count: number, budget: number }>}
 */
export function overusedPhrases(slots, values, ledger) {
  const batch = []
  const out = []
  for (const slot of slots) {
    const value = values?.[slot.key]
    if (typeof value !== 'string') continue
    for (const f of ledger.over(slot, value, batch)) out.push({ key: slot.key, ...f })
    batch.push({ slot, value })
  }
  return out
}

/** The sentence shown to the model when its answer repeats a phrase too often. */
export const phraseComplaint = (found) =>
  `Your previous answer repeats phrases the site already says too often: ${[
    ...new Map(found.map((f) => [f.phrase, f])).values()
  ]
    .slice(0, 6)
    .map(
      (f) =>
        `"${f.phrase}" in ${f.key} (${f.count} times ${f.scope === 'site' ? 'on the site' : 'on its page'}, at most ${f.budget})`
    )
    .join(
      '; '
    )}. Say a key message once where it matters most and write every other slot about its own subject, in other words.`

const NUMBER_WORDS = Object.freeze({
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12
})
/** Words after a number that make it no count of things ("one of", "one to one", "one by one", "one day"). */
const NOT_A_COUNT = new Set([
  'of',
  'to',
  'on',
  'by',
  'another',
  'more',
  'day',
  'time',
  'step',
  'way',
  'place',
  'stop'
])
/** Words before "one" that make it a pronoun ("no one", "every one", "the one"). */
const PRONOUN_BEFORE = new Set([
  'no',
  'every',
  'any',
  'each',
  'the',
  'this',
  'that',
  'which',
  'someone',
  'anyone'
])

const stem = (word) => word.replace(/(?:es|s)$/u, '')
const numberOf = (word) => (/^\d+$/.test(word) ? Number(word) : (NUMBER_WORDS[word] ?? null))

/**
 * The counts a text states about things the brief speaks of: "one coach", "3 studios", "two experienced trainers". A
 * number only counts when the noun after it (or after one word more) is a word the brief uses: "one place for all" is
 * no claim about the business, "one coach" is.
 * @param {unknown} text @param {string[]} facts - the brief's own strings
 * @returns {Array<{ n: number, noun: string, said: string }>}
 */
export function countClaims(text, facts) {
  const briefWords = new Set(facts.flatMap(wordsOf))
  const known = (word) => isContentWord(word) && [...briefWords].some((w) => w.startsWith(stem(word)))
  const words = wordsOf(text)
  const out = []
  for (let i = 0; i < words.length; i += 1) {
    const n = numberOf(words[i])
    if (n === null) continue
    if (words[i] === 'one' && PRONOUN_BEFORE.has(words[i - 1] ?? '')) continue
    if (NOT_A_COUNT.has(words[i + 1] ?? '')) continue
    const noun = [words[i + 1], words[i + 2]].find((w) => w && known(w))
    if (noun) out.push({ n, noun, said: words.slice(i, words.indexOf(noun, i) + 1).join(' ') })
  }
  return out
}

/**
 * The counts of a text that the brief never states: the same number (as a word or digits) before the same noun in one of
 * the brief's strings, or a statistic of the site plan with that value. A count of people, places or offerings that
 * holds no such source is an invented fact (FACT_RULES), whatever it is made of.
 * @param {unknown} text @param {string[]} facts @param {Array<{value?: unknown}>} [statistics]
 */
export function ungroundedCounts(text, facts, statistics = []) {
  const figures = new Set(statistics.map((s) => Number(s?.value)).filter(Number.isFinite))
  return countClaims(text, facts).filter(
    ({ n, noun }) =>
      !figures.has(n) &&
      !facts.some((fact) => countClaims(fact, [fact]).some((c) => c.n === n && stem(c.noun) === stem(noun)))
  )
}

/** The sentence shown to the model when its answer states a count the brief does not. */
export const countComplaint = (found) =>
  `Your previous answer states counts the brief never states: ${found
    .slice(0, 6)
    .map((f) => `"${f.said}" in ${f.key}`)
    .join(
      '; '
    )}. Never say how many people, places or offerings there are unless the brief says that number: write "our coaches", "our lessons" instead.`

/**
 * The words a heading keeps capitalised: the ones the brief itself capitalises inside a sentence (names of people, places,
 * the business, its offerings), never at a sentence's start.
 * @param {string[]} facts @returns {Set<string>}
 */
export function properNounsOf(facts) {
  const out = new Set()
  for (const fact of facts)
    for (const sentence of String(fact).split(/(?<=[.!?:])\s+|\n+/u)) {
      const words = sentence.split(/\s+/u)
      for (const raw of words.slice(1)) {
        const word = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
        if (/^\p{Lu}/u.test(word)) out.add(word)
      }
    }
  return out
}

/**
 * A Title Case heading written in sentence case ("Ready For Your First Rally" -> "Ready for your first rally"); any
 * other text as it is. A word stays capitalised when it is an acronym, holds a digit, starts a sentence or is a word the
 * brief capitalises (`properNounsOf`). Only for a language that writes headings in sentence case (English): German
 * capitalises its nouns, and its headings are never touched.
 * @param {string} value @param {Set<string>} [proper]
 */
export function sentenceCase(value, proper = new Set()) {
  const text = String(value ?? '')
  const tokens = [...text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)]
  if (tokens.length < 3) return text
  const later = tokens.slice(1).map((m) => m[0])
  const titled = later.filter((w) => /^\p{Lu}\p{Ll}/u.test(w) && !proper.has(w))
  if (titled.length < 2 || titled.length / later.length < 0.6) return text
  let out = ''
  let at = 0
  tokens.forEach((m, i) => {
    const word = m[0]
    const index = /** @type {number} */ (m.index)
    out += text.slice(at, index)
    at = index + word.length
    const startsSentence =
      i === 0 || /[.!?:]\s*(?:\[\[(?:br)?\]\]\s*)*$/u.test(text.slice(0, index).replace(/\[\[|\]\]/g, ''))
    out +=
      !startsSentence && /^\p{Lu}\p{Ll}+(?:['’-]\p{L}+)*$/u.test(word) && !proper.has(word)
        ? word.toLowerCase()
        : word
  })
  return out + text.slice(at)
}
