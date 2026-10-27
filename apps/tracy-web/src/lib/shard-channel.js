// apps/tracy-web/src/lib/shard-channel.js
/**
 * The signed channel between the master's tracy-web and a shard's (shard beta,
 * docs/sre/hop-dong-cua-shard.md §2). One file for both sides — the master imports it (W1), the
 * shard answers with it (W2) — and the heartbeat script (W3) signs the same string with openssl:
 *
 *   <timestamp ms>\n<nonce>\n<METHOD>\n<path without query>\n<sha256hex(body)>
 *
 * METHOD is the request's real method (`GET` for `/_shard/status`, whose empty body hashes to the
 * sha256 of the empty string). The query string is never signed: `canonicalString` drops it, so a
 * caller that passes the full request target signs the same string as one that passes the path.
 * Headers: `x-shard-timestamp` (ms), `x-shard-nonce` (32 hex), `x-shard-signature` (hex
 * HMAC-SHA256). No secret for the caller is `unknown_shard` (on the master: no `shard` row of that
 * name), a request more than 120 s from this clock is `clock`, a nonce seen in the last 120 s is
 * `replay`, anything else wrong is `signature`; the door answers `403 {code: "SIGNATURE_INVALID",
 * why}`. The secret is `SHARD_SECRET` on the shard and `SHARD_<name>_SECRET` on the master — never
 * a host secret. Exactly five exports, all three functions synchronous (contract §2): the master's
 * contract test (W1) pins the names.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** The three header names, so neither side of the channel spells them twice. */
export const SHARD_HEADERS = Object.freeze({
  timestamp: 'x-shard-timestamp',
  nonce: 'x-shard-nonce',
  signature: 'x-shard-signature'
})
/** How far a signed request may drift from this clock, and how long a spent nonce is remembered. */
export const SHARD_FRESHNESS_MS = 120_000
const NONCE = /^[0-9a-f]{32}$/
const SIGNATURE = /^[0-9a-f]{64}$/
const TIMESTAMP = /^\d{1,15}$/

/** The body is hashed as the bytes that were signed: a `Uint8Array` as it is, anything else as UTF-8 text. */
const sha256hex = (body) => {
  const hash = createHash('sha256')
  if (body instanceof Uint8Array) hash.update(body)
  else hash.update(String(body ?? ''), 'utf8')
  return hash.digest('hex')
}
const hmac = (secret, text) => createHmac('sha256', secret).update(text, 'utf8')

/** The string both sides sign (contract §2). */
export function canonicalString({ timestamp, nonce, method, path, body }) {
  const bare = String(path).split('?')[0]
  return `${timestamp}\n${nonce}\n${String(method).toUpperCase()}\n${bare}\n${sha256hex(body)}`
}

/**
 * The three headers of one signed request. `now` and `nonce` exist for tests and the openssl
 * cross-check (Task 8); a caller never picks its own nonce.
 * @returns {{'x-shard-timestamp': string, 'x-shard-nonce': string, 'x-shard-signature': string}}
 */
export function signShardRequest({
  secret,
  method,
  path,
  body,
  now = Date.now(),
  nonce = randomBytes(16).toString('hex')
}) {
  if (!secret) throw new Error('signShardRequest needs the channel secret')
  const timestamp = String(now)
  return {
    [SHARD_HEADERS.timestamp]: timestamp,
    [SHARD_HEADERS.nonce]: nonce,
    [SHARD_HEADERS.signature]: hmac(secret, canonicalString({ timestamp, nonce, method, path, body })).digest(
      'hex'
    )
  }
}

/** Lower-cased header names, from a `Headers` or a plain object. */
const lower = (headers) =>
  headers instanceof Headers
    ? Object.fromEntries(headers)
    : Object.fromEntries(
        Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), String(value)])
      )

/**
 * Verify one request. No secret is said first (`unknown_shard`: the master has no row for that
 * shard, so nothing else about the request can be judged). The signature is checked BEFORE the
 * nonce is remembered, so an unsigned caller cannot fill `seen`. The CALLER owns `seen` (nonce →
 * forget-at ms) so it outlives one request — a fresh Map per call would let every replay through;
 * the default exists only for a caller that truly has no table. A restart forgets it — the accepted
 * 120 s replay window (spec §8).
 * @param {{secret: string | null | undefined, headers: Headers | Record<string, string | undefined>,
 *   method: string, path: string, body?: string | Uint8Array, now?: number, seen?: Map<string, number>}} input
 * @returns {{ok: true} | {ok: false, why: 'clock' | 'replay' | 'signature' | 'unknown_shard'}}
 */
export function verifyShardRequest({
  secret,
  headers,
  method,
  path,
  body,
  now = Date.now(),
  seen = new Map()
}) {
  if (!secret) return { ok: false, why: 'unknown_shard' }
  const h = lower(headers)
  const timestamp = h[SHARD_HEADERS.timestamp] ?? ''
  const nonce = h[SHARD_HEADERS.nonce] ?? ''
  const signature = h[SHARD_HEADERS.signature] ?? ''
  if (!TIMESTAMP.test(timestamp) || !NONCE.test(nonce) || !SIGNATURE.test(signature))
    return { ok: false, why: 'signature' }
  if (Math.abs(now - Number(timestamp)) > SHARD_FRESHNESS_MS) return { ok: false, why: 'clock' }
  const expected = hmac(secret, canonicalString({ timestamp, nonce, method, path, body })).digest()
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return { ok: false, why: 'signature' }
  for (const [spent, forgetAt] of seen) if (forgetAt <= now) seen.delete(spent)
  if (seen.has(nonce)) return { ok: false, why: 'replay' }
  // Remembered until the end of ITS OWN window (`timestamp + 120 s`), not `now + 120 s`: a signer whose
  // clock runs ahead still has a valid window left when `now + 120 s` has passed (contract §2).
  seen.set(nonce, Number(timestamp) + SHARD_FRESHNESS_MS)
  return { ok: true }
}
