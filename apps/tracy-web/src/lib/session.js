/**
 * The viewer's sign-in: one HMAC-signed cookie, ported verbatim in shape from
 * workers/fleet-bar/src/session.js so a token minted by either side verifies on the other during
 * the cut-over. Identity only, never rights — every door re-asks the seat book.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { toBase64Url, fromBase64Url } from './base64url.js'
import { SESSION_RENEW_AFTER_S, SESSION_TTL_S } from './policy.js'

export const SESSION_COOKIE = 'tracy_sess'
/** A shard's own session cookie is `tracy_sess_<shard>` (`SESSION_COOKIE_NAME`, shard beta §3.5). */
export const SHARD_SESSION_PREFIX = 'tracy_sess_'
/** `/ops` › View as user: an admin's look at one customer, in a cookie of its own so the admin's `tracy_sess` is never touched. */
export const VIEW_COOKIE = 'tracy_view'
export const VIEW_SESSION_TTL_S = 30 * 60
// Re-exported, not redefined: `policy.js` owns the number, and every existing importer of
// `SESSION_TTL_S` from here keeps working unchanged.
export { SESSION_TTL_S }
const encoder = new TextEncoder()

async function key(secret, usage) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    usage
  ])
}

/**
 * The sign-ins sign-out has ended (`./session-revocation.js`), consulted by every read of a token
 * that carries a `jti`. Scoped to a request, not to the process: `buildApp` (`app.js`) runs every
 * request it answers inside `withSessionRevocations(book, …)`, and `server.js` does the same for
 * the websocket upgrade, so every door that reads the cookie through this file — with nothing but
 * the secret in hand — sees its own app's book. Outside any scope (a bare unit test, a script
 * minting a cookie) nothing is revoked.
 *
 * 🔒 NOT A MODULE-LEVEL VARIABLE. That was the first version: the last app built in a process
 * owned it, so in a test file that built an app on a database, closed it, then exercised a router
 * on its own, every later session read went to a closed pool and signed out.
 */
const revocationScope = new AsyncLocalStorage()

/**
 * Run `fn` with `book` as the revocation book for every session read inside it, async ones included.
 * @template T
 * @param {import('./session-revocation.js').RevocationBook | null} book
 * @param {() => T} fn
 * @returns {T}
 */
export function withSessionRevocations(book, fn) {
  return revocationScope.run(book ?? null, fn)
}

/**
 * The session cookie name this app writes besides `tracy_sess` (shard beta, spec §3.5), for every
 * read inside a request. A shard writes `tracy_sess_<name>` and reads both names: its own first,
 * then the legacy one the dsh plugins send (`tracy_sess=<token>`). Scoped per request exactly like
 * the revocation book above, and for the same reason: never a module-level variable.
 */
const cookieNameScope = new AsyncLocalStorage()

/**
 * Run `fn` with `name` as this app's own session cookie name for every read inside it.
 * @template T
 * @param {string | null | undefined} name
 * @param {() => T} fn
 * @returns {T}
 */
export function withSessionCookieName(name, fn) {
  return cookieNameScope.run(name && name !== SESSION_COOKIE ? name : null, fn)
}

/**
 * Whether the view cookie counts for the request being answered. Scoped like the two above, and for
 * the same reason; unlike them the default is OFF — a reader outside any scope (a script, a test, the
 * websocket upgrade) never acts as someone else. `app.js` switches it on for every door except
 * `/ops`, where the admin stays the admin.
 */
const viewScope = new AsyncLocalStorage()

/**
 * @template T
 * @param {boolean} enabled
 * @param {() => T} fn
 * @returns {T}
 */
export function withViewAs(enabled, fn) {
  return viewScope.run(Boolean(enabled), fn)
}

function readNames() {
  const own = cookieNameScope.getStore()
  return own ? [own, SESSION_COOKIE] : [SESSION_COOKIE]
}

/**
 * @param {string} email
 * @param {string} secret
 * @param {number} [now]
 * @param {{ jti?: string }} [options] - `jti`: the sign-in this token belongs to. A renewal passes
 *   the old token's, so signing out ends every token of that sign-in; a new sign-in gets a new one.
 */
export async function mintSession(email, secret, now = Date.now(), { jti = crypto.randomUUID() } = {}) {
  return signToken({ email: email.toLowerCase(), exp: Math.floor(now / 1000) + SESSION_TTL_S, jti }, secret)
}

/**
 * The token of an admin's view of `email`: the same wire format as a sign-in, plus `act` — the admin
 * who opened it. `act` is what lets a reader tell a view from a sign-in (no renewal, no activity recorded). Never renewed.
 */
export async function mintViewSession(
  email,
  actor,
  secret,
  now = Date.now(),
  { jti = crypto.randomUUID() } = {}
) {
  return signToken(
    {
      email: email.toLowerCase(),
      exp: Math.floor(now / 1000) + VIEW_SESSION_TTL_S,
      jti,
      act: actor.toLowerCase()
    },
    secret
  )
}

