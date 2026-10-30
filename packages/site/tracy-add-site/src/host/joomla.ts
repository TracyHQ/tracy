/**
 * A live Joomla site: sign into the admin, install Claude Cowork, then take its token.
 *
 * Copied from `tracy-desk` (`credential/verifyAdminLogin.ts` + `migrate/installMigrationPlugin.ts`),
 * keeping the guards measured on real sites. Dropped: the Electron sign-in window (decided
 * 31/08 — an account form plus a self-install route replace it), and the Akeeba fallback.
 *
 * Everything here is `fetch` + reading HTML + keeping cookies. Nothing needs a browser, which is why
 * it can run inside dsh.
 */

import { createHash } from 'node:crypto'
import {
  type ContractAsset,
  contractCandidates,
  fetchContractAssets,
  indexedCandidates,
  packageForImport,
  pickContracts,
  probePaths
} from './slim-package'
import { CookieJar } from './cookie-jar.js'
import { diagnosticError, diagnosticPath } from './diagnostic.mjs'
import { apiDoors, isEngineAnswer, isPhpParseFailure } from './doors.mjs'
import { failureCode } from './error-code.mjs'
import { firewallOf, USER_AGENT } from './firewall.mjs'
import { needsInstall } from './manifest.js'
import type { SiteLink } from './site-link.js'
import { retryAfterMs } from './site-link.js'
import { isTrustedHop, nextRedirectUrl } from './url-policy.mjs'

const REQUEST_TIMEOUT_MS = 15_000
const INSTALL_TIMEOUT_MS = 300_000

/**
 * How long the site gets to fetch the package itself (`installtype=url`, the fallback road since
 * #1568) before this side stops waiting. A host that cannot reach GitHub does not refuse, it
 * hangs: measured on production, the POST held for the whole `INSTALL_TIMEOUT_MS` and the customer
 * waited five minutes for a generic "could not reach". A healthy site fetches ~60 MB well within
 * this.
 */
const URL_INSTALL_TIMEOUT_MS = 60_000

/** Cap for each HTML page read — a healthy admin page is far smaller. */
const MAX_HTML_BYTES = 4 * 1024 * 1024

/**
 * Cap for the package carried over on the upload road. The released package was 58.9 MB on
 * 0.24.38 (it ships the design-system contracts), so the old 8 MB cap silently turned every upload
 * fallback into `install_failed`. This leaves room for it to double.
 */
const MAX_PACKAGE_BYTES = 128 * 1024 * 1024

/**
 * How much of an install POST's own answer is read. PHP prints its fatal error at the top of the
 * page (when `display_errors` is on), so a short head is enough to tell memory exhaustion apart, and
 * the rest of a failed page is never kept.
 */
const MAX_POST_BODY_BYTES = 64 * 1024

/** PHP's fatal error when a script outgrows `memory_limit` — PHP's own words, never translated. */
const MEMORY_EXHAUSTED = /Allowed memory size of \d+ bytes exhausted|Out of memory \(allocated \d+\)/i

/**
 * Joomla's login form carries a hidden anti-CSRF field whose **NAME** (not value) changes per
 * session: `<input type="hidden" name="<32 hex>" value="1">`.
 */
const CSRF_FIELD = /name="([a-f0-9]{32})"\s+value="1"/
const TITLE = /<title>([^<]*)<\/title>/i

/**
 * The one mark on the post-login page meaning "this session got in", and it is NOT translated —
 * every admin template ships the logout link with exactly this query string.
 */
const LOGGED_IN = /option=com_login&(?:amp;)?task=logout/i

/**
 * Joomla's two-factor page: right password, right account, but the site asks for one more factor
 * no POST can supply.
 *
 * 🔒 MUST BE CHECKED BEFORE `LOGGED_IN`, and that order is the fix itself: the captive page also ships the very
 * logout link every admin template has, so a site with MFA on **looks exactly like** a successful
 * sign-in. It was once saved as a usable credential, then every later step — the Extension
 * Manager, the install — failed on a session that never got in.
 */
const MFA_REQUIRED = /option=com_users&(?:amp;)?(?:view=captive|task=captive\.)/i

/**
 * `JERROR_LOGIN_DENIED` — the password is RIGHT but the account has no admin access. Joomla returns the same
 * 303 and the same `<title>` as for a wrong password, so the wording is the only thing telling the two apart.
 * Telling people to change their password in this case is telling them to fix something that never broke.
 */
const NO_BACKEND_ACCESS = /do not have access to the Administrator/i

/**
 * `JGLOBAL_AUTH_INVALID_SECRETKEY` — two-factor on, the Secret Key empty or wrong: Joomla 3 and
 * 4.0–4.1 ("two factor authentication", Joomla 3.10.12, 4.0.0, 4.1.5), and the field that stayed
 * after 4.2 brought the captive page ("Multi-factor Authentication", 4.2.0, 5.2.0). It comes back on
 * the same login page, with the same message type, as a wrong password, so as with
 * `NO_BACKEND_ACCESS` only the sentence tells it apart.
 */
const INVALID_SECRETKEY = /(?:two factor|multi-factor) authentication Secret Key is invalid/i

/** `JGLOBAL_AUTH_INVALID_PASS` and `JGLOBAL_AUTH_NO_USER`, one en-GB sentence in every version. */
const INVALID_PASS = /Username and password do not match/i

/**
 * The language keys of the sign-in refusals and the reason each one is, in the order they are
 * tried. A backend in another language says them in its own words (`landingRefusal`). All four
 * live in one file per version: `<tag>.ini` on Joomla 3, `joomla.ini` on 4+ (read from en-GB of
 * 3.10.12, 4.0.0, 4.1.5, 4.2.0, 5.2.0).
 */
const REFUSAL_KEYS = {
  JGLOBAL_AUTH_INVALID_SECRETKEY: 'mfa_required',
  JERROR_LOGIN_DENIED: 'no_backend_access',
  JGLOBAL_AUTH_INVALID_PASS: 'invalid_credential',
  JGLOBAL_AUTH_NO_USER: 'invalid_credential'
} as const
type SignInRefusal = (typeof REFUSAL_KEYS)[keyof typeof REFUSAL_KEYS]

/** English sentences, recognised without reading any file, in the same order. */
const ENGLISH_REFUSALS: [RegExp, SignInRefusal][] = [
  [INVALID_SECRETKEY, 'mfa_required'],
  [NO_BACKEND_ACCESS, 'no_backend_access'],
  [INVALID_PASS, 'invalid_credential']
]

/**
 * Requests one sign-in failure may spend on the site's language files, redirects included. A
 * site that refused a sign-in is asked as little as possible: two files at most, one each.
 */
const LANGUAGE_READ_BUDGET = 2

/** `return=aW5kZXgucGhw` is the fixed base64 of `index.php`, exactly the value the real form ships. */
const RETURN_PARAM = 'aW5kZXgucGhw'

/** The component mints its own token at install and prints it right on its Options page. */
const TOKEN_VALUE = /id="jform_token"[\s\S]{0,160}?value="([a-f0-9]{32,})"/i
/** A Joomla template's folder in an asset path: `/templates/ja_impact/…`, `/media/templates/site/ja_impact/…`. */
const TEMPLATE_PATH = /\/templates\/(?:site\/)?([a-z0-9_-]{2,64})\//gi

export const COMPONENT = 'com_claudecowork'

export interface BasicAuth {
  username: string
  password: string
}

export type LoginRefusal =
  | 'invalid_credential'
  | 'no_backend_access'
  | 'mfa_required'
  | 'unreachable'
  | 'basic_auth_required'
  | 'basic_auth_invalid'
  | 'admin_gate'
  | 'admin_form_not_found'
  | 'tls_invalid'
  | 'blocked_by_firewall'

export type AdminSession =
  | {
      ok: true
      /** The session's cookies as one header, for callers that only keep a string. */
      cookie: string
      /** The same cookies per site and path; `authedFetcher` keeps updating it. */
      jar?: CookieJar
      authHeader: Record<string, string>
      webRootUrl: string
    }
  | {
      ok: false
      reason: LoginRefusal
      /** On `blocked_by_firewall`: the firewall that answered (`firewallOf`), for the operator and the log. */
      firewall?: string
      detail?: Diagnostic
    }

/** Where the component answers. No `com_ajax` wrapper — the engine's object is at the top level. */
export function apiEndpoint(webRootUrl: string): string {
  return `${webRootUrl}/index.php?option=${COMPONENT}&task=api.exec&format=json`
}

const timeout = (ms = REQUEST_TIMEOUT_MS) => AbortSignal.timeout(ms)

async function readCappedBody(response: Response, cap = MAX_HTML_BYTES): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    if (size + value.length > cap) {
      // Keep the head of the chunk that crosses the cap: what a caller looks for (PHP's fatal
      // error, a title) sits at the start of a page that may arrive as one large chunk.
      chunks.push(value.subarray(0, cap - size))
      await reader.cancel().catch(() => undefined)
      break
    }
    size += value.length
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export function basicAuthHeader(basicAuth?: BasicAuth): Record<string, string> {
  if (!basicAuth) return {}
  const encoded = Buffer.from(`${basicAuth.username}:${basicAuth.password}`).toString('base64')
  return { authorization: `Basic ${encoded}` }
}

/**
 * Follow redirects MANUALLY, re-attaching the auth header on each hop.
 *
 * `fetch` (like curl, like every browser) DROPS the `Authorization` header when a redirect changes
 * origin — a deliberate anti-leak rule. But a bare admin address routinely 301s apex→www, and with
 * `redirect: 'follow'` the final request arrives with no Basic auth, gets a 401, and a correct
 * credential reads as wrong. Cookies are kept in `jar` across hops because a redirect can be where
 * the session is granted; each hop gets only the cookies of its own site and path (`cookie-jar.ts`).
 *
 * The trust boundary is the fixed `anchor` — the address the operator typed — never the last URL
 * seen. Every hop, and even the first request, is made only when `isTrustedHop` allows it, so
 * cookies and Basic auth reach the anchor's origin (and its apex/www variant) and nowhere else. An
 * untrusted or downgraded destination throws BEFORE any request is made to it: the flow fails
 * closed rather than land on http, or on a stranger's host, carrying the operator's credential.
 * `secure` rises to true once any hop has been on https and never falls, so a later cross-host http
 * hop cannot downgrade a flow that reached https.
 */
async function fetchFollowing(
  startUrl: string,
  authHeader: Record<string, string>,
  opts: {
    anchor?: string
    jar?: CookieJar
    maxRedirects?: number
    secure?: boolean
    /** Requests left, shared across calls; each hop spends one, and none is made at zero. */
    budget?: { left: number }
  } = {}
): Promise<{ response: Response; jar: CookieJar }> {
  const anchor = opts.anchor ?? startUrl
  const maxRedirects = opts.maxRedirects ?? 5
  const jar = opts.jar ?? new CookieJar()
  let url = startUrl
  // The https floor carries in from the caller too: a flow that already reached https before this
  // call (an earlier GET that upgraded, then a login POST) must not drop to http here just because
  // the anchor and this start URL happen to be http.
  let secure = opts.secure === true || isHttps(anchor) || isHttps(startUrl)
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!isTrustedHop(anchor, url, { secure })) throw new Error('untrusted redirect target')
    if (opts.budget) {
      if (opts.budget.left <= 0) throw new Error('request budget spent')
      opts.budget.left -= 1
    }
    const cookie = jar.header(url)
    const response = await fetch(url, {
      redirect: 'manual',
      headers: {
        'user-agent': USER_AGENT,
        ...authHeader,
        ...(cookie ? { cookie } : {})
      },
      signal: timeout()
    })
    if (isHttps(url)) secure = true
    jar.absorb(response, url)
    const location = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null
    if (!location) return { response, jar }
    const next = nextRedirectUrl(url, location)
    if (!next) return { response, jar }
    // Following on: the 3xx body is not needed, so dispose it and free the socket.
    await disposeBody(response)
    url = next
  }
  throw new Error('too many redirects')
}

