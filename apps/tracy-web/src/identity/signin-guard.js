/**
 * The forgery guard of the desktop round's pages BEFORE anybody is signed in (council decision (a),
 * point 5; `tasks/todo-desktop-onboard-v2.md`).
 *
 * WHY. `POST /signin/code` mails a code and `POST /signin/verify` approves a round, and both answer a
 * browser that holds no session yet — so the cross-site guard in `lib/csrf.js`, which only looks at
 * requests carrying a session, never sees them. Each door checks `Origin` exactly; this adds the
 * second half: a token the page carried, bound to the ROUND and to THIS browser.
 *
 * HOW. The browser gets one random id in a host-only cookie (no `Domain`, so no customer site under
 * the session domain can read or plant it; `Path=/signin`). A form's token is
 * HMAC(secret, round ‖ browser id). A page on another origin knows neither half; a token copied
 * from one round's page does not fit another round; and the cookie names no round, so two tabs on
 * two rounds never overwrite each other — there is no browser-wide "current round".
 */
import { timingSafeEqual } from 'node:crypto'

import { parseCookies } from '../lib/cookies.js'
import { hmacHex } from '../lib/hmac.js'

export const SIGNIN_BROWSER_COOKIE = 'tracy_signin_browser'
/** A day: longer than any round, so a page left open past one round still works for the next. */
const BROWSER_COOKIE_MAX_AGE_S = 24 * 60 * 60
const ID = /^[a-f0-9]{64}$/

/** This browser's id from the request's cookies, or null when it has none (or a malformed one). */
export function browserIdOf(cookieHeader) {
  const value = parseCookies(cookieHeader ?? null).get(SIGNIN_BROWSER_COOKIE) ?? ''
  return ID.test(value) ? value : null
}

/** A new browser id: 256 bits of CSPRNG as hex. */
export function newBrowserId() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** The cookie that plants `id`. Host-only (no `Domain`), HttpOnly, scoped to `/signin`. */
export function browserCookie(id, { secure }) {
  return `${SIGNIN_BROWSER_COOKIE}=${id}; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax; Path=/signin; Max-Age=${BROWSER_COOKIE_MAX_AGE_S}`
}

/** The token a page carries for one round in one browser. */
export function roundToken(secret, nonceHash, browserId) {
  return hmacHex(secret, `signin-round\n${nonceHash}\n${browserId}`)
}

/** Whether `given` is the token of this round in this browser. Constant-time on the comparison. */
export async function roundTokenMatches(secret, nonceHash, browserId, given) {
  if (!browserId || typeof given !== 'string' || !ID.test(given)) return false
  const expected = Buffer.from(await roundToken(secret, nonceHash, browserId))
  const offered = Buffer.from(given)
  return expected.length === offered.length && timingSafeEqual(expected, offered)
}
