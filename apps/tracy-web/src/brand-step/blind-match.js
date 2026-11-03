// Blind icon match (decisions 15 and 20): deterministic comparison of the blind reviewer's answer to "what business
// does this icon suggest?" with the business type the agent read from the brief. No model: plain word matching.
// Ported exactly from the approved lab rule.
//   key(text) = the words of the text, lower case, accents removed, every non-letter a separator, minus generic
//   words that name a kind of place rather than a trade (GENERIC below), each word stemmed (stem below).
//   A term matches an answer when every word of key(term) is in key(answer).
//   Accepted terms = the business type plus the close synonyms the agent wrote once at step start.
//   pass = one of the reviewer's 3 guesses (the answer is the first) matches an accepted term and that guess does
//          not match the neighbour or a neighbour alias; matchedPosition = 1, 2 or 3 (the first such guess).
//   fail = no guess matches an accepted term; why "neighbour" when the first guess matches the neighbour or one of
//          its aliases, else "other".

// generic words: say what kind of place, not which trade (never a trade or an industry name)
const GENERIC = new Set(
  (
    'a an the of for and or with in on at to by from its it this that some any my our your their ' +
    'business company brand shop store studio school academy centre center club house place service services ' +
    'class classes lesson lessons local small studio logo icon symbol emblem mark type kind professional ' +
    'provider maybe possibly perhaps likely something related like'
  ).split(/\s+/)
)

/** A crude stemmer: plural and common suffixes off, a doubled final consonant collapsed, a final e dropped. */
export function stem(w) {
  let s = w
  for (const [suf, rep] of [
    ['eries', ''],
    ['ery', ''],
    ['ies', 'y'],
    ['ings', ''],
    ['ing', ''],
    ['ers', ''],
    ['er', ''],
    ['es', ''],
    ['s', '']
  ]) {
    if (s.length - suf.length >= 3 && s.endsWith(suf)) {
      s = s.slice(0, s.length - suf.length) + rep
      break
    }
  }
  if (s.length >= 4 && /([b-df-hj-np-tv-z])\1$/.test(s)) s = s.slice(0, -1)
  if (s.length >= 4 && s.endsWith('e')) s = s.slice(0, -1)
  return s
}

export function key(text) {
  const words = String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean)
  return [...new Set(words.filter((w) => !GENERIC.has(w)).map(stem))]
}

export const matches = (answer, term) => {
  const k = key(term)
  if (!k.length) return false
  const a = new Set(key(answer))
  return k.every((w) => a.has(w))
}

/** Checks the agent's terms before a blind look: each has a key, and no accepted term matches the neighbour. */
export function termProblems({ businessType, accept = [], neighbour, neighbourAccept = [] }) {
  const out = []
  const terms = [businessType, ...accept]
  for (const t of terms)
    if (!key(t).length) out.push(`"${t}" has no specific word (only generic words like studio, shop, centre)`)
  if (neighbourAccept.length && !neighbour) out.push('neighbourAccept needs a neighbour')
  for (const n of neighbour ? [neighbour, ...neighbourAccept] : []) {
    if (!key(n).length) out.push(`neighbour "${n}" has no specific word`)
    for (const t of terms)
      if (matches(n, t) || matches(t, n)) out.push(`"${t}" also matches the neighbour "${n}"`)
  }
  return out
}

/** The verdict of one blind answer (the 3 guesses count). */
export function blindVerdict({
  answer,
  guesses = [],
  businessType,
  accept = [],
  neighbour,
  neighbourAccept = []
}) {
  const terms = [businessType, ...accept]
  const nbTerms = neighbour ? [neighbour, ...neighbourAccept] : []
  // the answer is the first guess; a reviewer that gave no guesses is judged on its answer alone
  const list = (guesses.length ? guesses : [answer]).slice(0, 3)
  const hitOf = (g) => terms.find((t) => matches(g, t)) ?? null
  const nbOf = (g) => nbTerms.find((t) => matches(g, t)) ?? null
  const i = list.findIndex((g) => hitOf(g) && !nbOf(g))
  const verdict = i >= 0 ? 'pass' : 'fail'
  const firstNb = nbOf(list[0] ?? answer)
  const why = verdict === 'pass' ? 'business' : firstNb ? 'neighbour' : 'other'
  return {
    answer,
    guesses,
    businessType,
    accept,
    neighbour: neighbour ?? null,
    neighbourAccept,
    verdict,
    why,
    matchedPosition: i >= 0 ? i + 1 : null,
    matchedGuess: i >= 0 ? list[i] : null,
    matchedTerm: i >= 0 ? hitOf(list[i]) : null,
    neighbourMatched: firstNb,
    answerKey: key(answer),
    rule: 'pass when one of the 3 guesses contains every specific word of the business type (or of one accepted synonym) and does not name the neighbour or a neighbour alias; matchedPosition is that guess (1 to 3); generic place words (studio, shop, school, centre, ...) ignored; words stemmed'
  }
}
