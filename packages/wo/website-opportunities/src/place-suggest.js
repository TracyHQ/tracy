/**
 * The Find place box's two Google calls, shared by the signed-in doors
 * (`opportunities/route.js`, `/api/website-opportunities/places/suggest[/:placeId]`) and the
 * sign-in-free ones (`public/wo-find-page.js`, `/find/api/places/suggest[/:placeId]`): one
 * Autocomplete call per debounced keystroke in a typing session, then one Place Details call
 * (location only) on a pick, in the same session so Google bills them as one. Each door keeps its
 * own caller check and budget; the input rules and the provider calls are this file's.
 */
export const SUGGEST_MIN_CHARS = 3
export const SUGGEST_MAX_CHARS = 200
const LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/
const SESSION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PLACE_ID = /^[A-Za-z0-9_-]{4,200}$/

export function isPlaceId(value) {
  return typeof value === 'string' && PLACE_ID.test(value)
}

/** `{session, lang}` of a suggest request, or `{refusal}` (400) when either is malformed. */
export function suggestSession(session, lang) {
  if (!SESSION.test(session ?? '') || (lang !== undefined && !LANGUAGE_TAG.test(lang)))
    return {
      refusal: {
        status: 400,
        code: 'INVALID_SUGGEST',
        next: `Send ?q=<up to ${SUGGEST_MAX_CHARS} characters>&session=<UUID of this typing session>[&lang=<language tag>].`
      }
    }
  return { session, lang }
}

/** What was typed: `{input}`, `{tooShort: true}` (answer no suggestions, ask nobody) or `{refusal}`. */
export function suggestInput(q) {
  const raw = q ?? ''
  if (raw.length > SUGGEST_MAX_CHARS)
    return {
      refusal: {
        status: 400,
        code: 'INVALID_SUGGEST',
        next: `Send at most ${SUGGEST_MAX_CHARS} characters in ?q=.`
      }
    }
  // One spelling per query, so the same words are one kept answer (`places-cache.js`).
  const input = raw.trim().replace(/\s+/g, ' ').toLowerCase()
  return input.length < SUGGEST_MIN_CHARS ? { tooShort: true } : { input }
}

/** One Autocomplete call: `[{placeId, text, mainText, secondaryText, types}]`. Throws `{code}`. */
export function suggestFrom(domain, { input, session, lang }, deps) {
  return domain.suggestPlaces({ input, sessionToken: session, ...(lang ? { language: lang } : {}) }, deps)
}

/** One Place Details call for a pick: `{label, lat, lon}`, or null when Google has no location. Throws `{code}`. */
export async function resolveFrom(domain, placeId, { session, lang }, deps) {
  const place = await domain.fetchPlaceLocation(placeId, {
    ...deps,
    sessionToken: session,
    ...(lang ? { language: lang } : {})
  })
  return place ? { label: place.label, lat: place.lat, lon: place.lon } : null
}

/** A provider failure as a refusal the place box understands: it stops suggesting, typing still works. */
export function providerRefusalOf(error) {
  if (error?.code === 'CREDENTIAL_MISSING')
    return { status: 503, code: 'CREDENTIAL_MISSING', next: 'Ask an admin to save a Google key on /ops/wo.' }
  if (error?.code === 'QUOTA')
    return { status: 429, code: 'PROVIDER_QUOTA', next: 'Google refused for quota; try again later.' }
  return { status: 502, code: 'PROVIDER_ERROR', next: 'Google did not answer; show the placeholder.' }
}
