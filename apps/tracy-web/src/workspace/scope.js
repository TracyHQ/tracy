/**
 * Which dsh a request is for, and under what standing — the ONE resolver the HTTP route
 * (`route.js`) and the WebSocket splice (`server.js`) both read, so a socket can never land in a
 * different workspace than the page that opened it.
 *
 * THREE SCOPES, told apart by the path alone:
 *
 *   /<siteKey>/…   a site's workspace (a dotted first segment — a site key is a hostname).
 *   /new/…         the viewer's own creation workspace — where a first site is built from, and
 *                  where anyone starts a NEW site from a design inspiration. No site row, no seat
 *                  on any site: one personal folder under `config.onboardingHome` on the default
 *                  host's dsh, registered by the seat door (`vendor/tracy/dsh-passwords/src/tracy/seat-home.ts`).
 *   /…             the root: a site is recovered from the Referer or the `tracy_site` pointer
 *                  (dsh serves a site with `<base href="/">`, so its assets ask at the root), else
 *                  this is a landing decision — sign in, the guest site, the first site held, or
 *                  the creation workspace for a signed-in viewer who holds none.
 *
 * WHY A PATH AND NOT A COOKIE FOR THE CREATION WORKSPACE. Until 13/09 the onboarding lane was
 * entered only through `/agent?inspiration=…&platform=…`, and only that ONE request knew it: the
 * page it answered had `<base href="/">`, so every asset, plugin module, RPC and the socket came
 * back as root requests carrying no intent, fell into the no-site branch, and got 404 — a blank
 * page with nothing in any log (measured 13/09, `tasks/evidence/first-site-onboarding/`). A
 * pointer cookie would have fixed the assets and broken the next thing: two tabs — one on a site,
 * one creating — share cookies, and last-cookie-wins moves one tab's socket into the other's
 * workspace. Under `/new/` dsh anchors `<base href="/new/">` (the gateway honours
 * `x-forwarded-prefix` when the forwarded path still carries it), so every sub-request of that
 * page names its scope by construction, and no tab can change another's.
 *
 * `/agent` is the Worker-era entry (`workers/cowork-web` rewrote it to `/`; dsh itself serves only
 * `/` and `/s/<id>`, measured 13/09: `/agent` is a dsh 404). It survives here as an alias: at the
 * root with a build intent it becomes `/new/?…`; anywhere else it is `/`.
 */

import { parseCookies } from '../lib/cookies.js'
import { hmacHex } from '../lib/hmac.js'

/** The mount every creation-workspace request is anchored under, and the seat-cookie scope it carries. */
export const ONBOARDING_MOUNT = '/new'
export const ONBOARDING_SCOPE = 'onboarding'
/**
 * The site half of the creation seat's account name at the door: `seatUsername` appends a hash of
 * it, so this seat is a DIFFERENT account from every site seat the same person holds — its own
 * permission row, its own folder — while a revoke by address still reaches it (prefix scan).
 */
export const ONBOARDING_SITE = '~onboarding'
/**
 * The toolsets a creation seat holds: `content` and nothing more. In the lane that is a
 * `workspace-write` sandbox on the personal folder, no terminal socket, no git download, no
 * workspace creation, no upload (`permissionsFor` in `vendor/tracy/dsh-passwords/src/tracy/seat.ts`).
 * Nothing here needs more — the Build tab creates the site through `POST /api/sites` with the
 * viewer's own session cookie, and the site's work happens in the site's own workspace after the
 * handoff. Sent EXPLICITLY, because an absent list means "the role's default" at the door.
 */
export const ONBOARDING_TOOLSETS = Object.freeze(['content'])

