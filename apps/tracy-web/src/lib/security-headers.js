/**
 * The headers every page this app RENDERS ITSELF answers with (#805).
 *
 * WHY ONE FILE. Until 03/10/2026 `/login` answered with no hardening header at all, the two
 * `/signin` pages carried only a frame refusal written by hand in `identity/route.js`, and the
 * pages in `bar/pages.js` only `no-store`. A page shell shared by every one of them
 * (`./page-shell.js`) deserves one answer about what the browser may do with it.
 *
 * 🔒 APPLIED WHERE A PAGE IS RENDERED, NEVER AS A MIDDLEWARE. This app also relays other people's
 * HTML — a customer's site, the dsh shell, the built documentation, the ops bundle — and each of
 * those loads scripts this policy would refuse. A wildcard middleware cannot tell them from a page
 * of ours; a call at the render site can.
 *
 * THE POLICY IS WHAT THE PAGES LOAD, NO MORE (measured 03/10/2026 from `page-shell.js` and the
 * stylesheets it links):
 *   - script: inline only (`pageShell`'s own `<script>`); the app itself fetches nothing. The one
 *     host in `script-src` belongs to the edge — see below.
 *   - style: the inline `<style>` block, plus the two font stylesheets — `api.fontshare.com`
 *     (General Sans) and `fonts.googleapis.com` (Newsreader, Be Vietnam Pro).
 *   - font: the files those stylesheets name — `cdn.fontshare.com`, `fonts.gstatic.com`.
 *   - img: the favicon, a `data:` URL. The brand lockup is inline SVG, not an image fetch.
 *   - connect: this origin (`loginScript` and the seat pages post their own forms by `fetch`),
 *     plus the edge's report address — see below.
 *   - form-action: this origin, plus the two sign-in providers — the provider buttons are forms on
 *     `/signin/<provider>`, which answers with a redirect to the provider, and a browser applies
 *     `form-action` to that redirect too.
 *
 * ⚠ ONE SCRIPT IS ADDED BY THE EDGE, NOT BY THIS APP. Cloudflare, in front of the deployed app,
 * injects its Web Analytics beacon into every HTML answer:
 * `<script src="https://static.cloudflareinsights.com/beacon.min.js/…">`, which reports to
 * `https://cloudflareinsights.com/cdn-cgi/rum` (measured 03/10/2026 in a browser on the dev
 * surface). No source file here names it, so the HTML-reading tests cannot see it; without these
 * two hosts the policy silently switches page analytics off on every rendered page. A laptop
 * without the edge never loads it. Exactly the two hosts Cloudflare documents, nothing wider.
 *
 * ⚠ HOSTS CARRY NO SCHEME, ON PURPOSE. Fontshare's stylesheet names its files protocol-relative
 * (`//cdn.fontshare.com/…`), so a laptop's `http://` page asks for them over `http://`; a bare
 * host matches the page's own scheme and its secure upgrade, which is `https` only in production.
 *
 * ⚠ `'unsafe-inline'` IS A COMPATIBILITY CHOICE, NOT A CLAIM. The shell's script and style are
 * inline, so this policy does not stop an injected inline script — escaping (`./html.js`) is what
 * does. What it does stop: a frame around the page, a script or stylesheet from another origin, a
 * form or `<base>` pointed elsewhere, plugins.
 */

const FONT_STYLES = 'api.fontshare.com fonts.googleapis.com'
const FONT_FILES = 'cdn.fontshare.com fonts.gstatic.com'
/** Where `identity/oauth.js`'s `authorizeUrl` sends the browser (a test holds the two together). */
const SIGN_IN_PROVIDERS = 'accounts.google.com github.com'

/**
 * The edge's Web Analytics beacon (see the file comment): the script, and where it reports.
 * Exported for the one other page with its own policy that the edge also injects into: the Scalar
 * reference (`api-reference/route.js`).
 */
export const EDGE_BEACON_SCRIPT = 'static.cloudflareinsights.com'
export const EDGE_BEACON_REPORT = 'cloudflareinsights.com'

const POLICY = [
  "default-src 'self'",
  `script-src 'unsafe-inline' ${EDGE_BEACON_SCRIPT}`,
  `style-src 'unsafe-inline' ${FONT_STYLES}`,
  `font-src ${FONT_FILES}`,
  "img-src 'self' data:",
  `connect-src 'self' ${EDGE_BEACON_REPORT}`,
  `form-action 'self' ${SIGN_IN_PROVIDERS}`,
  "base-uri 'none'",
  "object-src 'none'"
]

