/**
 * Put the viewer's own address back into a `Location` that names the address we DIALLED.
 *
 * 🔒 THE SITE CANNOT SEE ITS OWN NAME, AND NOTHING CAN GIVE IT ONE. `siteTarget`'s local branch
 * dials `http://<label>-web-1/` — a Docker network alias — and Node's fetch (undici) RECOMPUTES
 * `Host` from the URL it is given, so a `Host` set on the outgoing headers is discarded. Measured
 * 11/09 on the dev machine: `GET https://devsmoke2.tracy.site/wp-admin/` answered
 * `302 Location: https://devsmoke2-web-1/wp-admin/` — the internal container name, handed to a
 * browser that has no way to resolve it. The same request with the right `Host` (asked straight
 * of the container) answered `Location: https://devsmoke2.tracy.site/wp-admin/`.
 *
 * This is `proxy_redirect` in nginx and `ProxyPassReverse` in Apache: the job of the party that
 * changed the address on the way in. Only the host is touched — the path, query and fragment the
 * site chose are its own — and only when the value actually names the target, so a site
 * redirecting a visitor to a THIRD site (a payment provider, its own live domain) is left alone.
 *
 * `Content-Location` and `Link` carry absolute URLs too; `Link` is how WordPress advertises its
 * REST root, which a browser then dials.
 */
function reframeLocation(headers, target, viewerHost, viewerProto, sameHost) {
  const viewer = new URL(`${viewerProto}://${viewerHost}`)
  for (const name of ['location', 'content-location']) {
    const value = headers.get(name)
    if (!value) continue
    let parsed
    try {
      parsed = new URL(value, target)
    } catch {
      continue
    }
    // WordPress can append the public port to the internal Docker hostname when it redirects.
    // That is still our local container; giving that hostname to the visitor makes Live Edit
    // follow a link their browser cannot resolve. Remote targets keep the exact-authority rule.
    //
    // The site's OWN public hostname with another port or scheme is ours too (01/10): a
    // Joomla copy built while the local stand answered on `tracy.test:8080` keeps that address in
    // `$live_site`, so sign-in, sign-out and every SEF redirect sent the Browser tab to a port
    // nothing listens on, while ordinary pages (relative links) rendered fine. That hostname names
    // this one site and nothing else, so only the address the visitor used can be right for it.
    const ownHost = parsed.hostname === viewer.hostname
    if (parsed.host !== target.host && !(sameHost && parsed.hostname === target.hostname) && !ownHost)
      continue
    // The port too: assigning `host` a value with no port KEEPS the old one (WHATWG URL), so an
    // EmDash redirect (`/ru`, resolved against `http://<label>-web-1:4321/`) reached the visitor as
    // `https://<site>:4321/ru` — a port the tunnel never opens (measured 29/09 on the dev machine).
    //
    // 🔒 EXCEPT AN UPGRADE TO HTTPS OF THE SITE'S OWN PUBLIC ADDRESS (#1651). A Joomla copy with
    // `force_ssl=2` behind this proxy is told `X-Forwarded-Proto: http` for a visitor on http and
    // answers `301 Location: https://<site>/<same path>` — measured 23/10 on the dev machine, asked
    // straight of the container. Downgraded back to the visitor's http here, that was a redirect to
    // the very URL asked, forever (prod and dev, imported and provisioned copies alike). The edge
    // answers https on the same name, so the site's https stands. Only on a default port: a stand on
    // an explicit one (`tracy.test:51710`) answers the scheme it was opened on and nothing else.
    const upgrade = ownHost && parsed.protocol === 'https:' && viewer.protocol === 'http:' && !viewer.port
    parsed.protocol = upgrade ? 'https:' : viewer.protocol
    parsed.host = viewer.host
    parsed.port = viewer.port
    headers.set(name, parsed.toString())
  }
  const link = headers.get('link')
  if (link && link.includes(target.host)) {
    headers.set(
      'link',
      link.replaceAll(`//${target.host}`, `//${viewerHost}`).replaceAll('http://', `${viewerProto}://`)
    )
  }
}

/**
 * The one call a request to a customer's site hostname makes to that site's own copy — ported
 * from `proxyWithBar` in `workers/fleet-bar/src/index.js:91-253`, narrowed to what this task
 * carries (no proposals, no CF Access reads: tracy-web itself is the gate now).
 *
 * Two things this file must never get wrong, both learned the hard way elsewhere in this repo:
 *
 * 1. `x-tracy-email`, `x-tracy-tier` and `x-tracy-role` may be set ONLY here, and only after
 *    stripping whatever the client sent — a customer's own request could otherwise claim to be
 *    anyone, or claim `tier: editor` and be handed a CMS backend session (CLAUDE.md §2 RULES, and
 *    the task brief that ported this file, both name this explicitly).
 * 2. A response this code has READ (to inject the badge) can never forward the upstream's
 *    `content-encoding`/`content-length`/`transfer-encoding`/`content-range` — those describe
 *    bytes that no longer exist once the body has been re-serialized as a new string. Ported
 *    from `workspace/proxy.js`'s own `RESPONSE_REFRAMED` list and its comment on why: forwarding
 *    them anyway told a real browser to gunzip plain text, and it silently failed every page
 *    while curl and every test kept reporting 200.
 * 3. The upstream `fetch` itself can reject (DNS failure, connection refused, an aborted dial) —
 *    ported nowhere from the Worker, because a Worker's `fetch` to another zone fails a
 *    different way. Left uncaught, that rejection is an unhandled exception in `bar/route.js`'s
 *    handler, which Hono turns into a bare, unstyled `Internal Server Error` in plain text — the
 *    one response shape this app is otherwise careful never to show a visitor (chrome-acceptance
 *    defect: anonymous visit to a site's own root, `apps/tracy-web` unable to resolve the
 *    sibling site container). Caught below and answered as a styled page instead, `502` because
 *    that is the honest status for "I could not reach the thing behind me" — never swallowed
 *    silently, so `console.error` still puts it in the server log.
 */