async function signToken(body, secret) {
  const payload = toBase64Url(encoder.encode(JSON.stringify(body)))
  const sig = await crypto.subtle.sign('HMAC', await key(secret, 'sign'), encoder.encode(payload))
  return `v1.${payload}.${toBase64Url(new Uint8Array(sig))}`
}

export async function verifySession(token, secret, now = Date.now()) {
  return (await readSession(token, secret, now))?.email ?? null
}

/**
 * `verifySession` plus the token's expiry (epoch seconds), for a door that may renew it, and its
 * `jti` (null on a token minted before 11/10/2026). A token whose sign-in was ended is no token.
 */
async function readSession(token, secret, now) {
  if (!secret || typeof token !== 'string') return null
  const [version, payload, signature] = token.split('.')
  if (version !== 'v1' || !payload || !signature) return null
  try {
    const ok = await crypto.subtle.verify(
      'HMAC',
      await key(secret, 'verify'),
      fromBase64Url(signature),
      encoder.encode(payload)
    )
    if (!ok) return null
    const body = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)))
    if (typeof body.exp !== 'number' || body.exp * 1000 < now) return null
    const email = typeof body.email === 'string' && body.email ? body.email.toLowerCase() : null
    if (!email) return null
    const jti = typeof body.jti === 'string' && body.jti ? body.jti : null
    // A failing lookup throws into the catch below: an unanswerable revocation check signs out.
    const revocations = revocationScope.getStore()
    if (jti && revocations && (await revocations.isRevoked(jti))) return null
    const act = typeof body.act === 'string' && body.act ? body.act.toLowerCase() : undefined
    return act ? { email, exp: body.exp, jti, act } : { email, exp: body.exp, jti }
  } catch {
    return null
  }
}

/** Every session value in a `Cookie` header — this app's own name first, then `tracy_sess`; in
 * header order within a name (a parent domain and a subdomain can both send one). */
