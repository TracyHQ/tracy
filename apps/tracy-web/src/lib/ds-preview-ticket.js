/**
 * The ticket a Design system preview popup frames a running site with (`?tracy_ds_preview=<ticket>`):
 * the site's own page, loaded for real at its own address through the site proxy, with its scripts
 * running, wearing the one system the ticket names — exactly what Try on makes the site serve, without
 * writing anything (`sites/design-system-live-page.js`).
 *
 * 🔒 ONLY THE PREVIEW DOOR MINTS ONE, AND ONLY AFTER ITS GATES. `GET /api/sites/:key/design-system/preview`
 * with `live=1` checks the seat, the rate, the system, the template's contract and the customer lock, then
 * signs what it judged: the site, the system, the contract and template the bytes are emitted for. The
 * proxy (`bar/route.js`) believes nothing else: an unsigned, forged, expired or other site's ticket is
 * the page as it is, wearing nothing.
 *
 * An HMAC keyed from the session secret under its own label (never a session's or another token's key),
 * over the claims. The ticket rides in the frame's address, so it is short-lived and says nothing secret:
 * it only lets a seat holder's popup show a public page in a library look. Lives in `lib/` because two
 * domains use it: `sites/` mints, `bar/` reads.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

/** The query parameter a framed preview rides on (`bar/ds-preview.js` takes it off before the site is asked). */
export const DS_PREVIEW_PARAM = 'tracy_ds_preview'

const DOMAIN = 'tracy-ds-preview:v1:'
/** How long a ticket holds: a popup left open this long still browses the site in the same look. */
export const DS_PREVIEW_TICKET_S = 60 * 60
/** The longest ticket read: anything longer is not one of ours. */
const TICKET_MAX = 1024

const signature = (/** @type {string} */ secret, /** @type {string} */ body) =>
  createHmac('sha256', String(secret)).update(`${DOMAIN}${body}`).digest('base64url')

/**
 * @typedef {{ site: string, id: string, contract: string, template: string, exp: number }} DsPreviewClaims
 *   `site`: the site key; `id`: the library id the bytes are emitted for, or `template-default` (nothing
 *   laid in, the worn slot taken off); `contract`: the slot contract they are emitted through ('' for the
 *   template default); `template`: the template key the door judged; `exp`: seconds.
 */

/**
 * A ticket for one site wearing one system.
 * @param {string} secret `config.sessionSecret`
 * @param {Omit<DsPreviewClaims, 'exp'>} claims
 * @param {number} [now] milliseconds
 */
export function mintDsPreviewTicket(secret, { site, id, contract, template }, now = Date.now()) {
  const exp = Math.floor(now / 1000) + DS_PREVIEW_TICKET_S
  const body = Buffer.from(JSON.stringify({ s: site, i: id, c: contract, k: template, e: exp })).toString(
    'base64url'
  )
  return `${body}.${signature(secret, body)}`
}

/**
 * The claims of a ticket this process signed for `siteKey` that has not expired; null for anything else
 * (missing, malformed, forged, another site's, expired, dated past the validity window). Never throws.
 * @param {string | undefined} secret
 * @param {string | null | undefined} ticket
 * @param {string} siteKey
 * @param {number} [now] milliseconds
 * @returns {DsPreviewClaims | null}
 */
export function readDsPreviewTicket(secret, ticket, siteKey, now = Date.now()) {
  if (!secret || typeof ticket !== 'string' || ticket.length > TICKET_MAX) return null
  const m = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(ticket)
  if (!m) return null
  const want = Buffer.from(signature(secret, m[1]))
  const got = Buffer.from(m[2])
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  let c
  try {
    c = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'))
  } catch {
    return null
  }
  const at = Math.floor(now / 1000)
  const text = (/** @type {unknown} */ v) => typeof v === 'string'
  if (!c || !text(c.s) || !text(c.i) || !text(c.c) || !text(c.k) || !Number.isInteger(c.e)) return null
  if (c.s !== siteKey || c.e < at || c.e > at + DS_PREVIEW_TICKET_S) return null
  return { site: c.s, id: c.i, contract: c.c, template: c.k, exp: c.e }
}
