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
      if (!platform || !author || !words || /(?:\.{3}|\u2026)["\u201d']*$/.test(words) || r.onSite === false || seen.has(id) || heldNamesIn(words, held).length)
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

/** The values of one whole guest review on this card, or null when any required part has no place or does not fit. */
export function reviewValuesOf(slots, review) {
  const words = slots.filter((s) => s.type === 'text' && s.role === 'quote.text')
  const authors = slots.filter((s) => s.type === 'text' && s.role === 'quote.author_name')
  if (!words.length || !authors.length) return null
  const source = slots.some((s) => s.type === 'text' && ['quote.author_context', 'quote.rating_or_source'].includes(s.role))
  const values = {}
  for (const slot of slots) {
    if (slot.type !== 'text') continue
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

/** Whole reviews first, in source order. No fitting review means the whole guest quote is empty, never owner-signed. */
export function planReviewGroup(slots, reviews) {
  for (const review of reviews) {
    const values = reviewValuesOf(slots, review)
    if (values) return { review, values }
  }
  return null
}