/**
 * The header set for one rendered page, lower-case names.
 *
 * @param {{framable?: boolean, formAction?: string}} [options] - `formAction`: one more origin a form
 *   submission may end up at (the whitelist page: see `hardenPage`). `framable`: leave framing undecided. ONLY for a page
 *   answered on a CUSTOMER SITE's address (`bar/pages.js`'s `messagePage`, `unknownSitePage`,
 *   `refusedHostPage`): Tracy's preview pane and Live site tab show that address inside a frame,
 *   and a refusal there paints the browser's own "refused to connect" over the sentence the person
 *   needs to read. Those pages carry words and, since #796, one link to Tracy's own front page
 *   (`target="_top"`) — no form, no button, nothing that acts — so there is nothing to press
 *   through a disguise. Every page on Tracy's own address refuses a frame.
 * @returns {Record<string, string>}
 */
export function pageSecurityHeaders({
  framable = false,
  formAction = '',
  referrerPolicy = 'no-referrer'
} = {}) {
  const policy = formAction
    ? POLICY.map((d) => (d.startsWith('form-action ') ? `${d} ${formAction}` : d))
    : POLICY
  return {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': referrerPolicy,
    'content-security-policy': (framable ? policy : [...policy, "frame-ancestors 'none'"]).join('; '),
    ...(framable ? {} : { 'x-frame-options': 'DENY' })
  }
}

/**
 * Put the page headers on a Hono answer that is about to be (or may be) a rendered page. Status,
 * cookies and content type are left exactly as the route set them.
 *
 * @param {import('hono').Context} c
 * @param {{framable?: boolean}} [options]
 */
export function hardenPage(c, options) {
  // 🔒 `form-action` covers the WHOLE redirect chain a form submission starts. The Google button is
  // a form: first sign-in stops at Google's own screens (a person's click ends the chain), but a
  // person Google already knows is bounced straight back to `/signin/google/callback`, which
  // answers 303 to the whitelist page — a different origin, blocked, so nothing happened (measured
  // 07/10/2026 on cowork.tracy.ai). `formAction` is set per deployment by `app.js`.
  const formAction = c.get?.('formAction') ?? ''
  // A page whose own forms post to a door that checks `Origin` names a weaker policy here
  // (`identity/route.js`, GET /signin): under `no-referrer` a plain form POST carries `Origin: null`.
  const referrerPolicy = c.get?.('referrerPolicy') ?? 'no-referrer'
  for (const [name, value] of Object.entries(pageSecurityHeaders({ formAction, referrerPolicy, ...options })))
    c.header(name, value)
}

/**
 * `c.html(...)` for a page this app renders: the same answer, with the page headers on it.
 *
 * @param {import('hono').Context} c
 * @param {string} html - a complete document (`pageShell`'s output).
 * @param {number} [status]
 * @returns {Response}
 */
export function renderedPage(c, html, status = 200) {
  hardenPage(c)
  return c.html(html, status)
}

/** One year, no `includeSubDomains`, no `preload` (J1.4, 11/10/2026). */
export const HSTS_VALUE = 'max-age=31536000'

/**
 * Middleware: `Strict-Transport-Security` on every answer from Tracy's OWN hostname — the host of
 * `TRACY_ORIGIN`, and only when that origin is https. Nothing on any other hostname.
 *
 * 🔒 HSTS BINDS A HOSTNAME, NOT A PAGE (RFC 6797 §6.1.2). Unlike the page headers above, which
 * code drew the answer does not matter; which hostname answered does. A Tracy error page shown on a
 * customer's own domain would otherwise pin that domain to https for a year. So the test is the
 * request's hostname against the configured origin, and customer site hostnames (under
 * `SITE_DOMAIN`), customer domains and the bare site domain never match.
 * `includeSubDomains` is never sent: customer sites live under the same registrable domain.
 * A laptop stand runs on http and never matches.
 *
 * An answer relayed as-is from `fetch` has immutable headers; on Tracy's own hostname it is
 * re-wrapped (same status, headers and body stream) so it carries the header too. An answer on any
 * other hostname — a customer site relayed through this app — is never touched.
 * @param {string | undefined} origin - `config.origin`.
 */
export function strictTransportSecurity(origin) {
  let host = ''
  try {
    const url = new URL(origin ?? '')
    if (url.protocol === 'https:') host = url.hostname.toLowerCase()
  } catch {}
  return async (/** @type {import('hono').Context} */ c, /** @type {() => Promise<void>} */ next) => {
    await next()
    if (!host || new URL(c.req.url).hostname.toLowerCase() !== host) return
    try {
      c.res.headers.set('strict-transport-security', HSTS_VALUE)
    } catch {
      c.res = new Response(c.res.body, c.res)
      c.res.headers.set('strict-transport-security', HSTS_VALUE)
    }
  }
}