const SITE_PATH = /^\/([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)(\/.*)?$/
const MOUNT_PATH = /^\/new(\/.*)?$/

// dsh's own root files that happen to share the exact shape a site key has (one dotted segment,
// no further slash) — measured live: without this exclusion, a request for either gets treated
// as "the path names a site called manifest.webmanifest", minted a seat and mounted as a prefix,
// instead of falling through to the Referer/cookie resolution these dsh-served files actually
// need. Ported as a negative list from the pre-inversion `DSH_PATHS` allowlist
// (`workers/cowork-web/src/worker.js:39-40`), now that dsh owns everything else.
export const DSH_ROOT_FILES = new Set(['manifest.webmanifest', 'favicon.svg'])

/** A catalog id, or a site's own brand (`brand:<host>`) — the shape `@tracy/core/tab-link` accepts. */
const INSPIRATION_ID = /^[a-z0-9][a-z0-9-]*(?::[a-z0-9][a-z0-9.-]*)?$/
/**
 * The platforms a site can be BORN as through this door.
 *
 * It must stay the same set `sites/route.js` builds (`CREATE_PLATFORMS`): a platform this door
 * refuses is a presser who lands on the landing page with nothing said, and a platform it admits
 * that the create door then refuses is a form that answers with a refusal after the questions.
 * EmDash joined on 16/09 — it has built sites since the template cards landed, and a card whose
 * only platform is EmDash (Tracy SaaS) is unreachable without it.
 */
const INTENT_PLATFORMS = new Set(['joomla', 'wordpress', 'emdash'])

/**
 * dsh serves `/` and `/s/<id>`, never `/agent`: the Worker-era shell path is folded to `/` so a
 * link written for the Worker keeps opening a workspace instead of a dsh 404.
 * @param {string} rest
 * @returns {string}
 */
function shellPath(rest) {
  return rest === '/agent' || rest === '/agent/' ? '/' : rest
}

/**
 * What a path names, with no session and no cookie consulted: the scope, the mount dsh must be
 * told about, and the rest of the path for dsh to answer.
 * @param {string} pathname
 * @returns {{scope: 'site'|'onboarding'|'root', siteKey: string|null, mount: string, rest: string}}
 */
export function scopeForPath(pathname) {
  const mounted = MOUNT_PATH.exec(pathname)
  if (mounted) {
    const rest = mounted[1] && mounted[1] !== '' ? mounted[1] : '/'
    return { scope: ONBOARDING_SCOPE, siteKey: null, mount: ONBOARDING_MOUNT, rest: shellPath(rest) }
  }
  const m = SITE_PATH.exec(pathname)
  if (m && !DSH_ROOT_FILES.has(m[1])) {
    const rest = m[2] && m[2] !== '' ? m[2] : '/'
    return { scope: 'site', siteKey: m[1], mount: `/${m[1]}`, rest: shellPath(rest) }
  }
  return { scope: 'root', siteKey: null, mount: '', rest: pathname }
}

/**
 * The build intent a query string carries, or null. Validated here, once, with the same shapes
 * `@tracy/core/tab-link`'s `parseTabLink` accepts — a platform this door cannot build is not an
 * intent, so it never opens the creation workspace on a promise nothing behind it can keep.
 * @param {string|URLSearchParams} search
 * @returns {{inspiration: string, platform: string}|null}
 */
export function buildIntentOf(search) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search)
  const inspiration = params.get('inspiration') ?? ''
  const platform = params.get('platform') ?? ''
  if (!INSPIRATION_ID.test(inspiration) || !INTENT_PLATFORMS.has(platform)) return null
  return { inspiration, platform }
}

/**
 * The grant the seat door is asked for on behalf of one signed-in viewer's creation workspace.
 * `home` is a ROOT: the door makes `<home>/<account name>` under it, registers that one folder
 * as a workspace, and grants exactly that folder — never `home` itself.
 * @param {string} email
 * @param {{onboardingHome: string}} config
 * @returns {{role: string, email: string, folders: string[], home: string, site: string, toolsets: string[]}}
 */
export function onboardingGrant(email, config) {
  return {
    role: 'editor',
    email,
    folders: [],
    home: config.onboardingHome,
    site: ONBOARDING_SITE,
    toolsets: [...ONBOARDING_TOOLSETS]
  }
}

/**
 * A short, keyed digest of WHAT a seat cookie was minted for: the subject, the scope, the role,
 * the toolsets and folders. It rides in the cookie beside the lane's own token, and a request
 * whose live answer digests differently — a role changed, a policy narrowed, another account
 * signed in on the same browser — is treated as holding no cookie at all, so the door is asked
 * again. Keyed with the session secret, so a browser cannot write one that matches.
 * @param {object} grant - the grant as it would be sent to the door.
 * @param {string} scope - the cookie scope (`onboarding`, or a site's scope).
 * @param {string} secret - `config.sessionSecret`.
 * @returns {Promise<string>} 24 hex characters.
 */
