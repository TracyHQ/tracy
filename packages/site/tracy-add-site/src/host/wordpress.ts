/**
 * A live WordPress site: sign into the admin, install Claude Cowork, then take its token.
 *
 * Copied from `tracy-desk` (`tracyWordPress/credential/verifyAdminLogin.ts`, `migrate/installPlugin.ts`).
 * The same three jobs as the Joomla version, but NOT derivable from it — WordPress differs in three places, and all three
 * are places that have broken once:
 *
 *   1. **No install-from-URL screen.** Joomla takes an address and downloads it itself; with WordPress this machine
 *      must download the zip and upload it through the very form a person would use.
 *   2. **Installed is NOT enough — it must be activated.** An idle plugin registers no endpoint at all.
 *   3. **Upgrades go through WordPress's own updater**, not an overwriting upload. See `upgradeInPlace`.
 */

import { diagnosticError, diagnosticPath } from './diagnostic.mjs'
import type { Diagnostic } from './joomla.js'
import { firewallOf, USER_AGENT } from './firewall.mjs'
import { needsInstall } from './manifest.js'
import type { SiteLink } from './site-link.js'
import { connectionFailure, retryAfterMs } from './site-link.js'
import { isTrustedHop, nextRedirectUrl } from './url-policy.mjs'

const REQUEST_TIMEOUT_MS = 60_000
const MAX_HTML_BYTES = 4 * 1024 * 1024
const MAX_PACKAGE_BYTES = 8 * 1024 * 1024

/** The cookie WordPress issues for a signed-in session. The name carries a per-site hash suffix. */
const LOGGED_IN_COOKIE = /^wordpress_logged_in_/

/** WordPress draws this nonce field on every admin form. */
const NONCE_FIELD = /name="_wpnonce"[^>]*value="([a-z0-9]+)"/i

/** The plugin mints its own token at activation and prints it on its settings page. */
const TOKEN_VALUE = /id="claude_cowork_token"[\s\S]{0,200}?value="([A-Za-z0-9]{16,})"/i

const NOT_ALLOWED = /not allowed to access this page/i

