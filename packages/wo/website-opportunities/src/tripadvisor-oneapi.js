/** OneAPI TripAdvisor on RapidAPI. Parameters verified against its exported OpenAPI, 21 October 2026. */
import { tripadvisorJson, tripadvisorUrl } from './tripadvisor.js'

const HOST = 'tripadvisor-api1.p.rapidapi.com'
const fail = (code) => Object.assign(new Error(`OneAPI TripAdvisor ${code}`), { code })
const object = (v) => v && typeof v === 'object' && !Array.isArray(v)
const id = (v) => /^[1-9]\d{0,15}$/.test(String(v ?? ''))
const name = (v) => typeof v === 'string' && v.trim()

/** Canonical fields shared with the Litescrape adapter. Missing branch facts stay missing. */
function place(raw) {
  if (!object(raw) || !id(raw.locationId) || !name(raw.name)) throw fail('INVALID_RESPONSE')
  return {
    place_id: String(raw.locationId),
    title: raw.name,
    latitude: raw.latitude,
    longitude: raw.longitude,
    address: raw.address,
    phone: raw.phone,
    website: raw.officialUrl,
    link: tripadvisorUrl(raw.tripadvisorUrl),
    ...(Array.isArray(raw.photos) ? { images: raw.photos.filter((image) => typeof image === 'string') } : {})
  }
}

export async function oneapiTripadvisorCall(operation, params, options = {}) {
  if (!options.key) throw fail('CREDENTIAL_MISSING')
  const endpoint = { search: 'autocomplete', place: 'details_byid', reviews: 'reviews_byid' }[operation]
  if (!endpoint) throw fail('INVALID_OPERATION')
  if (operation !== 'search' && !id(params.place_id)) throw fail('INVALID_LOCATION')
  const query =
    operation === 'search'
      ? { input: params.q, searchType: 'Restaurants', resultCount: '4' }
      : operation === 'place'
        ? { locationId: params.place_id, searchType: 'Restaurants' }
        : {
            locationId: params.place_id,
            contentType: 'RESTAURANT',
            page: '1',
            resultCount: '10',
            sortOrder: 'Newest'
          }
  const url = new URL(`https://${HOST}/${endpoint}`)
  url.search = new URLSearchParams(query).toString()
  const body = await tripadvisorJson(
    url.href,
    {
      'x-rapidapi-key': options.key,
      'x-rapidapi-host': HOST,
      accept: 'application/json'
    },
    options
  )
  // This provider can report upstream errors in HTTP 200 alongside an empty result array.
  if (!object(body) || body.message !== 'Success' || body.source !== 'tripadvisor.com')
    throw fail('APPLICATION_ERROR')
  if (operation === 'place') {
    const result = place(body.detail)
    if (result.place_id !== String(params.place_id)) throw fail('INVALID_RESPONSE')
    return result
  }
  if (operation === 'search') {
    if (!Array.isArray(body.searchResults)) throw fail('INVALID_RESPONSE')
    return body.searchResults.map(place)
  }
  if (!Array.isArray(body.reviews)) throw fail('INVALID_RESPONSE')
  return body.reviews.slice(0, 10).map((review) => {
    if (!object(review) || String(review.locationId) !== String(params.place_id))
      throw fail('INVALID_RESPONSE')
    return {
      id: review.reviewId,
      text: review.text,
      author: review.author,
      rating: review.rating,
      published_date: review.publishedDate,
      language: review.language
    }
  })
}