import { outgoingCookieHeader } from '../lib/cookies.js'
import { OWN_READ_HEADER } from '../lib/own-read.js'
import { badgeTagFor } from './badge.js'
import { badgeSnippet } from '../lib/tracy-badge.js'
import { messagePage } from './pages.js'
import { requestLanguage, translate } from '../lib/i18n/index.js'
import { pickerScriptTag, reporterScriptTag } from './preview.js'
import { bodyFormat, isTracyCookie, originProjection, projectable } from './own-domain.js'
import { PROJECTED_MAX, PROJECTION_HEADER, projectBody, withAddedHashes } from './own-domain-integrity.js'
import { ASSERT_HEADER, SIG_HEADER, siteAccessHeaders } from './site-access.js'

// `origin`/`referer` are deliberately NOT on this list (fix round 1, Minor) — Node's fetch
// (undici) needs `host` recomputed from `target`, and needs the ordinary hop-by-hop set stripped
// the same way `workspace/proxy.js`'s own `HOP_BY_HOP` does, but that list also drops `origin`/
// `referer` for a reason specific to the WORKSPACE proxy (a WebSocket handshake whose gateway
// rejects a cross-origin `Origin`, per that file's own comment) that does not apply here.
// `proxyWithBar` in the Worker never touched either header, and a customer's own CMS reads
// `Referer` (WordPress checks it on admin POSTs) — stripping it silently breaks that check.
const REQUEST_HOP_BY_HOP = ['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host']

/**
 * Let Tracy's own surfaces put this site in an iframe — the preview pane, the Live site tab, the
 * side card's browser.
 *
 * 🔒 THE PLATFORMS DISAGREED FOR A STRUCTURAL REASON, NOT A POLICY ONE. WordPress and Joomla sit
 * behind Apache, and `scripts/lib/site-apache-conf.sh` writes
 * `frame-ancestors 'self' https://*.<zone> …` into EVERY site it configures, so Tracy has always
 * been able to frame them. EmDash runs Astro with no Apache in front: its own middleware sets
 * `X-Frame-Options: SAMEORIGIN` and nothing else, so Tracy's preview showed an empty pane for an
 * EmDash site while a WordPress site of the same age showed the site. Measured 19/09/2026 on
 * `demoemdash.tracy.test`: the site answered 200, the pane stayed empty, and `x-frame-options: SAMEORIGIN`
 * was the only header about framing.
 *
 * ⚠ AND IT COULD NOT BE FIXED AT PROVISION FOR EVERY TEMPLATE. `TRACY_FRAME_ANCESTORS` is read by
 * Tracy's own EmDash themes (`packages/cms/tracy-emdash-theme-*`), and a site built from a released
 * template that does not read it — `tracy-saas/emdash-0.x`, which hardcodes `frame-ancestors
 * 'none'` — ignores the variable entirely. Measured the same day: setting it changed no header.
 * This process is the one party every site's response passes through, so it is the only place the
 * answer is the same for all three platforms.
 *
 * 🔒 SCOPED TO TRACY, AND ONLY WHEN THE SITE SAID NOTHING. A site that already declares
 * `frame-ancestors` keeps its own answer untouched — that is WordPress and Joomla, whose Apache
 * policy is deliberately wider than this one. `X-Frame-Options` goes because it cannot name an
 * origin at all: it is either "nobody" or "same origin", and a proxied site's idea of "same" is
 * not the viewer's. Where a CSP `frame-ancestors` is present the browser must ignore XFO anyway,
 * so dropping it changes nothing for the two platforms that already send one.
 *
 * @param {Headers} headers - the response headers, already reframed.
 * @param {string|undefined} tracyOrigin - `config.origin`; without one, nothing is claimed.
 */
function allowTracyToFrame(headers, tracyOrigin) {
  const existing = headers.get('content-security-policy') ?? ''
  if (/\bframe-ancestors\b/i.test(existing)) return
  const origin = String(tracyOrigin ?? '').replace(/\/+$/, '')
  if (!/^https?:\/\/[^\s;,]+$/.test(origin)) return
  headers.delete('x-frame-options')
  const directive = `frame-ancestors 'self' ${origin}`
  headers.set('content-security-policy', existing === '' ? directive : `${existing}; ${directive}`)
}

/**
 * Forbid the browser from keeping a site's PERMANENT redirect.
 *
 * 🔒 A 301 OR 308 WITH NO CACHE HEADER IS KEPT BY THE BROWSER FOR AS LONG AS IT LIKES, and a site
 * behind this proxy changes its own address on purpose: an import arrives with the source site's
 * `home` still set, a copy is renamed, a draft goes live. Measured 28/09/2026 on
 * `tracy-ai-8836f920.tracy.site` (a copy of tracy.ai): the site answered `/` with 200, yet the side
 * card's Browser tab showed Chrome's broken-page icon. Inside the frame, `/` finished in 78 ms
 * without a single request to the site and went on to `https://tracy.ai/` (503), while `/?cb=1` and
 * every other path loaded. Chrome was replaying a 301 the site had sent while it still believed it
 * was tracy.ai, and no reload clears that. Only these two statuses need it: a 302/307 is not stored
 * unless the answer says so.
 * @param {Headers} headers - the response headers.
 * @param {number} status - the upstream status.
 */