/** WordPress's login form, by the id `login_form()` gives it. */
const LOGIN_FORM = /<form\b[^>]*\bid=["']loginform["']/i

const SETTINGS_PAGE = 'claude-cowork'

/**
 * A second-factor step after a correct password, by the form it draws. Two Factor and WP 2FA post
 * to `validate_2fa` with `wp-auth-id`/`wp-auth-nonce` (measured on Two Factor, WordPress 7.1,
 * 2026-10-19); Wordfence Login Security asks for its `wfls-token`; miniOrange names its fields
 * `mo2f_*`. Field names, never prose, so a translated site still matches.
 */
const MFA_STEP =
  /name=["']wp-auth-(?:id|nonce)["']|action=validate_2fa|wfls-token|wfls_twofactor|name=["']mo2f_/i

/**
 * The error block `login_header()` draws above the form: every `WP_Error` an `authenticate` filter
 * returns lands here, a captcha plugin's refusal and WordPress's own wrong-password one alike.
 */
const LOGIN_ERROR = /<div[^>]*\bid=["']login_error["'][^>]*>([\s\S]*?)<\/div>/i

/**
 * WordPress's own "wrong username or password" sentences, in English, read inside the error block.
 * Core's text, which no other refusal prints.
 */
const WRONG_PASSWORD =
  /password you entered|is not registered on this site|unknown (?:username|email address)/i

/**
 * A captcha plugin's refusal, read inside the error block only: reCAPTCHA, hCaptcha, Cloudflare
 * Turnstile, Friendly Captcha and the "verify you are human" family. A widget merely loaded on the
 * page proves nothing — it is there on every attempt, wrong password included.
 */
const CAPTCHA_ERROR = /captcha|turnstile|\bhuman\b|\brobot\b/i

/**
 * A lockout or rate limit after too many tries: Limit Login Attempts Reloaded ("Too many failed
 * login attempts", measured 2026-10-19), Wordfence and Solid Security ("locked out"), Loginizer
 * ("exceeded maximum login retries"). English only — a translated lockout reads as a wrong password.
 */
const LOCKED_OUT =
  /too many (?:failed |invalid )?(?:login |sign-in )?(?:attempts|retries)|(?:been|is|are) (?:temporarily )?locked out|exceeded (?:the )?maximum (?:number of )?(?:login|sign-in) (?:attempts|retries)/i

/**
 * WordPress's "Connection Information" form: it cannot write the plugins folder itself
 * (`FS_METHOD` ftp/ssh2, or a folder the web server does not own) and asks for FTP details
 * instead of installing. Read by its element id and field name, which are never translated.
 */
const FS_CREDENTIALS_FORM = /id=["']request-filesystem-credentials-form["']|name=["']connection_type["']/i

export type LoginRefusal =
  | 'invalid_credential'
  | 'no_backend_access'
  | 'installs_disabled'
  | 'unreachable'
  | 'basic_auth_required'
  | 'basic_auth_invalid'
  | 'mfa_required'
  | 'captcha_required'
  | 'login_locked_out'
  | 'blocked_by_firewall'

export type AdminSession =
  | { ok: true; cookie: string; authHeader: Record<string, string>; webRootUrl: string; adminUrl: string }
  | {
      ok: false
      reason: LoginRefusal
      firewall?: string
      /** The connection error of the first request (`ECONNREFUSED`…), when it never connected. */
      connection?: string
      detail?: Diagnostic
    }

export interface BasicAuth {
  username: string
  password: string
}

/**
 * Where the plugin answers.
 *
 * `admin-ajax.php` despite the "admin" in its name: the endpoint is registered on the `nopriv` branch too, so
 * it answers a call carrying the token without asking for a signed-in session.
 */
export function apiEndpoint(webRootUrl: string): string {
  return `${webRootUrl}/wp-admin/admin-ajax.php?action=claude_cowork`
}

const timeout = (ms = REQUEST_TIMEOUT_MS) => AbortSignal.timeout(ms)

async function readCappedBody(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    size += value.length
    if (size > MAX_HTML_BYTES) {
      await reader.cancel().catch(() => undefined)
      break
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * The whole body read to its end, keeping only the first `MAX_HTML_BYTES` as text.
 *
 * 🔒 For a page that DOES the work while it streams. `update.php` flushes the upgrader's log line
 * by line, so the response headers arrive before WordPress has even unpacked the new version; a
 * caller that stops at the headers (or at a size cap) walks on while the upgrade is half done, and
 * a cancelled read can abort it mid-way — measured 2026-10-19: the plugin left deactivated, the old
 * folder in place and `upgrade/claude-cowork-*` left behind.
 */
async function drainBody(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value || size >= MAX_HTML_BYTES) continue
    size += value.length
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * A cookie jar gathered across several hops.
 *
 * 🔒 IT MUST GATHER; it cannot just take the last hop's `Set-Cookie`. A successful sign-in returns
 * `wordpress_logged_in_*` alongside the `wordpress_test_cookie` the previous page issued, and a session
 * missing either reads as not signed in.
 */
class CookieJar {
  private readonly jar = new Map<string, { pair: string; expiresAt: number }>()

  /**
   * Keyed by name only, on purpose: the flow talks to one site. A Set-Cookie that deletes or expires
   * a name removes it, whatever its Path, because WordPress signs in and then clears the same auth
   * cookies in one response (a `reauth=1` login, #556); keeping the valid copy would read as signed in.
   */
  absorb(response: Response): void {
    const now = Date.now()
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair, ...attributes] = raw.split(';')
      const eq = pair.indexOf('=')
      if (eq <= 0) continue
      const name = pair.slice(0, eq).trim()
      if (!COOKIE_NAME.test(name)) continue
      const value = pair.slice(eq + 1).trim()
      const expiresAt = expiryOf(attributes, now)
      if (isDeletionValue(value) || expiresAt <= now) {
        this.jar.delete(name)
        continue
      }
      this.jar.set(name, { pair: `${name}=${value}`, expiresAt })
    }
  }

  /** True only for a cookie still live now, never for one that was deleted or has since expired. */
  has(pattern: RegExp): boolean {
    for (const name of this.live().keys()) if (pattern.test(name)) return true
    return false
  }

  get header(): string {
    return [...this.live().values()].join('; ')
  }

  private live(): Map<string, string> {
    const now = Date.now()
    const live = new Map<string, string>()
    for (const [name, cookie] of this.jar) {
      if (cookie.expiresAt > now) live.set(name, cookie.pair)
      else this.jar.delete(name)
    }
    return live
  }
}

/** RFC 6265 cookie-name token: no separators, controls or whitespace. */
const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

/**
 * The values PHP and WordPress send when clearing a cookie: PHP writes `deleted` for an empty value,
 * and `wp_clear_auth_cookie()` sends a single space (URL-encoded as `+` or `%20`).
 */
function isDeletionValue(value: string): boolean {
  if (value === 'deleted') return true
  let decoded = value.replace(/\+/g, ' ')
  try {
    decoded = decodeURIComponent(decoded)
  } catch {
    // A malformed escape is still a value; judge it as written.
  }
  return decoded.trim() === ''
}

/**
 * When a Set-Cookie stops being valid, in epoch ms; `Infinity` for a session cookie.
 *
 * `Max-Age` wins over `Expires` (RFC 6265 §5.3). An expiry attribute that is present but unreadable
 * is treated as already expired rather than guessed live, so it can never stand in for a signed-in
 * session.
 */
function expiryOf(attributes: string[], now: number): number {
  let maxAge: string | undefined
  let expires: string | undefined
  for (const attribute of attributes) {
    const eq = attribute.indexOf('=')
    const key = (eq < 0 ? attribute : attribute.slice(0, eq)).trim().toLowerCase()
    const value = eq < 0 ? '' : attribute.slice(eq + 1).trim()
    if (key === 'max-age') maxAge = value
    else if (key === 'expires') expires = value
  }
  if (maxAge !== undefined) {
    if (!/^-?\d+$/.test(maxAge)) return Number.NEGATIVE_INFINITY
    const seconds = Number(maxAge)
    return seconds <= 0 ? Number.NEGATIVE_INFINITY : now + seconds * 1000
  }
  if (expires !== undefined) {
    const at = Date.parse(expires)
    return Number.isNaN(at) ? Number.NEGATIVE_INFINITY : at
  }
  return Number.POSITIVE_INFINITY
}

function basicAuthHeader(basicAuth?: BasicAuth): Record<string, string> {
  if (!basicAuth) return {}
  const encoded = Buffer.from(`${basicAuth.username}:${basicAuth.password}`).toString('base64')
  return { authorization: `Basic ${encoded}` }
}

function isBasicAuthChallenge(response: Response): boolean {
  return response.status === 401 && /^basic\b/i.test(response.headers.get('www-authenticate') ?? '')
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

/**
 * Follow redirects manually, keeping Basic auth and cookies within the trust boundary — the same
 * reasoning as the Joomla half.
 *
 * The boundary is the fixed `anchor` (the address the operator typed), never the last URL seen.
 * Every hop, including the first request, is made only when `isTrustedHop` allows it: a hardened
 * wp-login can 301 https→http on the same host (which is rewritten back to https), and a
 * cross-host `Location` cannot pull the session cookie or Basic auth onto a stranger's origin — an
 * untrusted or downgraded destination throws before any request reaches it. `secure` rises once a
 * hop has been on https and never falls.
 */
async function followRedirects(
  startUrl: string,
  jar: CookieJar,
  authHeader: Record<string, string>,
  opts: { anchor?: string; maxRedirects?: number; secure?: boolean; visited?: string[] } = {}
): Promise<Response> {
  const anchor = opts.anchor ?? startUrl
  const maxRedirects = opts.maxRedirects ?? 5
  let url = startUrl
  // The https floor carries in from the caller: a flow that already reached https before this call
  // must not drop to http here even when the anchor and start URL are http.
  let secure = opts.secure === true || isHttps(anchor) || isHttps(startUrl)
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!isTrustedHop(anchor, url, { secure })) throw new Error('untrusted redirect target')
    const response = await fetch(url, {
      redirect: 'manual',
      headers: {
        'user-agent': USER_AGENT,
        ...authHeader,
        ...(jar.header ? { cookie: jar.header } : {})
      },
      signal: timeout()
    })
    if (isHttps(url)) secure = true
    opts.visited?.push(url)
    jar.absorb(response)
    const location = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null
    if (!location) return response
    const next = nextRedirectUrl(url, location)
    if (!next) return response
    await disposeBody(response)
    url = next
  }
  throw new Error('too many redirects')
}

/** `<webroot>/wp-login.php` → `<webroot>`, keeping any subpath. */
export function webRootFrom(loginUrl: string): string {
  const url = new URL(loginUrl)
  return `${url.origin}${url.pathname.replace(/\/wp-login\.php$/i, '')}`
}

/**
 * The resolved login URL without WordPress's `reauth` parameter, every other part kept.
 *
 * 🔒 `<site>/wp-admin` redirects a signed-out visitor to `wp-login.php?redirect_to=…&reauth=1`.
 * POSTing the password there makes WordPress sign in and then clear the auth cookies in the same
 * 200 answer (#556), so the account reads as signed out. The endpoint itself stays exactly as
 * resolved: a relocated login page and its subpath are not rewritten to `wp-login.php`.
 */
function withoutReauth(loginUrl: string): string {
  let url: URL
  try {
    url = new URL(loginUrl)
  } catch {
    return loginUrl
  }
  if (!url.searchParams.has('reauth')) return loginUrl
  // Drop only the `reauth` pairs and keep every other pair byte for byte: `searchParams.delete`
  // would re-serialise the whole query (`%20` → `+`), which a login page signing its query rejects.
  const kept = url.search
    .slice(1)
    .split('&')
    .filter((pair) => queryName(pair) !== 'reauth')
  url.search = kept.length > 0 ? `?${kept.join('&')}` : ''
  return url.href
}

/** A raw `name=value` query pair's decoded name, the way `URLSearchParams` reads it. */
function queryName(pair: string): string {
  const eq = pair.indexOf('=')
  const raw = (eq < 0 ? pair : pair.slice(0, eq)).replace(/\+/g, ' ')
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/** Most webroots a sign-in tries when nothing authoritative names one; the origin is always last. */
const MAX_WEB_ROOT_GUESSES = 4

/**
 * Where a login page says WordPress may live, most likely first, the site's origin always last.
 * Never the login page's own folder unless it is `wp-login.php`'s: a relocated slug is not a root.
 *
 * 🔒 A login page moved to a custom slug (WPS Hide Login, Solid Security's hidden backend) says
 * nothing about the webroot in its address — `/secret-door` is not under it — and on those sites
 * `<site>/wp-admin` answers a signed-out visitor with a 404 instead of a redirect, so there is no
 * admin hop either. What the page still says, in order of how tightly it is tied to the install:
 * WordPress's own form posting to `<webroot>/wp-login.php`; an address that IS `wp-login.php`;
 * `wp_admin_css('login')` links to `<webroot>/wp-admin/load-styles.php` (or `wp-admin/css/…` and
 * `wp-includes/…`), those under the login page's own path first; the login page's parent folders,
 * deepest first; then the origin. Only links on the login page's own host count; a CDN copy does
 * not. These are guesses: `loginToAdmin` keeps the first whose `wp-admin` answers, unless the
 * sign-in's auth cookie named the root outright.
 */
export function webRootCandidates(html: string, resolvedLoginUrl: string): string[] {
  let page: URL
  try {
    page = new URL(resolvedLoginUrl)
  } catch {
    return []
  }
  const paths: string[] = []
  const add = (path: string) => {
    if (!paths.includes(path)) paths.push(path)
  }
  /** `raw` resolved against the page, as a path without a trailing slash; null off this host. */
  const pathOf = (raw: string): string | null => {
    try {
      const url = new URL(raw.replace(/&amp;/g, '&'), page)
      return url.hostname === page.hostname ? url.pathname.replace(/\/+$/, '') : null
    } catch {
      return null
    }
  }

  const form = /<form\b[^>]*\bid=["']loginform["'][^>]*>/i.exec(html)?.[0] ?? ''
  const action = /\baction=["']([^"']+)["']/i.exec(form)?.[1]
  for (const path of [action ? pathOf(action) : null, page.pathname]) {
    const root = path ? /^(.*)\/wp-login\.php$/i.exec(path) : null
    if (root) add(root[1])
  }

  const assets: string[] = []
  for (const [, base] of html.matchAll(
    /(?:href|src)=["']([^"']*?)\/(?:wp-admin\/(?:load-styles\.php|css\/)|wp-includes\/)/gi
  )) {
    const path = pathOf(`${base}/`)
    if (path !== null && !assets.includes(path)) assets.push(path)
  }
  const under = (path: string) => page.pathname.startsWith(`${path}/`)
  for (const path of assets.filter(under).sort((a, b) => b.length - a.length)) add(path)
  for (const path of assets) add(path)
  // A subfolder install whose assets are all on a CDN: the login page's parent folders, deepest
  // first. Never the login page's own path — a slug is not a root.
  const segments = page.pathname.replace(/\/+$/, '').split('/')
  for (let depth = segments.length - 1; depth > 1; depth--) add(segments.slice(0, depth).join('/'))

  const guesses = paths.filter((path) => path !== '').slice(0, MAX_WEB_ROOT_GUESSES - 1)
  return [...guesses, ''].map((path) => `${page.origin}${path}`)
}

/**
 * The webroots to try for a sign-in whose GET visited `visited` and landed on `resolvedLoginUrl`.
 *
 * 🔒 The admin area is what names the webroot, not the login page. `<site>/wp-admin` redirects a
 * signed-out visitor to a login page that may be relocated (`/secret-door`,
 * `/secret-door/wp-login.php`, `/secret-door/wp-admin/login`), so no path pattern read off that
 * page can tell the webroot. Only a hop WordPress's admin gate answered with a redirect counts as
 * the admin area: never the final page (it is the login page, whatever its path), and only the
 * exact admin entry `<webroot>/wp-admin` or `<webroot>/wp-admin/`. The last such hop decides the
 * path, which also follows a redirect that moved the install (`/wp-admin` → `/blog/wp-admin/`).
 * A flow with no such hop (a login page typed directly) takes the page's own guesses
 * (`webRootCandidates`). The origin comes from the resolved URL: its hops were trusted, and it
 * carries any http→https upgrade.
 */
function webRootOf(visited: string[], resolvedLoginUrl: string, loginHtml = ''): string[] {
  const redirected = visited.slice(0, -1)
  for (let i = redirected.length - 1; i >= 0; i--) {
    let hop: URL
    try {
      hop = new URL(redirected[i])
    } catch {
      continue
    }
    const admin = /^(.*)\/wp-admin\/?$/i.exec(hop.pathname)
    if (admin) return [`${new URL(resolvedLoginUrl).origin}${admin[1]}`]
  }
  return webRootCandidates(loginHtml, resolvedLoginUrl)
}

/**
 * The webroot the sign-in's own auth cookie names, or `null`.
 *
 * WordPress scopes `wordpress_<hash>` / `wordpress_sec_<hash>` to ADMIN_COOKIE_PATH, which is the
 * path of `siteurl` plus `/wp-admin` — the install's own statement of where it lives, whatever the
 * login page's address. A site that redefines that constant names nothing here and falls back to
 * the guesses.
 */
function webRootFromAuthCookie(response: Response, origin: string): string | null {
  for (const line of response.headers.getSetCookie?.() ?? []) {
    const [pair, ...attributes] = line.split(';')
    const eq = pair.indexOf('=')
    if (eq < 0) continue
    const value = pair.slice(eq + 1).trim()
    if (!/^wordpress_(?:sec_)?[0-9a-f]+$/i.test(pair.slice(0, eq).trim())) continue
    if (value === '' || value === '+' || value === 'deleted') continue
    const path = attributes
      .map((attribute) => attribute.trim())
      .find((attribute) => /^path=/i.test(attribute))
      ?.slice(5)
    const root = path ? /^(.*)\/wp-admin\/?$/i.exec(path) : null
    if (root) return `${origin}${root[1]}`
  }
  return null
}

/**
 * Why a password POST did not sign in, read off the login page and the answer to the POST.
 *
 * Checked in the order that keeps each sentence honest: a second-factor form only appears after a
 * CORRECT password; a lockout refuses before the password is even looked at. Then the error the
 * POST drew decides: WordPress's own wrong-password sentence wins, and only an error that names
 * the captcha is one.
 *
 * 🔒 ONLY A RECOGNISED ERROR IS A WRONG PASSWORD: core's English sentences, nothing else. No
 * language-free signal is strict enough — core's lost-password link rides on a translated lockout or
 * security check as well, and a lockout names the account too. Anything else — no error block, a
 * translated core error, a plugin's own refusal — is `message_unread`: the run keeps `invalid_credential` for the code and says in its diagnostic that
 * the reason was not read, and the customer is told what to check, the password first.
 */
export function loginRefusalOf(loginHtml: string, postedHtml: string): LoginRefusal | 'message_unread' {
  if (MFA_STEP.test(postedHtml)) return 'mfa_required'
  if (LOCKED_OUT.test(postedHtml) || LOCKED_OUT.test(loginHtml)) return 'login_locked_out'
  const error = LOGIN_ERROR.exec(postedHtml)?.[1] ?? ''
  if (WRONG_PASSWORD.test(error)) return 'invalid_credential'
  if (CAPTCHA_ERROR.test(error)) return 'captcha_required'
  return 'message_unread'
}

/**
 * Whether the signed-in session may install plugins.
 *
 * 🔒 BEING ABLE TO SIGN IN DOES NOT MEAN BEING ABLE TO DO THE JOB. A Subscriber enters `wp-admin` normally
 * and can do nothing there, so the exact right needed — installing plugins — must be checked, or the failure
 * shows up much later, as an install returning a page about permissions.
 */
async function installAccessOf(
  adminUrl: string,
  jar: CookieJar,
  authHeader: Record<string, string>,
  secure: boolean
): Promise<
  'ok' | 'no_backend_access' | 'installs_disabled' | 'unreachable' | 'signed_out' | { firewall: string }
> {
  try {
    const response = await followRedirects(`${adminUrl}/plugin-install.php?tab=upload`, jar, authHeader, {
      anchor: adminUrl,
      secure
    })
    const html = await readCappedBody(response)
    // A 403 here is usually WordPress itself (`wp_die` for a missing capability), so only a page a
    // firewall signs counts as one.
    const firewall = firewallOf(response.status, response.headers, html)
    if (firewall) return { firewall }
    if (!response.ok) return response.status === 403 ? 'no_backend_access' : 'unreachable'
    if (NOT_ALLOWED.test(html)) return 'no_backend_access'
    // Sent back to a login form: the session does not hold here (a wrong webroot guess, or a
    // folder holding another install).
    if (LOGIN_FORM.test(html)) return 'signed_out'
    // `DISALLOW_FILE_MODS` is a `wp-config.php` constant many managed hosts turn on: the page
    // still opens, the upload form just is not there.
    if (!NONCE_FIELD.test(html)) return 'installs_disabled'
    return 'ok'
  } catch {
    return 'unreachable'
  }
}

/**
 * Sign into `wp-login.php`.
 *
 * 🔒 THE LOGIN PAGE MUST BE LOADED FIRST. It issues `wordpress_test_cookie`, and the POST carries `testcookie=1`
 * — WordPress refuses a sign-in without that pair, with a sentence about the browser blocking cookies.
 *
 * 🔒 `loginUrl` IS USED EXACTLY AS TYPED. Hiding `wp-login.php` is a common hardening, and
 * there is no way to discover a login page that was deliberately moved.
 */
export async function loginToAdmin(
  loginUrl: string,
  username: string,
  password: string,
  basicAuth?: BasicAuth
): Promise<AdminSession> {
  const authHeader = basicAuthHeader(basicAuth)
  const jar = new CookieJar()

  let resolvedLoginUrl = loginUrl
  let loginHtml = ''
  const visited: string[] = []
  try {
    const page = await followRedirects(loginUrl, jar, authHeader, { anchor: loginUrl, visited })
    if (isBasicAuthChallenge(page)) {
      return { ok: false, reason: basicAuth ? 'basic_auth_invalid' : 'basic_auth_required' }
    }
    loginHtml = await readCappedBody(page)
    // WordPress never refuses its own login page with a 403, so an unrecognised one is a gate too.
    const firewall = firewallOf(page.status, page.headers, loginHtml, { generic: true })
    if (firewall) return { ok: false, reason: 'blocked_by_firewall', firewall }
    if (!page.ok) return { ok: false, reason: 'unreachable' }
    resolvedLoginUrl = page.url || loginUrl
  } catch (error) {
    const connection = connectionFailure(error)
    return {
      ok: false,
      reason: 'unreachable',
      ...(connection ? { connection } : {}),
      detail: { at: 'login_page', check: 'network', error: diagnosticError(error) }
    }
  }

  const guesses = webRootOf(visited, resolvedLoginUrl, loginHtml)
  const adminUrl = `${guesses[0]}/wp-admin`
  const postUrl = withoutReauth(resolvedLoginUrl)

  // Defense in depth: the password only ever POSTs to an endpoint the original loginUrl trusts. The
  // GET followed nothing but trusted hops, so this holds; the guard makes it impossible for a
  // future change to POST the password to an origin the operator did not name.
  if (!isTrustedHop(loginUrl, postUrl, { secure: isHttps(loginUrl) })) {
    return { ok: false, reason: 'unreachable' }
  }

  let posted: Response
  try {
    posted = await fetch(postUrl, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'user-agent': USER_AGENT,
        'content-type': 'application/x-www-form-urlencoded',
        cookie: jar.header,
        ...authHeader
      },
      body: new URLSearchParams({
        log: username,
        pwd: password,
        'wp-submit': 'Log In',
        redirect_to: `${adminUrl}/`,
        testcookie: '1'
      }),
      signal: timeout()
    })
  } catch (error) {
    return {
      ok: false,
      reason: 'unreachable',
      detail: { at: 'login_post', check: 'network', error: diagnosticError(error) }
    }
  }
  jar.absorb(posted)
  // A redirect's body says nothing; the page drawn in answer to the POST says why it failed.
  const postedHtml =
    posted.status >= 300 && posted.status < 400 ? '' : await readCappedBody(posted).catch(() => '')
  // A rule that blocks the POST itself (a WAF scoring the password field) is not a wrong password.
  const firewall = firewallOf(posted.status, posted.headers, postedHtml, { generic: true })
  if (firewall) return { ok: false, reason: 'blocked_by_firewall', firewall }

  if (!jar.has(LOGGED_IN_COOKIE)) {
    const refusal = loginRefusalOf(loginHtml, postedHtml)
    return refusal === 'message_unread'
      ? { ok: false, reason: 'invalid_credential', detail: { at: 'login_post', check: 'message_unread' } }
      : { ok: false, reason: refusal }
  }

  // 🔒 A root the auth cookie names is the install's own word and is the only one tried. Guesses
  // are tried in order, and a guess counts only once its `wp-admin` answers as WordPress's: one with
  // nothing behind it (404) or that sends the session back to a login form gives way to the next.
  const cookieRoot = webRootFromAuthCookie(posted, new URL(postUrl).origin)
  const roots = cookieRoot ? [cookieRoot] : guesses
  let firstMiss: 'unreachable' | 'signed_out' | undefined
  for (const webRootUrl of roots) {
    const rootAdminUrl = `${webRootUrl}/wp-admin`
    // The login already ran over https once `resolvedLoginUrl` is https; hold that floor through
    // the install-access probe so a later hop cannot drop the session cookie or Basic auth to http.
    const access = await installAccessOf(rootAdminUrl, jar, authHeader, isHttps(resolvedLoginUrl))
    if (typeof access === 'object')
      return { ok: false, reason: 'blocked_by_firewall', firewall: access.firewall }
    if (access === 'ok')
      return { ok: true, cookie: jar.header, authHeader, webRootUrl, adminUrl: rootAdminUrl }
    if (access === 'unreachable' || access === 'signed_out') {
      firstMiss ??= access
      continue
    }
    return { ok: false, reason: access }
  }
  // No root held: report what the best one said. A login form where the upload form should be
  // has always read as installs disabled (no upload nonce on the page).
  return { ok: false, reason: firstMiss === 'signed_out' ? 'installs_disabled' : 'unreachable' }
}

function authedFetcher(session: Extract<AdminSession, { ok: true }>) {
  let cookie = session.cookie
  return async (url: string, init: RequestInit = {}): Promise<Response> => {
    const response = await fetch(url, {
      ...init,
      redirect: init.redirect ?? 'follow',
      headers: {
        'user-agent': USER_AGENT,
        cookie,
        ...session.authHeader,
        ...(init.headers as Record<string, string> | undefined)
      }
    })
    const set = response.headers.getSetCookie?.() ?? []
    if (set.length > 0) cookie = [cookie, ...set.map((one) => one.split(';')[0])].filter(Boolean).join('; ')
    return response
  }
}

export type InstallResult =
  | {
      ok: true
      token: string
      version?: string
      dbDumpMany?: { max_tables?: number; max_bytes?: number; max_seconds?: number }
    }
  | {
      ok: false
      reason:
        | 'install_failed'
        | 'activate_failed'
        | 'configure_failed'
        | 'unreachable'
        | 'fs_credentials_required'
        | 'upgrade_failed'
        | 'blocked_by_firewall'
        | 'upload_too_large'
      firewall?: string
      detail?: Diagnostic
      have?: string
      need?: string
    }

/** What one installer step met: done, failed, the "Connection Information" form, or a firewall. */
type StepOutcome = 'ok' | 'failed' | 'fs_credentials_required' | { firewall: string }

/** A refusal that decides the run where it was met: nothing more is asked of the site after it. */
type Stop = { stop: Extract<InstallResult, { ok: false }> }

/** WordPress's own `wp_die()` page (`id="error-page"`; `wp-die-message` since 5.3), in any language. */
const WP_DIE_PAGE = /<body[^>]*\bid=["']error-page["']|class=["'][^"']*\bwp-die-message\b/i

/**
 * The upload POST answered 413 or 403. 🔒 Either decides the outcome: a server that refused the
 * package's size or the request will refuse it again, and the Plugins screen asked after it would
 * only say "absent" (or show the old plugin) and lose the why. A 403 drawn by WordPress itself
 * (`wp_die`, e.g. an expired nonce or a missing capability) is the installer failing; any other 403
 * is something in front of WordPress — a named firewall when its page says which.
 */
function uploadRefusal(posted: Response, html: string, uploadUrl: string, base: string): Stop | null {
  if (posted.status !== 413 && posted.status !== 403) return null
  const path = diagnosticPath(posted.url || uploadUrl, base)
  const detail = (check: string) => ({
    at: 'upload_install',
    check,
    status: posted.status,
    ...(path ? { path } : {})
  })
  if (posted.status === 413)
    return { stop: { ok: false, reason: 'upload_too_large', detail: detail('too_large') } }
  const named = firewallOf(posted.status, posted.headers, html)
  if (!named && WP_DIE_PAGE.test(html))
    return { stop: { ok: false, reason: 'install_failed', detail: detail('forbidden') } }
  return {
    stop: {
      ok: false,
      reason: 'blocked_by_firewall',
      firewall: named ?? 'firewall',
      detail: detail('server_denied')
    }
  }
}

/** The installer page's own verdict on a step it drew, before anything else is asked. */
function blockerIn(response: Response, html: string): Exclude<StepOutcome, 'ok' | 'failed'> | null {
  const firewall = firewallOf(response.status, response.headers, html)
  if (firewall) return { firewall }
  if (FS_CREDENTIALS_FORM.test(html)) return 'fs_credentials_required'
  return null
}

/** Which state the plugin is in on the Plugins screen — read from links, not prose. */
function presenceIn(html: string): 'active' | 'inactive' | 'absent' {
  if (/href="[^"]*action=deactivate[^"]*claude-cowork/i.test(html)) return 'active'
  if (/href="[^"]*action=activate[^"]*claude-cowork/i.test(html)) return 'inactive'
  return 'absent'
}

export async function readSiteInfo(
  webRootUrl: string,
  token: string,
  opts: { noFollow?: boolean; link?: SiteLink } = {}
): Promise<{
  ok: boolean
  version?: string
  firewall?: string
  dbDumpMany?: { max_tables?: number; max_bytes?: number; max_seconds?: number }
}> {
  try {
    await opts.link?.ready()
    const response = await fetch(apiEndpoint(webRootUrl), {
      method: 'POST',
      // When verifying an https endpoint the token must not be replayed to a redirect target: a
      // 3xx here (an https endpoint 307ing to http or to another host) is refused, not followed.
      redirect: opts.noFollow ? 'manual' : 'follow',
      headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
      body: JSON.stringify({ token, action: 'info' }),
      signal: timeout(30_000)
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
      return { ok: false }
    }
    const text = await readCappedBody(response)
    // The engine answers JSON on every path, so an HTML 403 here is a gate in front of it.
    const firewall = firewallOf(response.status, response.headers, text, { generic: true })
    if (firewall) return { ok: false, firewall }
    const result = JSON.parse(text) as {
      ok?: boolean
      info?: {
        component?: string
        plugin?: string
        version?: string
        db_dump_many?: { max_tables?: number; max_bytes?: number; max_seconds?: number } | null
      }
      plugin?: string
      version?: string
    }
    // 🔒 `info.component` — the engine uses the SAME field name on both platforms, including in the
    // WordPress shell. Measured on `tracy.ai` 31/08: `{"ok":true,"info":{"wordpress":"7.0.2","component":"0.8.0"}}`.
    // Reading the wrong level made every import reinstall the plugin over the customer's site — see the long note in the Joomla version.
    const version =
      result?.info?.component ??
      result?.info?.plugin ??
      result?.info?.version ??
      result?.plugin ??
      result?.version
    return {
      ok: result?.ok === true,
      version,
      ...(result?.info?.db_dump_many && typeof result.info.db_dump_many === 'object'
        ? { dbDumpMany: result.info.db_dump_many }
        : {})
    }
  } catch (error) {
    opts.link?.failed(error)
    return { ok: false }
  }
}

/**
 * Upgrade the way a person upgrades: press the site's own Update link.
 *
 * 🔒 THIS ROAD EXISTS BECAUSE THE OTHER ONE SILENTLY STOPPED WORKING. The overwriting upload asks WordPress to unpack an
 * archive over an existing folder; on `tracy.ai` on 25/08 it returned HTTP 500 with a blank error page
 * — no reason, no confirmation link — while a person pressing **update now** a few minutes later
 * succeeded first time. So the trustworthy road was never ours: it is WordPress's own
 * updater, which upgrades millions of plugins every day.
 *
 * Three calls, each doing exactly what one user click does — and `force-check` is the key:
 * without it, a site a few minutes behind the new release still believes it is current for six more hours.
 */
async function upgradeInPlace(
  fetchAuthed: ReturnType<typeof authedFetcher>,
  admin: string
): Promise<StepOutcome> {
  try {
    const checked = await fetchAuthed(`${admin}/update-core.php?force-check=1`)
    const checkedBlocker = blockerIn(checked, await readCappedBody(checked))
    if (checkedBlocker) return checkedBlocker
    const plugins = await fetchAuthed(`${admin}/plugins.php`)
    const html = await readCappedBody(plugins)
    const pluginsBlocker = blockerIn(plugins, html)
    if (pluginsBlocker) return pluginsBlocker
    if (!plugins.ok) return 'failed'
    // The link WordPress itself draws for this plugin. `upgrade-plugin` plus the slug is what makes it
    // ours; matching on prose would break on a site in another language.
    const link = html
      .match(/href="([^"]*action=upgrade-plugin[^"]*claude-cowork[^"]*)"/i)?.[1]
      ?.replace(/&amp;/g, '&')
    if (!link) return 'failed'
    const taken = await fetchAuthed(new URL(link, `${admin}/`).toString())
    const page = await drainBody(taken)
    return blockerIn(taken, page) ?? (taken.ok ? 'ok' : 'failed')
  } catch {
    return 'failed'
  }
}

/**
 * Download the package, then upload it through the very form a user would use. `wasPresent`: the plugin was already on
 * the Plugins screen, so its presence afterwards proves nothing and only WordPress's own "Replace
 * current with uploaded" step, answered 2xx, counts as the new package landing.
 */
async function uploadPackage(
  fetchAuthed: ReturnType<typeof authedFetcher>,
  admin: string,
  packageUrl: string,
  wasPresent: boolean,
  webRootUrl: string
): Promise<StepOutcome | Stop> {
  try {
    const form = await fetchAuthed(`${admin}/plugin-install.php?tab=upload`)
    const formHtml = await readCappedBody(form)
    if (!form.ok) return blockerIn(form, formHtml) ?? 'failed'
    const nonce = formHtml.match(NONCE_FIELD)?.[1]
    if (!nonce) return 'failed'

    const download = await fetch(packageUrl, { headers: { 'user-agent': USER_AGENT }, signal: timeout() })
    if (!download.ok) return 'failed'
    const bytes = await download.arrayBuffer()
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_PACKAGE_BYTES) return 'failed'

    const body = new FormData()
    body.append('_wpnonce', nonce)
    body.append('_wp_http_referer', '/wp-admin/plugin-install.php?tab=upload')
    body.append('pluginzip', new Blob([bytes], { type: 'application/zip' }), 'claude-cowork.zip')
    body.append('install-plugin-submit', 'Install Now')

    const uploadUrl = `${admin}/update.php?action=upload-plugin`
    const posted = await fetchAuthed(uploadUrl, { method: 'POST', body })
    const html = await drainBody(posted)
    const refused = uploadRefusal(posted, html, uploadUrl, webRootUrl)
    if (refused) return refused
    // 🔒 A site that cannot write its plugins folder answers the upload with an FTP form and
    // installs nothing; the Plugins screen below would only say "absent" and lose the why.
    const blocked = blockerIn(posted, html)
    if (blocked) return blocked

    // The plugin is already on disk: WordPress does not overwrite, it offers a link that does, carrying the
    // temporary package it just saved and its own nonce. `overwrite=` survives every translation because it is a query
    // parameter, not prose.
    const replace = html.match(/href="([^"]*overwrite=update-plugin[^"]*)"/i)?.[1]?.replace(/&amp;/g, '&')
    if (!replace && wasPresent) return 'failed'
    if (replace) {
      const replaced = await fetchAuthed(new URL(replace, `${admin}/`).toString())
      const replacedHtml = await drainBody(replaced)
      const stopped = blockerIn(replaced, replacedHtml)
      if (stopped) return stopped
      if (!replaced.ok) return 'failed'
    }

    // 🔒 ASK THE SITE; DO NOT READ ITS PROSE. "Plugin installed successfully" is only one language:
    // a Vietnamese WordPress says "Đã cài đặt plugin thành công.", the regex misses, and a first
    // install died on a plugin already sitting there (14/08). The Plugins screen answers the same question
    // with something WordPress never translates.
    const after = await fetchAuthed(`${admin}/plugins.php`)
    const afterHtml = await readCappedBody(after)
    const afterBlocker = blockerIn(after, afterHtml)
    if (afterBlocker) return afterBlocker
    if (!after.ok) return 'failed'
    return presenceIn(afterHtml) !== 'absent' ? 'ok' : 'failed'
  } catch {
    return 'failed'
  }
}

/**
 * Install (or upgrade) Claude Cowork on a WordPress site, then return its token.
 *
 * The order is deliberate: see what the site has FIRST, because an overwriting upload onto a still-current plugin is
 * the most fragile road in this whole file.
 */
export async function installCowork(
  session: Extract<AdminSession, { ok: true }>,
  packageUrl: string,
  latestVersion: string,
  existingToken?: string,
  options: { link?: SiteLink } = {}
): Promise<InstallResult> {
  const fetchAuthed = authedFetcher(session)
  const admin = session.adminUrl

  const readInstalledToken = async (): Promise<{ token?: string; firewall?: string }> => {
    try {
      const page = await fetchAuthed(`${admin}/options-general.php?page=${SETTINGS_PAGE}`)
      const html = await readCappedBody(page)
      const firewall = firewallOf(page.status, page.headers, html)
      if (firewall) return { firewall }
      if (!page.ok) return {}
      return { token: html.match(TOKEN_VALUE)?.[1] }
    } catch {
      return {}
    }
  }
  const blocked = (firewall: string): InstallResult => ({
    ok: false,
    reason: 'blocked_by_firewall',
    firewall
  })

  if (existingToken) {
    const alive = await readSiteInfo(session.webRootUrl, existingToken, { link: options.link })
    if (alive.ok && !needsInstall(alive.version, latestVersion)) {
      return {
        ok: true,
        token: existingToken,
        version: alive.version,
        ...(alive.dbDumpMany ? { dbDumpMany: alive.dbDumpMany } : {})
      }
    }
  }

  let present: 'active' | 'inactive' | 'absent'
  try {
    const plugins = await fetchAuthed(`${admin}/plugins.php`)
    const html = await readCappedBody(plugins)
    const firewall = firewallOf(plugins.status, plugins.headers, html)
    if (firewall) return { ok: false, reason: 'blocked_by_firewall', firewall }
    if (!plugins.ok) return { ok: false, reason: 'unreachable' }
    present = presenceIn(html)
  } catch {
    return { ok: false, reason: 'unreachable' }
  }

  // Why a step stopped short, kept so the final check can say it instead of a generic failure.
  let blocker: Exclude<StepOutcome, 'ok' | 'failed'> | null = null

  if (present === 'active') {
    const { token, firewall } = await readInstalledToken()
    if (firewall) return blocked(firewall)
    if (token) {
      const info = await readSiteInfo(session.webRootUrl, token, { link: options.link })
      if (info.ok && !needsInstall(info.version, latestVersion)) {
        return {
          ok: true,
          token,
          version: info.version,
          ...(info.dbDumpMany ? { dbDumpMany: info.dbDumpMany } : {})
        }
      }
      // A token, but an old version: go through the site's updater. Only when it offers nothing, upload over it.
      const upgraded = await upgradeInPlace(fetchAuthed, admin)
      if (upgraded === 'ok') {
        const { token: after, firewall: afterFirewall } = await readInstalledToken()
        if (afterFirewall) return blocked(afterFirewall)
        if (after) {
          const proof = await readSiteInfo(session.webRootUrl, after, { link: options.link })
          // 🔒 The updater's page answering 200 is not the new version: a site that could not
          // replace the folder still draws a page. Only the engine saying the latest version counts;
          // anything older falls through to the upload below and the final check.
          if (proof.firewall) return blocked(proof.firewall)
          if (proof.ok && !needsInstall(proof.version, latestVersion)) {
            return {
              ok: true,
              token: after,
              version: proof.version,
              ...(proof.dbDumpMany ? { dbDumpMany: proof.dbDumpMany } : {})
            }
          }
        }
      } else if (upgraded !== 'failed') {
        blocker = upgraded
      }
    }
  }

  // A deactivated plugin cannot be asked its version — it has no endpoint at all — so it is uploaded over
  // without asking first.
  const uploaded = await uploadPackage(
    fetchAuthed,
    admin,
    packageUrl,
    present !== 'absent',
    session.webRootUrl
  )
  if (typeof uploaded === 'object' && 'stop' in uploaded) return uploaded.stop
  if (uploaded !== 'ok' && uploaded !== 'failed') blocker = uploaded
  if (uploaded !== 'ok' && present === 'absent') return refusalOf(blocker, 'install_failed')

  // 🔒 INSTALLED IS NOT ENOUGH: WordPress must ACTIVATE the plugin before it registers its endpoint — unlike Joomla,
  // where installing a component is all it takes. Also after a failed in-place upgrade: WordPress deactivates the
  // plugin before replacing it and does not turn it back on when the replace fails.
  // 🔒 Only a plugin that was on before, or the package just uploaded, is switched on. A plugin the
  // customer turned off themselves stays off when nothing new reached the site: activating it
  // would run code they chose not to run, and it still would not be the version Tracy needs.
  try {
    const plugins = await fetchAuthed(`${admin}/plugins.php`)
    const html = await readCappedBody(plugins)
    const firewall = firewallOf(plugins.status, plugins.headers, html)
    if (firewall) return blocked(firewall)
    const state = presenceIn(html)
    if (state === 'absent') return refusalOf(blocker, 'install_failed')
    if (state === 'inactive') {
      if (present === 'inactive' && uploaded !== 'ok') return refusalOf(blocker, 'install_failed')
      const link = html
        .match(/href="([^"]*action=activate[^"]*claude-cowork[^"]*)"/i)?.[1]
        ?.replace(/&amp;/g, '&')
      if (!link) return { ok: false, reason: 'activate_failed' }
      const activated = await fetchAuthed(new URL(link, `${admin}/`).toString())
      const activatedHtml = await readCappedBody(activated)
      const activateFirewall = firewallOf(activated.status, activated.headers, activatedHtml)
      if (activateFirewall) return blocked(activateFirewall)
      if (!activated.ok) return { ok: false, reason: 'activate_failed' }
    }
  } catch {
    return { ok: false, reason: 'activate_failed' }
  }

  const { token, firewall } = await readInstalledToken()
  if (firewall) return blocked(firewall)
  if (!token) return { ok: false, reason: 'configure_failed' }
  const proof = await readSiteInfo(session.webRootUrl, token, { link: options.link })
  if (proof.firewall) return blocked(proof.firewall)
  if (!proof.ok) return { ok: false, reason: 'configure_failed' }
  // 🔒 A plugin that is still the old version after both the updater and the upload is a failed
  // update, not a success: the site keeps running a build Tracy no longer speaks to reliably, and
  // the customer is never told (measured 2026-10-19 on a read-only plugins folder: run "done",
  // version 0.18.14 against 0.18.18). An engine that names no version cannot be compared; it passes.
  if (proof.version !== undefined && needsInstall(proof.version, latestVersion)) {
    const refused = refusalOf(blocker, 'upgrade_failed')
    return refused.reason === 'upgrade_failed'
      ? { ...refused, have: proof.version, need: latestVersion }
      : refused
  }
  return {
    ok: true,
    token,
    version: proof.version,
    ...(proof.dbDumpMany ? { dbDumpMany: proof.dbDumpMany } : {})
  }
}

/** The failure a run reports: the blocker a step met when there was one, else the step's own. */
function refusalOf(
  blocker: Exclude<StepOutcome, 'ok' | 'failed'> | null,
  fallback: 'install_failed' | 'upgrade_failed'
): Extract<InstallResult, { ok: false }> {
  if (blocker === 'fs_credentials_required') return { ok: false, reason: 'fs_credentials_required' }
  if (blocker) return { ok: false, reason: 'blocked_by_firewall', firewall: blocker.firewall }
  return { ok: false, reason: fallback }
}
