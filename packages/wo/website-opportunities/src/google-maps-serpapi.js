/** Supplemental Maps content via SerpApi; official Google Place facts remain a separate source. */
import { createHash } from 'node:crypto'
import { tripadvisorJson } from './tripadvisor.js'

const fail = (code) => Object.assign(new Error(`Google Maps provider ${code}`), { code })
const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null)
export const mapsDataId = (value) =>
  typeof value === 'string' && /^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(value) ? value : null
export const mapsCategoryId = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,510}={0,2}$/.test(value) ? value : null
export function mapsImageUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      /^lh\d+\.(googleusercontent|ggpht)\.com$/.test(url.hostname)
      ? url.href
      : null
  } catch {
    return null
  }
}
export function mapsSourceUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      ['www.google.com', 'google.com', 'maps.google.com'].includes(url.hostname) &&
      (url.pathname.startsWith('/maps') || url.pathname.startsWith('/local/'))
      ? url.href
      : null
  } catch {
    return null
  }
}
/** The menu link Google lists for a place (`place_results.menu`): a public https page with no credentials, else null. */
export function mapsMenuLink(menu) {
  try {
    const url = new URL(menu?.link)
    return url.protocol === 'https:' && !url.username && !url.password
      ? { url: url.href, source: text(menu.source) }
      : null
  } catch {
    return null
  }
}
export const mapsListingUrl = (placeId) =>
  `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(placeId)}`

/**
 * One exact-place lookup or one twenty-photo page. Never follows provider links or pagination; `retry` overrides the
 * retry defaults and `onTry` hears each HTTP try (`provider-retry.mjs`).
 */
export async function googleMapsSerpapiCall(
  operation,
  params,
  { key, fetch: fetchImpl = fetch, retry, onTry } = {}
) {
  if (!key) throw fail('CREDENTIAL_MISSING')
  const place = operation === 'place'
  if (!['place', 'overview', 'menu'].includes(operation)) throw fail('INVALID_OPERATION')
  if (place ? !/^[A-Za-z0-9_-]{1,256}$/.test(params.placeId ?? '') : !mapsDataId(params.dataId))
    throw fail('INVALID_LOCATION')
  if (operation === 'menu' && !mapsCategoryId(params.categoryId)) throw fail('INVALID_CATEGORY')
  const query = {
    engine: place ? 'google_maps' : 'google_maps_photos',
    hl: 'en',
    ...(place ? { place_id: params.placeId } : { data_id: params.dataId }),
    ...(operation === 'menu' ? { category_id: params.categoryId } : {}),
    api_key: key
  }
  const url = new URL('https://serpapi.com/search.json')
  url.search = new URLSearchParams(query).toString()
  let body
  try {
    // A 429 or transient 5xx is tried again within a few seconds (`provider-retry.mjs`); a 402 is final.
    body = await tripadvisorJson(
      url.href,
      { accept: 'application/json' },
      { fetch: fetchImpl, retry, ...(onTry ? { onTry } : {}) }
    )
  } catch (error) {
    throw fail(error?.code ?? 'PROVIDER_ERROR')
  }
  if (typeof body?.error === 'string') {
    for (const [parameter, code] of [
      ['category_id', 'INVALID_CATEGORY_ID'],
      ['data_id', 'INVALID_DATA_ID']
    ]) {
      const invalid = new RegExp(
        `(?:invalid|expired|unknown)\\s+(?:parameter\\s+)?["']?${parameter}\\b|\\b${parameter}(?:\\s+(?:parameter|value|is))?\\s+(?:invalid|expired|unknown|not found)`,
        'i'
      )
      if (invalid.test(body.error)) throw fail(code)
    }
  }
  if (!body || body.error || body.search_metadata?.status !== 'Success') throw fail('APPLICATION_ERROR')
  if (place) {
    const result = body.place_results
    if (!result || result.place_id !== params.placeId || !mapsDataId(result.data_id))
      throw fail('INVALID_RESPONSE')
    return {
      placeId: result.place_id,
      dataId: result.data_id,
      name: text(result.title),
      menuLink: mapsMenuLink(result.menu),
      reviews: normalizeMapsReviews(result.user_reviews?.most_relevant, params.placeId)
    }
  }
  if (
    body.search_parameters?.data_id !== params.dataId ||
    (operation === 'menu' && body.search_parameters?.category_id !== params.categoryId) ||
    !Array.isArray(body.photos)
  )
    throw fail('INVALID_RESPONSE')
  if (operation === 'overview' && !Array.isArray(body.categories)) throw fail('INVALID_RESPONSE')
  return {
    categories: (body.categories ?? [])
      .filter((category) => text(category?.title) && mapsCategoryId(category?.id))
      .map(({ title, id }) => ({ title, id })),
    photos: body.photos.slice(0, 20).flatMap((photo) => {
      const url = mapsImageUrl(photo?.image)
      if (!url) return []
      const authorUrl = mapsSourceUrl(photo.user?.link)
      return [
        {
          url,
          authors: text(photo.user?.name)
            ? [{ name: text(photo.user.name), ...(authorUrl ? { uri: authorUrl } : {}) }]
            : []
        }
      ]
    })
  }
}

export function normalizeMapsReviews(raw, placeId) {
  const seen = new Set()
  // Every review the paid lookup returned is kept: none is left behind for a cap of ours.
  return (Array.isArray(raw) ? raw : []).flatMap((review) => {
    const content = text(review?.description),
      author = text(review?.username),
      url = mapsSourceUrl(review?.link)
    if (!content || content.length > 10_000 || !author || !url || seen.has(url)) return []
    seen.add(url)
    const id = createHash('sha256').update(url).digest('hex').slice(0, 24)
    const authorUrl = /^\d{1,30}$/.test(String(review.contributor_id ?? ''))
      ? `https://www.google.com/maps/contrib/${review.contributor_id}`
      : null
    return [
      {
        id,
        source: 'google-maps',
        provider: 'serpapi',
        attribution: 'Google',
        googlePlaceId: placeId,
        text: content,
        author,
        authorUrl,
        authorAvatarUrl: mapsImageUrl(review.user_thumbnail),
        url,
        rating: Number.isFinite(review.rating) ? review.rating : null,
        date: text(review.date_iso8601) ?? text(review.date),
        photos: (Array.isArray(review.images) ? review.images : []).slice(0, 10).flatMap((photo) => {
          const image = mapsImageUrl(photo.image ?? photo.thumbnail)
          return image ? [{ url: image, reviewId: id, sourceUrl: url }] : []
        })
      }
    ]
  })
}

/** Preserve official Google reviews; omit duplicate supplemental quotes by source or author/text. */
export function supplementalMapsReviews(reviews, official = []) {
  return reviews.filter(
    (review) =>
      !official.some(
        (held) =>
          (held.googleMapsUri && held.googleMapsUri === review.url) ||
          (((review.authorUrl && held.authorUri === review.authorUrl) ||
            (review.author && held.author === review.author)) &&
            held.text?.trim() === review.text)
      )
  )
}
