/**
 * Whether a public name reaches THIS tracy-web: ask `/__tracy/address-probe` on it with a token in
 * the `x-tracy-address-probe` header, and require the token back. Only `bar/route.js` answers that
 * path with the token, so an echo proves the name is routed to Tracy's own proxy — not to a
 * container straight, not to a stale DNS record or tunnel rule that outranks the zone's wildcard.
 *
 * Lives in `lib/` because two domains use it: `sites/address.js` (a managed address change) and
 * `lib/demo-sites.js` (a demo going live), and a domain may import only `lib/` and `db/`.
 */

import { randomBytes } from 'node:crypto'

/** The path and header `bar/route.js` echoes. */
export const ADDRESS_PROBE_PATH = '/__tracy/address-probe'
export const ADDRESS_PROBE_HEADER = 'x-tracy-address-probe'

/**
 * One ask: true only when the answer is a 2xx whose body is exactly `token`. A redirect, an error
 * status, another body, a timeout or a network error are all false; it never throws.
 * @param {string | URL} url any URL on the name; only its origin is used
 * @param {string} token
 * @param {typeof fetch} fetchImpl
 * @param {number} [waitMs]
 */
export async function probeAddressOnce(url, token, fetchImpl, waitMs = 8000) {
  try {
    const response = await fetchImpl(new URL(ADDRESS_PROBE_PATH, url), {
      headers: { [ADDRESS_PROBE_HEADER]: token },
      redirect: 'manual',
      signal: AbortSignal.timeout(waitMs)
    })
    if (!response.ok) return false
    return (await response.text()) === token
  } catch {
    return false
  }
}

/**
 * `probeAddressOnce` with a fresh random token, asked up to `tries` times `gapMs` apart: a name
 * just routed may need a few seconds of DNS or edge propagation before it answers.
 * @param {string | URL} url
 * @param {{fetchImpl: typeof fetch, tries?: number, gapMs?: number, waitMs?: number,
 *   sleep?: (ms: number) => Promise<void>}} opts
 * @returns {Promise<boolean>}
 */
export async function addressReachesTracy(
  url,
  { fetchImpl, tries = 3, gapMs = 2000, waitMs = 5000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }
) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (attempt > 0) await sleep(gapMs)
    if (await probeAddressOnce(url, randomBytes(16).toString('hex'), fetchImpl, waitMs)) return true
  }
  return false
}
