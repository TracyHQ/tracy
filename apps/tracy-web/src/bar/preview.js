/**
 * The site proxy's half of the comment picker's security (plan `tasks/todo-comment-to-edit.md` §S,
 * measurements in `tasks/evidence/comment-to-edit/s-findings.md`): redeem a ticket, keep the
 * picker alive across in-frame navigation with a host-only cookie, and decide per request whether
 * this page load may carry the picker at all.
 *
 * `sites/preview-ticket.js` mints the ticket; this file is the only reader. `site-proxy.js` does
 * the byte work (the upstream header, the injected script, the response headers) once this file
 * has said yes.
 *
 * Every "yes" needs ALL of these, re-checked on every load, never remembered:
 *   1. `TRACY_COMMENT_PICKER=1`. Off, this file changes nothing: no param is read or stripped, no
 *      cookie is read, no redirect is answered.
 *   2. A GET that the browser says is an iframe navigation (`Sec-Fetch-Dest: iframe`). That
 *      refuses a top-level visit and dsh's `/sidebar/frame`, whose server-side fetch sends no
 *      Fetch Metadata. A plain-HTTP stand gets no Fetch Metadata from the browser either (only
 *      potentially trustworthy URLs do), so there the check needs the explicit dev switch
 *      `TRACY_COMMENT_PICKER_INSECURE_DEV=1`, default off.
 *   3. A token signed by this deployment, for THIS site, naming a parent origin still on the
 *      allowlist.
 *   4. The session on this very request belongs to the seat the token names (hash comparison),
 *      and that seat is still live, any role (`pickAllowed`, ADR 0028: a viewer comments too).
 *      A revoked seat or a sign-out loses the picker on the next load.
 *   5. For the ticket only: its `jti` has not been redeemed before (single use).
 *
 * A framed load that fails any of them still gets one thing (`report` → `reporterScriptTag`): the
 * runtime, told only to say the page's address to Tracy's own origin. It carries no text of the
 * page, so none of the rules above apply to it; without it a link followed inside an unvouched frame
 * left the Browser tab's address bar on the page it had opened (30/09/2026).
 *
 * The continuation lapses with the session it was issued under (`continuationExpiry` in
 * `lib/preview-ticket.js` says why that and not fifteen minutes). Sessions slide (`/auth/me`
 * re-mints one older than an hour), so a picker load under a session that has since outgrown the
 * continuation sets the cookie again with the session's new expiry — on the response the proxy
 * sends anyway, never with a request of its own.
 */
import { parseCookies, previewCookie, previewCookieName } from '../lib/cookies.js'
import {
  PREVIEW_PARAM,
  continuationExpiry,
  mintPreviewContinuation,
  previewParentOrigins,
  readPreviewToken,
  seatHashOf
} from '../lib/preview-ticket.js'
import { TRACY_PREVIEW_JS } from './tracy-preview.generated.js'

/**
 * The query string without `tracy_preview`, and the ticket it carried (first occurrence).
 *
 * Every other pair is kept byte-for-byte: a round trip through `URLSearchParams` would re-encode
 * the customer's own query (`%20` → `+`, and so on), which a CMS may read differently. A query
 * with no such parameter comes back exactly as given.
 * @param {string} search - `url.search`, with its leading `?` or empty.
 * @returns {{search: string, ticket: string|null}}
 */
export function splitPreviewParam(search) {
  if (!search || search.length < 2) return { search: search ?? '', ticket: null }
  const decode = (s) => {
    try {
      return decodeURIComponent(s.replace(/\+/g, ' '))
    } catch {
      return s
    }
  }
  let ticket = null
  let found = false
  const kept = []
  for (const pair of search.slice(1).split('&')) {
    const eq = pair.indexOf('=')
    const name = decode(eq === -1 ? pair : pair.slice(0, eq))
    if (name === PREVIEW_PARAM) {
      found = true
      if (ticket === null) ticket = eq === -1 ? '' : decode(pair.slice(eq + 1))
      continue
    }
    kept.push(pair)
  }
  if (!found) return { search, ticket: null }
  return { search: kept.length > 0 ? `?${kept.join('&')}` : '', ticket }
}

/** Rule 2 above: an iframe navigation, or a plain-HTTP stand with the dev switch on. */
function framedNavigation(request, config, secure) {
  if (request.method !== 'GET') return false
  const dest = request.headers.get('sec-fetch-dest')
  if (secure) return dest === 'iframe'
  return Boolean(config.commentPickerInsecureDev) && (dest === null || dest === 'iframe')
}

/** Rules 3 and 4, shared by the ticket and the continuation. */
async function bindingHolds(claims, { site, email, role, config, mayPick }) {
  if (!claims || !email) return false
  if (claims.site !== site.site_key) return false
  if (!previewParentOrigins(config).includes(claims.aud)) return false
  if (claims.seatHash !== (await seatHashOf(email))) return false
  return mayPick(site.site_key, role)
}

