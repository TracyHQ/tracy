// The neutral substitute of a heading or text that carries a number (ADR 0040 `claim.heading`, spec TracyHQ/tracy#132):
// every number of the demo's words is either the brief's own number for the same thing (a founding year, a count of
// followers or members, a rating) or it goes, with the words that only made sense with it ("since", "over", "years of").
// A demo number never stays. Pure, deterministic, word by word: no pattern runs over the whole text.

const list = (value) => (Array.isArray(value) ? value : [])

// Words that lean on the number after them: "since 2008", "over 500", "more than 1,200", "top 10", "No 1".
const GLUE_BEFORE = new Set(
  'since in est est. established founded from over than more nearly almost about around up to top no no. number for'.split(
    ' '
  )
)
// Words that only measure the number before them: "20 years", "4.8 stars", "7 days".
const UNITS_AFTER = new Set(
  'year years yr yrs month months week weeks day days decade decades hour hours star stars + k'.split(' ')
)
// Words that may stand alone at an edge once their number is gone: "- 4.8 stars" leaves a dash.
const DANGLING = new Set(['-', '–', '—', '&', 'and', ',', ':', '|', '/', '·'])
const SENTENCE_END = new Set(['.', '!', '?'])

const isLetter = (ch) => ch.toLowerCase() !== ch.toUpperCase()
const isDigit = (ch) => ch >= '0' && ch <= '9'
const hasDigit = (s) => [...s].some(isDigit)
const hasLetter = (s) => [...s].some(isLetter)

/** One word split into its leading punctuation, its core and its trailing punctuation. */
function split(word) {
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

/** What a number of the demo's words counts, read from its own shape. */
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

/** The brief fact that states this number, or null: same kind, and for a count the same thing counted. */
function factFor(kind, nextWords, facts) {
  for (const fact of facts) {
    const words = factWords(fact)
    if (!Number.isFinite(fact?.value?.amount)) continue
    if (kind === 'year' && words.some((w) => w.startsWith('found') || w.startsWith('establish'))) return fact
    if (kind === 'rating' && words.includes('rating')) return fact
    if (kind === 'count' && !words.includes('rating') && nextWords.some((w) => words.includes(singular(w))))
      return fact
  }
  return null
}

/** A figure as the site's language prints numbers: 12,400 in English, 12.400 in German. */
function numberIn(amount, locale) {
  try {
    return new Intl.NumberFormat(locale || 'en').format(amount)
  } catch {
    return new Intl.NumberFormat('en').format(amount)
  }
}

function printed(kind, amount, core, locale) {
  if (kind === 'year') return String(amount)
  if (kind === 'rating')
    return core.includes('/') ? `${numberIn(amount, locale)}/${core.split('/')[1]}` : numberIn(amount, locale)
  return numberIn(amount, locale)
}

/**
 * The demo's heading or text with every number either the brief's own or gone.
 * @param {object} input
 * @param {string} input.text - the demo's words in the slot
 * @param {Array<{id: string, value: {amount: number, label: string, unit?: string}}>} [input.facts] - the brief's
 *   accepted number facts (the place profile's statistics, a founding year labelled "founded")
 * @param {string} [input.locale] - the site's language
 * @returns {{state: 'unchanged'|'sourced'|'neutral'|'empty', text: string, factRefs: string[], dropped: string[]}}
 *   `sourced`: at least one number is the brief's; `neutral`: numbers went and none came; `empty`: nothing but the
 *   number was said; `dropped`: the demo numbers that went.
 */
export function numberlessSentence({ text, facts = [], locale = 'en' } = {}) {
  const source = typeof text === 'string' ? text.trim() : ''
  const words = source ? source.split(/\s+/).map(split) : []
  if (!words.some((w) => hasDigit(w.core)))
    return { state: 'unchanged', text: source, factRefs: [], dropped: [] }
  const usable = list(facts)
  const gone = Array.from({ length: words.length }, () => false)
  const factRefs = []
  const dropped = []
  const bare = (i) => words[i]?.core.toLowerCase() ?? ''
  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    if (!hasDigit(word.core)) continue
    const nextWords = [bare(i + 1), bare(i + 2)].filter((w) => w && !hasDigit(w))
    const kind = kindOf(word.core, bare(i + 1))
    const fact = kind === 'rank' || kind === 'percent' ? null : factFor(kind, nextWords, usable)
    if (fact) {
      word.core = printed(kind, fact.value.amount, word.core, locale)
      if (!factRefs.includes(fact.id)) factRefs.push(fact.id)
      continue
    }
    dropped.push(word.core)
    gone[i] = true
    // The words that only leaned on it go with it, unless punctuation closed them off.
    for (let j = i - 1; j >= 0 && !gone[j] && !words[j].trail && GLUE_BEFORE.has(bare(j)); j--) gone[j] = true
    let j = i + 1
    if (!word.trail) {
      while (j < words.length && !hasDigit(words[j].core) && UNITS_AFTER.has(bare(j))) {
        gone[j] = true
        if (words[j++].trail) break
      }
      const unitWent = j > i + 1 && !words[j - 1].trail
      if ((unitWent || kind === 'percent') && bare(j) === 'of' && !words[j].trail) gone[j] = true
    }
    // A sentence end on a word that went moves to the word before it.
    const end = [...(words[Math.max(i, j - 1)].trail || words[i].trail)].find((ch) => SENTENCE_END.has(ch))
    const before = gone.lastIndexOf(false, i)
    if (end && before >= 0 && !words[before].trail) words[before].trail = end
  }
  const kept = words.filter((_, i) => !gone[i]).map((w) => `${w.lead}${w.core}${w.trail}`)
  while (kept.length && DANGLING.has(kept[0].toLowerCase())) kept.shift()
  while (kept.length && DANGLING.has(kept.at(-1).toLowerCase())) kept.pop()
  let out = kept.join(' ').replace(/^[\s,;:–—-]+/, '')
  if (!hasLetter(out)) return { state: 'empty', text: '', factRefs: [], dropped }
  // A text that opened with a capital or a number opens with a capital again.
  const first = [...source].find((ch) => isLetter(ch) || isDigit(ch))
  if (first && first === first.toUpperCase()) out = out.charAt(0).toUpperCase() + out.slice(1)
  return { state: factRefs.length ? 'sourced' : 'neutral', text: out, factRefs, dropped }
}