function forgetPermanentRedirect(headers, status) {
  if (status === 301 || status === 308) headers.set('cache-control', 'no-store')
}

/** Headers through which an origin tells a cache in front how long it may keep an answer. */
const CACHE_LIFETIME_HEADERS = [
  'expires',
  'cdn-cache-control',
  'cloudflare-cdn-cache-control',
  'surrogate-control'
]

/**
 * Forbid every cache from keeping a site's `robots.txt`.
 *
 * 🔒 WHICH `robots.txt` A STRANGER GETS DEPENDS ON THE SITE'S PUBLISH STATE, WHICH THE CMS DOES NOT
 * KNOW. A draft is answered by the bar itself (`bar/route.js` `ROBOTS`, `no-store`); a published
 * site's own file comes through here, with whatever lifetime its CMS gives it. Measured 11/10/2026
 * on dev (#888 item 4): Joomla's Apache sends none, so Cloudflare caches the `.txt` and adds
 * `max-age=14400`; EmDash sends `public, max-age=86400`. After an unpublish the edge went on handing
 * out the published file — "index me" — for 4 to 24 hours (`cf-cache-status: HIT`). Cloudflare
 * honours an origin `no-store` (a draft's file answers `BYPASS`), so saying it here is enough; the
 * CDN-only lifetime headers go too, since an edge reads them before `Cache-Control`.
 * @param {Headers} headers - the response headers.
 * @param {string} path - the path the visitor asked for.
 */
function forgetRobots(headers, path) {
  if (path.toLowerCase() !== '/robots.txt') return
  headers.set('cache-control', 'no-store')
  for (const name of CACHE_LIFETIME_HEADERS) headers.delete(name)
}

/**
 * The headers a page carrying the comment picker must have (plan §S, "Block leaks").
 *
 * - `Cache-Control: private, no-store` + `Vary: Cookie`: to the CMS this request looks like a
 *   guest's, so without these a cache in front (Cloudflare with a cache-everything rule, a page
 *   cache) could store the picker page and hand it to the public.
 * - `Referrer-Policy: no-referrer`: nothing about this page leaves with its subresource requests.
 * - A SECOND `Content-Security-Policy` naming only the ticket's parent. Browsers enforce every CSP
 *   header they receive, so this narrows the site's own (wider) `frame-ancestors` without editing
 *   it, and a site that says `'none'` still says `'none'`. The ticket can be copied into any frame;
 *   this header is what refuses a parent that is not the one the ticket was issued to. Appended
 *   AFTER `allowTracyToFrame`, which reads the header as one string.
 *   🔒 IT NAMES `'self'` TOO, because `frame-ancestors` is checked against EVERY ancestor, not just
 *   the parent. A site page that frames a page of its own origin (a demo, an embed) sends that
 *   nested frame's request as a framed navigation with the same continuation cookie, so the nested
 *   answer carries this header as well; naming only `aud` refused it, since its parent is the site.
 *   Measured 25/10/2026 on `tracy-ai-8836f920.tracy.site`: the embedded demo showed "refused to
 *   connect" in Tracy's preview and loaded on the public site. `'self'` adds no stranger: every
 *   ancestor must still be the site itself or the ticket's parent, and a same-origin parent can
 *   read the frame's page anyway.
 * - The continuation cookie again, when `bar/preview.js` re-issued it for a session that slid.
 * @param {Headers} headers
 * @param {{aud: string, setCookie?: string}} preview - `aud` is the parent origin, already on the
 *   allowlist.
 */
function markPickerResponse(headers, { aud, setCookie }) {
  headers.set('cache-control', 'private, no-store')
  headers.append('vary', 'Cookie')
  headers.set('referrer-policy', 'no-referrer')
  headers.append('content-security-policy', `frame-ancestors 'self' ${aud}`)
  if (setCookie) headers.append('set-cookie', setCookie)
}

/** Headers that carry a hash of the response's own body. */
const BODY_DIGESTS = ['content-md5', 'digest', 'content-digest', 'repr-digest']
/** The policy headers a page's inline-block hashes are listed in. */
const POLICY_HEADERS = ['content-security-policy', 'content-security-policy-report-only']

/**
 * 🔒 A CUSTOMER SITE NEVER SETS ONE OF TRACY'S COOKIES, ON ANY ADDRESS (contract §3.1 (2)). A site
 * lives under the parent domain, where `tracy_sess*`, `tracy_handoff` and `tracy_shard` are read:
 * a `Set-Cookie: tracy_shard=…` from the site would steer the visitor, a `tracy_sess_<n>` would sign
 * them into the attacker's account. `projectHeaders` has always dropped them on an own domain; this
 * does it on Tracy's own addresses too. One named exception, `tracy_style`, is the theme's own
 * cookie (the previewed design system, kept across pages) and goes through both ways
 * (`lib/cookies.js` `isTracyCookieName`); any other `tracy_*` name, known or new, is still dropped.
 * @param {Headers} headers - the outgoing headers, changed in place
 */
