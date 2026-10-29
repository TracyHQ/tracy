// The neutral substitute of a heading or text that carries a number (ADR 0040 `claim.heading`, spec TracyHQ/tracy#132):
// every number of the demo's words is either the brief's own number for the same thing (a founding year, a count of
// followers or members, a rating) or it goes, with the words that only made sense with it ("since", "over", "years of").
// A demo number never stays. Pure, deterministic, word by word: no pattern runs over the whole text.

import { numberIn } from './number-in-locale.mjs'

const words = (line) => new Set(line.split(' '))
// Words that lean on the number after them: "since 2008", "over 500", "more than 1,200", "top 10", "No 1", "a dozen".
const GLUE_BEFORE = words(
  'since in est est. established founded from over than more nearly almost about around up to top no no. number for a an'
)
// Hedges a brief number never keeps: the brief states its number as it is.
const HEDGES = words('over than more nearly almost about around up to top')
// Words that say a year is when the business began: only such a year takes the brief's founding year.
const FOUNDING_BEFORE = words('since est est. established founded')
// Words that only measure the number before them: "20 years", "4.8 stars", "7 days".
const UNITS_AFTER = words(
  'year years yr yrs month months week weeks day days decade decades hour hours star stars + k'
)
// English numbers written as words ("one" is left out: it is a pronoun as often as a number).
const NUMBER_WORDS = words(
  'two three four five six seven eight nine ten eleven twelve twenty thirty forty fifty hundred hundreds thousand thousands dozen dozens'
)
// Words that may stand alone at an edge once their number is gone: "- 4.8 stars" leaves a dash.
const DANGLING = new Set(['-', '–', '—', '&', 'and', ',', ':', '|', '/', '·'])
// Words a text never ends on: they led to a number that went ("Classes for 25 years").
const DANGLING_AT_END = words('of for to with by in at on from since over than the a an')
const SENTENCE_END = new Set(['.', '!', '?'])

const isLetter = (ch) => ch.toLowerCase() !== ch.toUpperCase()
const isDigit = (ch) => ch >= '0' && ch <= '9'
const hasDigit = (s) => [...s].some(isDigit)
const hasLetter = (s) => [...s].some(isLetter)
const isNumber = (core) => hasDigit(core) || NUMBER_WORDS.has(core.toLowerCase())

/** One word split into its leading punctuation, its core and its trailing punctuation. */
function splitWord(word) {
  const chars = [...word]
  const keep = (ch) => isLetter(ch) || isDigit(ch)
  let start = 0
  while (start < chars.length && !keep(chars[start]) && chars[start] !== '#') start++
  let end = chars.length
  while (end > start && !keep(chars[end - 1]) && chars[end - 1] !== '%' && chars[end - 1] !== '+') end--
  return {
    lead: chars.slice(0, start).join(''),
    core: chars.slice(start, end).join(''),
    trail: chars.slice(end).join('')
  }
}

