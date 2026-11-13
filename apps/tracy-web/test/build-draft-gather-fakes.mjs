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

/** Invented picture bytes: a PNG of one plain colour, of a real size (`sharp` makes it, so it measures as one). */
export async function pngOf(width, height, background = { r: 180, g: 92, b: 60 }) {
  const { default: sharp } = await import('sharp')
  return new Uint8Array(
    await sharp({ create: { width, height, channels: 3, background } })
      .png()
      .toBuffer()
  )
}

/** An objects door held in memory (`put`, `get`, `delete`, as `lib/store-objects.js`), with what it holds. */
export function fakeObjects({ refuse = false } = {}) {
  const held = new Map()
  return {
    held,
    async put(key, bytes, mime) {
      if (refuse) return false
      held.set(key, { bytes: new Uint8Array(bytes), mime })
      return true
    },
    async get(key) {
      const o = held.get(key)
      return o ? { ok: true, arrayBuffer: async () => o.bytes.buffer.slice(0) } : { ok: false }
    },
    async delete(key) {
      return held.delete(key)
    }
  }
}

/**
 * The `build_draft_picture` table held in memory, for the gatherer's tests without a database: the three statements of
 * `pictures.js` (the upsert by account and sha256, the open by id, the prune by run). The Postgres test runs the real
 * table (`build-draft-engine.test.mjs`).
 */
export function fakePicturePool() {
  const rows = []
  let n = 0
  const COLS = [
    'account_id',
    'research_run',
    'kind',
    'category',
    'source',
    'source_url',
    'post_id',
    'posted_at'
  ]
  const MORE = ['caption', 'alt', 'sha256', 'object_key', 'mime', 'bytes', 'width', 'height', 'duration_s']
  const LAST = ['palette', 'dhash', 'labels']
  return {
    rows,
    async query(sql, params) {
      if (/^\s*insert into build_draft_picture/.test(sql)) {
        const given = Object.fromEntries([...COLS, ...MORE, ...LAST].map((c, i) => [c, params[i]]))
        given.palette = given.palette ? JSON.parse(given.palette) : null
        given.labels = given.labels ? JSON.parse(given.labels) : null
        const old = rows.find((r) => r.account_id === given.account_id && r.sha256 === given.sha256)
        if (old) {
          for (const c of [
            'research_run',
            'source',
            'source_url',
            'post_id',
            'posted_at',
            'caption',
            'alt',
            'category'
          ])
            old[c] = given[c]
          return { rows: [old] }
        }
        const row = { id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, ...given }
        rows.push(row)
        return { rows: [row] }
      }
      if (/^\s*delete from build_draft_picture/.test(sql)) {
        const gone = rows.filter((r) => r.account_id === params[0] && r.research_run !== params[1])
        for (const g of gone) rows.splice(rows.indexOf(g), 1)
        return { rows: gone }
      }
      if (/^\s*select .* from build_draft_picture/s.test(sql))
        return { rows: rows.filter((r) => r.id === params[0] && (!params[1] || r.account_id === params[1])) }
      throw new Error(`no fake for: ${sql.slice(0, 60)}`)
    }
  }
}
