/**
 * The team invitation token — one per invited person, covering every site of one batch.
 *
 * Ported from `workers/shared/team-invite.js`. That file also signs a WORKSPACE-shaped token for
 * Tracy's own internal team (`workspaceId`, and `owner` as a legal role) — this app has no
 * workspace-level book yet, so only the site-shaped token (`siteKeys`) is carried here. A token
 * signed by either side still verifies on the other for the site shape, which is all this app's
 * cross-compat test (`test/team-invite.test.mjs`) checks.
 *
 * WHY A TOKEN AND NOT A ROW. The invitation mail carries a link, and clicking the link IS the
 * acceptance: nothing is granted until it is clicked. The link must name the person and the
 * sites, and the seat book must be able to trust that naming without a lookup table of
 * outstanding links — the grant rows already ARE that table. An HMAC over `{ email, role,
 * siteKeys }` gives exactly that.
 *
 * THE LINK LIVES `TEAM_INVITE_TTL_S` (#804), counted from the token's own `iat`. Until 04/10/2026
 * it never expired (same as the Worker): the only way a link died was an admin cancelling the
 * invitation. The signature and the token's shape are unchanged, so a link mailed before that day
 * is aged by the `iat` it already carries. `teamInviteAge` is the one place the age is judged; the
 * accept door still reads the seat row for everything the link grants.
 */

import { toBase64Url, fromBase64Url } from './base64url.js'
import { TEAM_INVITE_TTL_S } from './policy.js'

const DOMAIN = 'team-invite:'
const VERSION = 1
// The roles an invitation may carry (`seats/roles.js` INVITABLE_ROLES; lib/ imports no domain, so
// the list is restated here). `admin`/`developer` are the roles ADR 0028 retired: a link signed
// before that still verifies, and reads as `editor`, the role its seat row was migrated to.
const ROLES = new Set(['editor', 'viewer'])
const RETIRED = { admin: 'editor', developer: 'editor' }

const encoder = new TextEncoder()

async function hmacKey(secret, usage) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    usage
  ])
}

/**
 * Sign one invitation. `email` is stored lowercased so the accept door compares like with like;
 * `siteKeys` is kept in the order given.
 */
export async function signTeamInvite({ email, role, siteKeys }, secret) {
  if (!secret) throw new TypeError('team invite: no secret to sign with')
  if (!ROLES.has(role)) throw new TypeError(`team invite: role "${role}" cannot be invited`)
  const body = {
    v: VERSION,
    email: String(email).trim().toLowerCase(),
    role,
    siteKeys: [...siteKeys],
    iat: Math.floor(Date.now() / 1000)
  }
  const payload = toBase64Url(encoder.encode(JSON.stringify(body)))
  const key = await hmacKey(secret, 'sign')
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(DOMAIN + payload))
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`
}

/**
 * The other direction: `{ email, role, siteKeys, iat }` when the token is ours and intact, `null`
 * otherwise. Never says why — a forger learns nothing from the difference between a bad
 * signature and a malformed body.
 */
export async function verifyTeamInvite(token, secret) {
  if (typeof token !== 'string' || !secret) return null
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra !== undefined) return null

  try {
    const key = await hmacKey(secret, 'verify')
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(signature),
      encoder.encode(DOMAIN + payload)
    )
    if (!ok) return null

    const body = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)))
    if (body?.v !== VERSION) return null
    if (typeof body.email !== 'string' || body.email === '') return null
    // Whole seconds since the epoch, as `signTeamInvite` writes them. Anything else (a string, a
    // fraction, a negative or unsafe number) cannot be aged, so the token verifies as nothing.
    if (!Number.isSafeInteger(body.iat) || body.iat < 0) return null
    // A workspace-shaped token (the legacy Tracy-team invite) has no `siteKeys` and an `owner`
    // role this app never grants — it fails the checks below and verifies as nothing here, same
    // as any other token this app was never meant to answer.
    const role = ROLES.has(body.role) ? body.role : (RETIRED[body.role] ?? null)
    if (!role) return null
    if (!Array.isArray(body.siteKeys) || body.siteKeys.length === 0) return null
    if (!body.siteKeys.every((key) => typeof key === 'string' && key !== '')) return null
    return { email: body.email, role, siteKeys: body.siteKeys, iat: body.iat }
  } catch {
    return null
  }
}

/**
 * Where a verified invitation stands against the clock: `'live'` inside its lifetime (the last
 * second included), `'expired'` past it, `'invalid'` when `iat` lies in the future — a token this
 * app could not have signed yet, refused rather than given a lifetime longer than the policy.
 * `nowMs` is the door's own clock, in milliseconds.
 */
export function teamInviteAge(invite, nowMs) {
  // Whole seconds on both sides, the unit `iat` is written in.
  const ageS = Math.floor(nowMs / 1000) - invite.iat
  if (!Number.isFinite(ageS) || ageS < 0) return 'invalid'
  return ageS > TEAM_INVITE_TTL_S ? 'expired' : 'live'
}

/** Where the link in the mail points. */
export const TEAM_INVITE_PATH = '/invite/'

export function teamInviteUrl(token, origin) {
  return `${origin.replace(/\/$/, '')}${TEAM_INVITE_PATH}${token}`
}

/**
 * The "Not for you? Decline" link of the same mail (#809 case T6): the same signed token, so the
 * decline page names exactly the person and sites the accept link does. Opening it only shows a
 * confirmation; the decline itself is a POST from that page.
 */
export function teamInviteDeclineUrl(token, origin) {
  return `${teamInviteUrl(token, origin)}/decline`
}

/**
 * Where a Tracy staff invitation mail points: the `/ops/invite/:token` door (`ops/route.js`).
 *
 * The path segment is the `tracy_admin` workspace's id, percent-encoded. It is a MARKER, not a
 * secret and not a selector: that door never reads it, and accepts only a pending grant of the
 * account that is signed in when the link is opened. Nothing is signed here because there is
 * nothing a value in the link could unlock.
 */
export function staffInviteUrl(workspaceId, origin) {
  return `${origin.replace(/\/$/, '')}/ops/invite/${encodeURIComponent(workspaceId)}`
}

/**
 * The site's own address, asking the My Sites tab to open on that site's team — the review link a
 * join-request mail sends to a site's admins. Ported from `siteTeamUrl` in the Worker; `origin`
 * is required here (not defaulted to a hardcoded production host) since this app already carries
 * its own origin in `config`.
 */
export function siteTeamUrl(siteKey, { member = null, origin }) {
  const params = new URLSearchParams({ open: 'my-sites', team: siteKey })
  if (member) params.set('member', member)
  // No trailing slash after `/<siteKey>`, same reason as the Worker: `/<siteKey>/` is a 404 on a
  // lane not flagged prefix-aware.
  return `${origin.replace(/\/$/, '')}/${siteKey}?${params.toString()}`
}
