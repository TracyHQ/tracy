/**
 * The JoomlArt SSO v1 wire contract — Tracy's half of a Discourse-style signed redirect, with
 * aMember (`www.joomlart.com/member`, module `joomlartsso`) as the identity provider.
 *
 * MUST stay byte-identical to aMember's `library/JoomlartSso/Payload.php` (repo `TracyHQ/member`):
 *
 *   - payload = `k=v&k=v` in a FIXED order, each key and value `rawurlencode`d (RFC 3986: only
 *     `A-Za-z0-9-_.~` survive), then standard base64 WITH padding;
 *   - signature = lowercase hex HMAC-SHA256 over that base64 STRING (not the decoded bytes), with
 *     the shared secret;
 *   - request (Tracy → aMember): `nonce`, `return_url`, `exp` (unix seconds; aMember refuses a
 *     missing or past `exp` for the `tracy*` clients);
 *   - response (aMember → Tracy): `nonce`, `external_id`, `email`, `email_verified` (the strings
 *     `true`/`false`), `username`, `name`, `entitlement` (a JSON array as one field).
 *
 * `test/joomlart-sso.test.mjs` holds vectors produced by the PHP side; a change that moves one byte
 * of those is a change aMember will refuse. Pure: no network, no clock, no config.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

/** Longest decoded payload read (bytes). aMember's response is a few hundred bytes; 8 KB is room. */
const MAX_PAYLOAD_BYTES = 8 * 1024

/** Standard base64 with padding, as PHP's strict `base64_decode($sso, true)` reads it. */
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

/**
 * PHP's `rawurlencode`: `encodeURIComponent` plus the five characters JS leaves bare and PHP does
 * not (`!'()*`). Both decode either form, so this matters only for byte-identical signed output.
 * @param {string} value
 */
function rawUrlEncode(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  )
}

/**
 * Ordered `[key, value]` pairs → the base64 payload string.
 * @param {Array<[string, string]>} pairs
 * @returns {string}
 */
export function encodePayload(pairs) {
  const query = pairs.map(([k, v]) => `${rawUrlEncode(String(k))}=${rawUrlEncode(String(v))}`).join('&')
  return Buffer.from(query, 'utf8').toString('base64')
}

/**
 * The base64 payload string → its fields as strings, or null when it is not a payload: not a
 * string, not strict base64, over 8 KB decoded, not UTF-8, or a key sent twice (two values for one
 * name is an ambiguity PHP resolves by "last wins"; Tracy refuses it instead of guessing which one
 * the signer meant). A pair with no `=` reads as an empty value, an empty pair is skipped — the
 * same tolerance as the PHP decoder, so the two sides read one payload the same way.
 * @param {unknown} sso
 * @returns {Record<string, string> | null}
 */
export function decodePayload(sso) {
  if (typeof sso !== 'string' || sso === '' || !BASE64.test(sso)) return null
  const bytes = Buffer.from(sso, 'base64')
  if (bytes.length > MAX_PAYLOAD_BYTES) return null
  let query
  try {
    query = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
  const fields = Object.create(null)
  for (const pair of query.split('&')) {
    if (pair === '') continue
    const eq = pair.indexOf('=')
    let key
    let value
    try {
      key = decodeURIComponent(eq === -1 ? pair : pair.slice(0, eq))
      value = eq === -1 ? '' : decodeURIComponent(pair.slice(eq + 1))
    } catch {
      return null
    }
    if (key in fields) return null
    fields[key] = value
  }
  return { ...fields }
}

/**
 * Lowercase hex HMAC-SHA256 of the base64 payload string.
 * @param {string} sso
 * @param {string} secret
 */
export function sign(sso, secret) {
  return createHmac('sha256', secret).update(sso, 'utf8').digest('hex')
}

/**
 * Constant-time check that `sig` is `sign(sso, secret)`. False, never a throw, for anything that
 * is not two non-empty strings and a secret: `timingSafeEqual` demands equal lengths, so the
 * lengths are compared first and a short or long `sig` is refused without reaching it.
 * @param {unknown} sso
 * @param {unknown} sig
 * @param {string} secret
 */
export function verify(sso, sig, secret) {
  if (typeof sso !== 'string' || typeof sig !== 'string' || sso === '' || sig === '' || !secret) return false
  const expected = Buffer.from(sign(sso, secret), 'utf8')
  const given = Buffer.from(sig, 'utf8')
  if (expected.length !== given.length) return false
  return timingSafeEqual(expected, given)
}

/**
 * The signed request Tracy sends aMember: `?client=…&sso=<sso>&sig=<sig>`.
 * @param {{nonce: string, returnUrl: string, exp: number, secret: string}} params `exp` in unix seconds.
 * @returns {{sso: string, sig: string}}
 */
export function buildRequest({ nonce, returnUrl, exp, secret }) {
  const sso = encodePayload([
    ['nonce', nonce],
    ['return_url', returnUrl],
    ['exp', String(exp)]
  ])
  return { sso, sig: sign(sso, secret) }
}

/**
 * `entitlement` as aMember sends it: a JSON array of objects. Anything else — bad JSON, a non-array,
 * non-object items — reads as no entitlement at all, never as a crash on the callback.
 * @param {string} raw
 * @returns {Array<Record<string, unknown>>}
 */
function parseEntitlement(raw) {
  if (!raw) return []
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
}

/**
 * The signed response aMember redirected the browser back with, verified and typed, or null when
 * the signature or the payload is bad. The signature is checked over the base64 string exactly as
 * received, BEFORE anything is decoded. `emailVerified` is true only for the exact string `true`;
 * every missing field is `""`; `entitlement` is a parsed array (`[]` when unreadable).
 * @param {{sso: unknown, sig: unknown, secret: string}} params
 * @returns {{nonce: string, externalId: string, email: string, emailVerified: boolean, username: string, name: string, entitlement: Array<Record<string, unknown>>} | null}
 */
export function parseResponse({ sso, sig, secret }) {
  if (!verify(sso, sig, secret)) return null
  const fields = decodePayload(sso)
  if (!fields) return null
  const read = (key) => (typeof fields[key] === 'string' ? fields[key] : '')
  return {
    nonce: read('nonce'),
    externalId: read('external_id'),
    email: read('email'),
    emailVerified: read('email_verified') === 'true',
    username: read('username'),
    name: read('name'),
    entitlement: parseEntitlement(read('entitlement'))
  }
}
