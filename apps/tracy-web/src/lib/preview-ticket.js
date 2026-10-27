/**
 * The comment picker's two signed tokens — the one-shot TICKET the Browser tab puts in the
 * iframe's first URL, and the CONTINUATION the site proxy trades it for as a host-only cookie on
 * the site's hostname. Plan: `tasks/todo-comment-to-edit.md` §S; measurements the design rests on:
 * `tasks/evidence/comment-to-edit/s-findings.md`.
 *
 * Lives in `lib/` because two domains need the same answer: `sites/preview-ticket.js` mints the
 * ticket, `bar/preview.js` redeems it and checks the continuation on every page load, and a domain
 * may not import another (`test/module-graph.test.mjs`).
 *
 * 🔒 SAME WIRE SHAPE AS THE SESSION, SEPARATE KEY. `<prefix>.<b64url(json)>.<b64url(HMAC-SHA256)>`
 * like `mintSession` (`lib/session.js`), but keyed by `HMAC(SESSION_SECRET, "tracy-preview:v1")`,
 * so a session token can never verify as a ticket (or the reverse) even though one secret roots
 * both, and no new secret has to be deployed. Rotating the session secret also voids every
 * outstanding ticket and continuation, which is the right direction to fail.
 *
 * 🔒 NO EMAIL IN EITHER TOKEN. Both travel through URLs and cookies that logs, proxies and the
 * site's own page may see; they carry `seat:<sha256(email)>` instead, and the proxy compares that
 * hash to the live session on the same request. The token proves nothing on its own — every use
 * re-reads the session and the seat book.
 */
import { toBase64Url, fromBase64Url } from './base64url.js'
import { hmacHex, sha256Hex } from './hmac.js'
import { SESSION_TTL_S } from './policy.js'

/** The query parameter the Browser tab appends to the iframe's first URL. */
export const PREVIEW_PARAM = 'tracy_preview'
/** A ticket is redeemed by the very next navigation, so two minutes is generous. */
export const PREVIEW_TICKET_TTL_S = 120

/**
 * When a continuation issued now, under a session that ends at `sessionExp`, lapses: exactly when
 * that session does, and never later than one session TTL from now.
 *
 * 🔒 WHY THE CONTINUATION LIVES AS LONG AS THE SESSION, NOT FIFTEEN MINUTES (29/09/2026).
 * It used to lapse after fifteen minutes "before the Browser tab must ask again", and nothing asked
 * again: after fifteen minutes in Edit the next reload came back without the picker, and the tab's
 * recovery loaded the page once more at a new ticketed address, which opens at the TOP (measured
 * scroll 3085 → 0, `tasks/evidence/comment-reveal-scroll/continuation-lapse-top.json`). The short
 * life bought almost no safety: the cookie is host-only, `HttpOnly`, `SameSite=Lax` (`__Host-` and
 * `Secure` over https), never in a URL, and it proves nothing on its own — every load re-reads the
 * live session and the seat book (`bar/preview.js` rules 3–4), so a sign-out or a revoked seat loses
 * the picker on the next load whatever the cookie says.
 * Its life is bounded by the session so it never outlives the sign-in it was issued under.
 * @param {number|undefined|null} sessionExp - the session's expiry, epoch seconds.
 * @param {number} [now] - epoch ms.
 * @returns {number} epoch seconds; `now` itself (already over) when no session expiry is given.
 */
export function continuationExpiry(sessionExp, now = Date.now()) {
  const nowS = Math.floor(now / 1000)
  if (typeof sessionExp !== 'number' || !Number.isFinite(sessionExp)) return nowS
  return Math.min(Math.floor(sessionExp), nowS + SESSION_TTL_S)
}

const encoder = new TextEncoder()
const KINDS = Object.freeze({ ticket: 'pv1', continuation: 'pc1' })

async function key(secret, usage) {
  const derived = await hmacHex(secret, 'tracy-preview:v1')
  return crypto.subtle.importKey('raw', encoder.encode(derived), { name: 'HMAC', hash: 'SHA-256' }, false, [
    usage
  ])
}

async function sign(kind, claims, secret) {
  const payload = toBase64Url(encoder.encode(JSON.stringify(claims)))
  const sig = await crypto.subtle.sign('HMAC', await key(secret, 'sign'), encoder.encode(payload))
  return `${KINDS[kind]}.${payload}.${toBase64Url(new Uint8Array(sig))}`
}

/**
 * The claims of a token of `kind`, or null for anything forged, expired, of the other kind, or
 * shaped wrong. Never throws.
 * @param {'ticket'|'continuation'} kind
 * @param {unknown} token
 * @param {string|undefined} secret - `config.sessionSecret`.
 * @param {number} [now] - epoch ms.
 */