/** Is this an https URL? Fails closed (false) on anything unparseable. */
function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

/** Drop a response body we will not read, so following a redirect does not leak the socket. */
async function disposeBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    // A body already consumed or a stream that refuses to cancel is not a failure of the flow.
  }
}

/** A 401 with `WWW-Authenticate: Basic` — an .htaccess layer IN FRONT of Joomla, not Joomla refusing. */
function isBasicAuthChallenge(response: Response): boolean {
  return response.status === 401 && /^basic\b/i.test(response.headers.get('www-authenticate') ?? '')
}

/**
 * Certificate and handshake failures, as Node names them on `error.cause.code`. An https address
 * whose certificate is expired, self-signed or for another name is not "unreachable": the site
 * answered, and Tracy refused to send a password to it.
 */
const TLS_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'CERT_REVOKED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'ERR_SSL_WRONG_VERSION_NUMBER',
  'ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE',
  'ERR_SSL_TLSV1_ALERT_PROTOCOL_VERSION',
  'ERR_SSL_UNSUPPORTED_PROTOCOL',
  'EPROTO'
])

/**
 * Whether a thrown `fetch` failure is the TLS layer refusing the site, looked up the cause chain and
 * inside an `AggregateError` (`error-code.mjs`).
 */
export function isTlsFailure(error: unknown): boolean {
  return failureCode(error, (code) => TLS_CODES.has(code) || code.startsWith('ERR_SSL_')) !== undefined
}

/** The refusal for a request that threw before any answer: TLS when that is what it was. */
function thrownRefusal(error: unknown): 'tls_invalid' | 'unreachable' {
  return isTlsFailure(error) ? 'tls_invalid' : 'unreachable'
}

/**
 * Where a run stopped, for the operator (`ops_signal`), never shown to the customer: `at` names the
 * request, `check` the test it failed, `status` and `path` what the site answered, `error` the code
 * of what was thrown. Production recorded nothing but the reason, so an `installing/unreachable`
 * two seconds into a run could be any of five exits.
 *
 * 🔒 No secret rides here: no cookie, token or password, and every value comes from a closed set
 * (`diagnostic.mjs`) — a query string, a renamed admin folder or an error message can carry Admin
 * Tools' secret word or a password.
 */
export interface Diagnostic {
  at: string
  check: string
  status?: number
  path?: string
  error?: string
  /** What each install road met, kept apart (`InstallRoad`): a later answer never hides an earlier one. */
  roads?: Partial<Record<InstallRoadName, InstallRoad>>
  /** The PHP size limits the site's phpinfo named, in bytes (`PhpLimits`). */
  php_limits?: PhpLimits
  /** The size of the package carried over on the upload road, in bytes. */
  package_bytes?: number
  /** On a refused sign-in: whether the username had an email address's shape. Never the value. */
  username_is_email?: boolean
  /** On a `call_failed`: the engine call that stopped (`DIAGNOSTIC_ACTIONS`). */
  action?: string
  /** What came back instead of the engine's reply (`DIAGNOSTIC_ANSWERS`), never its text. */
  answer?: string
  /** The engine's own refusal code (`DIAGNOSTIC_ENGINE_ERRORS`, else `other`). */
  engine_error?: string
}

export type InstallRoadName = 'url_install' | 'upload_install'

/**
 * One install road, as it answered. `post_status` is the install POST's own status, `result_status`
 * the installer page read after it (Joomla's Post-Redirect-Get), `error` the code of what was thrown.
 * `cause` is a fixed classification, never the page: `memory_exhausted` when the POST's answer
 * carried PHP's memory error, `too_large` for a 413, `over_limit` when the road was not taken because
 * the package is larger than the site's known PHP upload limits.
 */
export interface InstallRoad {
  post_status?: number
  result_status?: number
  cause?: 'memory_exhausted' | 'too_large' | 'over_limit'
  error?: string
}

/**
 * The Local Value of three PHP limits, in bytes; `-1` is PHP's own "no limit". A limit the page did
 * not show (phpinfo disabled, a value Tracy cannot read) is absent: unknown, never a guess.
 */
export interface PhpLimits {
  memory_limit?: number
  upload_max_filesize?: number
  post_max_size?: number
}

/** A thrown error as a code from the closed list in `diagnostic.mjs`, `other` when it is not there. */
export const errorCode = diagnosticError

/**
 * Diagnostic builders for one site: `path` is only ever one of the importer's own Joomla paths,
 * relative to `base` (the site's web root), never a query string or a folder the site chose.
 */
function diagnoser(base: string) {
  return {
    answered(at: string, check: string, response: Response, url?: string): Diagnostic {
      const path = diagnosticPath(response.url || url || '', base)
      return { at, check, status: response.status, ...(path ? { path } : {}) }
    },
    thrown(at: string, error: unknown): Diagnostic {
      return { at, check: isTlsFailure(error) ? 'tls' : 'network', error: diagnosticError(error) }
    }
  }
}

/**
 * A page Joomla itself rendered — its error page included — rather than the web server or a firewall
 * in front of it: it loads the administrator template's assets (`media/templates/administrator/…` on
 * Joomla 4+, `administrator/templates/…` on 3.x) or the core `media/system` scripts. Measured on
 * Joomla 6.2: the 403 an Administrator or Manager gets on Extensions › Install is "Fehler: 403"
 * drawn by Atum, in the backend language.
 */
export function isJoomlaPage(html: string): boolean {
  return /\/media\/templates\/administrator\/|\/administrator\/templates\/|\/media\/system\/(?:js|css)\//i.test(
    html
  )
}

/**
 * The administrator page answered, but with no Joomla sign-in form: what stands there instead.
 *
 * `admin_gate` is a page that asks for a password of its own — RSFirewall's "Protected Area"
 * (`rsf_backend_password`, a 200 with no Joomla form, measured on a customer's Joomla 3.10), or any
 * other password form that is not Joomla's — and a 403, which is how Admin Tools, jSecure and
 * hosting firewalls block an administrator they do not trust. Everything else, including Admin
 * Tools sending a visitor without the secret word to the home page, is `admin_form_not_found`: the
 * address answers, and it is not a Joomla sign-in page.
 */
