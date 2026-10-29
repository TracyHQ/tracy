// What sets the business apart (its USP), for the hero headline of a brief build (spec TracyHQ/tracy#189, COO rule
// 29/10/2026). Pure and CMS neutral.
//
// 🔒 THE USP GATE: a line counts only when it is all three of
//   SPECIFIC         a concrete method, result, convenience, credential or promise; generic praise ("friendly",
//                    "quality", "best", "all levels", "European" or "premium" with nothing behind it) never counts
//   DIFFERENTIATING  it says more than the trade, the offerings and the place (what every rival could say)
//   PROVABLE         a fact of the brief, or a theme at least two reviews state (any star rating), quoted as evidence
// 🔒 NEVER INVENTED: no candidate passes, no USP. The headline then says what and where, and the owner is asked
// "What makes you different from other <trade> in <place>?".
//
// The candidates, best first: the owner's key messages, the brief's story and team facts, then review themes. A theme is
// one a model clustered while reading the business (`brief.reading.uspThemes`, or `options.themes`), which passes only
// when its quotes are found word for word in at least two reviews, or it names a fact of the brief (`checkUspTheme`);
// without one that passes, one of a closed list of meanings read in code (`REVIEW_THEMES`).
import { businessWords } from './trade-words.mjs'

const list = (v) => (Array.isArray(v) ? v : [])
const nonEmpty = (v) => typeof v === 'string' && v.trim() !== ''
const lower = (t) => String(t ?? '').toLowerCase()

/** Words that praise without saying anything a rival could not say too. */
const GENERIC = new Set(
  `friendly nice kind lovely great good amazing awesome excellent fantastic wonderful brilliant best top quality
  professional professionals experienced expert experts passionate dedicated caring premium luxury european international
  world class world-class leading trusted reliable modern unique special perfect highly very fun relaxed
  all ages levels level every any everyone anyone beginners beginner advanced fitness ability abilities kids adults
  welcome welcoming affordable fair prices value service services team staff people`
    .split(/\s+/)
    .filter(Boolean)
)
/** Words that carry no claim: articles, prepositions, conjunctions. */
const FILLER = new Set(
  'a an the and or & of in on at for to from with by our your my we you us is are be it its this that across near'.split(
    ' '
  )
)

/** Concrete markers: a number, a credential, a promise or a convenience a rival does not say by default. */
const CONCRETE = [
  /\b\d+\s*(?:\+\s*)?(?:years?|yrs?|seasons?|clients?|students?|players?|members?|locations?|branches?|venues?|awards?)\b/i,
  /\bsince\s+(?:19|20)\d{2}\b/i,
  /\b(?:certified|licensed|accredited|qualified|registered|chartered)\b/i,
  /\b(?:former|ex-)\s*(?:international|national|olympic|professional|pro|world|tour)\b/i,
  /\b(?:champion|championship|olympian|award-winning|award winning|medal(?:ist)?)\b/i,
  /\b(?:guarantee[ds]?|money[- ]back|free (?:trial|first|assessment|consultation))\b/i,
  /\b(?:same[- ]day|within \d+ (?:hours?|minutes?|days?)|24\/7|open late|we come to you|at your (?:home|door|place))\b/i,
  /\b(?:one[- ]to[- ]one|1[:-]1|private (?:lessons?|sessions?|coaching))\b/i,
  /\b(?:whole family|same (?:coach(?:es)?|trainers?|teachers?|team|people|instructors?))\b/i
]

/**
 * Whether a line is specific and differentiating: it holds a concrete marker, and words beyond generic praise, the trade,
 * the offerings and the place.
 * @param {string} text
 * @param {{others?: string[]}} [context] - words every rival of the trade could say (trade nouns, offerings, place)
 * @returns {{specific: boolean, why: string}}
 */
export function isSpecificClaim(text, { others = [] } = {}) {
  const common = new Set(others.flatMap((o) => lower(o).split(/[^\p{L}\p{N}-]+/u)).filter(Boolean))
  const words = lower(text)
    .split(/[^\p{L}\p{N}-]+/u)
    .filter(Boolean)
  const said = words.filter((w) => !GENERIC.has(w) && !FILLER.has(w) && !common.has(w))
  if (!said.length)
    return { specific: false, why: 'only generic praise, the trade, the offerings or the place' }
  if (!CONCRETE.some((re) => re.test(text)))
    return { specific: false, why: 'no concrete method, result, convenience, credential or promise' }
  return { specific: true, why: 'a concrete claim' }
}

/** The reviews a brief holds, any star rating: the ones the site may show (held reviews carry no text). */
export const reviewsOf = (brief) =>
  [...list(brief?.googlePlace?.reviews), ...list(brief?.reviews)]
    .map((r) => (nonEmpty(r?.text) ? r.text : null))
    .filter(Boolean)