function dropTracyCookies(headers) {
  const cookies = headers.getSetCookie?.() ?? []
  if (!cookies.some(isTracyCookie)) return
  headers.delete('set-cookie')
  for (const cookie of cookies) if (!isTracyCookie(cookie)) headers.append('set-cookie', cookie)
}

/**
 * The response headers of an own-domain request, in the visitor's terms: every header whose value
 * is a URL of the canonical origin by that header's own format names the own domain instead
 * (`Location`, each target of `Link`, a CSP source, a CORS origin — `own-domain.js` `header`), and
 * the cookies are the site's alone — none of Tracy's is ever set on a customer's domain, and a
 * cookie the CMS scoped to its canonical host (`Domain=`) becomes a cookie of the host that was
 * asked, which is what a browser on the own domain can keep.
 * @param {Headers} headers - the outgoing headers, changed in place
 * @param {Headers} upstream - the site's own response headers (for its `Set-Cookie` lines)
 * @param {ReturnType<typeof originProjection>} project
 * @param {URL} canonical
 * @param {boolean} bodyProjected - the body is one whose addresses may be replaced on the way out
 */
function projectHeaders(headers, upstream, project, canonical, bodyProjected) {
  // What described the bytes the CMS sent does not describe the bytes the visitor is sent
  // (`own-domain-integrity.js`, rule 3): no digest, no byte ranges, and a validator that only
  // claims the two are equivalent.
  if (bodyProjected) {
    for (const name of BODY_DIGESTS) headers.delete(name)
    headers.delete('accept-ranges')
    const etag = headers.get('etag')
    if (etag && !/^\s*W\//.test(etag)) headers.set('etag', `W/${etag.trim()}`)
  }
  // Collected first: a `Headers` object is not changed while it is being walked.
  const changed = []
  for (const [name, value] of headers) {
    if (name === 'set-cookie') continue
    const made = project.header(name, value)
    if (made !== null && made !== value) changed.push([name, made])
  }
  for (const [name, made] of changed) headers.set(name, made)
  headers.delete('set-cookie')
  const host = canonical.hostname.toLowerCase()
  for (const cookie of upstream.getSetCookie?.() ?? []) {
    if (isTracyCookie(cookie)) continue
    // 🔒 EVERY `Domain` THAT SCOPES THE CANONICAL HOST, NOT ONLY ITS EXACT NAME. A CMS told to
    // share its cookie across subdomains writes `Domain=.tracy.site`; on the customer's domain a
    // browser throws such a cookie away (the domain is not the host's, nor a parent of it), and
    // with it the visitor's cart or login. Any `Domain` the canonical host is, or lies under, is a
    // cookie the browser would have kept there — so on the own domain it is kept the only way it
    // can be: host-only, the attribute gone. A `Domain` that does not cover the canonical host was
    // never a cookie of this site's and goes through as written, for the browser to refuse.
    const scopes = (value) => {
      const domain = value.trim().toLowerCase().replace(/^\./, '').replace(/\.$/, '')
      return domain !== '' && (host === domain || host.endsWith(`.${domain}`))
    }
    const parts = cookie.split(';').filter((part, index) => {
      if (index === 0) return true
      const at = part.indexOf('=')
      if (at === -1 || part.slice(0, at).trim().toLowerCase() !== 'domain') return true
      return !scopes(part.slice(at + 1))
    })
    headers.append('set-cookie', parts.join(';'))
  }
}

/**
 * The CMS tier each seat role is vouched for on the site's own copy — what the Tracy Access
 * plugins (`scripts/provision/access/wordpress/tracy-access.php`'s `tracy_access_tier`,
 * `access/joomla/…/TracyAccess.php`'s `tier()`) read to decide whether to open a backend session.
 * Both sign someone in ONLY on exactly `editor`, and log a matching session OUT on anything else.
 *
 * 🔒 DROPPING THIS HEADER IS WHAT ISSUE #339 WAS. The port out of the fleet-bar Worker kept
 * `x-tracy-email` and left the tier behind on the belief that nothing read it; both plugins did,
 * so every owner's "Open admin" landed on the CMS's own login page.
 *
 * The three seat roles (ADR 0028): an owner and an editor get `editor` — a backend session — and
 * `x-tracy-role` beside it says which CMS role that session gets (both plugins map `owner` to the
 * CMS administrator: WordPress `administrator`, Joomla Super Users; any other role to the work role,
 * WordPress `editor` / Joomla Manager by default). A viewer gets `viewer`: the front end only, and
 * a backend session it may still hold is logged out. An unknown role (a retired `admin` or
 * `developer` before its migration) gets NO tier and NO role — fail closed, the same as no seat.
 */
const TIER_BY_ROLE = Object.freeze({
  owner: 'editor',
  editor: 'editor',
  viewer: 'viewer'
})

const RESPONSE_REFRAMED = [
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'content-range',
  'connection',
  'keep-alive',
  'proxy-connection',
  'te',
  'trailer',
  'upgrade'
]

/**
 * The request tracy-web sends on to a site's own copy. Every Tracy cookie is stripped (this is a
 * different origin than the workspace proxy's dsh — `outgoingCookieHeader` already does exactly
 * this filtering with no seat token to append; `{ site: true }` hands back the theme's own
 * `tracy_style`, the one `tracy_` name a site owns), and exactly one identity header survives,
 * stripped-then-set so a client's own value can never ride through
 * (`workers/fleet-bar/src/index.js`'s `withEmail`, same trust model).
 *
 * `sameHost` picks which header carries it: `x-tracy-email` when this process is co-located with
 * the site's own host (`siteTarget`'s local branch), `x-tracy-edge` on the cross-host branch —
 * which has no receiving side yet (`sites/resolver.js`'s `siteTarget` docstring, and the task
 * brief that specified this file: "no receiving side yet — only one host at cutover"). Carrying the
 * header now costs nothing and means the day a second host's edge exists, this file does not
 * need to change.
 *
 * The seat's tier and role (`x-tracy-tier`, `x-tracy-role`) ride with `x-tracy-email` on the
 * same-host branch only. ⚠ Cross-host carries NEITHER: nothing on a second host receives
 * `x-tracy-edge` yet (no reader anywhere in `apps/` or `packages/`, checked 24/09 for #339), so
 * there is no party that would strip a forged tier there and re-set a vouched one. Inventing a
 * second header for that edge would be a trust path nobody verifies; until the edge exists, a
 * site on another host gets no auto-login, stated here rather than half-built.
 */
function originRequest(
  request,
  target,
  { email, role, sameHost, viewerHost, viewerProto, preview, canonical = null, access = null }
) {
  const headers = new Headers(request.headers)
  for (const h of REQUEST_HOP_BY_HOP) headers.delete(h)
  if (canonical) {
    // 🔒 ON A CUSTOMER'S OWN DOMAIN NOTHING NAMED `x-tracy-*` COMES FROM THE CLIENT, WHATEVER IT IS
    // CALLED. The explicit list below covers the headers the site trusts today; this covers the one
    // added tomorrow. (The Tracy address keeps the explicit list: signed component calls ride it.)
    const forged = []
    for (const name of headers.keys()) if (name.toLowerCase().startsWith('x-tracy-')) forged.push(name)
    for (const name of forged) headers.delete(name)
    // The browser's own account of where it is (`Origin`, `Referer`) names the own domain; the CMS
    // compares both with the address it believes it has (WordPress on admin POSTs, Astro on every
    // form POST), so they are told back in its terms.
    const back = originProjection(new URL(`${viewerProto}://${viewerHost}`), canonical)
    for (const name of ['origin', 'referer']) {
      const value = headers.get(name)
      const told = value ? back.url(value) : null
      if (told !== null) headers.set(name, told)
    }
  }
  const cookie = outgoingCookieHeader(request.headers.get('cookie'), null, { site: true })
  if (cookie) headers.set('cookie', cookie)
  else headers.delete('cookie')
  headers.delete('x-tracy-email')
  headers.delete('x-tracy-edge')
  headers.delete('x-tracy-tier')
  headers.delete('x-tracy-role')
  // Tracy's mark on its own reads (`lib/own-read.js`) is for the router only: the site never sees it.
  headers.delete(OWN_READ_HEADER)
  // Stripped on EVERY request, picker on or off: the Claude Cowork plugin will trust this header
  // to print render stamps (plan §S, stage 2), so a client must never be able to send it.
  headers.delete('x-tracy-preview')
  if (preview) headers.set('x-tracy-preview', 'pick')
  if (email) headers.set(sameHost ? 'x-tracy-email' : 'x-tracy-edge', email)
  // `Object.hasOwn`, not a bare index: `TIER_BY_ROLE['constructor']` is inherited from Object.
  const tier = email && role && Object.hasOwn(TIER_BY_ROLE, role) ? TIER_BY_ROLE[role] : null
  if (sameHost && tier) {
    headers.set('x-tracy-tier', tier)
    headers.set('x-tracy-role', role)
  }
  headers.delete(ASSERT_HEADER)
  headers.delete(SIG_HEADER)
  const forwardedHost = canonical ? canonical.host : viewerHost
  // 🔒 The assertion is what a strict verifier believes (`site-access.js`); the bare headers above
  // stay only until every site runs one. Signed on every request, a viewer without a seat as an
  // anonymous guest, so the verifier can end a Tracy session the seat no longer covers.
  if (sameHost && access) {
    const signed = siteAccessHeaders({
      ...access,
      email: tier ? email : '',
      role: tier ? role : '',
      tier: tier ?? 'guest',
      host: forwardedHost,
      method: request.method,
      target: `${target.pathname}${target.search}`
    })
    for (const [name, value] of Object.entries(signed)) headers.set(name, value)
  }
  // 🔒 ON AN OWN DOMAIN THE CMS IS TOLD ITS CANONICAL ADDRESS, NOT THE VISITOR'S (`own-domain.js`).
  // The site's Apache puts `X-Forwarded-Host` back as `Host`; told the customer's domain, WordPress
  // answers 301 to its `home` (measured on the dev machine, `x-redirect-by: WordPress`), and told the
  // visitor's scheme beside a canonical of another scheme it does the same. Told exactly its own
  // address it has nothing to redirect, and every URL it writes is one this file knows how to find.
  headers.set('x-forwarded-host', forwardedHost)
  // 🔒 THE SCHEME THE VIEWER USED, NOT THE ONE WE DIAL. It read `target.protocol` until 11/09,
  // which is always `http` — the site's own copy is reached over plain HTTP inside the machine.
  // So a visitor on https was announced to the site as http, and the stock WordPress `wp-config`
  // (`if (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) …) $_SERVER['HTTPS'] = 'on';`) never fired.
  // That is the whole point of the header: it describes the CLIENT's connection, and this process
  // is the only party that still knows it.
  headers.set('x-forwarded-proto', canonical ? canonical.protocol.replace(':', '') : viewerProto)
  const init = { method: request.method, headers, redirect: 'manual', signal: request.signal }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body
    init.duplex = 'half'
  }
  return new Request(target, init)
}