export function adminGateOf(
  html: string,
  status = 200,
  where?: LoginPageWhere
): 'admin_gate' | 'admin_form_not_found' {
  if (status === 403) return 'admin_gate'
  if (/name=["']?rsf_backend_password/i.test(html)) return 'admin_gate'
  if (isFrontLoginPage(html, where)) return 'admin_form_not_found'
  if (/<input[^>]+type=["']?password/i.test(html) && !/wp-login\.php|name=["']?log["'\s>]/i.test(html))
    return 'admin_gate'
  return 'admin_form_not_found'
}

/** Inspect only the public admin page; never submit credentials or infer captcha/MFA. */
export function inspectAdminPage(html: string, status: number, pageUrl: string, adminUrl: string) {
  const where = { pageUrl, adminBase: adminBasePath(adminUrl) }
  const signInFound = status < 400 && !isFrontLoginPage(html, where) && CSRF_FIELD.test(html)
  return {
    signInFound,
    locked: !signInFound && adminGateOf(html, status, where) === 'admin_gate'
  }
}

/**
 * A 403 that Joomla did not render: a named firewall when its page or headers say which
 * (`firewallOf`), otherwise `admin_gate`.
 *
 * 🔒 Without `generic`: Admin Tools, jSecure and hosting rules answer an administrator they do not
 * trust with a bare 403 too, and for those `admin_gate`'s advice (turn the extension off during the
 * import) is the right one. Only a page that names its firewall — Cloudflare's "Just a moment..."
 * challenge in front of the whole site, ModSecurity, Sucuri — is `blocked_by_firewall`.
 */
export function forbiddenBy(
  response: Response,
  html: string
): { reason: 'admin_gate' } | { reason: 'blocked_by_firewall'; firewall: string } {
  const firewall = firewallOf(response.status, response.headers, html)
  return firewall ? { reason: 'blocked_by_firewall', firewall } : { reason: 'admin_gate' }
}

/** Where a login page was read, and the administrator folder the typed address names. */
export type LoginPageWhere = { pageUrl: string; adminBase: string }

/**
 * The administrator folder of the address as typed, with a trailing slash: `/administrator/`,
 * `/office/administrator/`, or a renamed one (`adminUrl` is used as typed, never guessed).
 */
export function adminBasePath(adminUrl: string): string {
  const path = new URL(adminUrl).pathname.replace(/\/index\.php$/i, '')
  return path.endsWith('/') ? path : `${path}/`
}

/** Whether `url` lies inside the administrator folder `adminBase`. */
export function isUnderAdmin(url: string, adminBase: string): boolean {
  let path: string
  try {
    path = new URL(url).pathname
  } catch {
    return false
  }
  return path.startsWith(adminBase) || `${path}/` === adminBase
}

/**
 * A page of the site's front end with Joomla's login module (`option=com_users`), not the
 * administrator's form (`option=com_login`). Measured on Joomla 6: the home page an Admin Tools-style
 * gate redirects to carries a CSRF field and a password input of its own. A template may name the
 * component in the form's action instead of a hidden field (`index.php?option=com_users&task=
 * user.login`), or only the task (`?task=user.login`). So beside those markers, a password form
 * whose action resolves outside the administrator folder (`where`) is not the administrator's:
 * the password is never posted outside it.
 */
export function isFrontLoginPage(html: string, where?: LoginPageWhere): boolean {
  // Each form on its own: the administrator's login page links to the front end's password reset
  // (`index.php?option=com_users&view=reset`), so the bare word anywhere on the page proves nothing.
  for (const form of html.match(/<form\b[\s\S]*?(?:<\/form>|$)/gi) ?? []) {
    const tag = form.match(/^<form\b[^>]*>/i)?.[0] ?? ''
    const action = (
      tag
        .match(/\baction=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
        ?.slice(1)
        .find((v) => v !== undefined) ?? ''
    ).replace(/&amp;/gi, '&')
    // The form posts to the front end's users component, by its action…
    if (/[?&](?:option=com_users|task=user\.)/i.test(action)) return true
    // …or to anywhere outside the administrator folder (no action: the page's own address)…
    if (where && /<input\b[^>]*\btype=["']?password/i.test(form)) {
      let target: string | undefined
      try {
        target = new URL(action || where.pageUrl, where.pageUrl).toString()
      } catch {}
      if (!target || !isUnderAdmin(target, where.adminBase)) return true
    }
    // …or by its hidden fields: `option=com_users`, or `task=user.login` (the administrator's is `login`).
    for (const input of form.match(/<input\b[^>]*>/gi) ?? []) {
      const name = input.match(/\bname=["']?([\w.[\]-]+)/i)?.[1]?.toLowerCase()
      const value = input.match(/\bvalue=["']?([\w.-]+)/i)?.[1]?.toLowerCase()
      if ((name === 'option' && value === 'com_users') || (name === 'task' && value?.startsWith('user.')))
        return true
    }
  }
  return false
}

/**
 * Where the login form posts: `<admin>/index.php`, WITH the query string the address carried.
 * Admin Tools' secret word (`/administrator/?secret`) must ride on the POST too, or the gate sends
 * the guest who is signing in to the home page and a right password reads as a wrong one.
 */
export function loginPostUrl(resolvedAdminUrl: string): string {
  const url = new URL(resolvedAdminUrl)
  if (!/\/index\.php$/i.test(url.pathname)) url.pathname = `${url.pathname.replace(/\/+$/, '')}/index.php`
  url.hash = ''
  return url.toString()
}

/**
 * What an admin page says about the session that just loaded it.
 *
 * `captive` is a state that must exist: signed in as far as the cookie goes, yet every door stays shut
 * until the second factor is given.
 */
export function adminPageState(html: string, url = ''): 'in' | 'captive' | 'out' {
  if (MFA_REQUIRED.test(html) || MFA_REQUIRED.test(url)) return 'captive'
  const title = html.match(TITLE)?.[1] ?? ''
  return title.startsWith('Home Dashboard') || LOGGED_IN.test(html) ? 'in' : 'out'
}

/** The site's web root for a typed admin address, or `''` when it does not parse. */
function siteBaseOf(adminUrl: string): string {
  try {
    return webRootFrom(adminUrl)
  } catch {
    return ''
  }
}

/**
 * Cut `/administrator[/index.php]` off the RESOLVED sign-in address to get the webroot.
 *
 * Derived from the resolved URL, not from the string the user typed: a real site has its admin at
 * `office.example.org/office/administrator/` — a different host AND a subpath — and its front `index.php`
 * (where the component answers) sits at that same subpath, not at the bare origin.
 */
export function webRootFrom(loginUrl: string): string {
  const url = new URL(loginUrl)
  const path = url.pathname.replace(/\/administrator(\/index\.php)?\/?$/i, '')
  return `${url.origin}${path}`
}

/**
 * Sign into the site's admin, returning the authenticated session.
 *
 * 🔒 `adminUrl` IS USED EXACTLY AS TYPED, no guessing, no appended path. Real sites move
 * `/administrator` elsewhere for hardening, and a guess would report "unreachable" for a
 * site running normally.
 *
 * 🔒 The POST is read with `redirect: 'manual'`. Joomla **regenerates the session** on a successful sign-in and sends
 * the NEW cookie on that very 303. `redirect: 'follow'` hides the intermediate response, so
 * the automatic GET carries the OLD cookie and lands back on the login page — reading every correct sign-in as
 * a failure.
 */
export async function loginToAdmin(
  adminUrl: string,
  username: string,
  password: string,
  basicAuth?: BasicAuth
): Promise<AdminSession> {
  const authHeader = basicAuthHeader(basicAuth)
  const { answered, thrown } = diagnoser(siteBaseOf(adminUrl))

  // 🔒 ONE jar for the whole sign-in: the login page, the POST and the landing each add to it, and
  // none replaces what an earlier one set (a balancer's sticky cookie beside Joomla's session).
  const jar = new CookieJar()
  let getResponse: Response
  let loginPageHtml: string
  try {
    ;({ response: getResponse } = await fetchFollowing(adminUrl, authHeader, { jar }))
    if (isBasicAuthChallenge(getResponse)) {
      await disposeBody(getResponse)
      return {
        ok: false,
        reason: basicAuth ? 'basic_auth_invalid' : 'basic_auth_required',
        detail: answered('login_page', 'basic_challenge', getResponse)
      }
    }
    // A 403 on the login page is a server or firewall rule, unless Joomla rendered it itself: that
    // is not a gate in front of the admin, and saying "turn your firewall off" would be wrong.
    if (getResponse.status === 403) {
      const html = await readCappedBody(getResponse)
      return isJoomlaPage(html)
        ? { ok: false, reason: 'unreachable', detail: answered('login_page', 'joomla_denied', getResponse) }
        : {
            ok: false,
            ...forbiddenBy(getResponse, html),
            detail: answered('login_page', 'forbidden', getResponse)
          }
    }
    if (!getResponse.ok) {
      // A firewall can answer with another status (Cloudflare's 429 or 503 challenge): name it.
      const html = await readCappedBody(getResponse)
      const firewall = firewallOf(getResponse.status, getResponse.headers, html)
      return firewall
        ? {
            ok: false,
            reason: 'blocked_by_firewall',
            firewall,
            detail: answered('login_page', 'firewall', getResponse)
          }
        : { ok: false, reason: 'unreachable', detail: answered('login_page', 'http_status', getResponse) }
    }
    loginPageHtml = await readCappedBody(getResponse)
  } catch (error) {
    return { ok: false, reason: thrownRefusal(error), detail: thrown('login_page', error) }
  }

  // No Joomla form on the page: say what is there instead of "could not reach" — the address
  // answered (#gate: RSFirewall's Protected Area on a customer's site read as unreachable).
  // The front end's login module carries a CSRF field too: a gate that sends a guest to the home
  // page (Admin Tools without its secret word) must not get the password posted to that form.
  const where = { pageUrl: getResponse.url || adminUrl, adminBase: adminBasePath(adminUrl) }
  const csrfField = isFrontLoginPage(loginPageHtml, where) ? undefined : loginPageHtml.match(CSRF_FIELD)?.[1]
  if (!csrfField) {
    // Cloudflare marks its challenge with `cf-mitigated` even on a 200, and the challenge page has
    // no Joomla form: it is the firewall, not a gate or a wrong address.
    const firewall = firewallOf(getResponse.status, getResponse.headers, loginPageHtml)
    if (firewall)
      return {
        ok: false,
        reason: 'blocked_by_firewall',
        firewall,
        detail: answered('login_page', 'firewall', getResponse)
      }
    const reason = adminGateOf(loginPageHtml, getResponse.status, where)
    return { ok: false, reason, detail: answered('login_page', reason, getResponse) }
  }

  const body = new URLSearchParams({
    username,
    passwd: password,
    option: 'com_login',
    task: 'login',
    return: RETURN_PARAM,
    [csrfField]: '1'
  })

  // POST to `<admin>/index.php`, where the real form posts — not to the folder URL the GET
  // just resolved. Some servers answer 403 to a POST to a bare `/administrator/`, and that 403 reads
  // back as "unreachable". The query string stays (`loginPostUrl`).
  const loginUrl = loginPostUrl(getResponse.url || adminUrl)

  // Defense in depth: the password only ever POSTs to an endpoint the original adminUrl trusts. The
  // GET already followed nothing but trusted hops, so this holds; the guard makes it impossible for
  // a future change to POST the password to an origin the operator did not name.
  if (!isTrustedHop(adminUrl, loginUrl, { secure: isHttps(adminUrl) })) {
    return { ok: false, reason: 'unreachable', detail: { at: 'login_post', check: 'untrusted_target' } }
  }
  // Nor to a path outside the administrator folder: a page the GET was redirected to (the home
  // page) whose form looks like the administrator's would otherwise get it on the front end.
  if (!isUnderAdmin(loginUrl, where.adminBase)) {
    return {
      ok: false,
      reason: 'admin_form_not_found',
      detail: answered('login_page', 'admin_form_not_found', getResponse)
    }
  }

  let redirectResponse: Response
  try {
    redirectResponse = await fetch(loginUrl, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'user-agent': USER_AGENT,
        'content-type': 'application/x-www-form-urlencoded',
        cookie: jar.header(loginUrl),
        ...authHeader
      },
      body,
      signal: timeout()
    })
  } catch (error) {
    return { ok: false, reason: thrownRefusal(error), detail: thrown('login_post', error) }
  }

  // Joomla 4+ answers its own login POST with a redirect, right password or wrong; Joomla 3 only
  // when it signs in, and draws the login form again on a refusal (below). A 403 page Joomla
  // rendered itself (an expired or invalid form token) is not a gate: the site answered, and the
  // run cannot go on. Any other 403 is a web server or firewall rule on the POST (mod_security, a
  // WAF), the same gate as one on the GET.
  if (redirectResponse.status === 403) {
    const html = await readCappedBody(redirectResponse)
    return isJoomlaPage(html)
      ? {
          ok: false,
          reason: 'unreachable',
          detail: answered('login_post', 'joomla_denied', redirectResponse, loginUrl)
        }
      : {
          ok: false,
          ...forbiddenBy(redirectResponse, html),
          detail: answered('login_post', 'forbidden', redirectResponse, loginUrl)
        }
  }
  const location = redirectResponse.headers.get('location')
  if (redirectResponse.status < 300 || redirectResponse.status >= 400 || !location) {
    // Not a redirect: a firewall that answered the POST itself (Cloudflare's challenge on a 200,
    // marked by `cf-mitigated`) is named first. Joomla 3 refuses a sign-in with a 200 that draws
    // its login form again, the message queued (`LoginController::login()` of 3.10.11 redirects
    // only on success): that page is read like the landing. Anything else stays `no_redirect`.
    const html = await readCappedBody(redirectResponse)
    const firewall = firewallOf(redirectResponse.status, redirectResponse.headers, html)
    if (firewall)
      return {
        ok: false,
        reason: 'blocked_by_firewall',
        firewall,
        detail: answered('login_post', 'firewall', redirectResponse, loginUrl)
      }
    if (
      redirectResponse.status === 200 &&
      isAdminLoginForm(html, { pageUrl: loginUrl, adminBase: where.adminBase })
    )
      return refusedSignIn('login_post', html, redirectResponse, { adminUrl, loginUrl, authHeader })
    return {
      ok: false,
      reason: 'unreachable',
      detail: answered('login_post', 'no_redirect', redirectResponse, loginUrl)
    }
  }
  jar.absorb(redirectResponse, loginUrl)

  // The login landing redirect gets the same https-preserving resolution as any other hop: a
  // admin behind TLS termination 303s the successful POST to `http://…` on the same host, and following that
  // down would land the whole session — and the derived webroot — on http (`url-policy.mjs`).
  const landingUrl = nextRedirectUrl(loginUrl, location)
  if (!landingUrl)
    return { ok: false, reason: 'unreachable', detail: { at: 'login_landing', check: 'bad_location' } }

  // The landing is followed against the ORIGINAL adminUrl as its trust anchor, not against the
  // post-login `Location`. A `Location` pointing off to another host cannot reset the boundary and
  // pull the session cookie and Basic auth onto a stranger's origin: `fetchFollowing` refuses the
  // first request when the destination is untrusted, and the catch below turns that into a plain
  // "unreachable" rather than a leaked credential.
  let landingHtml: string
  let landingResponse: Response
  try {
    const { response: landing } = await fetchFollowing(landingUrl, authHeader, {
      anchor: adminUrl,
      jar,
      // The login already ran over https (`loginUrl`); the landing must stay https even when it
      // points at a trusted www alias, so the session cookie and Basic auth never ride an http hop.
      secure: isHttps(loginUrl)
    })
    // A 403 on the dashboard after the login redirect: Joomla's own page is a refusal of this
    // account, anything else a server or firewall rule.
    if (landing.status === 403) {
      const html = await readCappedBody(landing)
      return isJoomlaPage(html)
        ? {
            ok: false,
            reason: 'no_backend_access',
            detail: answered('login_landing', 'joomla_denied', landing)
          }
        : {
            ok: false,
            ...forbiddenBy(landing, html),
            detail: answered('login_landing', 'server_denied', landing)
          }
    }
    landingHtml = await readCappedBody(landing)
    landingResponse = landing
    // A firewall on the dashboard, whatever the status (a 200 challenge marked by `cf-mitigated`),
    // is named here: read as a page it would be "signed out", a wrong password.
    const firewall = firewallOf(landing.status, landing.headers, landingHtml)
    if (firewall)
      return {
        ok: false,
        reason: 'blocked_by_firewall',
        firewall,
        detail: answered('login_landing', 'firewall', landing)
      }
    if (!landing.ok)
      return { ok: false, reason: 'unreachable', detail: answered('login_landing', 'http_status', landing) }
  } catch (error) {
    return { ok: false, reason: 'unreachable', detail: thrown('login_landing', error) }
  }

  const state = adminPageState(landingHtml, location)
  if (state === 'captive')
    return { ok: false, reason: 'mfa_required', detail: { at: 'login_landing', check: 'mfa' } }
  if (state === 'out')
    return refusedSignIn('login_landing', landingHtml, landingResponse, { adminUrl, loginUrl, authHeader })
  return {
    ok: true,
    cookie: jar.header(loginUrl),
    jar,
    authHeader,
    webRootUrl: webRootFrom(loginUrl)
  }
}

/**
 * Joomla's administrator login form, drawn by Joomla itself (`isJoomlaPage`): the `form-login` form
 * with its `passwd` field (Isis on 3.10, Atum on 4+), posting inside the administrator folder. A
 * page that only asks for a password of its own (RSFirewall's `rsf_backend_password`) is not it.
 */
export function isAdminLoginForm(html: string, where: LoginPageWhere): boolean {
  return (
    isJoomlaPage(html) &&
    /<form\b[^>]*\bid=["']?form-login["'\s>]/i.test(html) &&
    /<input\b[^>]*\bname=["']?passwd["'\s>]/i.test(html) &&
    !isFrontLoginPage(html, where)
  )
}

/**
 * A sign-in Joomla refused, from the login page it showed after it: the landing of the POST's
 * redirect (Joomla 4+), or the POST's own 200 (Joomla 3). `at` names which.
 */
async function refusedSignIn(
  at: 'login_post' | 'login_landing',
  html: string,
  response: Response,
  where: { adminUrl: string; loginUrl: string; authHeader: Record<string, string> }
): Promise<Extract<AdminSession, { ok: false }>> {
  const refusal = await landingRefusal(html, response, where)
  if (refusal === 'mfa_required') return { ok: false, reason: 'mfa_required', detail: { at, check: 'mfa' } }
  if (refusal === 'no_backend_access')
    return { ok: false, reason: 'no_backend_access', detail: { at, check: 'no_backend_access' } }
  // A wrong password is claimed only when Joomla's own sentence for it was read; any other page
  // keeps the reason the customer is shown today, and says in the check that it was not read.
  return {
    ok: false,
    reason: 'invalid_credential',
    detail: { at, check: refusal === 'invalid_credential' ? 'invalid_credential' : 'message_unread' }
  }
}

/**
 * Why Joomla refused the sign-in, read from the message it showed; `undefined` when that message
 * could not be read or is none Tracy knows.
 *
 * 🔒 THE SENTENCE IS THE ONLY SIGNAL, AND IT IS TRANSLATED. Joomla answers a wrong password, a
 * missing Secret Key and an account without administrator access with the same answer — a 303 to
 * the login page on 4+, the login page itself on a 200 on 3 — and the same message type
 * (`warning`; Joomla 3.10.12 and 6, read from their source). So the
 * message is matched in the backend's own words: the page's `<html lang>` names the language, and
 * the site's language file (`<admin>/language/<tag>/joomla.ini` on 4+, `<tag>.ini` on 3) holds the
 * sentence for each key in `REFUSAL_KEYS`. Nothing is posted again, and no translation table here
 * can fall behind a site's language pack.
 *
 * 🔒 ONLY A RECOGNISED SENTENCE IS A VERDICT. A page with no language tag, a message no sentence
 * matches (a language override, an extension's own message), a file missing a key: each is
 * `undefined`, never a wrong password. Only the messages themselves are compared (`messagesOf`),
 * not the whole page, whose scripts and help text can carry any of these sentences.
 *
 * The files are read within `LANGUAGE_READ_BUDGET` requests, and not at all after an answer that
 * looks like a firewall: a 401, 403 or 429 on one stops the reading.
 */
async function landingRefusal(
  html: string,
  landing: Response,
  where: { adminUrl: string; loginUrl: string; authHeader: Record<string, string> }
): Promise<SignInRefusal | undefined> {
  const messages = messagesOf(html)
  if (messages.length === 0) return undefined
  for (const [english, reason] of ENGLISH_REFUSALS)
    if (messages.some((message) => english.test(message))) return reason
  const tag = languageTagOf(html)
  if (!tag || tag.startsWith('en-')) return undefined
  if (firewallOf(landing.status, landing.headers, html)) return undefined
  const sentences = await refusalSentences(tag, where)
  for (const [key, reason] of Object.entries(REFUSAL_KEYS)) {
    const sentence = sentences.get(key)
    if (sentence && messages.some((message) => message.includes(sentence))) return reason
  }
  return undefined
}

/**
 * The messages Joomla queued on a page, as plain text. Joomla 4+ carries them in the script
 * options (`joomla.messages`: `[{ <type>: [<message>…] }]`, rendered by `Joomla.renderMessages`)
 * with a `<noscript>` copy; Joomla 3 prints each in `<div class="alert-message">`
 * (`layouts/joomla/system/message.php` of 4.0.0 and 3.10.12).
 */
export function messagesOf(html: string): string[] {
  const found: string[] = []
  for (const [, json] of html.matchAll(
    /<script\b[^>]*\bclass=["'][^"']*\bjoomla-script-options\b[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    let options: unknown
    try {
      options = JSON.parse(json)
    } catch {
      continue
    }
    const queued = (options as Record<string, unknown> | null)?.['joomla.messages']
    for (const group of Array.isArray(queued) ? queued : [])
      for (const list of Object.values((group ?? {}) as Record<string, unknown>))
        for (const message of Array.isArray(list) ? list : [])
          if (typeof message === 'string') found.push(message)
  }
  if (found.length === 0) {
    const container = html.match(
      /<div\b[^>]*\bid=["']system-message-container["'][^>]*>\s*<noscript\b[^>]*>([\s\S]*?)<\/noscript>/i
    )?.[1]
    for (const [, message] of container?.matchAll(
      /<div\b[^>]*\bclass=["']alert\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi
    ) ?? [])
      found.push(message)
    for (const [, message] of html.matchAll(
      /<div\b[^>]*\bclass=["']alert-message["'][^>]*>([\s\S]*?)<\/div>/gi
    ))
      found.push(message)
  }
  return found.map(plainText).filter(Boolean)
}

/**
 * The language of a Joomla page, as its folder under `language/` is named (`de-de` → `de-DE`), or
 * undefined. Only a plain `xx-XX` tag passes: the value becomes part of a path.
 */
export function languageTagOf(html: string): string | undefined {
  const match = html.match(/<html\b[^>]*?\blang=["']([a-z]{2,3})-([a-z]{2,4})["']/i)
  return match ? `${match[1].toLowerCase()}-${match[2].toUpperCase()}` : undefined
}

/**
 * The site's own sentence for each of `REFUSAL_KEYS` in language `tag` that a language file gave;
 * empty when none answered. Read with the Basic auth the administrator needs and no session
 * cookie, within the address the operator typed (`fetchFollowing`) and `LANGUAGE_READ_BUDGET`.
 * `<tag>.override.ini` is not read: a sentence it changes matches nothing, which is `undefined`.
 */
async function refusalSentences(
  tag: string,
  where: { adminUrl: string; loginUrl: string; authHeader: Record<string, string> }
): Promise<Map<string, string>> {
  const sentences = new Map<string, string>()
  const folder = new URL(`${adminBasePath(where.loginUrl)}language/${tag}/`, where.loginUrl)
  const budget = { left: LANGUAGE_READ_BUDGET }
  for (const file of ['joomla.ini', `${tag}.ini`]) {
    if (budget.left <= 0) break
    let response: Response
    try {
      ;({ response } = await fetchFollowing(new URL(file, folder).toString(), where.authHeader, {
        anchor: where.adminUrl,
        secure: isHttps(where.loginUrl),
        budget
      }))
    } catch {
      continue
    }
    const body = await readCappedBody(response)
    // Asked enough: a gate, a rate limit or a firewall answered, so nothing more is asked of it.
    if ([401, 403, 429].includes(response.status) || firewallOf(response.status, response.headers, body))
      break
    if (!response.ok) continue
    for (const [key, value] of iniEntries(body))
      if (key in REFUSAL_KEYS && value) sentences.set(key, plainText(value))
    if (sentences.size > 0) break
  }
  return sentences
}

/**
 * `KEY="value"` lines of a Joomla language file. Joomla 3 writes a quote inside a value as
 * `"_QQ_"`, 4+ as `\"`; a `;` comment may follow the closing quote.
 */
export function iniEntries(ini: string): [string, string][] {
  const entries: [string, string][] = []
  for (const line of ini.split(/\r?\n/)) {
    const head = line.match(/^[ \t]*([A-Za-z0-9_.-]+)[ \t]*=[ \t]*"/)
    if (!head) continue
    let value = ''
    let at = head[0].length
    let closed = false
    while (at < line.length) {
      if (line.startsWith('"_QQ_"', at)) {
        value += '"'
        at += 6
      } else if (line.startsWith('\\"', at)) {
        value += '"'
        at += 2
      } else if (line[at] === '"') {
        closed = true
        at += 1
        break
      } else {
        value += line[at]
        at += 1
      }
    }
    if (closed && /^[ \t]*(?:;.*)?$/.test(line.slice(at))) entries.push([head[1], value])
  }
  return entries
}

/** HTML's Latin-1 entities (U+00A0–U+00FF, in code point order) and the others Joomla's packs use. */
const LATIN1_ENTITIES =
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'.split(
    ' '
  )
const ENTITIES: Record<string, string> = {
  ...Object.fromEntries(LATIN1_ENTITIES.map((name, i) => [name, String.fromCharCode(0xa0 + i)])),
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  OElig: '\u0152',
  oelig: '\u0153',
  Scaron: '\u0160',
  scaron: '\u0161',
  Yuml: '\u0178',
  ndash: '\u2013',
  mdash: '\u2014',
  lsquo: '\u2018',
  rsquo: '\u2019',
  sbquo: '\u201a',
  ldquo: '\u201c',
  rdquo: '\u201d',
  bdquo: '\u201e',
  hellip: '\u2026',
  euro: '\u20ac'
}

/** A numeric character reference's character, or U+FFFD for one no string may hold. */
function codePoint(value: number): string {
  return Number.isInteger(value) && value > 0 && value <= 0x10ffff && (value < 0xd800 || value > 0xdfff)
    ? String.fromCodePoint(value)
    : '\ufffd'
}

/**
 * Text as a sentence can be found in it: tags dropped, numeric and named HTML entities decoded
 * (names are case-sensitive, as in HTML), whitespace collapsed. Never throws.
 */
function plainText(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(?:[xX]([0-9a-fA-F]+)|(\d+));/g, (_, hex?: string, dec?: string) =>
      codePoint(hex ? Number.parseInt(hex, 16) : Number(dec))
    )
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (entity, name: string) => ENTITIES[name] ?? entity)
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Keep cookies fresh across a multi-request flow — Joomla's Extension Manager rotates the session.
 *
 * 🔒 MERGE, NEVER REPLACE (`cookie-jar.ts`): a page that sets one unrelated cookie (a language or
 * consent cookie) used to replace the whole header and sign the installer out. Redirects are
 * followed here, hop by hop, so a cookie set on a 302 is kept too, and only within the site's own
 * address (`isTrustedHop`); a redirect elsewhere comes back as the 3xx it is. `redirect: 'manual'`
 * returns the first answer as before.
 */
function authedFetcher(session: Extract<AdminSession, { ok: true }>) {
  const jar = session.jar ?? CookieJar.fromHeader(session.cookie, session.webRootUrl)
  const secure = isHttps(session.webRootUrl)
  return async (url: string, init: RequestInit = {}): Promise<Response> => {
    let current = url
    let method = init.method ?? 'GET'
    let body = init.body
    for (let hop = 0; ; hop++) {
      const cookie = jar.header(current)
      const response = await fetch(current, {
        ...init,
        method,
        body,
        redirect: 'manual',
        headers: {
          'user-agent': USER_AGENT,
          ...(cookie ? { cookie } : {}),
          ...session.authHeader,
          ...(init.headers as Record<string, string> | undefined)
        }
      })
      jar.absorb(response, current)
      if (init.redirect === 'manual') return response
      const location =
        response.status >= 300 && response.status < 400 ? response.headers.get('location') : null
      const next = location ? nextRedirectUrl(current, location) : undefined
      if (!next || hop >= 5 || !isTrustedHop(session.webRootUrl, next, { secure })) return response
      await disposeBody(response)
      // As a browser does: a 303, or a 301/302 after a POST, goes on as a GET without the body.
      if (
        response.status === 303 ||
        ((response.status === 301 || response.status === 302) && method === 'POST')
      ) {
        method = 'GET'
        body = undefined
      }
      current = next
    }
  }
}

export type InstallResult =
  | { ok: true; token: string; version?: string }
  | {
      ok: false
      reason:
        | 'install_failed'
        | 'configure_failed'
        | 'unreachable'
        | 'php_too_old'
        | 'install_forbidden'
        | 'admin_gate'
        | 'upload_too_large'
        | 'site_resource_limit'
        | 'blocked_by_firewall'
      /** On `blocked_by_firewall`: the firewall that answered (`firewallOf`). */
      firewall?: string
      /** On `php_too_old`: the version the site runs (when it said) and the one the engine needs. */
      php?: string
      minimumPhp?: string
      /** On `upload_too_large` over a known PHP limit: the package and that limit, in MB, as shown. */
      uploadMb?: { package: string; limit: string }
      /** Where it stopped, for the operator (`Diagnostic`). */
      detail?: Diagnostic
    }

/**
 * Which version the component runs, asked with its own token.
 *
 * 🔒 THE VERSION NUMBER IS IN `info.component`, NOT at the top level. Measured on a real site 31/08:
 *
 *     {"ok":true,"info":{"php":"8.3.33","wordpress":"7.0.2","component":"0.8.0"}}
 *
 * The first version of this function read `result.component ?? result.version` at the outer level and so ALWAYS got
 * `undefined` — which `needsInstall` reads as "older". Meaning every import
 * reinstalled the extension over the customer's site, even when it was already the latest. No data lost,
 * but it was a WRITE to a production site for what should have been a read — and it really happened,
 * on `tracy.ai`, on the very first real run. No gate and no test caught it:
 * both trusted the shape this code declared itself.
 */
export type SiteInfo = {
  ok: boolean
  component?: string
  /** The engine's own word when it refused (`unauthorized`, `contract_unavailable`, …). */
  error?: string
  upload?: string
  reached: boolean
  /** The HTTP status the door answered with; absent when no answer came back at all. */
  status?: number
  /**
   * The engine cannot run on this PHP: the door answered 5xx with a PHP parse error, or (claude-cowork
   * 0.24.73+) the engine said so itself, `{ok: false, error: 'php_too_old', php, min}` with HTTP 200.
   */
  phpError?: boolean
  /** On an engine's own `php_too_old`: the PHP the site runs and the one the engine needs, as it said. */
  php?: string
  minimumPhp?: string
  basicChallenge?: boolean
  /** A firewall answered instead of the engine (`firewallOf`, no `generic`). */
  firewall?: string
  dbDumpMany?: { max_tables?: number; max_bytes?: number; max_seconds?: number }
}

export async function readSiteInfo(
  endpoint: string,
  token: string,
  opts: { noFollow?: boolean; headers?: Record<string, string>; link?: SiteLink } = {}
): Promise<SiteInfo> {
  try {
    await opts.link?.ready()
    const response = await fetch(endpoint, {
      method: 'POST',
      // When verifying an https endpoint the token must not be replayed to a redirect target: a
      // 3xx here (an https endpoint 307ing to http or to another host) is refused, not followed.
      redirect: opts.noFollow ? 'manual' : 'follow',
      // `headers` carries the site's HTTP Basic credential: a site that asks for one on
      // /administrator answers the administrator door 401 without it.
      headers: { ...opts.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ token, action: 'info' }),
      signal: timeout()
    })
    opts.link?.answeredWith(
      response.status === 429 || response.status === 503
        ? retryAfterMs(response.headers.get('retry-after'))
        : undefined
    )
    // In noFollow verification any non-2xx answer is unusable: a 3xx redirect must not be followed,
    // and a 5xx (or other error) must not be trusted even if its body says {ok:true}. Reject and
    // dispose the unread body so the socket is freed.
    if (opts.noFollow && !response.ok) {
      await response.body?.cancel()
      const firewall = firewallOf(response.status, response.headers, '')
      return {
        ok: false,
        reached: false,
        status: response.status,
        ...(isBasicAuthChallenge(response) ? { basicChallenge: true } : {}),
        ...(firewall ? { firewall } : {})
      }
    }
    const text = await readCappedBody(response)
    if (isPhpParseFailure(response.status, text))
      return { ok: false, reached: false, status: response.status, phpError: true }
    let result: {
      ok?: boolean
      info?: { component?: string; version?: string; upload?: string; db_dump_many?: SiteInfo['dbDumpMany'] }
      component?: string
      version?: string
      error?: unknown
      php?: unknown
      min?: unknown
    }
    try {
      result = JSON.parse(text)
    } catch {
      const firewall = firewallOf(response.status, response.headers, text)
      return {
        ok: false,
        reached: false,
        status: response.status,
        ...(isBasicAuthChallenge(response) ? { basicChallenge: true } : {}),
        ...(firewall ? { firewall } : {})
      }
    }
    // The engine refusing to run on this PHP (claude-cowork 0.24.73+, both doors, HTTP 200): the same
    // `php_too_old` as a parse error, with the two versions it named — never anything else it said.
    if (result?.ok === false && result.error === 'php_too_old')
      return {
        ok: false,
        reached: false,
        status: response.status,
        phpError: true,
        ...(bareVersion(result.php) ? { php: bareVersion(result.php) } : {}),
        ...(bareVersion(result.min) ? { minimumPhp: bareVersion(result.min) } : {})
      }
    // The `info` level first, the outer level after: the engine returns `info.component`, and the other two branches only
    // catch an older engine that once returned it flat.
    const component = result?.info?.component ?? result?.info?.version ?? result?.component ?? result?.version
    // `reached` is the engine having answered at all — a refusal included. A gate's HTML (parse
    // error) or Joomla's own guest JSON never carries `ok`, and that is the signal to try the
    // other door rather than to conclude the extension is missing.
    return {
      ok: result?.ok === true,
      component,
      ...(result?.ok !== true && typeof result?.error === 'string' ? { error: result.error } : {}),
      // Which road the host can upload a part by (0.8.22+): 'curl', 'stream', or 'none' for a
      // host with no outbound connection at all. Older engines say nothing, which reads as "the
      // usual road" — exactly what they had.
      upload: typeof result?.info?.upload === 'string' ? result.info.upload : undefined,
      dbDumpMany:
        result?.info?.db_dump_many && typeof result.info.db_dump_many === 'object'
          ? result.info.db_dump_many
          : undefined,
      reached: isEngineAnswer(result),
      status: response.status,
      ...(isBasicAuthChallenge(response) ? { basicChallenge: true } : {})
    }
  } catch (error) {
    opts.link?.failed(error)
    return { ok: false, reached: false }
  }
}

/**
 * The first door the engine answers through, front door first (see `doors.mjs`).
 *
 * `undefined` when neither door reaches the engine — the extension is not there, or not this
 * version. A door the engine answered with a refusal still counts as found: the token is a
 * separate question from the address.
 */
export async function findDoor(
  webRootUrl: string,
  token: string,
  opts: { noFollow?: boolean; headers?: Record<string, string>; link?: SiteLink } = {}
): Promise<
  | {
      endpoint: string
      ok: boolean
      component?: string
      upload?: string
      dbDumpMany?: SiteInfo['dbDumpMany']
    }
  | undefined
> {
  return (await askDoors(webRootUrl, token, opts)).door
}

/** Both doors asked in order, with what the ones that did not reach the engine answered. */
async function askDoors(
  webRootUrl: string,
  token: string,
  opts: { noFollow?: boolean; headers?: Record<string, string>; link?: SiteLink }
): Promise<{
  door?: {
    endpoint: string
    ok: boolean
    component?: string
    error?: string
    upload?: string
    dbDumpMany?: SiteInfo['dbDumpMany']
  }
  misses: DoorMiss[]
}> {
  const misses: DoorMiss[] = []
  for (const endpoint of apiDoors(webRootUrl)) {
    const info = await readSiteInfo(endpoint, token, opts)
    if (info.reached)
      return {
        door: {
          endpoint,
          ok: info.ok,
          component: info.component,
          error: info.error,
          upload: info.upload,
          dbDumpMany: info.dbDumpMany
        },
        misses
      }
    misses.push({ ...info, endpoint, webRootUrl })
  }
  return { misses }
}

/** A version as the engine said it (`7.3.33`), or `undefined` for anything else. */
function bareVersion(value: unknown): string | undefined {
  return typeof value === 'string' && /^\d+(\.\d+){0,3}$/.test(value) ? value : undefined
}

/**
 * The versions a `php_too_old` names: the engine's own when a door said them, else `phpDetail` of
 * what the run read itself (phpinfo, the manifest's minimum).
 */
export function phpOfMisses(
  misses: DoorMiss[],
  php: string | undefined,
  minimum: string | undefined
): { php?: string; minimumPhp?: string } {
  const said = misses.find((miss) => miss.phpError && miss.minimumPhp)
  if (said) return { ...(said.php ? { php: said.php } : {}), minimumPhp: said.minimumPhp }
  return phpDetail(php, minimum)
}

/** A door that did not reach the engine, with the address it was asked on. */
type DoorMiss = SiteInfo & { endpoint: string; webRootUrl: string }

/**
 * What the last door that missed answered, for the diagnostic: a PHP parse error, an HTTP status
 * that was not the engine, or no answer at all.
 */
function doorMiss(at: string, misses: DoorMiss[]): Diagnostic {
  const miss = [...misses].reverse().find((one) => one.phpError) ?? misses.at(-1)
  if (!miss) return { at, check: 'no_door' }
  const path = diagnosticPath(miss.endpoint, miss.webRootUrl)
  // The engine saying its PHP minimum itself is not a parse error: `below_minimum`, as phpinfo's.
  const check = miss.phpError
    ? miss.minimumPhp
      ? 'below_minimum'
      : 'parse_error'
    : miss.status !== undefined
      ? 'no_engine'
      : 'network'
  return {
    at,
    check,
    ...(miss.status !== undefined ? { status: miss.status } : {}),
    ...(path ? { path } : {})
  }
}

/** The last door a named firewall answered, with its diagnostic; `undefined` when none did. */
function firewallMiss(at: string, misses: DoorMiss[]): { firewall: string; detail: Diagnostic } | undefined {
  const miss = [...misses].reverse().find((one) => one.firewall)
  if (!miss?.firewall) return undefined
  const path = diagnosticPath(miss.endpoint, miss.webRootUrl)
  return {
    firewall: miss.firewall,
    detail: {
      at,
      check: 'firewall',
      ...(miss.status !== undefined ? { status: miss.status } : {}),
      ...(path ? { path } : {})
    }
  }
}

export type ResolvedDoor =
  | { endpoint: string; inline: boolean; dbDumpMany?: SiteInfo['dbDumpMany'] }
  | {
      refusal: 'php_too_old' | 'cowork_not_answering' | 'basic_auth_required'
      detail: Diagnostic
      /** On `php_too_old` the engine named: the site's PHP and the one it needs. */
      php?: string
      minimumPhp?: string
    }
  | { refusal: 'blocked_by_firewall'; firewall: string; detail: Diagnostic }

/**
 * The endpoint the rest of the run talks to. Asked, not assumed: on a site whose front end is
 * gated only the administrator door answers, and every `db.*` / `files.*` call has to go there.
 *
 * Neither door reaching the engine, asked twice, stops the run: the extension is not on the site,
 * is switched off, or every door is gated (a 401 for a Basic credential the site wants). Reading
 * through the front door anyway can only fail, as `call_failed`, which tells the customer "the
 * site stopped answering, try again" — measured on production 19/10/2026 (a pasted token, no
 * `com_claudecowork` on disk, three retries that could never work). One second look absorbs a
 * blip on the road, which is all a retry could fix. A door that died on a PHP parse error is
 * `php_too_old` at once: the code on disk does not change in two seconds. Every other miss is
 * `cowork_not_answering`, with the diagnostic naming the door and what it answered — or
 * `blocked_by_firewall` when a door was answered by a firewall `firewallOf` names.
 * @param opts.headers Sent on every door request: the site's HTTP Basic credential, when it has one.
 */
export async function resolveDoor(
  webRootUrl: string,
  token: string,
  opts: { headers?: Record<string, string>; link?: SiteLink; secondLookMs?: number } = {}
): Promise<ResolvedDoor> {
  const { headers } = opts
  let { door, misses } = await askDoors(webRootUrl, token, { headers, link: opts.link })
  if (!door && !misses.some((miss) => miss.phpError)) {
    await new Promise((resolve) => setTimeout(resolve, opts.secondLookMs ?? 2_000))
    ;({ door, misses } = await askDoors(webRootUrl, token, { headers, link: opts.link }))
  }
  if (!door) {
    const challenge = Object.keys(headers ?? {}).length === 0 && misses.find((miss) => miss.basicChallenge)
    if (challenge) {
      const path = diagnosticPath(challenge.endpoint, challenge.webRootUrl)
      return {
        refusal: 'basic_auth_required',
        detail: {
          at: 'api_door',
          check: 'basic_challenge',
          ...(challenge.status !== undefined ? { status: challenge.status } : {}),
          ...(path ? { path } : {})
        }
      }
    }
    if (misses.some((miss) => miss.phpError))
      return {
        refusal: 'php_too_old',
        detail: doorMiss('api_door', misses),
        ...phpOfMisses(misses, undefined, undefined)
      }
    const blocked = firewallMiss('api_door', misses)
    if (blocked) return { refusal: 'blocked_by_firewall', ...blocked }
    return { refusal: 'cowork_not_answering', detail: doorMiss('api_door', misses) }
  }
  // `inline`: the host cannot PUT a part anywhere itself, so every part comes back in the answer
  // and this side stores it. Decided once, before the first part.
  return {
    endpoint: door.endpoint,
    inline: door.upload === 'none',
    ...(door.dbDumpMany ? { dbDumpMany: door.dbDumpMany } : {})
  }
}

/**
 * The site's PHP version, as `major.minor.patch`, and its size limits (`PhpLimits`), from one read
 * of the administrator's phpinfo page (System Information › PHP Information, Joomla 3 to 6). Only
 * these values are kept, never the page.
 *
 * The `<h1 class="p">PHP Version 8.0.30</h1>` there is PHP's own output, untranslated whatever the
 * backend language, and so is each directive's row (`<td class="e">memory_limit</td>` then its Local
 * Value, then its Master Value). Hosts that disable `phpinfo()` blank that page; the `X-Powered-By`
 * header is the fallback for the version, and many hosts strip it too. The last one is Joomla's own
 * System Information as JSON (`format=json`, Joomla 3.5 to 6): its `info.phpversion` is
 * `phpversion()`, which no host setting hides — a Joomla 3 site on PHP 7.3 with `phpinfo` disabled
 * was told the install failed instead of that its PHP is too old (#225). `undefined` still means
 * "unknown", never "too old", and an absent limit means unknown, never "no limit".
 */
export async function readPhpInfo(
  fetchAuthed: (url: string, init?: RequestInit) => Promise<Response>,
  adminBase: string,
  onAnswer?: (page: Response, html: string, url: string) => void
): Promise<{ php?: string; limits: PhpLimits }> {
  try {
    const url = `${adminBase}?option=com_admin&view=sysinfo&layout=phpinfo`
    const page = await fetchAuthed(url, { signal: timeout() })
    const html = await readCappedBody(page)
    onAnswer?.(page, html, url)
    const limits = phpLimits(html)
    const fromPage = html.match(/<h1 class="p">PHP Version (\d+\.\d+(?:\.\d+)?)/)?.[1]
    const php =
      fromPage ??
      page.headers.get('x-powered-by')?.match(/PHP\/(\d+\.\d+(?:\.\d+)?)/i)?.[1] ??
      (await readSysinfoPhp(fetchAuthed, adminBase))
    return { ...(php ? { php } : {}), limits }
  } catch {
    return { limits: {} }
  }
}

/** `info.phpversion` of the administrator's System Information as JSON, or `undefined` (`readPhpInfo`). */
async function readSysinfoPhp(
  fetchAuthed: (url: string, init?: RequestInit) => Promise<Response>,
  adminBase: string
): Promise<string | undefined> {
  try {
    const page = await fetchAuthed(`${adminBase}?option=com_admin&view=sysinfo&format=json`, { signal: timeout() })
    // Read as text, not parsed: a PHP warning printed ahead of the JSON (phpinfo() disabled, on
    // PHP 7) still leaves the field readable.
    const body = await readCappedBody(page)
    return page.ok ? body.match(/"phpversion"\s*:\s*"(\d+\.\d+(?:\.\d+)?)/)?.[1] : undefined
  } catch {
    return undefined
  }
}

/**
 * The Claude Cowork package installer's own refusal of an old PHP (its `script.php` preflight, in
 * English whatever the backend language): the site's version and the minimum, or `undefined`.
 */
export function installerPhpFloor(html: string): { php: string; minimumPhp: string } | undefined {
  const said = html.match(
    /Claude Cowork needs PHP (\d+\.\d+(?:\.\d+)?) or newer; this site runs PHP (\d+\.\d+(?:\.\d+)?)/
  )
  return said ? { php: said[2], minimumPhp: said[1] } : undefined
}

const PHP_LIMIT_NAMES = ['memory_limit', 'upload_max_filesize', 'post_max_size'] as const

/** The Local Value of each limit in `PHP_LIMIT_NAMES` that a phpinfo page shows, in bytes. */
export function phpLimits(html: string): PhpLimits {
  const limits: PhpLimits = {}
  for (const name of PHP_LIMIT_NAMES) {
    const local = html.match(
      new RegExp(`<td class="e">\\s*${name}\\s*</td>\\s*<td class="v">\\s*([^<]*?)\\s*</td>`, 'i')
    )?.[1]
    const bytes = phpSizeBytes(local)
    if (bytes !== undefined) limits[name] = bytes
  }
  return limits
}

/**
 * A PHP size directive as bytes, read as PHP reads it: a whole number, optionally followed by `K`,
 * `M` or `G` (either case, powers of 1024). Any negative value is PHP's "no limit" and reads `-1`.
 * Anything else (`no value`, a fraction, a unit PHP does not know) is `undefined`: unknown.
 */
export function phpSizeBytes(value: string | undefined): number | undefined {
  const match = value?.trim().match(/^(-?\d+)\s*([kmg])?$/i)
  if (!match) return undefined
  const amount = Number(match[1])
  if (amount < 0) return -1
  const unit = match[2]?.toLowerCase()
  const bytes = amount * (unit === 'g' ? 1024 ** 3 : unit === 'm' ? 1024 ** 2 : unit === 'k' ? 1024 : 1)
  return Number.isSafeInteger(bytes) ? bytes : undefined
}

/**
 * The known PHP limit a package of `bytes` cannot pass on the upload road, or `undefined` when none
 * is known to stop it. `upload_max_filesize` caps the file itself and `post_max_size` the whole
 * request, `requestBytes` as `uploadRequestBytes` measures it; PHP empties `$_FILES` past either, and
 * Joomla answers 200 having installed nothing. A limit of 0 or below, or one not read, stops nothing.
 */
export function uploadBlockedBy(bytes: number, limits: PhpLimits, requestBytes = bytes): number | undefined {
  const blocking: number[] = []
  const file = limits.upload_max_filesize
  if (file !== undefined && file > 0 && bytes > file) blocking.push(file)
  const post = limits.post_max_size
  if (post !== undefined && post > 0 && requestBytes > post) blocking.push(post)
  return blocking.length ? Math.min(...blocking) : undefined
}

/** The form Joomla's own upload tab sends, around `file`. */
function uploadForm(file: ArrayBuffer, fileName: string, csrf: string): FormData {
  const form = new FormData()
  // `install_package` is the file field name Joomla's own upload tab sends, in both 3.x and 4+.
  form.append('install_package', new Blob([file], { type: 'application/zip' }), fileName)
  form.append('installtype', 'upload')
  form.append('task', 'install.install')
  form.append('return', '')
  form.append(csrf, '1')
  return form
}

/**
 * The body `fetch` sends on the upload road for a package of `bytes`: the multipart envelope
 * (boundaries, part headers, the four other fields) encoded around an empty file, plus the file.
 * The CSRF field name is always 32 hex characters (`CSRF_FIELD`) and the boundary `fetch` writes
 * has a fixed length, so this is the request's real size — the number PHP holds to `post_max_size`.
 */
export async function uploadRequestBytes(
  bytes: number,
  fileName: string,
  csrf = '0'.repeat(32)
): Promise<number> {
  const envelope = await new Response(uploadForm(new ArrayBuffer(0), fileName, csrf)).arrayBuffer()
  return envelope.byteLength + bytes
}

/** Bytes as MB for the customer's sentence: one decimal under 10 MB, whole above (`8`, `2.5`, `59`). */
export function megabytes(bytes: number): string {
  const mb = bytes / 1024 ** 2
  return mb < 10 ? String(Math.round(mb * 10) / 10) : String(Math.round(mb))
}

/** `a < b` for dotted numeric versions (`7.4.33` < `8.0`). */
export function versionBelow(a: string, b: string): boolean {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = left[i] ?? 0
    const y = right[i] ?? 0
    if (x !== y) return x < y
  }
  return false
}

/**
 * The PHP the engine needs: the manifest's `requires_php`, believed as it stands (claude-cowork
 * 0.24.39 runs on the 7.4 it declares). `undefined` when the manifest names none, or nothing readable:
 * then nothing is refused before installing, and a parse error afterwards still says `php_too_old`.
 */
export function minimumPhp(declared?: string): string | undefined {
  return declared && /^\d+(\.\d+)*$/.test(declared) ? declared : undefined
}

/**
 * The versions a `php_too_old` names: both when the site's PHP is known to be below the minimum, the
 * minimum alone when the site's is unknown, neither when the site already runs the minimum — an
 * engine dying on a parse error there (an older engine left installed, a manifest that says too
 * little) must not read "your PHP 7.4.33; needs 7.4 or newer".
 */
export function phpDetail(
  php: string | undefined,
  minimum: string | undefined
): { php?: string; minimumPhp?: string } {
  if (!minimum) return {}
  if (!php) return { minimumPhp: minimum }
  return versionBelow(php, minimum) ? { php, minimumPhp: minimum } : {}
}

/** The package file name on upload — derived from the URL so a version bump needs no change here. */
function packageFileName(packageUrl: string): string {
  try {
    const last = new URL(packageUrl).pathname.split('/').pop() ?? ''
    return /\.zip$/i.test(last) ? last : 'pkg_claudecowork.zip'
  } catch {
    return 'pkg_claudecowork.zip'
  }
}

/** The package, downloaded by THIS machine — the other half of the upload door the site cannot do itself. */
async function downloadPackage(packageUrl: string): Promise<ArrayBuffer | undefined> {
  try {
    const response = await fetch(packageUrl, {
      headers: { 'user-agent': USER_AGENT },
      signal: timeout(60_000)
    })
    if (!response.ok) return undefined
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_PACKAGE_BYTES) return undefined
    return bytes
  } catch {
    return undefined
  }
}

/**
 * Install Claude Cowork on a live site, then return the token the component minted itself at install.
 *
 * TWO ROADS, in this order (since #1568, 22/10/2026; the URL road went first before):
 *
 *   1. **This side downloads, slims and uploads** (`installtype=upload`). First, because only a
 *      package this side carries can leave every other template's contracts behind
 *      (`slim-package.ts`); the site's own download of a full release (up to 0.24.53) installed
 *      all of them, 483 MB in one customer's webroot, and the import packed them back. A slim
 *      release carries none, and this side puts the site's own in, for a host that cannot reach
 *      GitHub to fetch it.
 *   2. **The site downloads it itself** (`installtype=url`). The fallback when the first road
 *      cannot go or does not install, for ANY reason: telling "your host refuses uploads" from the
 *      other failures means reading Joomla's prose in the backend's language, and guessing wrong
 *      keeps a door shut that could have opened. It installs the full release.
 *
 * Only when both close does the customer have to install by hand — and that is exactly road (b) of step 2 in
 * the wizard, so it is not a dead end.
 *
 * When both close on a limit of the host, installing by hand hits the same limit with the same
 * package, so the refusal names the limit instead: PHP's memory error in a POST's answer is
 * `site_resource_limit`; a package larger than the `upload_max_filesize` or `post_max_size` phpinfo
 * named is `upload_too_large` without sending it (the URL road is still tried first, and an unknown
 * limit sends it as before). Each road's own answers ride in the diagnostic (`InstallRoad`).
 */
export async function installCowork(
  session: Extract<AdminSession, { ok: true }>,
  packageUrl: string,
  latestVersion: string,
  existingToken?: string,
  options: { requiresPhp?: string; link?: SiteLink } = {}
): Promise<InstallResult> {
  const met: FirewallMet = {}
  const result = await installSteps(session, packageUrl, latestVersion, existingToken, options, met)
  // A step that read a firewall's answer as "no token", "not installed" or a page without a form
  // (Cloudflare's challenge on the configure page, on a door, on a 200) fails generically; the
  // firewall it met is the cause. Refusals with a cause of their own (a 403 already named, PHP,
  // a limit) keep it.
  if (!result.ok && met.firewall && met.detail && GENERIC_INSTALL_FAILURES.has(result.reason)) {
    const { roads, php_limits, package_bytes } = result.detail ?? {}
    return {
      ok: false,
      reason: 'blocked_by_firewall',
      firewall: met.firewall,
      detail: {
        ...met.detail,
        ...(roads ? { roads } : {}),
        ...(php_limits ? { php_limits } : {}),
        ...(package_bytes !== undefined ? { package_bytes } : {})
      }
    }
  }
  return result
}

/** The first answer of the install that a named firewall gave (`firewallOf`, no `generic`). */
type FirewallMet = { firewall?: string; detail?: Diagnostic }

/** The refusals that only say a step did not get what it expected, not why. */
const GENERIC_INSTALL_FAILURES = new Set<string>(['unreachable', 'install_failed', 'configure_failed'])

async function installSteps(
  session: Extract<AdminSession, { ok: true }>,
  packageUrl: string,
  latestVersion: string,
  existingToken: string | undefined,
  options: { requiresPhp?: string; link?: SiteLink },
  met: FirewallMet
): Promise<InstallResult> {
  const fetchAuthed = authedFetcher(session)
  const doorOpts = { headers: session.authHeader, link: options.link }
  const { answered, thrown } = diagnoser(session.webRootUrl)
  const needPhp = minimumPhp(options.requiresPhp)
  const adminBase = `${session.webRootUrl}/administrator/index.php`
  const optionsUrl = `${adminBase}?option=com_config&view=component&component=${COMPONENT}`

  /** Keeps the first answer a named firewall gave, with where it was met. */
  const note = (at: string, response: Response, html: string, url: string): void => {
    if (met.firewall) return
    const firewall = firewallOf(response.status, response.headers, html)
    if (firewall) Object.assign(met, { firewall, detail: answered(at, 'firewall', response, url) })
  }
  /** The same, for doors that did not reach the engine. */
  const noteDoors = (at: string, misses: DoorMiss[]): void => {
    if (met.firewall) return
    const blocked = firewallMiss(at, misses)
    if (blocked) Object.assign(met, blocked)
  }

  const readInstalledToken = async (at: string): Promise<string | undefined> => {
    try {
      const response = await fetchAuthed(optionsUrl, { signal: timeout() })
      const html = await readCappedBody(response)
      note(at, response, html, optionsUrl)
      return html.match(TOKEN_VALUE)?.[1]
    } catch {
      return undefined
    }
  }

  /**
   * The site's Joomla templates by name, lower case: the site Template Styles list (every installed
   * style's thumbnail carries its folder) and the front page. A page that does not answer names none.
   */
  const siteTemplates = async (): Promise<Set<string>> => {
    const names = new Set<string>()
    for (const url of [
      `${adminBase}?option=com_templates&view=styles&client_id=0`,
      `${session.webRootUrl}/`
    ]) {
      try {
        const html = await readCappedBody(await fetchAuthed(url, { signal: timeout() }))
        for (const m of html.matchAll(TEMPLATE_PATH)) names.add(m[1].toLowerCase())
      } catch {
        // Nothing read: no name from this page.
      }
    }
    return names
  }

  /**
   * The quickstart contracts `pkg` must carry for this site (`slim-package.ts`): those of a template
   * it has, narrowed to the version whose shipped files the site still serves. A slim release's
   * candidates come from their assets beside the package, fetched here and checked against its
   * index; the kept ones' assets go back with the ids, to be put into the component.
   */
  const contractsToKeep = async (
    pkg: ArrayBuffer
  ): Promise<{ keep: Set<string>; assets: Map<string, ContractAsset> }> => {
    const templates = await siteTemplates()
    const fetchAsset = (asset: string): Promise<ArrayBuffer | undefined> =>
      downloadPackage(new URL(asset, packageUrl).toString())
    const assets = await fetchContractAssets(pkg, indexedCandidates(pkg, templates), fetchAsset)
    const candidates = contractCandidates(pkg, templates, assets)
    const seen = new Map<string, string>()
    for (const path of probePaths(candidates)) {
      try {
        const response = await fetchAuthed(`${session.webRootUrl}/${path}`, { signal: timeout() })
        if (!response.ok) {
          await disposeBody(response)
          continue
        }
        seen.set(
          path,
          createHash('sha256')
            .update(Buffer.from(await response.arrayBuffer()))
            .digest('hex')
        )
      } catch {
        // Not read: it tells nothing.
      }
    }
    const keep = pickContracts(candidates, seen)
    // The contract a kept quickstart names may be of no template the site has: fetched now.
    const named = [...keep].filter((id) => !assets.has(id))
    for (const [id, asset] of await fetchContractAssets(pkg, named, fetchAsset)) assets.set(id, asset)
    return { keep, assets }
  }

  // A token already held, on a component still current, means nothing to do.
  if (existingToken) {
    const { door: alive, misses } = await askDoors(session.webRootUrl, existingToken, doorOpts)
    noteDoors('api_door', misses)
    if (alive?.ok && !needsInstall(alive.component, latestVersion)) {
      return { ok: true, token: existingToken, version: alive.component }
    }
  }

  const present = await readInstalledToken('install_page')
  if (present) {
    const { door: info, misses } = await askDoors(session.webRootUrl, present, doorOpts)
    noteDoors('api_door', misses)
    if (info?.ok && !needsInstall(info.component, latestVersion)) {
      return { ok: true, token: present, version: info.component }
    }
  }

  const installUrl = `${adminBase}?option=com_installer&view=install`
  let installPage: Response
  let installPageHtml: string
  try {
    installPage = await fetchAuthed(installUrl, { signal: timeout() })
    installPageHtml = await readCappedBody(installPage)
  } catch (error) {
    return { ok: false, reason: 'unreachable', detail: thrown('install_page', error) }
  }
  if (installPage.status === 403) {
    // Joomla's own refusal: the account signed in but lacks `core.manage` on Extensions, which by
    // default only Super Users have (measured on Joomla 6.2: Administrator and Manager both get it).
    // Anything else answering 403 is a server or firewall rule on `option=com_installer`.
    return isJoomlaPage(installPageHtml)
      ? {
          ok: false,
          reason: 'install_forbidden',
          detail: answered('install_page', 'joomla_denied', installPage, installUrl)
        }
      : {
          ok: false,
          ...forbiddenBy(installPage, installPageHtml),
          detail: answered('install_page', 'server_denied', installPage, installUrl)
        }
  }
  // A firewall answering the installer with another status, or with a 200 challenge marked by
  // `cf-mitigated`, is named rather than read as a page without the installer's form.
  const installFirewall = firewallOf(installPage.status, installPage.headers, installPageHtml)
  if (installFirewall)
    return {
      ok: false,
      reason: 'blocked_by_firewall',
      firewall: installFirewall,
      detail: answered('install_page', 'firewall', installPage, installUrl)
    }
  if (!installPage.ok)
    return {
      ok: false,
      reason: 'unreachable',
      detail: answered('install_page', 'http_status', installPage, installUrl)
    }
  // A page that is not the installer — redirected away (a session gone, a plugin's own page) — has
  // a CSRF field too, and posting the install to it installs nothing. Which page came back is read
  // from where it landed and what it carries, never from its prose (the backend's language).
  const csrf = installPageHtml.match(CSRF_FIELD)?.[1]
  const onInstaller = /[?&]option=com_installer\b/i.test(installPage.url || installUrl)
  if (!onInstaller || !csrf) {
    const check = !onInstaller ? 'left_installer' : LOGGED_IN.test(installPageHtml) ? 'no_csrf' : 'signed_out'
    return {
      ok: false,
      reason: 'unreachable',
      detail: answered('install_page', check, installPage, installUrl)
    }
  }

  // Refuse before writing anything to a site whose PHP cannot parse the engine: Joomla installs it
  // without complaint, and only then does every call die with a parse error (measured: Joomla 3.10
  // on PHP 7.2 and 7.4 with claude-cowork 0.24.38). An unknown version goes ahead; the proof after
  // install catches it.
  const { php, limits } = await readPhpInfo(fetchAuthed, adminBase, (page, html, url) =>
    note('php_check', page, html, url)
  )
  if (php && needPhp && versionBelow(php, needPhp))
    return {
      ok: false,
      reason: 'php_too_old',
      php,
      minimumPhp: needPhp,
      detail: { at: 'php_check', check: 'below_minimum' }
    }

  /**
   * Whether the component is on the site, at the latest version, and answering on its own token.
   *
   * 🔒 ASK THE SITE, DO NOT READ ITS PROSE — the same rule as `wordpress.ts`. "Installation of the
   * package was successful" is English only: Joomla translates it into the backend language.
   * Measured on production 12/10/2026: the first real import (`coachingnvc.pl`, Joomla 6.1.4, admin
   * in `pl-pl`) returned `install_failed` after 8 seconds only because that sentence was Polish.
   */
  const installedNow = async (at: InstallRoadName): Promise<boolean> => {
    const token = await readInstalledToken(at)
    if (!token) return false
    const { door: info, misses } = await askDoors(session.webRootUrl, token, doorOpts)
    noteDoors(at, misses)
    return info?.ok === true && !needsInstall(info.component, latestVersion)
  }

  // The page the last install POST came back to, for the diagnostic when nothing landed; and a 403
  // on the POST itself, told apart like the one on the install page (Joomla's own, or a server's —
  // mod_security refusing a large upload is the usual one).
  let lastResult: Response | undefined
  // The package's own installer refused this PHP (`installerPhpFloor`): that decides the outcome.
  let phpFloor: { php: string; minimumPhp: string } | undefined
  let postDenied: { by: 'joomla' | 'server'; response: Response; at: string; html: string } | undefined
  // A 413 on the upload: the web server's body limit (nginx `client_max_body_size`, Apache
  // `LimitRequestBody`) refused the package before PHP saw it. Nothing Joomla can do changes that,
  // so it decides the outcome and nothing more is asked of the site after it.
  let tooLarge: Response | undefined
  // What each road answered, kept apart for the diagnostic: the URL road's 500 must still be there
  // when the upload road's later page says 200 (measured on Joomla 6.1.3 with `memory_limit` 128M:
  // the 500 was the cause, and only the 200 reached the operator).
  const roads: Partial<Record<InstallRoadName, InstallRoad>> = {}
  let packageBytes: number | undefined
  /** `detail` with the evidence both roads gathered, for a refusal of the install itself. */
  const withEvidence = (detail: Diagnostic): Diagnostic => ({
    ...detail,
    ...(Object.keys(roads).length ? { roads } : {}),
    ...(Object.keys(limits).length ? { php_limits: limits } : {}),
    ...(packageBytes !== undefined ? { package_bytes: packageBytes } : {})
  })

  /**
   * One pass through the Extension Manager, whichever door.
   *
   * The install POST 303s back to the install page regardless of outcome (Joomla's Post-Redirect-Get), so
   * the answer is in the flash message of the NEXT GET, not in the POST's response.
   */
  const submitInstall = async (
    body: URLSearchParams | FormData,
    waitMs = INSTALL_TIMEOUT_MS
  ): Promise<boolean> => {
    const posted = await fetchAuthed(installUrl, {
      method: 'POST',
      redirect: 'manual',
      body,
      signal: timeout(waitMs)
    })
    const at = body instanceof FormData ? 'upload_install' : 'url_install'
    const road: InstallRoad = { post_status: posted.status }
    roads[at] = road
    // A refusal of the POST itself decides that road: no result page can follow it, and asking
    // again could only turn the refusal into an `unreachable` if the site stops answering.
    if (posted.status === 403) {
      const html = await readCappedBody(posted)
      postDenied = { by: isJoomlaPage(html) ? 'joomla' : 'server', response: posted, at, html }
      return false
    } else {
      postDenied = undefined
      if (posted.status === 413 && at === 'upload_install') {
        await disposeBody(posted)
        road.cause = 'too_large'
        tooLarge = posted
        return false
      }
      // A redirect is the normal answer and carries nothing. Any other page may be PHP dying in the
      // install: a 500 (or a 200, with `display_errors` on) whose head names memory exhaustion.
      // Only the classification is kept.
      if (posted.status >= 300 && posted.status < 400) {
        note(at, posted, '', installUrl)
        await disposeBody(posted)
      } else {
        const html = await readCappedBody(posted, MAX_POST_BODY_BYTES)
        note(at, posted, html, installUrl)
        if (MEMORY_EXHAUSTED.test(html)) road.cause = 'memory_exhausted'
        phpFloor = installerPhpFloor(html) ?? phpFloor
      }
    }
    lastResult = await fetchAuthed(installUrl, { signal: timeout() })
    road.result_status = lastResult.status
    const resultHtml = await readCappedBody(lastResult)
    note(at, lastResult, resultHtml, installUrl)
    phpFloor = installerPhpFloor(resultHtml) ?? phpFloor
    // The English sentence is only a shortcut; every other language goes through asking the
    // component itself. Joomla names the extension TYPE in it ("the package", "the component"), so
    // match the shape, not one word.
    if (/alert-success">\s*Installation of the \w+ was successful/i.test(resultHtml)) return true
    return installedNow(at)
  }

  /** The road whose POST answered with PHP's memory error, if one did. */
  const memoryRoad = (): InstallRoadName | undefined =>
    (['url_install', 'upload_install'] as const).find((name) => roads[name]?.cause === 'memory_exhausted')

  // The upload road not taken: the package is larger than a PHP limit the site named.
  let blockedBy: number | undefined
  /**
   * The refusal a cause already recorded decides, in order: a 403 on an install POST, PHP's memory
   * error on a road, a package over a known limit, a 413. Every refusal of the install asks this
   * first, so a later failure (a download, an upload page) never hides an earlier cause.
   */
  const recordedCause = (): InstallResult | undefined => {
    if (postDenied)
      return postDenied.by === 'joomla'
        ? {
            ok: false,
            reason: 'install_forbidden',
            detail: withEvidence(answered(postDenied.at, 'joomla_denied', postDenied.response, installUrl))
          }
        : {
            ok: false,
            ...forbiddenBy(postDenied.response, postDenied.html),
            detail: withEvidence(answered(postDenied.at, 'server_denied', postDenied.response, installUrl))
          }
    // PHP died of memory on a road: the host's `memory_limit` is the cause, whatever came after.
    const memory = memoryRoad()
    if (memory)
      return {
        ok: false,
        reason: 'site_resource_limit',
        detail: withEvidence({
          at: memory,
          check: 'memory_exhausted',
          ...(roads[memory]?.post_status !== undefined ? { status: roads[memory]?.post_status } : {})
        })
      }
    if (blockedBy !== undefined && packageBytes !== undefined)
      return {
        ok: false,
        reason: 'upload_too_large',
        uploadMb: { package: megabytes(packageBytes), limit: megabytes(blockedBy) },
        detail: withEvidence({ at: 'upload_install', check: 'over_limit' })
      }
    if (tooLarge)
      return {
        ok: false,
        reason: 'upload_too_large',
        detail: withEvidence(answered('upload_install', 'too_large', tooLarge, installUrl))
      }
    return undefined
  }

  // 🔒 THE SLIM PACKAGE FIRST; THE SITE'S OWN DOWNLOAD ONLY WHEN IT CANNOT GO (#1568). The URL road
  // has the site fetch the release from GitHub, and a full release (up to 0.24.53) carries every
  // quickstart's contracts: measured 21/10/2026, 483 MB of them landed in a customer's webroot and
  // the import packed them back, 3.4 times the site's own bytes. A slim release carries none, and
  // the site fetches its own on bind, which a host without GitHub cannot. Only the package this
  // side carries can be fitted to the site (`slim-package.ts`), so it goes first; the URL road
  // stays as the fallback for a package this side cannot fetch, one over a limit the site named,
  // or an upload the site did not install.
  let installed = false
  /** The road the last install POST went by, for the diagnostic when nothing landed. */
  let lastRoad: InstallRoadName = 'upload_install'
  // The upload POST that never got an answer: the site stopped answering mid-upload.
  let uploadThrown: Diagnostic | undefined
  let carried = await downloadPackage(packageUrl)
  if (carried) {
    // A full release carries every quickstart's contracts (63 MB of 0.24.48), a slim one none; a
    // site reads only the one its params name (`slim-package.ts`), and a host that takes 2 MB in one
    // upload took no more. So the others go, and a slim release gets the site's put in.
    const { keep, assets } = await contractsToKeep(carried)
    carried = packageForImport(carried, keep, assets)?.bytes ?? carried
    packageBytes = carried.byteLength
    // PHP drops a body past `upload_max_filesize` or `post_max_size` without a word and Joomla
    // answers 200 having installed nothing, so sending it only turns a known cause into an unknown
    // one. Unknown limits send it as before.
    blockedBy = uploadBlockedBy(
      carried.byteLength,
      limits,
      await uploadRequestBytes(carried.byteLength, packageFileName(packageUrl))
    )
    if (blockedBy !== undefined) roads.upload_install = { cause: 'over_limit' }
  }

  if (carried && blockedBy === undefined) {
    try {
      // Do NOT set content-type: `fetch` writes the multipart boundary, while a hand-written header
      // without a boundary gives a body the server cannot parse — and a 200 that installs nothing.
      installed = await submitInstall(uploadForm(carried, packageFileName(packageUrl), csrf))
    } catch (error) {
      uploadThrown = thrown('upload_install', error)
      roads.upload_install = { ...roads.upload_install, error: errorCode(error) }
      installed = await installedNow('upload_install')
    }
    // Joomla refusing the install itself refuses the account, and the URL road asks the same account.
    if (!installed && postDenied?.by === 'joomla') return recordedCause() as InstallResult
  }
  // A server rule refusing the upload (mod_security on a large multipart body) need not refuse the
  // URL road's small form, so that road is still tried; if it installs nothing, the refusal decides.
  const uploadDenied = postDenied

  let urlError: string | undefined
  if (!installed) {
    let urlCsrf: string | undefined = csrf
    if (roads.upload_install?.post_status !== undefined || uploadThrown) {
      // A second CSRF token, read fresh: the failed POST above may have rotated the session, and an old token is
      // refused by Joomla with a sentence about an expired session — which would read as "the URL door does not work".
      try {
        const page = await fetchAuthed(installUrl, { signal: timeout() })
        const pageHtml = await readCappedBody(page)
        note('install_page', page, pageHtml, installUrl)
        // The same page answering 403 now is told apart as it was the first time.
        if (page.status === 403)
          return isJoomlaPage(pageHtml)
            ? {
                ok: false,
                reason: 'install_forbidden',
                detail: withEvidence(answered('install_page', 'joomla_denied', page, installUrl))
              }
            : {
                ok: false,
                ...forbiddenBy(page, pageHtml),
                detail: withEvidence(answered('install_page', 'server_denied', page, installUrl))
              }
        urlCsrf = pageHtml.match(CSRF_FIELD)?.[1]
        if (!urlCsrf)
          return (
            recordedCause() ?? {
              ok: false,
              reason: 'install_failed',
              detail: withEvidence(answered('install_page', 'no_csrf', page, installUrl))
            }
          )
      } catch (error) {
        return (
          recordedCause() ?? {
            ok: false,
            reason: 'unreachable',
            detail: withEvidence(uploadThrown ?? thrown('install_page', error))
          }
        )
      }
    }
    lastRoad = 'url_install'
    try {
      installed = await submitInstall(
        new URLSearchParams({
          installtype: 'url',
          install_url: packageUrl,
          task: 'install.install',
          return: '',
          [urlCsrf]: '1'
        }),
        URL_INSTALL_TIMEOUT_MS
      )
    } catch (error) {
      // The site stopped answering while it fetched the package itself — a host that cannot reach
      // GitHub hangs rather than refuses. Unless the package landed after all, it did not install.
      urlError = errorCode(error)
      roads.url_install = { ...roads.url_install, error: urlError }
      installed = await installedNow('url_install')
    }
  }

  if (!installed && !postDenied) postDenied = uploadDenied
  if (!installed && !carried)
    return (
      recordedCause() ?? {
        ok: false,
        reason: 'install_failed',
        detail: withEvidence({
          at: 'package_download',
          check: 'not_downloaded',
          ...(urlError ? { error: urlError } : {})
        })
      }
    )
  // Neither road got an answer: the site stopped answering, which no sentence about installing fixes.
  if (!installed && uploadThrown && urlError)
    return recordedCause() ?? { ok: false, reason: 'unreachable', detail: withEvidence(uploadThrown) }

  if (!installed) {
    // The package refused the site's PHP itself, naming both versions: the owner's next step is the
    // host's PHP, not installing it by hand (which the same check refuses) (#225).
    if (phpFloor)
      return {
        ok: false,
        reason: 'php_too_old',
        ...phpFloor,
        detail: withEvidence({ at: lastRoad, check: 'installer_php_floor' })
      }
    const cause = recordedCause()
    if (cause) return cause
    // A backend in another language never says "successful" in English, so the component itself
    // is asked (`installedNow`) — and on a PHP too old for it, it answers neither door with
    // anything but a parse error. Say that rather than "the site refused the install".
    const landed = await readInstalledToken('proof')
    if (landed) {
      const { door: proof, misses } = await askDoors(session.webRootUrl, landed, doorOpts)
      noteDoors('proof', misses)
      // Installed, but the site names a quickstart contract the package did not carry: every door
      // refuses until it does. Not the host's doing, so not the "ask your host" sentence.
      if (proof?.error === 'contract_unavailable')
        return {
          ok: false,
          reason: 'install_failed',
          detail: withEvidence({ at: 'proof', check: 'contract_unavailable' })
        }
      if (misses.some((m) => m.phpError))
        return {
          ok: false,
          reason: 'php_too_old',
          ...phpOfMisses(misses, php, needPhp),
          detail: withEvidence(doorMiss(lastRoad, misses))
        }
    }
    return {
      ok: false,
      reason: 'install_failed',
      detail: withEvidence(
        lastResult
          ? answered(lastRoad, landed ? 'not_answering' : 'not_installed', lastResult, installUrl)
          : { at: lastRoad, check: 'not_installed' }
      )
    }
  }

  const token = await readInstalledToken('proof')
  if (!token) return { ok: false, reason: 'configure_failed', detail: { at: 'proof', check: 'no_token' } }
  const { door: proof, misses } = await askDoors(session.webRootUrl, token, doorOpts)
  noteDoors('proof', misses)
  // Installed "successfully" yet answering on neither door is not installed — this is the check
  // that catches exactly that. A door dying on a PHP parse error says why.
  if (!proof?.ok) {
    if (!proof && misses.some((miss) => miss.phpError))
      return {
        ok: false,
        reason: 'php_too_old',
        ...phpOfMisses(misses, php, needPhp),
        detail: doorMiss('proof', misses)
      }
    return {
      ok: false,
      reason: 'configure_failed',
      detail: proof ? { at: 'proof', check: 'refused' } : doorMiss('proof', misses)
    }
  }

  return { ok: true, token, version: proof.component }
}