/** The sentences of a text. */
const sentencesOf = (text) =>
  String(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)

const CHILD = /\b(?:kids?|child|children|son|sons|daughters?|boys?|girls?|teenagers?|toddlers?)\b/i
const ADULT =
  /\b(?:husband|wife|partner|myself|parents?|adults?|whole family|all the family|both of us|my family)\b/i
const SAME =
  /\bsame\s+(?:coach|coaches|trainers?|teachers?|team|instructors?|people|staff|tutors?|doctors?|therapists?)\b/i

/**
 * The review themes read in code: a closed list of meanings, each read the same way for every trade. A theme passes
 * with two reviews or more; its `who` names the people it serves, and its headlines are tried longest first.
 */
export const REVIEW_THEMES = Object.freeze([
  Object.freeze({
    id: 'whole-family',
    label: 'one team for the whole family, children and adults',
    who: 'kids and adults',
    words: ['family'],
    accent: 'whole family',
    // A review where children and adults are taught by the same people: a child and an adult of the family, or a child
    // taught by "the same" people as the reviewer.
    quoteOf: (text) => {
      if (!CHILD.test(text) || !(ADULT.test(text) || SAME.test(text))) return null
      return sentencesOf(text).find((s) => CHILD.test(s)) ?? null
    },
    headlines: (noun) => [`One ${noun} for the whole family`, `One ${lastWordOf(noun)} for the whole family`]
  }),
  Object.freeze({
    id: 'comes-to-you',
    label: 'comes to the customer',
    who: null,
    words: ['you', 'home'],
    accent: 'comes to you',
    quoteOf: (text) =>
      sentencesOf(text).find((s) =>
        /\b(?:came|comes|come) (?:to|over to) (?:our|my|the) (?:home|house|place|flat|apartment|villa|office)\b/i.test(
          s
        )
      ) ?? null,
    headlines: (noun) => [`The ${noun} that comes to you`, `We come to you`]
  })
])

const lastWordOf = (noun) => String(noun).split(' ').at(-1)

/**
 * A model's review theme, checked in code: its quotes must be found word for word in the brief's reviews (the ones the
 * site may show), in two different reviews or more, or it must name a fact the brief shows; and its line must pass the
 * specific test. A quote is `{text}` or `{quote}`, with the review's index when the caller knows it.
 * @param {{label: string, line?: string, who?: string, quotes?: Array<{review?: number, text?: string, quote?: string}>,
 *   factIds?: string[]}} theme
 * @param {any} brief
 * @returns {{pass: boolean, why: string, evidence: any[]}}
 */
export function checkUspTheme(theme, brief, context = {}) {
  const reviews = reviewsOf(brief).map(lower)
  const quotes = list(theme?.quotes).flatMap((q) => {
    const text = String(q?.text ?? q?.quote ?? '').trim()
    if (!text) return []
    const want = lower(text)
    const at = Number.isInteger(q?.review) ? [q.review] : reviews.map((_, i) => i)
    const review = at.find((i) => reviews[i]?.includes(want))
    return review === undefined ? [] : [{ review, text }]
  })
  const facts = list(theme?.factIds)
    .map((id) => list(brief?.facts).find((f) => f?.id === id && f.onSite === true))
    .filter(Boolean)
  const distinct = new Set(quotes.map((q) => q.review)).size
  if (quotes.length < list(theme?.quotes).length)
    return { pass: false, why: 'a quote is not found word for word in the reviews', evidence: [] }
  if (distinct < 2 && !facts.length)
    return {
      pass: false,
      why: 'fewer than two reviews state it word for word, and it names no fact',
      evidence: []
    }
  const claim = isSpecificClaim(theme.line ?? theme.label ?? '', context)
  if (!claim.specific) return { pass: false, why: claim.why, evidence: [] }
  return {
    pass: true,
    why: facts.length ? 'a fact of the brief' : `${distinct} reviews`,
    evidence: [
      ...quotes.map((q) => ({ kind: 'review', review: q.review, quote: q.text })),
      ...facts.map((f) => ({ kind: 'fact', id: f.id }))
    ]
  }
}

/** The text of a fact's value. */
const factText = (f) =>
  typeof f?.value === 'string' ? f.value : nonEmpty(f?.value?.text) ? f.value.text : (f?.value?.label ?? '')