/**
 * What the picker means for one request to a site hostname.
 *
 * @param {object} input
 * @param {Request} input.request
 * @param {URL} input.url - the request URL as the browser sent it.
 * @param {{site_key: string}} input.site
 * @param {string|null} input.email - the session on this request, if any.
 * @param {number|null} [input.sessionExp] - that session's expiry (epoch seconds); the
 *   continuation lapses with it.
 * @param {string|null} input.role - that email's live role on this site (`roleOnSite`).
 * @param {object} input.config - `commentPicker`, `commentPickerInsecureDev`, `origin`, `sessionSecret`.
 * @param {string} input.viewerProto - `https` or `http`, as the browser used it.
 * @param {string} input.viewerHost - the Host the browser used.
 * @param {(siteKey: string, role: string|null) => Promise<boolean>} input.mayPick
 * @param {{claim: (jti: string, exp: number) => boolean}} input.usedTickets
 * @param {number} [input.now] - epoch ms.
 * @returns {Promise<{redirect: Response|null, pick: {aud: string, setCookie?: string}|null, report: string|null, search: string}>}
 *   `search` is what the upstream request must use — never the ticket. `pick.setCookie`, when
 *   present, is a continuation re-issued for a session that slid; the picker response carries it.
 *   `report` is set on a framed navigation that gets NO picker: the origin the page may tell its
 *   address to (`reporterScriptTag`).
 */
export async function previewFor({
  request,
  url,
  site,
  email,
  sessionExp = null,
  role,
  config,
  viewerProto,
  viewerHost,
  mayPick,
  usedTickets,
  now = Date.now()
}) {
  if (!config.commentPicker) return { redirect: null, pick: null, report: null, search: url.search }
  const { search, ticket } = splitPreviewParam(url.search)
  const secure = viewerProto === 'https'
  if (!framedNavigation(request, config, secure)) return { redirect: null, pick: null, report: null, search }
  const ctx = { site, email, role, config, mayPick }

  if (ticket) {
    const claims = await readPreviewToken('ticket', ticket, config.sessionSecret, now)
    if ((await bindingHolds(claims, ctx)) && usedTickets.claim(claims.jti, claims.exp)) {
      const exp = continuationExpiry(sessionExp, now)
      const continuation = await mintPreviewContinuation({
        site: claims.site,
        seatHash: claims.seatHash,
        aud: claims.aud,
        secret: config.sessionSecret,
        sessionExp: exp,
        now
      })
      // Absolute, built from the host already matched to this site: a relative `Location` of a
      // path starting `//` would be read as another host.
      const location = `${viewerProto}://${viewerHost}${url.pathname}${search}`
      const headers = new Headers({
        location,
        'cache-control': 'private, no-store',
        'referrer-policy': 'no-referrer'
      })
      headers.append(
        'set-cookie',
        previewCookie(continuation, { secure, maxAge: exp - Math.floor(now / 1000) })
      )
      return { redirect: new Response(null, { status: 303, headers }), pick: null, report: null, search }
    }
  }

  const cookie = parseCookies(request.headers.get('cookie')).get(previewCookieName(secure))
  if (cookie) {
    const claims = await readPreviewToken('continuation', cookie, config.sessionSecret, now)
    if (await bindingHolds(claims, ctx)) {
      const exp = continuationExpiry(sessionExp, now)
      if (exp <= claims.exp) return { redirect: null, pick: { aud: claims.aud }, report: null, search }
      // The session slid since this continuation was issued: carry it along to the new expiry.
      const renewed = await mintPreviewContinuation({
        site: claims.site,
        seatHash: claims.seatHash,
        aud: claims.aud,
        secret: config.sessionSecret,
        sessionExp: exp,
        now
      })
      const setCookie = previewCookie(renewed, { secure, maxAge: exp - Math.floor(now / 1000) })
      return { redirect: null, pick: { aud: claims.aud, setCookie }, report: null, search }
    }
  }
  // A framed page with no picker still says where it is, to Tracy's own origin only (runtime 18,
  // feature `address`; see `reporterScriptTag`).
  return { redirect: null, pick: null, report: previewParentOrigins(config)[0] ?? null, search }
}

const escapeAttr = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The inline picker runtime, told which parent origin it may talk to. `</script` inside the
 * generated source is split so it cannot close the tag early (inside a JS string `<\/script` is
 * the same text).
 * @param {string} aud - an origin already checked against the allowlist.
 */
export function pickerScriptTag(aud) {
  return `<script data-parent-origin="${escapeAttr(aud)}" data-tracy-preview="pick">${inlineRuntime()}</script>`
}

/**
 * The same runtime for a framed page that gets NO picker, told only which origin it may tell its
 * address to (`data-report-origin`, runtime 18, feature `address`).
 *
 * WHY EVERY FRAMED PAGE, AND WHY NO TICKET (30/09/2026, EmDash `capiel1647` on the local
 * stand). A frame whose request carried no session for the seat the ticket named came back without
 * the picker; a link followed inside it loaded another page, and nothing on that page said where it
 * was — EmDash has no copy of the runtime, and a theme's copy says an anonymous `ready` with no
 * address. The Browser tab's address bar, the dsh page's `page=` and the Comments view stayed on the
 * page the tab had opened, on WordPress, Joomla and EmDash alike. The picker's rules above guard what
 * a pick carries OUT of the page (its text); this carries none of it — only the page's own address,
 * stripped of credentials, ticket and fragment by the runtime (`pageAddress`), posted to Tracy's own
 * origin exactly, which is where the side card showing that address lives.
 * @param {string} origin - Tracy's own origin (`previewParentOrigins`), already an exact origin.
 */
export function reporterScriptTag(origin) {
  return `<script data-report-origin="${escapeAttr(origin)}" data-tracy-preview="address">${inlineRuntime()}</script>`
}

/** The generated runtime, with `</script` split so it cannot close the tag early. */
function inlineRuntime() {
  return TRACY_PREVIEW_JS.replace(/<\/script/gi, '<\\/script')
}
