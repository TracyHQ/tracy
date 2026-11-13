// Fakes of the build chat research gatherer's network doors (#609): the Website Opportunities domain as it is, with
// every door that reaches the network replaced (the link guard, the connectors, Google Places, listing pages). Every
// business, address, phone number, handle and link here is invented; no place id is real.
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'

export const SITE = 'https://hollowmere-bakehouse.example/'
export const FACEBOOK = 'https://www.facebook.com/hollowmerebakehouse.example'
export const PLACE_ID = 'ChIJinventedHollowmere0001'
export const MAPS = `https://www.google.com/maps/search/?api=1&query=Hollowmere&query_place_id=${PLACE_ID}`

/** What the invented bakery's website says, as the website crawler answers it. */
export const websiteResult = () => ({
  source: 'website',
  status: 'complete',
  reason: null,
  coverage: { fetched: 2 },
  profile: {
    name: 'Hollowmere Bakehouse',
    phone: '+1 555 0142 318',
    address: '12 Quillan Lane, Brackenford',
    bio: 'Sourdough baked before dawn since 2011.',
    businessType: 'Bakery',
    links: [FACEBOOK]
  },
  pages: [
    { url: SITE, title: 'Hollowmere Bakehouse', text: 'Hollowmere Bakehouse. Sourdough baked before dawn.' }
  ],
  media: [
    { url: 'https://hollowmere-bakehouse.example/img/loaves.jpg', alt: 'Morning loaves on the counter' },
    { url: 'https://hollowmere-bakehouse.example/img/oven.jpg', alt: 'Our wood oven' }
  ],
  posts: []
})

/** What the invented bakery's Facebook page says, as the social connector answers it. */
export const facebookResult = () => ({
  source: 'facebook',
  status: 'complete',
  reason: null,
  coverage: { fetched: 1 },
  profile: { name: 'Hollowmere Bakehouse', bio: 'Neighbourhood bakery.' },
  posts: [{ id: 'p1', text: 'Rye is back on Saturdays.', postedAt: '2026-10-30T08:00:00.000Z' }],
  media: [{ url: 'https://cdn.social.example/hollowmere/rye.jpg', caption: 'Rye is back', postId: 'p1' }]
})

/** Google's Place Details answer for the invented bakery (Places API field names). */
export const placeDetails = () => ({
  id: PLACE_ID,
  displayName: { text: 'Hollowmere Bakehouse', languageCode: 'en' },
  formattedAddress: '12 Quillan Lane, Brackenford',
  nationalPhoneNumber: '+1 555 0142 318',
  primaryType: 'bakery',
  types: ['bakery', 'food'],
  rating: 4.7,
  userRatingCount: 88,
  regularOpeningHours: { weekdayDescriptions: ['Monday: 7:00 AM to 3:00 PM'] }
})

/**
 * The domain with its network doors faked. `connectors` replaces `connectorsFor`'s answer; a host named
 * `private.example` is refused by the link guard as a private address; `calls` records each door used.
 */
export async function fakeDomain({ connectors = {}, details = placeDetails, realGuard = false } = {}) {
  const domain = await websiteOpportunitiesDomain()
  const calls = []
  const fake = {
    ...domain,
    async assertPublicUrl(url, deps) {
      calls.push(['guard', String(url)])
      if (realGuard) return domain.assertPublicUrl(url, deps)
      if (new URL(String(url)).hostname.endsWith('private.example'))
        throw Object.assign(new Error('blocked'), { code: 'URL_BLOCKED' })
      return new URL(String(url))
    },
    connectorsFor: (env) => {
      calls.push(['connectors', env])
      return {
        website: { available: false, reason: 'unsupported' },
        facebook: { available: false, reason: 'credential_missing' },
        instagram: { available: false, reason: 'credential_missing' },
        tiktok: { available: false, reason: 'credential_missing' },
        youtube: { available: false, reason: 'credential_missing' },
        ...connectors
      }
    },
    async searchNamedPlaces(query) {
      calls.push(['search', query])
      return {
        candidates: [{ provider: 'google-places', providerId: PLACE_ID, name: 'Hollowmere Bakehouse' }]
      }
    },
    async fetchPlaceDetails(id, deps) {
      calls.push(['details', id, Boolean(deps.googleKey)])
      return details(id)
    },
    async readListingPage(url) {
      calls.push(['listing', url])
      return { ok: false, reason: 'blocked' }
    }
  }
  return { domain: fake, calls }
}

/** A connector answering `result()` and recording what it was asked. */
export const connector = (result, asked = []) => ({
  available: true,
  provider: 'fake',
  async collect(ref, opts, deps) {
    asked.push({ ref, opts, deps })
    return typeof result === 'function' ? result(ref, opts, deps) : result
  }
})

/** The `/ops/wo` runtime of a server with these keys. */
export const runtimeWith =
  (keys = {}, settings = {}) =>
  async () => ({ keys, settings })
