// The link of the Tracy reviews block (ticket #596): the business's Google listing, and nothing else. A link the caller
// passes and one read from the needs profile's Google source go through the same check, so a review never links to a
// page that is not the business's Google listing. Pure; a link that fails raises `ReviewsBlockError` `listing_missing`.
import { ReviewsBlockError } from './library-reviews-error.mjs'

const TLD = '[a-z]{2,3}(?:\\.[a-z]{2})?'
// Hosts where every page is a Maps page: Google Maps itself, a Google business short link, a Maps share link.
const MAPS_HOST = new RegExp(`^maps\\.google\\.${TLD}$`)
const MAPS_SHORT_HOSTS = new Set(['g.page', 'maps.app.goo.gl'])
// Hosts of Google search, where only the `/maps` pages are a listing.
const SEARCH_HOST = new RegExp(`^(?:www\\.)?google\\.${TLD}$`)
const PLACE_ID = /^[\w-]+$/
const PLACES_PREFIX = 'places/'

const isText = (value) => typeof value === 'string' && value.trim() !== ''
const missing = (why) =>
  new ReviewsBlockError(
    'listing_missing',
    `the reviews block links to the Google listing, and there is none: ${why}`
  )

/**
 * A link to a Google listing as the block writes it, trimmed and normalised. Accepted: https only, no user name and no
 * port, on maps.google.<tld>, on www.google.<tld> or google.<tld> under `/maps`, on g.page or on maps.app.goo.gl.
 * Google's `/url?q=` redirect and every other host are refused.
 * @param {unknown} value
 * @returns {string}
 */
export function checkedListingUrl(value) {
  if (!isText(value)) throw missing('no link')
  let url
  try {
    url = new URL(value.trim())
  } catch {
    throw missing('not a link')
  }
  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:') throw missing('a listing link is https')
  if (url.username || url.password || url.port) throw missing('a listing link has no user name and no port')
  if (url.pathname === '/url' || url.pathname.startsWith('/url/')) throw missing('a Google redirect')
  const maps =
    MAPS_HOST.test(host) ||
    MAPS_SHORT_HOSTS.has(host) ||
    (SEARCH_HOST.test(host) && /^\/maps(?:\/|$)/.test(url.pathname))
  if (!maps) throw missing(`${host} is not a Google Maps address`)
  return url.href
}

/**
 * The link to the business's Google listing, from the needs profile's Google source: its own address when it is a
 * listing link, else the Maps link built from the place id it names (a Places API name `places/<id>` loses its prefix).
 * @param {{ref?: string, name?: string} | null | undefined} source the profile's `google` source; `name` the business
 * @returns {string}
 */
export function googleListingUrl(source) {
  const ref = source && typeof source === 'object' ? source.ref : undefined
  if (!isText(ref)) throw missing('the Google source names no place')
  const value = ref.trim()
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return checkedListingUrl(value)
  const id = value.startsWith(PLACES_PREFIX) ? value.slice(PLACES_PREFIX.length) : value
  if (!PLACE_ID.test(id)) throw missing(`${JSON.stringify(value)} is not a place id`)
  const name = isText(source.name) ? source.name.trim() : id
  return checkedListingUrl(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(id)}`
  )
}
