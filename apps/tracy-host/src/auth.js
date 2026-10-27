/**
 * The verifying half of the signed channel from `tracy-web` — mirrored against
 * `apps/tracy-web/src/host/client.js`'s `signHostCall`, SAME canonical string, checked from a
 * completely different codebase. Any drift between the two (a header name, the placement of a
 * `\n`, whether the method segment is the real HTTP verb or a fixed literal) turns into every
 * `/_host/*` call answering 403 with `signature` — that is why `test/auth.test.mjs` signs with
 * the actual client function instead of a hand-typed fixture: two independent readings of a
 * shared paragraph of prose are exactly how this kind of thing drifts apart unnoticed.
 *
 * CANONICAL: `${timestamp}\n${nonce}\nPOST\n${path}\n${sha256Hex(body)}` — the method segment is
 * ALWAYS the literal `POST`, even when the real HTTP verb is GET (`hostJob`'s one read route).
 * That is not a bug to fix here: it is one fewer axis for the two sides to disagree on, the same
 * choice the seat door made (`vendor/tracy/dsh-passwords/src/tracy/seat.ts`'s `canonical()`).
 *
 * `tracy-host` holds NO seat secret and admits NO cookie (this migration's boundary rule). The
 * only credential this file ever checks is the one `hostSecret` this host was given, over a
 * channel only `tracy-web` knows how to sign for.
 */
import { hmacHex, sha256Hex } from './hmac.js'

/** How far a signed request may be allowed to drift from this host's own clock. */
const FRESHNESS_MS = 120_000
/** How long a spent nonce is remembered — must be >= FRESHNESS_MS, or a request could fall out of
 * the replay table while still inside the freshness window and be replayed once more. */
const NONCE_MEMORY_MS = 120_000

/** Constant-time hex compare — `===` on a hex string leaks its shared prefix to a timing attack.
 * The same one-line idiom `apps/tracy-web/src/github/route.js` uses, copied rather than imported:
 * the two apps share an idiom here, not a module (RULE #1). */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Verify one signed `/_host/*` call.
 *
 * Order matters, same reasoning as the seat door's `verifySeatRequest`
 * (`vendor/tracy/dsh-passwords/src/tracy/seat.ts`): the signature is checked BEFORE the nonce is remembered,
 * so an unauthenticated caller can't fill the replay table by throwing garbage at the door.
 *
 * @param {object} input
 * @param {string} input.secret - this host's `hostSecret` — never a seat secret, tracy-host holds
 *   none.
 * @param {string} input.path - the request path exactly as received, e.g. `/_host/jobs/abc` (no
 *   query string — `signHostCall`'s callers never sign one).
 * @param {string} input.body - the raw request body, exactly as received (already-serialized;
 *   an empty string for a bodyless GET, matching `hostJob`).
 * @param {Record<string, string>} input.headers - `x-host-timestamp` / `x-host-nonce` /
 *   `x-host-signature`, lower-cased keys.
 * @param {number} [input.now] - clock override, for tests.
 * @param {Map<string, number>} [input.seen] - spent nonce → the moment it may be forgotten.
 *   Owned by the caller so it survives across requests; defaults to a fresh Map so a caller who
 *   forgets to pass a shared one fails obviously (never blocks a legitimate replay) rather than
 *   silently granting replay protection that isn't there.
 * @returns {Promise<{ok: true} | {ok: false, why: 'missing'|'skew'|'signature'|'replay'}>}
 */
export async function verifyHostCall({ secret, path, body, headers, now = Date.now(), seen = new Map() }) {
  const timestamp = headers?.['x-host-timestamp']
  const nonce = headers?.['x-host-nonce']
  const signature = headers?.['x-host-signature']
  if (!secret || !timestamp || !nonce || !signature) return { ok: false, why: 'missing' }

  const sent = Number(timestamp)
  if (!Number.isFinite(sent)) return { ok: false, why: 'missing' }
  if (Math.abs(now - sent) > FRESHNESS_MS) return { ok: false, why: 'skew' }

  const expected = await hmacHex(secret, `${timestamp}\n${nonce}\nPOST\n${path}\n${await sha256Hex(body)}`)
  if (!timingSafeEqual(expected, signature)) return { ok: false, why: 'signature' }

  // Sweep expired nonces before checking/recording this one, so `seen` never grows unbounded on
  // a long-lived process — the same sweep-then-check order the seat door's verifier uses.
  for (const [spentNonce, expiresAt] of seen) {
    if (expiresAt <= now) seen.delete(spentNonce)
  }
  if (seen.has(nonce)) return { ok: false, why: 'replay' }
  seen.set(nonce, now + NONCE_MEMORY_MS)
  return { ok: true }
}
