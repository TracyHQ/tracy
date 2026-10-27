/**
 * The one-click unsubscribe token of a notification mail (spam hints C1-B, RFC 8058).
 *
 * 🔒 SAME WIRE SHAPE AS THE SESSION, SEPARATE KEY. `us1.<b64url(json)>.<b64url(HMAC-SHA256)>`, keyed
 * by `HMAC(SESSION_SECRET, "tracy-unsubscribe:v1")`, so a session or preview token can never verify
 * as one of these (or the reverse), and no new secret has to be deployed. Rotating the session
 * secret voids every outstanding link, which only means an old mail's Unsubscribe stops working.
 *
 * 🔒 NO ADDRESS IN THE TOKEN. It travels in a mail header and in a URL that logs and mail providers
 * see; it names the account by its id and the notification group, nothing else. It grants exactly
 * one thing: turning that group's EMAIL switch off for that account (`notifications/route.js`).
 * Repeating it is harmless (the switch is already off), so it needs no one-shot bookkeeping; it
 * lapses `UNSUBSCRIBE_TTL_S` after it was minted.
 */
import { fromBase64Url, toBase64Url } from './base64url.js'
import { hmacHex } from './hmac.js'
import { UNSUBSCRIBE_TTL_S } from './policy.js'

const PREFIX = 'us1'
const encoder = new TextEncoder()

async function key(secret, usage) {
  const derived = await hmacHex(secret, 'tracy-unsubscribe:v1')
  return crypto.subtle.importKey('raw', encoder.encode(derived), { name: 'HMAC', hash: 'SHA-256' }, false, [
    usage
  ])
}

/**
 * @param {{accountId: string, groupId: string, secret: string, now?: number}} input
 * @returns {Promise<string>}
 */
export async function mintUnsubscribeToken({ accountId, groupId, secret, now = Date.now() }) {
  const iat = Math.floor(now / 1000)
  const claims = { v: 1, a: accountId, g: groupId, iat, exp: iat + UNSUBSCRIBE_TTL_S }
  const payload = toBase64Url(encoder.encode(JSON.stringify(claims)))
  const sig = await crypto.subtle.sign('HMAC', await key(secret, 'sign'), encoder.encode(payload))
  return `${PREFIX}.${payload}.${toBase64Url(new Uint8Array(sig))}`
}

/**
 * The `{accountId, groupId}` a token names, or null for anything forged, expired or shaped wrong.
 * Never throws. Whether the group may be switched off is the door's call, not this one's.
 * @param {unknown} token
 * @param {string|undefined} secret
 * @param {number} [now] epoch ms
 * @returns {Promise<{accountId: string, groupId: string} | null>}
 */
export async function readUnsubscribeToken(token, secret, now = Date.now()) {
  if (!secret || typeof token !== 'string' || token.length > 1024) return null
  const [prefix, payload, signature, extra] = token.split('.')
  if (prefix !== PREFIX || !payload || !signature || extra !== undefined) return null
  try {
    const ok = await crypto.subtle.verify(
      'HMAC',
      await key(secret, 'verify'),
      fromBase64Url(signature),
      encoder.encode(payload)
    )
    if (!ok) return null
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)))
    if (claims?.v !== 1 || typeof claims.a !== 'string' || typeof claims.g !== 'string') return null
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return null
    return { accountId: claims.a, groupId: claims.g }
  } catch {
    return null
  }
}
