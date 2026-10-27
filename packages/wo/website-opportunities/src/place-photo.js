/**
 * The cover photo of a Google Places listing for the find screen's grid (Find
 * spec): `photos[0]` of Place Details asked with the `photos` field mask ONLY.
 *
 * Pricing (developers.google.com/maps/documentation/places/web-service/place-details, read
 * 18/10/2026): `photos` is in the "Place Details Essentials IDs Only" SKU — the lowest tier, with
 * `id`, `name` and `attributions` — so this call never triggers the Pro or Enterprise SKUs that
 * `domain.fetchPlaceDetails` (the Atmosphere mask, one per researched restaurant) does. The photo
 * bytes themselves are the separate "Place Details Photos" SKU, paid per photo served, which is
 * why the door caches them (`photo-cache.js`).
 */
const PLACES_API = 'https://places.googleapis.com/v1/'
const DETAILS_MAX_BYTES = 256 * 1024
import { isPlaceId } from './place-suggest.js'

const PHOTO_NAME = /^places\/([A-Za-z0-9_-]+)\/photos\/[A-Za-z0-9_-]+$/

export { isPlaceId }

export function isPhotoName(value) {
  return typeof value === 'string' && PHOTO_NAME.test(value)
}

/** The place a photo name belongs to (`places/<id>/photos/<ref>`), or null. */
export function placeIdOfPhotoName(name) {
  const m = typeof name === 'string' ? PHOTO_NAME.exec(name) : null
  return m && isPlaceId(m[1]) ? m[1] : null
}

/** The authors' names of a photo, as Google requires them shown wherever the photo is. */
export function creditOf(attributions) {
  return (Array.isArray(attributions) ? attributions : [])
    .map((a) => (typeof a === 'string' ? a : a?.displayName))
    .filter((n) => typeof n === 'string' && n.trim())
    .map((n) => n.trim())
    .join(', ')
}

/**
 * `{name, credit}` of the listing's first photo, or null when it has none. Throws `{code}`:
 * `CREDENTIAL_MISSING`, `PROVIDER_ERROR`, `QUOTA`, `TIMEOUT`.
 * @param {string} placeId
 * @param {{ googleKey: string, fetchLimited: Function, fetch: typeof fetch, resolve?: Function }} deps
 *   `fetchLimited` is the domain's guarded fetch; `fetch` the crawler's pinned one.
 */
export async function fetchPlacePhotoName(placeId, deps) {
  const fail = (code, message) => Object.assign(new Error(message ?? code), { code })
  if (!deps?.googleKey) throw fail('CREDENTIAL_MISSING', 'no Google key')
  if (!isPlaceId(placeId)) throw fail('PROVIDER_ERROR', 'invalid place id')
  let res
  try {
    res = await deps.fetchLimited(`${PLACES_API}places/${placeId}`, {
      fetch: deps.fetch,
      resolve: deps.resolve,
      headers: { 'X-Goog-Api-Key': deps.googleKey, 'X-Goog-FieldMask': 'photos' },
      maxBytes: DETAILS_MAX_BYTES,
      timeoutMs: 15_000
    })
  } catch (error) {
    // Never the key: the domain's errors may quote the URL, and this one carries it in a header only.
    throw fail(error?.code === 'TIMEOUT' ? 'TIMEOUT' : 'PROVIDER_ERROR', error?.code ?? 'fetch failed')
  }
  if (res.status === 429) throw fail('QUOTA', 'quota')
  if (res.status < 200 || res.status >= 300) throw fail('PROVIDER_ERROR', `HTTP ${res.status}`)
  let body
  try {
    body = JSON.parse(new TextDecoder().decode(res.bytes))
  } catch {
    throw fail('PROVIDER_ERROR', 'invalid JSON from provider')
  }
  const first = Array.isArray(body?.photos) ? body.photos.find((p) => typeof p?.name === 'string') : null
  return first ? { name: first.name, credit: creditOf(first.authorAttributions) } : null
}
