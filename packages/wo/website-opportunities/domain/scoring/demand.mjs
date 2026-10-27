const MAX = 30

/** Many reviews and a good rating: people already look for this place. */
export default {
  id: 'demand',
  weight: MAX,
  score({ candidate }) {
    const reviews = Number.isFinite(candidate.reviews) ? candidate.reviews : 0
    const rating = Number.isFinite(candidate.rating) ? candidate.rating : 0
    const points = Math.round(
      Math.min(MAX, 6 * Math.log10(Math.max(reviews, 1) + 1) + 2 * Math.max(0, rating - 3))
    )
    // Only what Google said: an unknown count or rating is left out, never shown as 0 reviews or ★0.0.
    const params = {
      ...(Number.isFinite(candidate.reviews) ? { reviews } : {}),
      ...(Number.isFinite(candidate.rating) ? { rating } : {})
    }
    return { points, reason: 'demand.reviews', params }
  }
}
