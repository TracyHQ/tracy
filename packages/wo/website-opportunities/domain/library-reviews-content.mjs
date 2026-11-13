// What the Tracy reviews block shows (ticket #596, spec #577 story 9): at most six reviews of four or five stars, in
// the reviewer's own words (never cut, never edited), each named by first name and initial, with a link to the
// business's Google listing. Pure: reviews in, what the block shows and what it set aside (with the reason) out.
//
// A review is a needs profile item of kind `quote` (`fields['quote.text'].value`, ..., `sources: [<source id>]`) or a
// plain `{text, author, rating, origin}`. Only a review with a Google source is shown: the block says its reviews are
// Google reviews and links them to the Google listing, so a website testimonial with stars is set aside. A review
// without a rating is set aside too: the block cannot say it has four or five stars.
import { reviewerName, reviewerNameProblem } from './library-reviews-names.mjs'

export { reviewerName } from './library-reviews-names.mjs'
export { googleListingUrl } from './library-reviews-listing.mjs'

export const REVIEWS_MAX = 6
export const REVIEW_MIN_STARS = 4
export const REVIEW_MAX_STARS = 5

const isText = (value) => typeof value === 'string' && value.trim() !== ''
const fieldOf = (review, role, plain) => {
  const field = review?.fields?.[role]
  if (field !== undefined) return field && typeof field === 'object' ? field.value : field
  return review?.[plain]
}

/**
 * The source origins of a review: its own `origin` or `origins`, and each of its `sources` read through `origins` (the
 * needs profile's source id -> origin) or as a `{origin}` / `{kind}` record (a plan item's sources).
 */
function originsOf(review, origins) {
  const out = new Set([review?.origin, ...(Array.isArray(review?.origins) ? review.origins : [])])
  for (const source of Array.isArray(review?.sources) ? review.sources : [])
    out.add(typeof source === 'string' ? origins?.get(source) : (source?.origin ?? source?.kind))
  out.delete(undefined)
  return out
}

/** A review as the block reads it: `{text, author, rating}`, the text exactly as written. */
export function reviewOf(review) {
  const text = fieldOf(review, 'quote.text', 'text')
  const author = fieldOf(review, 'quote.author_name', 'author')
  const raw = fieldOf(review, 'quote.rating_or_source', 'rating')
  const rating =
    typeof raw === 'number' ? raw : isText(raw) && /^\s*\d+(?:\.\d+)?\s*$/.test(raw) ? Number(raw) : null
  return { text: typeof text === 'string' ? text : null, author: isText(author) ? author : null, rating }
}

/**
 * Why the block does not show this review, or null when it does.
 * @param {object} review a profile item or `{text, author, rating}`
 * @param {{textLimit?: number, authorLimit?: number, origins?: Map<string, string>}} [options] the block's text and
 *   author limits (a longer review or name is set aside, never cut); `origins` reads a profile item's source ids
 */
export function reviewProblem(review, { textLimit = Infinity, authorLimit = Infinity, origins } = {}) {
  const { text, author, rating } = reviewOf(review)
  if (!originsOf(review, origins).has('google')) return 'it is not a Google review'
  if (!isText(text)) return 'it has no text'
  if (rating === null) return 'it has no star rating'
  if (rating < REVIEW_MIN_STARS || rating > REVIEW_MAX_STARS)
    return 'only reviews of four or five stars are shown'
  if (!Number.isInteger(rating)) return 'its star rating is not a whole number'
  const nameProblem = reviewerNameProblem(author, { limit: authorLimit })
  if (nameProblem) return nameProblem
  if ([...text.trim()].length > textLimit)
    return 'it is longer than the section holds, and a review is never cut'
  return null
}

/**
 * The reviews the block shows, in the order given, and the ones it sets aside.
 * @param {object[]} reviews
 * @param {{textLimit?: number, authorLimit?: number, origins?: Map<string, string>, max?: number}} [options]
 * @returns {{shown: Array<{text: string, author: string, rating: number}>, setAside: Array<{index: number, reason: string}>}}
 */
export function reviewsToShow(reviews, { max = REVIEWS_MAX, ...rules } = {}) {
  const shown = []
  const setAside = []
  const seen = new Set()
  ;(Array.isArray(reviews) ? reviews : []).forEach((review, index) => {
    const problem = reviewProblem(review, rules)
    if (problem) return setAside.push({ index, reason: problem })
    const { text, author, rating } = reviewOf(review)
    const key = text.trim().replace(/\s+/g, ' ').toLowerCase()
    if (seen.has(key)) return setAside.push({ index, reason: 'the same words are shown already' })
    if (shown.length >= Math.min(max, REVIEWS_MAX))
      return setAside.push({ index, reason: `at most ${Math.min(max, REVIEWS_MAX)} reviews are shown` })
    seen.add(key)
    shown.push({ text: text.trim(), author: reviewerName(author), rating })
  })
  return { shown, setAside }
}