/**
 * Fetch the site's own copy and hand back what the visitor's browser should see.
 *
 * @param {Request} request - the incoming request, as the browser sent it.
 * @param {URL} target - `siteTarget(site, config)` with the request's path+query applied —
 *   never `site.address` (RULE: server-side code never dials it).
 * @param {object} input
 * @param {string|null} input.email - the viewer's email, already narrowed by the caller to "only
 *   when they hold a seat here" (`bar/route.js` passes `null` otherwise — this file does not
 *   itself decide who has a seat).
 * @param {string|null} [input.role] - the viewer's live seat role on THIS site (`roleOnSite`), or
 *   null. Decides `x-tracy-tier`/`x-tracy-role` on the same-host branch; ignored without `email`.
 * @param {boolean} input.sameHost - `site.host === config.hostName`.
 * @param {string} input.viewerHost - the Host header the browser actually used.
 * @param {'draft'|'published'} input.publish - `site.publish`, decides
 *   whether `x-robots-tag: noindex, nofollow` rides the response.
 * @param {'draft'|'managed'|'advert'|'none'} [input.variant] - `badgeVariantFor(site)`;
 *   a demo is `advert` (its own badge) or `none` (installed without one). `create` is accepted and
 *   still handled below, but nothing produces it any more — see `badgeVariantFor`. Left out, it
 *   follows `publish` the way it always did.
 * @param {string} [input.badgeScriptUrl] - where `/tracy-badge.js` answers, for an `advert` demo.
 * @param {string|null} [input.badgeTemplate] - the template that badge's button opens.
 * @param {string} [input.badgeOrigin] - the Tracy origin that badge links to. Also where the
 *   draft/managed badge's team link points, since the bar no longer serves one (ADR 0018).
 * @param {string} [input.label] - `site.label`, for that team link's `/:label/team` route.
 * @param {string} input.badgeUrl - `config.badgeUrl`.
 * @param {{aud: string, setCookie?: string}|null} [input.preview] - `bar/preview.js`'s verdict for
 *   this request: when set, the site is told `x-tracy-preview: pick`, and an HTML answer carries the
 *   picker plus the headers that keep it out of shared caches and out of any other parent's frame
 *   (and the continuation again when `setCookie` is given).
 * @param {string|null} [input.report] - `bar/preview.js`'s `report`: on a framed load with no
 *   picker, the origin an HTML answer's runtime may tell the page's address to (runtime 18). No
 *   header changes with it: the page carries nothing a picker response guards.
 * @param {URL|null} [input.canonical] - set for a request on a customer's OWN domain (#1037): the
 *   origin of the site's Tracy address, which the CMS goes on believing it lives at. The CMS is then
 *   asked as that address, every client-sent `x-tracy-*` header is dropped, and what comes back is
 *   told in the visitor's terms (`own-domain.js`). `viewerHost`/`viewerProto` stay the visitor's.
 * @param {{site: string, kid: string, key: Buffer}|null} [input.access] - the site's access key
 *   (`site-access.js`); set, every request on the same-host branch carries a signed assertion.
 * @param {typeof fetch} [input.fetchImpl] - overridable so a test never dials a real host.
 * @returns {Promise<Response>}
 */
