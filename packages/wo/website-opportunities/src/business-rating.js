/**
 * Google's rating on a researched business's site (`domain/google-rating.mjs`), decided on every read with the
 * person's choice on the candidate (`ratingPick`), so a choice made after research needs no new run. The brief makes
 * the same decision from the same inputs.
 */
import { decideGoogleRating, ratingPickOf } from '../domain/google-rating.mjs'

/**
 * The profile with `googleRating` (`RatingDecision`): Google's rating, its review count, and whether the site shows it.
 * @param {any} profile @param {{ opportunity?: any }} [read]
 */
export function withRatingDecision(profile, { opportunity = null } = {}) {
  if (!profile || typeof profile !== 'object') return profile
  const candidate = opportunity?.candidate ?? {}
  const googleRating = decideGoogleRating({
    googlePlace: profile.googlePlace ?? null,
    candidate,
    pick: ratingPickOf(candidate)
  })
  return { ...profile, googleRating }
}
