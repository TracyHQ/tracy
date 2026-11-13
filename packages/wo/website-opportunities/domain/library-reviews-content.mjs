// What the Tracy reviews block shows (ticket #596, spec #577 story 9): at most six reviews of four or five stars, in
// the reviewer's own words (never cut, never edited), each named by first name and initial, with a link to the
// business's Google listing. Pure: reviews in, what the block shows and what it set aside (with the reason) out.
//
// A review is a needs profile item of kind `quote` (`fields['quote.text'].value`, ...) or a plain
// `{text, author, rating}`. A review without a rating is set aside: the block cannot say it has four or five stars.
import { isGoogleHost } from './google-link.mjs'

export const REVIEWS_MAX = 6
export const REVIEW_MIN_STARS = 4
export const REVIEW_MAX_STARS = 5

const isText = (value) => typeof value === 'string' && value.trim() !== ''
const fieldOf = (review, role, plain) => {
  const field = review?.fields?.[role]
  if (field !== undefined) return field && typeof field === 'object' ? field.value : field
  return review?.[plain]
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

const nameToken = (token) => token.replace(/[^\p{L}\p{M}'.-]/gu, '')

/**
 * The reviewer as the block names them: first name and the initial of the last name ("Mara T."). A single name is
 * shown alone; a name already shortened keeps its own initial. Null when nothing readable is left.
 */
export function reviewerName(author) {
  const tokens = String(author ?? '')
    .normalize('NFC')
    .split(/\s+/)
    .map(nameToken)
    .filter((t) => /\p{L}/u.test(t))
  if (tokens.length === 0) return null
  const first = tokens[0]
  if (tokens.length === 1) return first
  const initial = [...tokens[tokens.length - 1]].find((c) => /\p{L}/u.test(c))
  return `${first} ${initial.toLocaleUpperCase()}.`
}

/**
 * Why the block does not show this review, or null when it does.
 * @param {object} review a profile item or `{text, author, rating}`
 * @param {{textLimit?: number}} [options] the block's text limit: a longer review is set aside, never cut
 */
export function reviewProblem(review, { textLimit = Infinity } = {}) {
  const { text, author, rating } = reviewOf(review)
  if (!isText(text)) return 'it has no text'
  if (rating === null) return 'it has no star rating'
  if (rating < REVIEW_MIN_STARS || rating > REVIEW_MAX_STARS)
    return 'only reviews of four or five stars are shown'
  if (!Number.isInteger(rating)) return 'its star rating is not a whole number'
  if (!reviewerName(author)) return 'it has no reviewer name'
  if ([...text.trim()].length > textLimit)
    return 'it is longer than the section holds, and a review is never cut'
  return null
}

/**
 * The reviews the block shows, in the order given, and the ones it sets aside.
 * @param {object[]} reviews
 * @param {{textLimit?: number, max?: number}} [options]
 * @returns {{shown: Array<{text: string, author: string, rating: number}>, setAside: Array<{index: number, reason: string}>}}
 */
export function reviewsToShow(reviews, { textLimit = Infinity, max = REVIEWS_MAX } = {}) {
  const shown = []
  const setAside = []
  const seen = new Set()
  ;(Array.isArray(reviews) ? reviews : []).forEach((review, index) => {
    const problem = reviewProblem(review, { textLimit })
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

/**
 * The link to the business's Google listing, from the Google source of the needs profile: its own address when it is
 * a Google link, else a Google Maps link built from the place id it names. Null when there is neither.
 * @param {{ref?: string, name?: string}} source `ref` of the profile's `google` source; `name` the business name
 */
export function googleListingUrl({ ref, name } = {}) {
  if (!isText(ref)) return null
  const value = ref.trim()
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && isGoogleHost(url.hostname) ? url.href : null
  } catch {
    if (!/^[\w-]+$/.test(value)) return null
    const query = encodeURIComponent(isText(name) ? name.trim() : value)
    return `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${encodeURIComponent(value)}`
  }
}
