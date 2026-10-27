/** Guest photos retain their review/listing provenance, without inventing a photographer. */
import { tripadvisorUrl, tripadvisorImageUrl } from './tripadvisor.js'

export function tripadvisorPhotos(place, reviews, { placeId, placeUrl, provider }) {
  const byUrl = new Map()
  const add = (raw, review = null, via = null) => {
    const url = tripadvisorImageUrl(raw)
    const sourceUrl =
      tripadvisorUrl(review?.url) ?? byUrl.get(url)?.credit?.sourceUrl ?? tripadvisorUrl(placeUrl)
    if (!url || !sourceUrl) return
    const previous = byUrl.get(url)
    const reviewId = review?.id ?? null
    const reviewIds = [...new Set([...(previous?.credit?.reviewIds ?? []), ...(reviewId ? [reviewId] : [])])]
    byUrl.set(url, {
      kind: 'image',
      url,
      postId: reviewId ?? previous?.postId ?? null,
      caption: null,
      alt: null,
      provider: via ?? review?.provider ?? previous?.provider ?? provider,
      credit: {
        provider: 'TripAdvisor',
        authors: [],
        placeId,
        sourceUrl,
        reviewId: reviewId ?? previous?.credit?.reviewId ?? null,
        reviewIds,
        photoSource: reviewId || previous?.credit?.reviewId ? 'review' : 'gallery',
        viaProvider: via ?? review?.provider ?? previous?.provider ?? provider
      }
    })
  }
  for (const review of reviews ?? [])
    for (const image of review.photos ?? []) add(image.url, review, image.provider)
  for (const image of place?.images ?? []) add(image)
  return [...byUrl.values()].slice(0, 10)
}
