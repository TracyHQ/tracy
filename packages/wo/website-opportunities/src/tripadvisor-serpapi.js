/** SerpApi TripAdvisor engines. Only whitelisted source fields leave this adapter. */
import { tripadvisorJson, tripadvisorUrl } from './tripadvisor.js'

const API = 'https://serpapi.com/search.json'
const fail = (code) => Object.assign(new Error(`SerpApi TripAdvisor ${code}`), { code })
const object = (v) => v && typeof v === 'object' && !Array.isArray(v)
const id = (v) => /^[1-9]\d{0,15}$/.test(String(v ?? ''))

/** SerpApi exposes branch coordinates in the Google Maps address link. No geocoding request is made. */
export function serpapiCoordinates(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== 'maps.google.com' || url.username || url.password)
      return {}
    const hit = (url.searchParams.get('daddr') ?? '').match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/)
    if (!hit) return {}
    const latitude = Number(hit[1]),
      longitude = Number(hit[2])
    return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : {}
  } catch {
    return {}
  }
}

export async function serpapiTripadvisorCall(operation, params, options = {}) {
  if (!options.key) throw fail('CREDENTIAL_MISSING')
  const engine = { search: 'tripadvisor', place: 'tripadvisor_place', reviews: 'tripadvisor_reviews' }[
    operation
  ]
  if (!engine) throw fail('INVALID_OPERATION')
  if (operation !== 'search' && !id(params.place_id)) throw fail('INVALID_LOCATION')
  const query =
    operation === 'search'
      ? { q: params.q, ssrc: 'r', limit: '4', ...(params.lat ? { lat: params.lat, lon: params.lon } : {}) }
      : operation === 'place'
        ? { place_id: params.place_id }
        : { place_id: params.place_id, limit: '20', sort_by: 'most_recent' }
  const url = new URL(API)
  url.search = new URLSearchParams({
    engine,
    tripadvisor_domain: 'www.tripadvisor.com',
    ...query,
    api_key: options.key
  }).toString()
  const body = await tripadvisorJson(url.href, { accept: 'application/json' }, options)
  if (!object(body) || body.error || body.search_metadata?.status !== 'Success')
    throw fail('APPLICATION_ERROR')
  if (operation !== 'search' && String(body.search_parameters?.place_id) !== String(params.place_id))
    throw fail('INVALID_RESPONSE')
  if (operation === 'search') {
    if (!Array.isArray(body.places)) throw fail('INVALID_RESPONSE')
    return body.places.map((place) => {
      if (!object(place) || !id(place.place_id) || typeof place.title !== 'string')
        throw fail('INVALID_RESPONSE')
      return {
        place_id: String(place.place_id),
        title: place.title,
        market: typeof place.location === 'string' ? place.location : null,
        link: tripadvisorUrl(place.link),
        rating: place.rating,
        reviews: place.reviews
      }
    })
  }
  if (operation === 'place') {
    const place = body.place_result
    if (
      !object(place) ||
      typeof place.name !== 'string' ||
      (place.place_id && String(place.place_id) !== String(params.place_id))
    )
      throw fail('INVALID_RESPONSE')
    return {
      place_id: String(params.place_id),
      title: place.name,
      address: place.address,
      phone: place.phone,
      website: place.website,
      ...serpapiCoordinates(place.address_link),
      link: tripadvisorUrl(place.link) ?? tripadvisorUrl(body.search_metadata?.tripadvisor_place_url),
      rating: place.rating,
      reviews: place.reviews,
      ...(Array.isArray(place.images)
        ? { images: place.images.filter((image) => typeof image === 'string') }
        : {})
    }
  }
  if (!Array.isArray(body.reviews)) throw fail('INVALID_RESPONSE')
  return body.reviews.slice(0, 20).map((review) => {
    if (!object(review)) throw fail('INVALID_RESPONSE')
    return {
      id: review.review_id,
      text: review.snippet,
      author: {
        name: review.author?.display_name ?? review.author?.username,
        url: tripadvisorUrl(review.author?.link),
        avatar: review.author?.avatar
      },
      link: tripadvisorUrl(review.link),
      rating: review.rating,
      date: review.date,
      language: review.original_language ?? review.language,
      ...(Array.isArray(review.images)
        ? { images: review.images.filter((image) => typeof image === 'string') }
        : {})
    }
  })
}