/** The largest HTML page read whole to place the badge; bigger ones stream through untouched. */
const MAX_HTML_BYTES = 5 * 1024 * 1024

/**
 * A body read whole, up to `max` bytes: `{ bytes }`, or — past the ceiling — `{ stream }`, the same
 * body from its first byte (what was read, then the rest as it arrives), for sending on untouched.
 * A body that fails while it is read rejects: the caller has no answer to give for it.
 * @param {ReadableStream<Uint8Array>} body
 * @param {number} max
 */
async function readWhole(body, max) {
  const reader = body.getReader()
  const chunks = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return { bytes: Buffer.concat(chunks) }
    chunks.push(Buffer.from(value))
    size += value.length
    if (size > max) break
  }
  const stream = new ReadableStream({
    async pull(controller) {
      if (chunks.length > 0) return controller.enqueue(chunks.shift())
      const { done, value } = await reader.read()
      if (done) controller.close()
      else controller.enqueue(value)
    },
    cancel: (reason) => reader.cancel(reason)
  })
  return { stream }
}

export async function proxySite(
  request,
  target,
  {
    email,
    role = null,
    sameHost,
    viewerHost,
    viewerProto = 'https',
    publish,
    variant = publish === 'published' ? 'managed' : 'draft',
    badgeScriptUrl = '',
    badgeTemplate = null,
    badgeOrigin = undefined,
    label = '',
    badgeUrl,
    preview = null,
    report = null,
    canonical = null,
    // the Design system panel's live preview (`ds-preview.js`): the page's HTML in, the page wearing
    // a system out (null: as it is). Such a response carries no badge, picker or reporter, and is
    // never stored or indexed
    transformHtml = null,
    access = null,
    fetchImpl = fetch
  }
) {
  const ask = (from) =>
    originRequest(from, target, {
      email,
      role,
      sameHost,
      viewerHost,
      viewerProto,
      preview,
      canonical,
      access
    })
  const unreachable = (error) => {
    console.error(`[bar] could not reach ${target.hostname}'s own copy: ${error.message}`)
    const lang = requestLanguage(request)
    return messagePage(
      translate(lang, 'bar.siteUnavailableTitle'),
      translate(lang, 'bar.siteUnavailableBody'),
      502,
      lang
    )
  }
  /** The refusal of a response whose body cannot be told whole on an own domain, and why. */
  const unprojectable = (reason) => {
    console.warn(
      `[bar] ${viewerHost}${new URL(request.url).pathname} is refused: not projectable (${reason})`
    )
    const lang = requestLanguage(request)
    const refusal = messagePage(
      translate(lang, 'bar.siteUnavailableTitle'),
      translate(lang, 'bar.siteUnavailableBody'),
      502,
      lang
    )
    refusal.headers.set(PROJECTION_HEADER, `refused; reason=${reason}`)
    refusal.headers.set('cache-control', 'no-store')
    return refusal
  }
  // The visitor's own domain in place of the CMS's canonical address, on the way out (#1037).
  const project = canonical ? originProjection(canonical, new URL(`${viewerProto}://${viewerHost}`)) : null
  const askedPath = new URL(request.url).pathname
  /**
   * Whether a body of this content type is one this request's answer is read whole and projected
   * for. Plain text has one file with URLs in it by definition (`robots.txt`); any other is passed
   * on as it streams, ranges and all.
   */
  const told = (type) =>
    Boolean(project) &&
    projectable(type) &&
    (bodyFormat(type) !== 'plain' || askedPath.toLowerCase() === '/robots.txt')
  let upstream
  try {
    upstream = await fetchImpl(ask(request))
    // 🔒 A SLICE OF A BODY THIS FILE REWRITES IS NOT A SLICE OF WHAT THE VISITOR IS SENT. Offsets in
    // a `206` count the CMS's bytes; once an address in them is replaced by one of another length
    // they name other bytes. The whole body is asked for instead and answered `200`, which a client
    // that sent `Range` must accept. Only for text an address can be in: a video keeps its ranges.
    if (upstream.status === 206 && request.method === 'GET' && told(upstream.headers.get('content-type'))) {
      await upstream.body?.cancel().catch(() => {})
      const whole = new Headers(request.headers)
      whole.delete('range')
      whole.delete('if-range')
      upstream = await fetchImpl(ask(new Request(request, { headers: whole })))
      if (upstream.status === 206) throw new Error('the site answered a range to a request without one')
    }
  } catch (error) {
    return unreachable(error)
  }

  /** The response headers every branch below sends: reframed, and on an own domain projected. */
  const outgoing = () => {
    const headers = new Headers(upstream.headers)
    // A reader must distinguish the routed CMS from a control-plane page or unknown host.
    headers.delete('x-tracy-site-response')
    if (label) headers.set('x-tracy-site-response', label)
    for (const h of RESPONSE_REFRAMED) headers.delete(h)
    reframeLocation(headers, target, viewerHost, viewerProto, sameHost)
    if (project)
      projectHeaders(
        headers,
        upstream.headers,
        project,
        canonical,
        told(upstream.headers.get('content-type'))
      )
    dropTracyCookies(headers)
    allowTracyToFrame(headers, badgeOrigin)
    forgetPermanentRedirect(headers, upstream.status)
    forgetRobots(headers, askedPath)
    return headers
  }
  // 🔒 A REDIRECT TO THE ADDRESS THAT WAS JUST ASKED FOR IS NEVER HANDED TO A BROWSER. It is what a
  // CMS that disagrees with this proxy about its own address would produce, and a browser follows it
  // until it gives up with an error page of its own that names nobody. Said here instead, once.
  if (project && upstream.status >= 300 && upstream.status < 400) {
    const headers = outgoing()
    const asked = new URL(request.url)
    const viewed = `${viewerProto}://${viewerHost}${asked.pathname}${asked.search}`
    let to = null
    try {
      to = new URL(headers.get('location') ?? '', viewed).href
    } catch {
      /* A Location that is no URL is the site's own to answer for. */
    }
    if (to === new URL(viewed).href && (request.method === 'GET' || request.method === 'HEAD')) {
      await upstream.body?.cancel().catch(() => {})
      return unreachable(new Error(`redirects ${viewed} to itself (${upstream.status})`))
    }
  }

  const contentType = upstream.headers.get('content-type') ?? ''
  const isHtml = contentType.includes('text/html')
  const noindex = publish !== 'published'

  // Badge injection must only touch HTML, and only a GET response — ported verbatim as a rule
  // from `proxyWithBar`. Everything else (an asset, a POST's redirect, a JSON API response)
  // streams through untouched but for the response-reframing headers, which must be stripped
  // regardless of content type: they describe the upstream's wire bytes on ANY response, not
  // only the ones this file re-serializes.
  const tooLarge = Number(upstream.headers.get('content-length') ?? 0) > MAX_HTML_BYTES
  const withHashes = (headers, hashes) => {
    for (const name of POLICY_HEADERS) {
      const policy = headers.get(name)
      if (policy) headers.set(name, withAddedHashes(policy, hashes))
    }
    return headers
  }
  // 🔒 ON AN OWN DOMAIN A BODY THAT CAN CARRY THE SITE'S ADDRESS IS READ WHOLE AND TOLD IN THE
  // VISITOR'S TERMS BY ITS OWN FORMAT'S PARSER (`own-domain-integrity.js` `projectBody`) — a page
  // with what it says about its own bytes kept true.
  //
  // 🔒 AND A BODY THAT CANNOT BE TOLD WHOLE IS NOT SENT AT ALL. Too large, not UTF-8, XHTML, left
  // partly unread by its parser, a policy that leans on a hash this file would remove: the headers
  // (a policy, a `Link`, a cookie) are told as one with the body, so sending the site's own bytes
  // under them is a page half in each name — a policy that blocks its own assets, a canonical tag of
  // the other address, an asset whose hash no longer matches. The response is refused, by name
  // (`unprojectable`); nothing of the site's answer goes out, and — for the page a connection
  // probe asks for — nothing is signed that says this domain opens the site.
  let page = null
  if (upstream.body && request.method !== 'HEAD' && told(contentType)) {
    const asked = new URL(request.url)
    let read
    try {
      read = tooLarge ? { stream: upstream.body } : await readWhole(upstream.body, PROJECTED_MAX)
    } catch (error) {
      return unreachable(error)
    }
    const told = read.stream
      ? { unsupported: 'size' }
      : projectBody(read.bytes, {
          contentType,
          projection: project,
          canonical,
          path: `${asked.pathname}${asked.search}`,
          policies: POLICY_HEADERS.map((name) => upstream.headers.get(name)).filter(Boolean)
        })
    if (told.unsupported) {
      await read.stream?.cancel().catch(() => {})
      return unprojectable(told.unsupported)
    }
    const headers = withHashes(outgoing(), told.hashes ?? [])
    page = { bytes: told.bytes, headers }
    // Everything but a page that may carry the badge is answered here.
    if (request.method !== 'GET' || !isHtml) {
      return new Response(page.bytes, { status: upstream.status, statusText: upstream.statusText, headers })
    }
  }
  if (request.method !== 'GET' || !isHtml) {
    // The framing answer belongs on EVERY response, not only the ones this file re-serializes: a
    // HEAD is how anyone checks these headers (it is how this change was first measured, and the
    // first reading said the fix had not worked), and a framed document is not always HTML.
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outgoing()
    })
  }

  // A page that is not a page (a stream, a download served as HTML) must not be read whole into memory:
  // past the ceiling it goes through untouched, with no badge, exactly like a non-HTML response.
  if (tooLarge) {
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outgoing()
    })
  }
  let text = page ? new TextDecoder().decode(page.bytes) : await upstream.text()
  let transformed = false
  if (transformHtml) {
    try {
      const t = await transformHtml(text)
      if (typeof t === 'string' && t !== text) {
        text = t
        transformed = true
      }
    } catch (error) {
      // a preview that cannot be made is the page as it is, said in the log, never a broken frame
      console.error(`[bar] design-system preview of ${target.hostname}: ${error.message}`)
    }
  }
  // Only when there is a `</body>` to insert before — ported verbatim from `proxyWithBar`'s own
  // `HTMLRewriter().on('body', ...)`, which only ever fires when that element exists. A page with
  // none (a fragment, a malformed document) is returned exactly as the origin sent it.
  const idx = text.toLowerCase().lastIndexOf('</body>')
  // Which tag, if any, goes in before `</body>`:
  //   'none'   — a demo installed without the badge: the page is passed through untouched.
  //   'advert' — a demo: Tracy's own badge, whose one door is the Design inspiration page.
  //   else     — the seat pill of `bar/badge.js`, which needs a session to be of any use.
  const tag =
    variant === 'none' || transformHtml
      ? ''
      : variant === 'advert'
        ? badgeSnippet({ scriptUrl: badgeScriptUrl, template: badgeTemplate, origin: badgeOrigin })
        : badgeTagFor({
            variant,
            hostname: viewerHost,
            email,
            origin: badgeOrigin,
            label,
            badgeUrl
          })
  // The picker when this load is vouched; otherwise, on a framed load, only the page's address to
  // Tracy's origin (`report`, runtime 18) — one of the two, never both.
  const inserted = transformHtml
    ? ''
    : tag + (preview ? pickerScriptTag(preview.aud) : report ? reporterScriptTag(report) : '')
  // With nothing to insert, an own-domain page goes out as the BYTES that were settled above —
  // never through a decode and re-encode, which would rewrite a body that is not UTF-8.
  const untouched = !transformed && (idx === -1 || inserted === '')
  const body = untouched
    ? page
      ? page.bytes
      : text
    : idx === -1 || inserted === ''
      ? text
      : text.slice(0, idx) + inserted + text.slice(idx)

  const headers = page ? page.headers : outgoing()
  if (transformHtml) {
    headers.set('cache-control', 'no-store')
    headers.set('x-robots-tag', 'noindex, nofollow')
  }
  // The bar tells every visitor a DRAFT copy is hidden from search and AI — a published site is
  // the live site, and its own robots.txt (proxied by `bar/route.js`, never cached: `forgetRobots`) speaks for it.
  if (noindex) headers.set('x-robots-tag', 'noindex, nofollow')
  if (preview) markPickerResponse(headers, preview)
  return new Response(body, { status: upstream.status, statusText: upstream.statusText, headers })
}