function sessionTokensIn(cookieHeader) {
  return readNames().flatMap((name) =>
    [...(cookieHeader ?? '').matchAll(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`, 'g'))].map((m) => m[1])
  )
}

/**
 * The first session value a request carries under this app's names, NOT verified, or null: what a
 * door hands on as "the viewer's session" (the AI accounts broker). On a shard that is its own
 * cookie, never the master's `tracy_sess` riding along on the shared domain.
 * @param {string | null | undefined} cookieHeader
 * @returns {string | null}
 */
export function primarySessionToken(cookieHeader) {
  return sessionTokensIn(cookieHeader)[0] ?? null
}

/**
 * The session value the dsh proxy forwards as `x-tracy-session` (`workspace/proxy.js`). A shard
 * sends its own cookie (as `primarySessionToken`); a master sends exactly what that door read before
 * the shard beta — the LAST `tracy_sess` of the header, the way `parseCookies` keeps one — so the
 * master's behaviour does not move by a byte.
 * @param {string | null | undefined} cookieHeader
 * @returns {string | null}
 */
export function proxiedSessionToken(cookieHeader) {
  // While an admin's view is open dsh gets the view, never the admin's own sign-in: what its plugins
  // call back with must carry `act`, so those calls are not counted as the customer's own.
  if (viewScope.getStore() === true) {
    const viewed = new RegExp(`(?:^|;\\s*)${VIEW_COOKIE}=([^;]+)`).exec(cookieHeader ?? '')
    if (viewed) return viewed[1]
  }
  if (cookieNameScope.getStore()) return primarySessionToken(cookieHeader)
  let last
  for (const part of (cookieHeader ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === SESSION_COOKIE) last = part.slice(i + 1).trim()
  }
  return last || null
}

export async function sessionFromCookieHeader(cookieHeader, secret, now = Date.now()) {
  return (await sessionWithExpiry(cookieHeader, secret, now))?.email ?? null
}

/**
 * The session in a `Cookie` header as `{ email, exp }`, `exp` being the LATEST expiry among the
 * valid copies, or null. `exp` is what lets `/auth/me` decide whether to renew.
 */
export async function sessionWithExpiry(cookieHeader, secret, now = Date.now()) {
  // An admin's view wins over the admin's own sign-in outright; the two are never "conflicting identities".
  if (viewScope.getStore() === true) {
    for (const m of (cookieHeader ?? '').matchAll(new RegExp(`(?:^|;\\s*)${VIEW_COOKIE}=([^;]+)`, 'g'))) {
      const viewed = await readSession(m[1], secret, now)
      if (viewed?.act) return viewed
    }
  }
  // Browsers can send the same name for both a parent domain and a QA subdomain.
  // An expired or foreign-key cookie must not hide a valid session. The header has
  // no domain metadata, so refuse conflicting valid identities instead of guessing.
  let found = null
  for (const token of sessionTokensIn(cookieHeader)) {
    const candidate = await readSession(token, secret, now)
    if (!candidate) continue
    if (found && found.email !== candidate.email) return null
    found = found && found.exp >= candidate.exp ? found : candidate
  }
  return found
}

/**
 * End the sign-in(s) behind every valid session token in a `Cookie` header (`POST /auth/signout`).
 * Each is refused from now on, and so is every renewal of it, until no token of it can still be
 * alive (`./session-revocation.js` says why one TTL). Tokens without a `jti` cannot be ended and
 * are skipped. Answers how many sign-ins were ended.
 */
export async function revokeSessionsIn(cookieHeader, secret, now = Date.now()) {
  const revocations = revocationScope.getStore()
  if (!revocations) return 0
  const until = new Date(now + SESSION_TTL_S * 1000)
  let ended = 0
  for (const token of sessionTokensIn(cookieHeader)) {
    const session = await readSession(token, secret, now)
    if (!session?.jti) continue
    await revocations.revoke(session.jti, until)
    ended++
  }
  return ended
}

/**
 * Whether a session expiring at `exp` (epoch seconds) is old enough to re-mint: it was minted more
 * than `SESSION_RENEW_AFTER_S` ago. See that constant for why sessions slide.
 */
export function sessionDueForRenewal(exp, now = Date.now()) {
  const mintedAt = exp - SESSION_TTL_S
  return Math.floor(now / 1000) - mintedAt >= SESSION_RENEW_AFTER_S
}

/**
 * The `Domain=` to actually write for a request that arrived on `host`, or `undefined` for a
 * host-only cookie.
 *
 * 🔒 A `Domain=` THE HOST IS NOT UNDER IS NOT A NARROWER COOKIE — IT IS NO COOKIE AT ALL, AND
 * NOTHING SAYS SO. A browser silently drops a `Set-Cookie` whose `Domain` does not cover the
 * request host; so does curl. Measured 10/09, minutes after `SESSION_DOMAIN` moved to
 * `tracy.test`: signing in over the `localhost` alias returned `303` with a perfectly good
 * `Set-Cookie: ... Domain=tracy.test`, the browser threw it away, and `/auth/me` answered
 * `{"email":null}` — sign-in "succeeded" and left the person signed out, with no error anywhere
 * in the chain to explain it.
 *
 * `SITE_DOMAIN_ALIASES` exists precisely so more than one suffix reaches this app, so this case
 * is ordinary, not exotic. A host outside `sessionDomain` gets a host-only cookie: it works on
 * that host, and it does not pretend to span the site hostnames it cannot span.
 *
 * @param {string | null | undefined} host - the request's `Host` header, port and all.
 * @param {string | null | undefined} sessionDomain - `config.sessionDomain`; empty means host-only.
 * @returns {string | undefined}
 */
export function cookieDomainFor(host, sessionDomain) {
  if (!sessionDomain) return undefined
  const h = (host ?? '').split(':')[0].toLowerCase()
  const d = sessionDomain.replace(/^\./, '').toLowerCase()
  return h === d || h.endsWith(`.${d}`) ? sessionDomain : undefined
}

function attrs({ domain, secure }) {
  return `HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax;${domain ? ` Domain=${domain};` : ''} Path=/`
}
export function sessionCookie(token, opts) {
  return `${opts.name ?? SESSION_COOKIE}=${token}; ${attrs(opts)}; Max-Age=${SESSION_TTL_S}`
}
export function clearSessionCookie(opts) {
  return `${opts.name ?? SESSION_COOKIE}=; ${attrs(opts)}; Max-Age=0`
}

/** The view cookie: thirty minutes, HttpOnly, and Max-Age matches the token so the browser drops it with it. */
export function viewCookie(token, opts) {
  return `${VIEW_COOKIE}=${token}; ${attrs(opts)}; Max-Age=${VIEW_SESSION_TTL_S}`
}
export function clearViewCookie(opts) {
  return `${VIEW_COOKIE}=; ${attrs(opts)}; Max-Age=0`
}

/**
 * End the view in a `Cookie` header: its `jti` is refused from now on, wherever the token was sent.
 * Answers the view that was ended (`{ email, act }`) or null.
 */
export async function endViewSession(cookieHeader, secret, now = Date.now()) {
  const revocations = revocationScope.getStore()
  for (const m of (cookieHeader ?? '').matchAll(new RegExp(`(?:^|;\\s*)${VIEW_COOKIE}=([^;]+)`, 'g'))) {
    const viewed = await readSession(m[1], secret, now)
    if (!viewed?.act) continue
    if (revocations && viewed.jti) await revocations.revoke(viewed.jti, new Date(viewed.exp * 1000))
    return { email: viewed.email, act: viewed.act }
  }
  return null
}
