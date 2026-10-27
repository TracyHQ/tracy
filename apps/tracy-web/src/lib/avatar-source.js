/**
 * Where a person's picture may come from: the provider address Google or GitHub handed over at
 * sign-in, and nothing else.
 *
 * 🔒 ONE ALLOW-LIST FOR BOTH ENDS. The sign-in writes `account.avatar_url` only through
 * `avatarSource` (`identity/route.js`), `personFace` turns a stored value into Tracy's own address
 * only when it passes here, and `GET /auth/avatar/:accountId` (`identity/avatar.js`) fetches only an
 * address that passes here, every redirect hop included. A value that fails is no picture at all:
 * the letter is drawn.
 *
 * The hosts are the providers' own picture CDNs, not Tracy addresses, so they are not deployment
 * config (`scripts/check-origins.ts` is about Tracy's own domain).
 *
 * Pure and shared (`lib/`): `identity/` and every door that answers a face import it.
 */

/** Exact hosts. */
const EXACT_HOSTS = new Set(['avatars.githubusercontent.com'])
/** Host suffixes: Google serves pictures from `lh3.googleusercontent.com`, `lh4.…` and so on. */
const HOST_SUFFIXES = ['.googleusercontent.com']

/** Longest address stored or fetched — a provider picture address is far shorter. */
const MAX_LENGTH = 2048

/**
 * The address as Tracy may store and fetch it, or null when it is not a provider picture.
 * @param {unknown} value
 * @returns {string | null} the normalised `https:` address
 */
export function avatarSource(value) {
  if (typeof value !== 'string' || value === '' || value.length > MAX_LENGTH) return null
  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
  const host = url.hostname.toLowerCase()
  if (!EXACT_HOSTS.has(host) && !HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return null
  return url.toString()
}
