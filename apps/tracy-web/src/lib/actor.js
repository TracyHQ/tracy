/** dsh's short-lived prompter assertion, accepted only by the component Apply door and `/moment`.
 * Wire-compatible with dsh-passwords and fleet-bar/registry.js; identity never grants a seat.
 */
import { verifySession } from './session.js'
import { fromBase64Url } from './base64url.js'

/** The furthest ahead an assertion's expiry may sit, in seconds. */
export const MAX_ACTOR_LIFETIME_S = 120

export async function verifyActor(raw, secret, now = Date.now()) {
  if (typeof raw !== 'string' || !/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw)) return null
  const email = await verifySession(raw, secret, now)
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null
  try {
    const body = JSON.parse(new TextDecoder().decode(fromBase64Url(raw.split('.')[1])))
    const seconds = Math.floor(now / 1000)
    // Signers issue sixty seconds. Two minutes allows for clock skew and no more: the assertion names
    // a person, not a site or a turn, so every second it lives is a second it works on every site that
    // person holds a seat on. A session cookie's twelve-hour lifetime must never pass as one.
    return Number.isInteger(body.exp) && body.exp >= seconds && body.exp <= seconds + MAX_ACTOR_LIFETIME_S
      ? email
      : null
  } catch {
    return null
  }
}
