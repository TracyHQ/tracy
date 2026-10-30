// A guest quote is one sourced record: words, reviewer and platform travel together. A measured box selects a whole
// review; it never asks a writer to shorten somebody else's words. Templates without an excerpt contract get no excerpt.
import { heldNamesIn, heldPeopleOf } from './held-reviews.mjs'

const text = (v) => (typeof v === 'string' ? v.trim() : '')
const list = (v) => (Array.isArray(v) ? v : [])
const PLATFORMS = {
  google: 'Google',
  googleMaps: 'Google',
  'google-maps': 'Google',
  'google-places': 'Google',
  tripadvisor: 'Tripadvisor',
  facebook: 'Facebook',
  yelp: 'Yelp',
  trustpilot: 'Trustpilot'
}

/** Reviews the frozen brief permits, with their real authors and platforms; duplicate reads count once. */
export function sourcedReviewsOf(brief) {
  const held = heldPeopleOf(brief?.missing)
  const sources = [
    ['Google', brief?.googlePlace?.reviews],
    ...Object.entries(brief?.reviewSources ?? {}).map(([kind, source]) => [PLATFORMS[kind], source?.reviews])
  ]
  const seen = new Set()
  return sources.flatMap(([platform, reviews]) =>
    list(reviews).flatMap((r) => {
      const author = text(r?.author)
      const words = text(r?.text)
      const id = JSON.stringify([platform, author, words])
      if (
        !platform ||
        !author ||
        !words ||
        /(?:\.{3}|\u2026)["\u201d']*$/.test(words) ||
        r.onSite === false ||
        seen.has(id) ||
        heldNamesIn(words, held).length
      )
        return []
      seen.add(id)
      return [{ id, text: words, author, platform, context: `${platform} review` }]
    })
  )
}

/** A quote must satisfy both the declared limit and every measured viewport. Missing limits impose no cut. */
export function reviewFits(slot, value) {
  const fit = slot.fit?.measured === true ? slot.fit : null
  const limits = [slot.maxCharacters, fit?.maxCharacters, ...Object.values(fit?.maxChars ?? {})].filter(
    (n) => Number.isInteger(n) && n > 0
  )
  return limits.every((n) => [...value].length <= n)
}

/** A sentence end: terminal punctuation (Latin or CJK) with closing quotes, never an ellipsis. */
const SENTENCE_END = new RegExp(String.raw`[.!?\u3002\uff01\uff1f]["'\u2019\u201d)\]]*$`, 'u')
const ELLIPSIS_END = new RegExp(String.raw`(?:\.{2,}|\u2026)["'\u2019\u201d)\]]*$`, 'u')
/** A title before a period is not a sentence end ("Dr. Rowan"): the sentence segmenter does not know it. */
const TITLE_END = /(?:^|\s)(?:Mr|Mrs|Ms|Mx|Dr|Prof|St|Sr|Jr|Mt|No|vs|etc|e\.g|i\.e)\.$/i

/** True when `words` ends a sentence: what a quote may end on (`checkReviewQuotes` reads the same rule). */
export function endsSentence(words) {
  const value = text(words)
  return SENTENCE_END.test(value) && !ELLIPSIS_END.test(value) && !TITLE_END.test(value)
}

/**
 * The longest run of the review's own leading sentences within `limit` characters, or null. Every excerpt is a prefix of
 * the real words that ends where a sentence of the review ends: never a cut mid-sentence, never a word added.
 */
export function sentenceExcerptOf(words, limit) {
  if (!Number.isInteger(limit) || limit < 1) return null
  let best = null
  let end = 0
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(words)) {
    end += segment.length
    const excerpt = words.slice(0, end).trim()
    if ([...excerpt].length > limit) break
    if (excerpt.length < words.trim().length && endsSentence(excerpt)) best = excerpt
  }
  return best
}

/**
 * The text limit of the quote's words: per quote.text slot the tightest of its declared limit and every measured viewport,
 * then the roomiest of those slots (the words stand once, in the first slot they fit: a pull-quote heading or the body).
 * A slot with no limit imposes no cut.
 */
function textLimitOf(slots) {
  const perSlot = slots
    .filter((s) => s.type === 'text' && s.role === 'quote.text')
    .map((s) => {
      const fit = s.fit?.measured === true ? s.fit : null
      const limits = [s.maxCharacters, fit?.maxCharacters, ...Object.values(fit?.maxChars ?? {})].filter(
        (n) => Number.isInteger(n) && n > 0
      )
      return limits.length ? Math.min(...limits) : null
    })
  if (!perSlot.length || perSlot.includes(null)) return null
  return Math.max(...perSlot)
}

/** The values of one whole guest review on this card, or null when any required part has no place or does not fit. */
export function reviewValuesOf(slots, review) {
  const words = slots.filter((s) => s.type === 'text' && s.role === 'quote.text')
  const authors = slots.filter((s) => s.type === 'text' && s.role === 'quote.author_name')
  if (!words.length || !authors.length) return null
  const source = slots.some(
    (s) => s.type === 'text' && ['quote.author_context', 'quote.rating_or_source'].includes(s.role)
  )
  // 🔒 THE REVIEW'S WORDS STAND ONCE ON A CARD (#189, criterion 2.2): a card with a pull-quote heading and a body both
  // declared quote.text shows them in the first one they fit whole; the other is left empty, never a second copy.
  const home = words.find((s) => reviewFits(s, review.text))
  if (!home) return null
  const values = {}
  for (const slot of slots) {
    if (slot.type !== 'text' || (slot.role === 'quote.text' && slot !== home)) continue
    const value = {
      'quote.text': review.text,
      'quote.author_name': source ? review.author : `${review.author}, ${review.context}`,
      'quote.author_context': review.context,
      'quote.rating_or_source': review.context
    }[slot.role]
    if (value === undefined) continue
    if (!reviewFits(slot, value)) return null
    values[slot.key] = value
  }
  return values
}

/**
 * Whole reviews first, in source order; then the longest leading-sentence excerpt of one review, still with its real author
 * and platform. The template declares no excerpt marker, so none is added. No fitting review means the whole guest quote
 * is empty, never owner-signed.
 */
export function planReviewGroup(slots, reviews) {
  for (const review of reviews) {
    const values = reviewValuesOf(slots, review)
    if (values) return { review, values }
  }
  const limit = textLimitOf(slots)
  const excerpts = reviews
    .map((review) => ({ review, words: sentenceExcerptOf(review.text, limit) }))
    .filter((e) => e.words)
    .sort((a, b) => [...b.words].length - [...a.words].length)
  for (const { review, words } of excerpts) {
    const values = reviewValuesOf(slots, { ...review, text: words })
    if (values) return { review, values, excerpt: words }
  }
  return null
}
