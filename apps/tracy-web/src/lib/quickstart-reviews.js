/** Preserve review objects and their actual source instead of assigning every quote to one provider. */
export function quickstartReviews(given) {
  // A revision frozen without a profile stores JSON null, which a default parameter does not catch.
  const profile = given ?? {}
  const rows = []
  const add = (reviews, provider = null) => {
    for (const review of Array.isArray(reviews) ? reviews : []) {
      const text = typeof review.text === 'string' ? review.text : review.text?.text
      const author = review.authorAttribution?.displayName ?? review.author_name ?? review.author
      if (!text || typeof author !== 'string') continue
      const provenance = review.provenance ?? {}
      const origin =
        provenance.provider ??
        review.provider ??
        review.source?.provider ??
        (typeof review.source === 'string' ? review.source : provider)
      const url = provenance.url ?? review.googleMapsUri ?? review.url ?? review.source?.url ?? null
      if (!origin && !url) continue
      rows.push({
        ...review,
        text,
        author,
        provenance: {
          ...provenance,
          provider: origin,
          url,
          language: review.language ?? provenance.language ?? null
        }
      })
    }
  }
  add(profile.googlePlace?.reviews, 'Google Reviews')
  add(profile.reviews)
  if (Array.isArray(profile.reviewSources))
    for (const source of profile.reviewSources) add(source.reviews, source.provider)
  // Keyed by site (`{tripadvisor, googleMaps}`): each review credits the site it is on, never its data vendor.
  else
    for (const source of Object.values(profile.reviewSources ?? {}))
      add(
        (Array.isArray(source?.reviews) ? source.reviews : []).map((review) => ({
          ...review,
          provider: review.attribution ?? source.attribution ?? review.provider
        }))
      )
  return rows.filter(
    (row, index) =>
      rows.findIndex(
        (other) =>
          other.text === row.text &&
          other.author === row.author &&
          other.provenance.url === row.provenance.url
      ) === index
  )
}
export function reviewAttribution(review) {
  return (
    review.provenance?.provider ??
    review.provider ??
    review.source?.provider ??
    (typeof review.source === 'string' ? review.source : '')
  )
}
