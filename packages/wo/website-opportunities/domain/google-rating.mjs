// Google's star rating of a business, and whether its site shows it. Pure.
//
// Measured on a business (Tennis & Padel Coach, Dubai, 26/10/2026): Google rates it 5.0 from 4 reviews. A
// perfect score from so few people can look picked on a site, so under FEW_GOOGLE_REVIEWS the site leaves it off
// until the person shows it; from that many on, the site shows it and the person may leave it off.

/** Under this many Google reviews the rating is left off the site unless the person shows it. */
export const FEW_GOOGLE_REVIEWS = 5

const nonEmpty = (s) => typeof s === 'string' && s.trim() !== ''
const score = (v) => (Number.isFinite(v) && v >= 0 && v <= 5 ? v : null)
const count = (v) => (Number.isInteger(v) && v >= 0 ? v : null)

/**
 * @typedef {{ choice: 'show' | 'leave' }} RatingPick
 * @typedef {{
 *   state: 'none' | 'shown' | 'left',
 *   score?: number,
 *   reviews?: number | null,
 *   few?: boolean,
 *   choice?: 'show' | 'leave' | null,
 *   mapsUrl?: string | null,
 *   from?: 'details' | 'search'
 * }} RatingDecision
 *   `score` (not `rating`: a read that collects every `rating` key must not count the decision as a second rating) is
 *   Google's rating of 5, `reviews` how many reviews it counts (null when Google did not say), `few` under
 *   FEW_GOOGLE_REVIEWS or unknown. `state` is what the site does: `shown` or `left` off.
 */

/**
 * Google's rating of this place: Place Details first (it reads the place itself), else the search listing it was
 * found by, only when that listing is this same place. Null when neither has one.
 * @returns {{ score: number, reviews: number | null, mapsUrl: string | null, from: 'details' | 'search' } | null}
 */
export function googleRatingOf({ googlePlace = null, candidate = null } = {}) {
  const g = googlePlace && typeof googlePlace === 'object' ? googlePlace : {}
  const c = candidate && typeof candidate === 'object' ? candidate : {}
  const mapsUrl = nonEmpty(c.mapsUrl) ? c.mapsUrl : null
  const detail = score(g.rating)
  if (detail !== null) return { score: detail, reviews: count(g.userRatingCount), mapsUrl, from: 'details' }
  const samePlace = c.provider === 'google-places' && (!nonEmpty(g.placeId) || c.providerId === g.placeId)
  const listed = samePlace ? score(c.rating) : null
  if (listed === null) return null
  return { score: listed, reviews: count(c.reviews), mapsUrl, from: 'search' }
}

/** The person's choice for the rating on the site, kept on the candidate (`ratingPick`); null when none was made. */
export function ratingPickOf(candidate) {
  const choice = candidate?.ratingPick?.choice
  return choice === 'show' || choice === 'leave' ? { choice } : null
}

/**
 * Whether the site shows Google's rating: the person's choice when there is one; otherwise shown from
 * FEW_GOOGLE_REVIEWS reviews on, left off under it (or when Google did not say how many).
 * @param {{ googlePlace?: any, candidate?: any, pick?: RatingPick | null }} input
 * @returns {RatingDecision}
 */
export function decideGoogleRating({ googlePlace = null, candidate = null, pick = null } = {}) {
  const found = googleRatingOf({ googlePlace, candidate })
  if (!found) return { state: 'none' }
  const few = found.reviews === null || found.reviews < FEW_GOOGLE_REVIEWS
  const choice = pick?.choice === 'show' || pick?.choice === 'leave' ? pick.choice : null
  const state = choice === 'show' ? 'shown' : choice === 'leave' ? 'left' : few ? 'left' : 'shown'
  return { state, ...found, few, choice }
}

/**
 * How a page could write the rating a brief withholds, for the site check that nothing withheld is shown: the score
 * with its star or "of 5", and the review count with its word. The bare score ("5.0") is too common to judge by.
 * @param {RatingDecision} decision
 * @returns {string[]}
 */
export function ratingShownForms(decision) {
  if (decision?.state === 'none' || !Number.isFinite(decision?.score)) return []
  const s = decision.score.toFixed(1)
  const forms = [`${s} ★`, `${s}★`, `★ ${s}`, `★${s}`, `${s}/5`, `${s} / 5`, `${s} out of 5`]
  if (Number.isInteger(decision.reviews)) {
    const word = decision.reviews === 1 ? 'review' : 'reviews'
    forms.push(`${decision.reviews} ${word}`, `${decision.reviews} Google ${word}`)
  }
  return forms
}