export async function readPreviewToken(kind, token, secret, now = Date.now()) {
  if (!secret || typeof token !== 'string' || token.length > 2048) return null
  const [prefix, payload, signature] = token.split('.')
  if (prefix !== KINDS[kind] || !payload || !signature) return null
  try {
    const ok = await crypto.subtle.verify(
      'HMAC',
      await key(secret, 'verify'),
      fromBase64Url(signature),
      encoder.encode(payload)
    )
    if (!ok) return null
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)))
    if (claims?.v !== 1 || claims.typ !== kind || claims.purpose !== 'pick') return null
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return null
    for (const field of ['site', 'seatHash', 'aud']) if (typeof claims[field] !== 'string') return null
    if (kind === 'ticket' && typeof claims.jti !== 'string') return null
    return claims
  } catch {
    return null
  }
}

/** `seat:<sha256 hex of the lowercased email>` — the only way either token names a person. */
export async function seatHashOf(email) {
  return `seat:${await sha256Hex(String(email).toLowerCase())}`
}

/**
 * A single-use ticket for one (site, seat, parent origin), valid `PREVIEW_TICKET_TTL_S`.
 * @param {{site: string, email: string, aud: string, secret: string, now?: number}} input
 * @returns {Promise<{ticket: string, exp: number}>} `exp` in epoch seconds.
 */
export async function mintPreviewTicket({ site, email, aud, secret, now = Date.now() }) {
  const iat = Math.floor(now / 1000)
  const exp = iat + PREVIEW_TICKET_TTL_S
  const jti = toBase64Url(crypto.getRandomValues(new Uint8Array(16)))
  const claims = {
    v: 1,
    typ: 'ticket',
    site,
    seatHash: await seatHashOf(email),
    aud,
    purpose: 'pick',
    iat,
    exp,
    jti
  }
  return { ticket: await sign('ticket', claims, secret), exp }
}

/**
 * The cookie value a redeemed ticket becomes: the same binding (site, seat hash, parent origin),
 * no `jti` — it is meant to be presented on every in-frame load until it lapses, which is when the
 * session it was issued under does (`continuationExpiry`).
 * @param {{site: string, seatHash: string, aud: string, secret: string, sessionExp: number, now?: number}} input
 */
export async function mintPreviewContinuation({ site, seatHash, aud, secret, sessionExp, now = Date.now() }) {
  const exp = continuationExpiry(sessionExp, now)
  return sign(
    'continuation',
    { v: 1, typ: 'continuation', site, seatHash, aud, purpose: 'pick', exp },
    secret
  )
}

/**
 * Which `jti` values were already redeemed, until they would have expired anyway.
 *
 * ⚠ IN MEMORY, AND THAT IS A STAGE-1 DECISION, NOT AN OVERSIGHT. One tracy-web process fronts
 * every site on its host today, so one process-local set sees every redemption. A restart forgets
 * the set, which re-opens at most the tickets minted in the last `PREVIEW_TICKET_TTL_S` — each
 * still bound to a live session and seat of the same person. A second tracy-web process behind
 * one host (not planned) would need this moved to Postgres.
 * @param {() => number} [now] - epoch ms.
 */
export function usedTicketStore(now = Date.now) {
  /** @type {Map<string, number>} jti → exp (epoch s) */
  const used = new Map()
  return {
    /** True the first time a live `jti` is claimed, false on every replay. */
    claim(jti, exp) {
      const nowS = Math.floor(now() / 1000)
      for (const [id, until] of used) if (until <= nowS) used.delete(id)
      if (used.has(jti)) return false
      used.set(jti, exp)
      return true
    },
    get size() {
      return used.size
    }
  }
}

/**
 * Whether a seat role may use the picker on a site: any role of the seat book, viewer included
 * (ADR 0028 — a viewer comments, and pins a comment to an element). The picker only POINTS: the
 * runtime reports which element was picked and its own visible words (`tracy-cms-preview`
 * `pick.mjs`), and the site is told `x-tracy-preview: pick` only to print provenance stamps, which
 * change no data. Nothing it enables writes the site; every write an answered comment leads to goes
 * through the Apply door and its role rule.
 *
 * Callers pass a role only for a LIVE seat (`requireGrant`, `roleOnSite`), so this asks only "is it a
 * role at all". Fails closed: no role, an unknown role, no rule, or a rule that throws, is "no".
 * @param {(role: unknown) => string|null} normalizeRole - `seats/roles.js`'s, injected (lib/ imports
 *   no domain).
 * @param {string|null} role
 */
export function pickAllowed(normalizeRole, role) {
  if (!role || typeof normalizeRole !== 'function') return false
  try {
    return Boolean(normalizeRole(role))
  } catch {
    return false
  }
}

/** The parent origins a ticket may name: this deployment's own origin, nothing else yet. */
export function previewParentOrigins(config) {
  return [String(config?.origin ?? '').replace(/\/+$/, '')].filter(Boolean)
}