/** The clause of a text that holds a concrete marker, emoji and symbols taken off. */
function concreteClauseOf(text) {
  for (const s of sentencesOf(text)) {
    const clean = s
      .replace(/[^\p{L}\p{N}\s,.'&:+/-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (CONCRETE.some((re) => re.test(clean))) return clean.replace(/[.,:;]+$/, '')
  }
  return null
}

/**
 * The business's USP, or null, with every candidate weighed (for the report).
 * @param {any} brief
 * @param {{themes?: any[], places?: string[], offerings?: string[]}} [options]
 * @returns {{usp: {kind: 'key-message' | 'fact' | 'review-theme', id: string, label: string, who: string | null,
 *   words: string[], headlines: string[], accent?: string | null, evidence: any[]} | null, weighed: Array<{kind: string, label: string,
 *   pass: boolean, why: string}>, passing: any[], question: string}} - `passing` holds every passing candidate, best
 *   first, for a headline box the first one does not fit
 */
export function findUsp(brief, { themes = [], places = [], offerings = [] } = {}) {
  const words = businessWords(brief?.business)
  const context = { others: [words.noun, words.item, words.items, ...places, ...offerings].filter(nonEmpty) }
  const weighed = []
  const passing = []
  // The owner's key messages: specific, and resting on a fact the brief shows.
  for (const k of list(brief?.keyMessages)) {
    if (!nonEmpty(k?.label)) continue
    const claim = isSpecificClaim(k.label, context)
    const facts = list(k.factRefs).filter((id) =>
      list(brief?.facts).some((f) => f?.id === id && f.onSite === true)
    )
    const pass = claim.specific && facts.length > 0
    weighed.push({
      kind: 'key-message',
      label: k.label,
      pass,
      why: claim.specific ? 'no fact on the site' : claim.why
    })
    if (pass)
      passing.push({
        kind: 'key-message',
        id: k.id,
        label: k.label,
        who: null,
        words: [],
        headlines: [k.label.trim()],
        evidence: facts.map((id) => ({ kind: 'fact', id }))
      })
  }
  // The story and team facts the site shows: a clause with a concrete marker.
  for (const f of list(brief?.facts)) {
    if (f?.onSite !== true || !['story', 'team'].includes(f.field)) continue
    const clause = concreteClauseOf(factText(f))
    if (!clause) continue
    const claim = isSpecificClaim(clause, context)
    weighed.push({ kind: 'fact', label: clause, pass: claim.specific, why: claim.why })
    if (claim.specific)
      passing.push({
        kind: 'fact',
        id: f.id,
        label: clause,
        who: null,
        words: [],
        headlines: [clause],
        evidence: [{ kind: 'fact', id: f.id }]
      })
  }
  // Review themes: the model's (`brief.reading.uspThemes`, `business-reading.mjs`), each checked against the reviews; the
  // closed list read in code only when no model theme stands (no model, or none of its themes passed).
  const modelThemes = list(themes).length ? list(themes) : list(brief?.reading?.uspThemes)
  let modelPassed = false
  for (const theme of modelThemes) {
    const check = checkUspTheme(theme, brief, context)
    weighed.push({
      kind: 'review-theme',
      label: String(theme?.label ?? ''),
      pass: check.pass,
      why: check.why
    })
    if (!check.pass) continue
    modelPassed = true
    passing.push({
      kind: 'review-theme',
      id: theme.id ?? `model:${theme.label}`,
      label: theme.label,
      who: nonEmpty(theme.who) ? theme.who : null,
      words: lower(theme.accent)
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 4),
      headlines: [theme.line ?? theme.label].filter(nonEmpty),
      accent: nonEmpty(theme.accent) ? theme.accent : null,
      evidence: check.evidence
    })
  }
  const reviews = reviewsOf(brief)
  for (const t of modelPassed ? [] : REVIEW_THEMES) {
    const quotes = reviews.flatMap((text, review) => {
      const quote = t.quoteOf(text)
      return quote ? [{ review, text: quote }] : []
    })
    if (!quotes.length) continue
    const pass = quotes.length >= 2
    weighed.push({ kind: 'review-theme', label: t.label, pass, why: `${quotes.length} review(s)` })
    if (pass)
      passing.push({
        kind: 'review-theme',
        id: t.id,
        label: t.label,
        who: t.who,
        words: t.words,
        headlines: t.headlines(words.noun),
        accent: t.accent,
        evidence: quotes.map((q) => ({ kind: 'review', review: q.review, quote: q.text }))
      })
  }
  return { usp: passing[0] ?? null, passing, weighed, question: uspQuestionOf(brief, places[0] ?? null) }
}

/** The question the owner is asked when nothing passes. */
export function uspQuestionOf(brief, place) {
  const noun = businessWords(brief?.business).noun
  const plural = noun.endsWith('s') ? noun : noun.endsWith('y') ? `${noun.slice(0, -1)}ies` : `${noun}s`
  return `What makes you different from other ${plural}${place ? ` in ${place}` : ''}?`
}