/** What a number of the demo's words counts, read from its own shape and the word after it. */
function kindOf(core, next) {
  const c = core.toLowerCase()
  if (/^(?:no\.?|#)\d{1,4}$/.test(c) || /^\d{1,4}(?:st|nd|rd|th)$/.test(c)) return 'rank'
  if (c.endsWith('%')) return 'percent'
  if (/^\d{1,2}(?:[.,]\d{1,2})?\/(?:5|10)$/.test(c) || next === 'star' || next === 'stars') return 'rating'
  if (/^(?:1[89]|20)\d\d$/.test(c)) return 'year'
  return 'count'
}

const singular = (w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)
/** The words a fact's label and unit say it counts: "reviewCount" reads as "review", "count". */
const factWords = (fact) =>
  `${fact?.value?.label ?? ''} ${fact?.value?.unit ?? ''}`
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean)
    .map(singular)

/**
 * The brief fact that states this number, or null: a founding year for a year that says when the business began, a
 * rating for a rating, and for a count a fact about the same thing counted (the next two words).
 */
function factFor(kind, { founding, nextWords }, facts) {
  for (const fact of facts) {
    if (!Number.isFinite(fact?.value?.amount)) continue
    const said = factWords(fact)
    if (kind === 'year' && founding && said.some((w) => w.startsWith('found') || w.startsWith('establish')))
      return fact
    if (kind === 'rating' && said.includes('rating')) return fact
    if (kind === 'count' && !said.includes('rating') && nextWords.some((w) => said.includes(singular(w))))
      return fact
  }
  return null
}

function printed(kind, amount, core, locale) {
  if (kind === 'year') return String(amount)
  if (kind === 'rating' && core.includes('/')) return `${numberIn(amount, locale)}/${core.split('/')[1]}`
  return numberIn(amount, locale)
}

/**
 * The demo's heading or text with every number either the brief's own or gone.
 * @param {object} input
 * @param {string} input.text - the demo's words in the slot
 * @param {Array<{id: string, value: {amount: number, label: string, unit?: string}}>} [input.facts] - the brief's
 *   accepted number facts (the place profile's statistics, a founding year labelled "founded")
 * @param {string} [input.locale] - the site's language
 * @param {{maxCharacters?: number}} [input.fit] - the slot's text Slot fit: a rewrite longer than it holds empties
 * @returns {{state: 'unchanged'|'sourced'|'neutral'|'empty', text: string, factRefs: string[], dropped: string[],
 *   reason?: 'too-long'}}
 *   `sourced`: at least one number is the brief's; `neutral`: numbers went and none came; `empty`: nothing but the
 *   number was said, or the rewrite does not fit; `dropped`: the demo numbers that went.
 */
export function numberlessSentence({ text, facts = [], locale = 'en', fit } = {}) {
  const source = typeof text === 'string' ? text.trim() : ''
  const parts = source ? source.split(/\s+/).map(splitWord) : []
  if (!parts.some((w) => isNumber(w.core)))
    return { state: 'unchanged', text: source, factRefs: [], dropped: [] }
  const usable = Array.isArray(facts) ? facts : []
  const removed = Array.from({ length: parts.length }, () => false)
  const factRefs = []
  const dropped = []
  const lower = (i) => parts[i]?.core.toLowerCase() ?? ''
  /** Removes the words before `i` that only led to its number, stopping at punctuation. */
  const removeBefore = (i, set) => {
    for (let b = i - 1; b >= 0 && !removed[b] && !parts[b].trail && set.has(lower(b)); b--) removed[b] = true
  }
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!isNumber(part.core)) continue
    const kind = kindOf(part.core, lower(i + 1))
    const founding =
      FOUNDING_BEFORE.has(lower(i - 1)) || (lower(i - 1) === 'in' && FOUNDING_BEFORE.has(lower(i - 2)))
    const nextWords = [lower(i + 1), lower(i + 2)].filter((w) => w && !isNumber(w))
    const fact = kind === 'rank' || kind === 'percent' ? null : factFor(kind, { founding, nextWords }, usable)
    if (fact) {
      part.core = printed(kind, fact.value.amount, part.core, locale)
      if (!factRefs.includes(fact.id)) factRefs.push(fact.id)
      removeBefore(i, HEDGES)
      continue
    }
    dropped.push(part.core)
    removed[i] = true
    removeBefore(i, GLUE_BEFORE)
    // The unit that measured it ("years"), then an "of" that tied the unit to the rest ("years of experience").
    let last = i
    if (!part.trail) {
      while (last + 1 < parts.length && !isNumber(parts[last + 1].core) && UNITS_AFTER.has(lower(last + 1))) {
        removed[++last] = true
        if (parts[last].trail) break
      }
      const tied = (last > i && !parts[last].trail) || kind === 'percent'
      if (tied && lower(last + 1) === 'of' && !parts[last + 1].trail) removed[last + 1] = true
    }
    // A sentence end on a word that went moves to the word before it.
    const end = [...(parts[last].trail || part.trail)].find((ch) => SENTENCE_END.has(ch))
    const before = removed.lastIndexOf(false, i)
    if (end && before >= 0 && !parts[before].trail) parts[before].trail = end
  }
  const kept = parts.filter((_, i) => !removed[i])
  while (kept.length && DANGLING.has(kept[0].core.toLowerCase() || kept[0].lead)) kept.shift()
  while (kept.length && !kept.at(-1).trail && DANGLING_AT_END.has(kept.at(-1).core.toLowerCase())) kept.pop()
  while (kept.length && DANGLING.has(kept.at(-1).core.toLowerCase() || kept.at(-1).lead)) kept.pop()
  let out = kept
    .map((w) => `${w.lead}${w.core}${w.trail}`)
    .join(' ')
    .replace(/^[\s,;:–—-]+/, '')
  if (!hasLetter(out)) return { state: 'empty', text: '', factRefs: [], dropped }
  if (Number.isInteger(fit?.maxCharacters) && [...out].length > fit.maxCharacters)
    return { state: 'empty', text: '', factRefs: [], dropped, reason: 'too-long' }
  // A text that opened with a capital or a number opens with a capital again.
  const first = [...source].find((ch) => isLetter(ch) || isDigit(ch))
  if (first && first === first.toUpperCase()) out = out.charAt(0).toUpperCase() + out.slice(1)
  return { state: factRefs.length ? 'sourced' : 'neutral', text: out, factRefs, dropped }
}
