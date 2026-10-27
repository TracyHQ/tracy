/**
 * Where a Website Opportunities place picture's bytes live (shared places plan §7).
 *
 * Two stores, chosen by the key's prefix, never by a column:
 *   - `media/<origin>/<sha256[0:2]>/<sha256>.<ext>` → the SHARED bucket (`PLACE_MEDIA_S3_*`, R2
 *     `tracy-google-place-media`), one for every deployment. The key names the content, so two
 *     deployments storing one picture write one object; a duplicate write is harmless.
 *     `<origin>` is `google` (Google-served content: Places, Maps, also through SerpApi) or `other`,
 *     so Google content can be purged by prefix.
 *   - anything else (`places/<place uuid>/…`, `opportunities/…`) → this deployment's artifact store.
 *
 * 🔒 WO never deletes from the shared bucket: other deployments' rows may point at any object in it.
 */

export const SHARED_MEDIA_ROOT = 'media/'
export const MEDIA_ORIGINS = ['google', 'other']
/** A shared key, with its origin, sha256 and extension captured. */
export const SHARED_MEDIA_KEY = /^media\/(google|other)\/([0-9a-f]{2})\/([0-9a-f]{64})\.([a-z0-9]{2,5})$/

const SHA256 = /^[0-9a-f]{64}$/
const EXT = /^[a-z0-9]{2,5}$/
const GOOGLE_SOURCES = new Set(['google-places', 'google-maps', 'google-places-search'])
const GOOGLE_PROVIDERS = new Set(['google', 'serpapi'])

/** `google` when the picture was served by Google (directly or through SerpApi's Maps), else `other`. */
export function placeMediaOrigin({ source, provider, credit } = {}) {
  if (GOOGLE_SOURCES.has(source) || GOOGLE_PROVIDERS.has(provider)) return 'google'
  if (credit && (credit.provider === 'Google' || credit.googlePlaceId)) return 'google'
  return 'other'
}

export function sharedMediaKey({ sha256, ext, origin }) {
  if (!SHA256.test(sha256 ?? '')) throw new Error('sharedMediaKey: sha256 must be 64 lower-case hex')
  if (!EXT.test(ext ?? '')) throw new Error('sharedMediaKey: bad extension')
  if (!MEDIA_ORIGINS.includes(origin)) throw new Error('sharedMediaKey: origin must be google or other')
  return `${SHARED_MEDIA_ROOT}${origin}/${sha256.slice(0, 2)}/${sha256}.${ext}`
}

export const isSharedMediaKey = (key) => typeof key === 'string' && key.startsWith(SHARED_MEDIA_ROOT)

/**
 * One objects adapter over both stores (each `{get, put, publicUrl, head?, delete?}` or null).
 * `sharedKey(media, ext)` is the key a NEW place picture gets: shared when the bucket is configured,
 * null otherwise (the caller keeps its old `places/` key). @returns {object | null}
 */
export function routePlaceMediaObjects({ local, shared }) {
  if (!local && !shared) return null
  const storeOf = (key) => (isSharedMediaKey(key) ? shared : local)
  return {
    async get(key) {
      return (await storeOf(key)?.get(key)) ?? null
    },
    async put(key, bytes, type) {
      const store = storeOf(key)
      return store ? Boolean(await store.put(key, bytes, type)) : false
    },
    async publicUrl(key) {
      return (await storeOf(key)?.publicUrl?.(key)) ?? null
    },
    /** `{size}` of a stored object, or null when it is missing or unreadable. */
    async head(key) {
      return (await storeOf(key)?.head?.(key)) ?? null
    },
    async delete(key) {
      if (isSharedMediaKey(key)) return
      await local?.delete?.(key)
    },
    sharedKey(media, ext) {
      return shared ? sharedMediaKey({ sha256: media.sha256, ext, origin: placeMediaOrigin(media) }) : null
    }
  }
}