export async function grantFingerprint(grant, scope, secret) {
  const shape = JSON.stringify({
    scope,
    email: (grant.email ?? '').toLowerCase(),
    role: grant.role,
    site: grant.site ?? null,
    home: grant.home ?? null,
    folders: [...(grant.folders ?? [])].sort(),
    toolsets: grant.toolsets ? [...grant.toolsets].sort() : null
  })
  return (await hmacHex(secret, `seat-fingerprint\n${shape}`)).slice(0, 24)
}

const COOKIE_SEP = '~'

/** The cookie value: the fingerprint, a separator the lane's JWT never contains, and the token. */
export function seatCookieValue(fingerprint, token) {
  return `${fingerprint}${COOKIE_SEP}${token}`
}

/**
 * The lane token a seat cookie carries, or null when there is no cookie, it was minted for a
 * different grant, or it predates the fingerprint (a bare token from before 13/09 — one re-mint
 * on the next request, and nothing else).
 * @param {string|null} cookieHeader
 * @param {string} name - the cookie's name (`seatTokenCookieName`).
 * @param {string} fingerprint - what `grantFingerprint` answers for the grant in force now.
 * @returns {string|null}
 */
export function seatTokenFromCookie(cookieHeader, name, fingerprint) {
  const raw = parseCookies(cookieHeader).get(name)
  if (!raw) return null
  const at = raw.indexOf(COOKIE_SEP)
  if (at <= 0) return null
  return raw.slice(0, at) === fingerprint ? raw.slice(at + 1) : null
}

/**
 * Whether a request keeps its mount on the forwarded path — the ONE condition dsh's webserver puts
 * on honouring `x-forwarded-prefix` (`unmount`, `packages/host/webserver/src/index.ts:58`: the
 * header is believed only while the path still begins with it). With the mount kept, dsh answers
 * `<base href="<mount>/">`, scopes its seat cookie to `Path=<mount>` and writes `<mount>/s/<id>`
 * on the address bar; without it, dsh runs at the root under `<base href="/">`.
 *
 * The creation workspace has always kept it (13/09 — see the module note). A site named on the
 * path keeps it since 20/09 (tasks/pa-dia-chi-mot-duong-cho-site.md, Part A): it was live on 13
 * lanes from 05/09 in the Worker era (KV `prefix:<label>`), came across the port as the column
 * `site.prefix_aware` that nothing read, and a site went back to the root "as before" — where
 * "before" was before 05/09. Two tabs on two sites shared one root-scoped seat cookie again, the
 * very failure the creation workspace was mounted to avoid.
 *
 * A site the POINTER cookie or the Referer resolved (`named: false`, `mount: ''`) has nothing to
 * keep: a page still on the old shape asks for `/assets/…` at the root, and is served there.
 * `prefixed: false` is `site.prefix_aware = false` — the way out for one site, no deploy.
 * @param {{scope: string, mount: string}} located
 * @param {{prefixed?: boolean}} [opts]
 * @returns {boolean}
 */
export function keepsMount(located, opts = {}) {
  if (located.scope === ONBOARDING_SCOPE) return true
  return located.scope === 'site' && located.mount !== '' && opts.prefixed !== false
}

/**
 * The upstream URL a request is forwarded to — the mount kept on the path whenever `keepsMount`
 * says so, the rest forwarded exactly as it came.
 * @param {string} dshOrigin
 * @param {{scope: string, mount: string, rest: string}} located
 * @param {string} search - the query string, `?…` or ''.
 * @param {{prefixed?: boolean}} [opts] - `prefixed: false` for a site whose row switched the prefix off.
 * @returns {URL}
 */
export function upstreamUrl(dshOrigin, located, search, opts = {}) {
  const target = new URL(dshOrigin)
  target.pathname = keepsMount(located, opts) ? `${located.mount}${located.rest}` : located.rest
  target.search = search
  return target
}
