import {
  SESSION_COOKIE,
  SHARD_SESSION_PREFIX,
  VIEW_COOKIE,
  clearSessionCookie,
  clearViewCookie,
  cookieDomainFor
} from './session.js'

export function parseCookies(header) {
  const out = new Map()
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out.set(part.slice(0, i).trim(), part.slice(i + 1).trim())
  }
  return out
}

export const SEAT_TOKEN_PREFIX = 'tracy_tok_'
const cookieSafe = (s) => s.replace(/[^a-z0-9]/gi, '_').toLowerCase()

/**
 * The seat-token cookie's own name, unique per (dsh, site) so two sites on the same dsh never
 * collide. Both halves go through `cookieSafe` — not just `dshOrigin` — so the guarantee (no `;`
 * or whitespace can ride into a `Set-Cookie` header) holds regardless of what a caller passes as
 * `scope`, not only for today's one call site.
 */
export function seatTokenCookieName(dshOrigin, scope) {
  return `${SEAT_TOKEN_PREFIX}${cookieSafe(new URL(dshOrigin).host)}__${cookieSafe(scope)}`
}

/**
 * The comment picker's continuation on a customer site's hostname (`bar/preview.js`). `__Host-`
 * makes the browser keep it host-only, `Secure` and `Path=/`; a plain-HTTP stand cannot hold a
 * `__Host-` cookie at all, so there it is written without the prefix (`previewCookieName`).
 */
export const PREVIEW_COOKIE = '__Host-tracy_pv'

/** `__Host-tracy_pv` over https, `tracy_pv` on a plain-HTTP stand. */
export function previewCookieName(secure) {
  return secure ? PREVIEW_COOKIE : PREVIEW_COOKIE.slice('__Host-'.length)
}

/**
 * @param {string} value - from `mintPreviewContinuation`.
 * @param {{secure: boolean, maxAge: number}} opts - `maxAge` in seconds: what is left of the
 *   continuation, which lapses with the session it was issued under (`continuationExpiry`).
 */
export function previewCookie(value, { secure, maxAge }) {
  const age = Math.max(0, Math.floor(maxAge))
  return `${previewCookieName(secure)}=${value}; Path=/;${secure ? ' Secure;' : ''} HttpOnly; SameSite=Lax; Max-Age=${age}`
}

/**
 * 🔒 THE ONE `tracy_` NAME A CUSTOMER SITE OWNS: `tracy_style`. Tracy Business themes set it to keep
 * a previewed design system (`?style=<id>`) for a day as the visitor moves between pages (Joomla
 * `tpl_tracy/resolve.php`, WordPress `tracy-base/functions.php`); dropped by the proxy, every page
 * after the first fell back to the template's own look. Tracy never mints or reads it.
 *
 * Exact and case-sensitive, as a browser and PHP's `$_COOKIE` tell names apart: `Tracy_Style` or
 * `tracy_style_extra` is not the theme's cookie and stays under the prefix rule below. Only the
 * site path opens it (`{ site: true }`): dsh has no use for a site's cookie.
 */
const SITE_OWNED_NAMES = new Set(['tracy_style'])

/**
 * Whether a cookie name is Tracy's, so it never crosses between the browser and what Tracy proxies
 * to. The rule is a prefix, case-insensitive, so a Tracy cookie added tomorrow is covered too:
 * `tracy_*`, `__Host-tracy_*` (`__Host-tracy_pv`, `__Host-tracy_shard` do not start with
 * `tracy_`), and dsh's own `dsh_gateway_token`.
 * @param {string} name
 * @param {{site?: boolean}} [opts] - `site`: the other end is a customer site, which owns
 *   `SITE_OWNED_NAMES`.
 */
export function isTracyCookieName(name, { site = false } = {}) {
  const trimmed = name.trim()
  if (site && SITE_OWNED_NAMES.has(trimmed)) return false
  const lower = trimmed.toLowerCase()
  return lower.startsWith('tracy_') || lower.startsWith('__host-tracy_') || lower === 'dsh_gateway_token'
}

/**
 * What dsh (or a customer site's own copy) may see: every cookie that is not Tracy's
 * (`isTracyCookieName`), plus the seat token under dsh's own name. Forwarding one of Tracy's would
 * hand the other end a value it has no use for, or one it could replay. A customer site
 * (`{ site: true }`) also gets back the one `tracy_` cookie it set itself, `tracy_style`.
 * @param {string | null | undefined} incoming
 * @param {string | null} seatToken
 * @param {{site?: boolean}} [opts]
 */
export function outgoingCookieHeader(incoming, seatToken, { site = false } = {}) {
  const kept = (incoming ?? '')
    .split(';')
    .map((c) => c.trim())
    .filter((c) => c !== '' && !isTracyCookieName(c.split('=')[0], { site }))
  if (seatToken) kept.push(`dsh_gateway_token=${seatToken}`)
  return kept.length > 0 ? kept.join('; ') : null
}

/** dsh plants its seat cookie as `dsh_gateway_token`; the browser must see it under Tracy's own name. */
export function relabelSetCookie(setCookies, name) {
  return setCookies.map((c) =>
    c.startsWith('dsh_gateway_token=') ? `${name}=${c.slice('dsh_gateway_token='.length)}` : c
  )
}

/**
 * The site pointer — which site a root-path request means. Written by `workspace/route.js` when a
 * site page is served, read by its resolver, and forgotten by BOTH that route (a pointer to a site
 * the viewer holds no seat on, or that no longer exists) and `identity/route.js` (sign-out: the
 * pointer belongs to the person who set it). Defined here because two domains need it and a
 * domain never imports another (`test/module-graph.test.mjs`).
 */
export const SITE_COOKIE = 'tracy_site'
const SITE_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60 // 2,592,000 — same span as cowork-web's own tracy_site

/** @param {string} siteKey @param {{secure?: boolean}} config */
export function siteCookie(siteKey, config) {
  return `${SITE_COOKIE}=${siteKey}; Path=/; SameSite=Lax;${config.secure ? ' Secure;' : ''} Max-Age=${SITE_COOKIE_MAX_AGE_S}`
}

/** The `set-cookie` value that forgets the pointer — same attributes as `siteCookie`, or the browser keeps the old one. */
export function clearSiteCookie(config) {
  return `${SITE_COOKIE}=; Path=/; SameSite=Lax;${config.secure ? ' Secure;' : ''} Max-Age=0`
}

/** Attributes every seat-token cookie carries; `HttpOnly` because the value holds the lane's token. */
const seatAttrs = (config) => `Path=/; HttpOnly; SameSite=Lax;${config.secure ? ' Secure;' : ''}`
const SEAT_COOKIE_MAX_AGE_S = 12 * 60 * 60 // 43,200 — one working day; a lapsed seat is re-minted silently while the session holds

/** @param {string} name - from `seatTokenCookieName` @param {string} value - from `scope.js`'s `seatCookieValue` */
export function seatCookie(name, value, config) {
  return `${name}=${value}; ${seatAttrs(config)} Max-Age=${SEAT_COOKIE_MAX_AGE_S}`
}

/** The `set-cookie` value that forgets one seat-token cookie. */
export function clearSeatCookie(name, config) {
  return `${name}=; ${seatAttrs(config)} Max-Age=0`
}

/** The framed widget visitor acquires account authority after inline sign-in. */
export const WIDGET_COOKIE = 'tracy_widget'
const widgetAttrs = (config) =>
  `Path=/widget; HttpOnly; ${config.secure ? 'Secure; SameSite=None; Partitioned' : 'SameSite=Lax'}`

/** A host-only visitor, partitioned by the embedding site on HTTPS. Never a domain cookie. */
export function widgetCookie(id, config) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new TypeError('Invalid widget visitor id')
  return `${WIDGET_COOKIE}=${id}; ${widgetAttrs(config)}; Max-Age=86400`
}

/** Clear the same host/path/partition as the visitor cookie when the person signs out. */
export function clearWidgetCookie(config) {
  return `${WIDGET_COOKIE}=; ${widgetAttrs(config)}; Max-Age=0`
}

/**
 * THE COOKIE LEDGER — every cookie this app writes into a person's browser, and whether it may
 * outlive their sign-out.
 *
 * WHY A LEDGER. `tracy_site` survived sign-out for weeks and nobody noticed, because nothing
 * anywhere said "this cookie belongs to the person, clear it with them" — the cookie was minted
 * in one file, the sign-out door lived in another, and no test asked the two to agree. Measured
 * 14/09: account B, fresh from sign-in on a browser A had used, got "Ask to join <A's site>" as
 * its first screen. `test/cookie-ledger.test.mjs` holds three rules against this list:
 *
 *   1. `Max-Age=` (the attribute every minted cookie needs) may appear only in the files named in
 *      `mintedIn` below — a cookie written by hand elsewhere is red before it is reviewed.
 *   2. Every `*_COOKIE` / `*_PREFIX` constant exported under `src/` has a row here.
 *   3. `POST /auth/signout` is called with every row's cookie present, and every row with
 *      `outlivesSignout: false` must come back cleared. Adding a row without wiring the door is
 *      red; adding a person-bound cookie without a row is red by rule 2.
 *
 * `outlivesSignout: true` needs a `why` — a cookie that stays after the person left has to say
 * what it is for, in the one place the next reader will look.
 */
/** The press as a cookie — `intentCookie` below says why and how long. */
export const INTENT_COOKIE = 'tracy_intent'

/**
 * The shard pointer (docs/sre/2026-10-15-shard-beta-design.md §1; docs/sre/hop-dong-cua-shard.md §3):
 * which shard this browser's person lives on, so a visit to one of the master's own pages is sent
 * there (`shards/route-cookie.js`). `__Host-` makes the browser keep it host-only (no `Domain`),
 * `Secure` and `Path=/`, and REFUSE any copy a customer site under the parent domain tries to plant
 * (the precedent is `__Host-tracy_pv`); a plain-HTTP stand cannot hold a `__Host-` cookie at all, so
 * there it is written without the prefix (`shardCookieName`). ONLY THE MASTER sets or clears it — a
 * shard never does. A year, HttpOnly, not a secret: only a value the `shard` table holds is acted
 * on. It OUTLIVES sign-out: the next sign-in here goes straight back to the same shard; `?stay=1`
 * on the master is what drops it.
 */
export const SHARD_COOKIE = '__Host-tracy_shard'
const SHARD_COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60

/** `__Host-tracy_shard` over https, `tracy_shard` on a plain-HTTP stand. */
export function shardCookieName(secure) {
  return secure ? SHARD_COOKIE : SHARD_COOKIE.slice('__Host-'.length)
}

/**
 * The nonce of one handoff ticket (spec §4.3, review amendment 2, contract §3, §4): 32 hex, sixty
 * seconds, `Path=/` and `Domain=` the session domain so the shard's `/handoff` reads it, never in a
 * URL. The shard clears it after the swap with `clearHandoffCookie`; sign-out clears it too. A
 * `tracy_` name on purpose: the site door strips every `tracy_` cookie before a customer's container
 * sees a request.
 */
export const HANDOFF_COOKIE = 'tracy_handoff'

const sharedAttrs = ({ domain, secure }) =>
  `Path=/; HttpOnly; SameSite=Lax;${secure ? ' Secure;' : ''}${domain ? ` Domain=${domain};` : ''}`

/**
 * @param {string} name - a shard name the caller read from the `shard` table.
 * @param {{secure?: boolean}} opts - only `secure` is read: the pointer is host-only, never `Domain=`.
 */
export function shardCookie(name, { secure }) {
  return `${shardCookieName(secure)}=${name}; ${sharedAttrs({ secure })} Max-Age=${SHARD_COOKIE_MAX_AGE_S}`
}

export function clearShardCookie({ secure }) {
  return `${shardCookieName(secure)}=; ${sharedAttrs({ secure })} Max-Age=0`
}

/** @param {string} nonce - 32 hex, from `shards/adopt-client.js`. */
export function handoffCookie(nonce, opts) {
  return `${HANDOFF_COOKIE}=${nonce}; ${sharedAttrs(opts)} Max-Age=60`
}

export function clearHandoffCookie(opts) {
  return `${HANDOFF_COOKIE}=; ${sharedAttrs(opts)} Max-Age=0`
}

/**
 * Every place a second `tracy_handoff` may hide (contract §3.1 (3)): a site under the parent domain
 * can plant `Domain=<parent>; Path=/handoff` or `Path=/`, and a browser keeps each (name, domain,
 * path) copy apart, so clearing only the `Path=/` one leaves the planted one to break every later
 * handoff. One clearing line per copy: parent `Domain` and host-only, on `Path=/` and `Path=/handoff`.
 */
export function clearHandoffCookieEverywhere({ domain, secure }) {
  const lines = []
  for (const withDomain of domain ? [true, false] : [false])
    for (const path of ['/', '/handoff'])
      lines.push(
        `${HANDOFF_COOKIE}=; Path=${path}; HttpOnly; SameSite=Lax;${secure ? ' Secure;' : ''}` +
          `${withDomain ? ` Domain=${domain};` : ''} Max-Age=0`
      )
  return lines
}

/** A shard's own session cookie cleared with exactly the attributes `lib/session.js` writes `tracy_sess` with. */
const clearNamedSessionCookie = (name, opts) =>
  `${name}${clearSessionCookie(opts).slice(SESSION_COOKIE.length)}`
/** A shard's session cookie name as the installer writes it (`tracy_sess_<shard>`, contract §3). */
const SHARD_SESSION_NAME = /^tracy_sess_[a-z][a-z0-9]{0,15}$/

export const COOKIE_LEDGER = [
  {
    name: WIDGET_COOKIE,
    mintedIn: 'lib/cookies.js',
    outlivesSignout: false
  },
  {
    name: 'tracy_download_request',
    mintedIn: 'desktop/update-feed.js',
    outlivesSignout: true,
    why:
      'a host-only fifteen-minute retry token on the sessionless update host, scoped to /desktop; ' +
      'it groups installer requests and carries no account identity or authorization, so signing ' +
      'out on the separate cowork host does not need to clear it'
  },
  {
    name: 'tracy_invitations_gmail_state',
    mintedIn: 'invitations/gmail.js',
    outlivesSignout: true,
    why:
      'a ten-minute Gmail OAuth nonce scoped to the callback path; the callback also verifies the ' +
      'original session hash and operator identity, so it cannot authorize a different signed-in ' +
      'person after sign-out; the callback clears it and the pending state expires independently'
  },
  {
    name: 'tracy_sess',
    mintedIn: 'lib/session.js',
    outlivesSignout: false
  },
  {
    // An admin's read-only view of a customer (`/ops` › View as user): thirty minutes, and it must
    // not survive the admin signing out — it would keep reading as the customer with nobody behind it.
    name: VIEW_COOKIE,
    mintedIn: 'lib/session.js',
    outlivesSignout: false
  },
  {
    // A shard's own session cookie, `tracy_sess_<shard>` (`SESSION_COOKIE_NAME`): minted and cleared
    // by the same two functions as `tracy_sess`, under the name the config gives them.
    prefix: SHARD_SESSION_PREFIX,
    mintedIn: 'lib/session.js',
    outlivesSignout: false
  },
  {
    name: SITE_COOKIE,
    mintedIn: 'lib/cookies.js',
    outlivesSignout: false
  },
  {
    prefix: SEAT_TOKEN_PREFIX,
    mintedIn: 'lib/cookies.js',
    // Bound to the signed-in email through `grantFingerprint`, so another account cannot use it —
    // but a token for a person who left has no business sitting in the jar for twelve hours.
    outlivesSignout: false
  },
  {
    name: 'tracy_oauth_state',
    mintedIn: 'identity/oauth.js',
    outlivesSignout: true,
    why:
      'a minutes-long CSRF nonce for one OAuth round trip, cleared by the callback that consumes it; ' +
      'a sign-out mid-flow leaves a state the callback refuses on its own, and clearing it here would ' +
      'break a person who signs out in one tab while finishing sign-in in another'
  },
  {
    name: 'tracy_signin_browser',
    mintedIn: 'identity/signin-guard.js',
    outlivesSignout: true,
    why:
      'a random id of this browser, host-only and scoped to /signin, that the desktop round pages bind ' +
      'their pre-sign-in form tokens to; it names no person and no round, so it carries nothing a ' +
      'sign-out should take away, and clearing it would only break a round the person is finishing in ' +
      'another tab'
  },
  {
    name: 'tracy_invitations_gmail_state',
    mintedIn: 'invitations/gmail.js',
    outlivesSignout: true,
    why:
      'the same ten-minute CSRF state as tracy_oauth_state, for one Gmail connect round trip in /ops, ' +
      'path-scoped to its callback and cleared by it; a sign-out mid-flow leaves a state the callback ' +
      'refuses on its own (it also checks the admin seat and the encrypted state)'
  },
  {
    name: SHARD_COOKIE,
    mintedIn: 'lib/cookies.js',
    outlivesSignout: true,
    why:
      'names which shard holds the sites of the person who uses this browser, nothing more: it opens ' +
      'nothing, only a name the shard table holds is acted on, and keeping it through sign-out sends the ' +
      'next sign-in on the master straight back to that shard; ?stay=1 on the master drops it. ' +
      'Host-only (__Host-), set and read by the master alone (docs/sre/hop-dong-cua-shard.md §3)'
  },
  {
    name: HANDOFF_COOKIE,
    mintedIn: 'lib/cookies.js',
    outlivesSignout: false
  },
  {
    name: INTENT_COOKIE,
    mintedIn: 'lib/cookies.js',
    outlivesSignout: true,
    why:
      'a two-minute note of what was pressed on the public page, read once by the side card on the ' +
      'page load it was written for and deleted there; it names an inspiration and a CMS, nothing about ' +
      'the person, and a sign-out inside those two minutes leaves a note the next visitor cannot act on ' +
      'without a seat of their own'
  },
  {
    name: PREVIEW_COOKIE,
    mintedIn: 'lib/cookies.js',
    outlivesSignout: true,
    why:
      "written on a CUSTOMER SITE's hostname by the site proxy when the comment picker's ticket is " +
      "redeemed, so the sign-out door on Tracy's own hostname cannot clear it; it is inert without the " +
      'session it names, because every page load compares its seat hash with the live session and seat, ' +
      'and it lapses on its own with the session it was issued under'
  },
  {
    name: 'tracy_lang',
    // This app never writes it: `@tracy/dsh-settings` does, in the browser, on an explicit pick
    // in Settings › Language. The row names the one file that reads it (#753).
    mintedIn: 'lib/i18n/index.js',
    outlivesSignout: true,
    why:
      'a language id written by the dsh page only when the person picks a language in Settings, read ' +
      'by the sign-in pages and mails so a signed-out reload of /login speaks the language they chose; ' +
      'it names a language, nothing about the person, and clearing it at sign-out would hand the next ' +
      'sign-in page back to the browser language the person had overridden'
  },
  {
    name: 'tracy_badge_off',
    mintedIn: 'lib/seat-badge.js',
    outlivesSignout: true,
    why:
      "written by the seat pill's script IN THE VISITOR'S BROWSER, on the customer site's own hostname, " +
      'as a day-long "hide this badge" — this app never receives it and cannot clear a cookie on a ' +
      'hostname it does not answer for; it is a mood about a pill, not anything bound to the person'
  }
]

/**
 * Every `set-cookie` value sign-out must send: the session, the site pointer, and each seat-token
 * cookie the browser actually presented (their names are per site, so they are read off the
 * request rather than guessed). One value per header — a browser refuses a comma-joined pair.
 * Two doors sign out — `POST /auth/signout` and the dsh-passwords card's own Sign out
 * (`workspace/route.js`) — and both send exactly this list. On both sides of the shard model this
 * is the one list (docs/sre/hop-dong-cua-shard.md §3): a shard also clears its own
 * `tracy_sess_<name>`, the master every `tracy_sess_<n>` the browser presents; a presented
 * `tracy_handoff` goes; `__Host-tracy_shard` stays.
 * @param {string|null|undefined} cookieHeader - the request's `cookie` header.
 * @param {{secure?: boolean, sessionDomain?: string, deploymentRole?: string, sessionCookieName?: string}} config
 * @param {string|null|undefined} host - the request's `Host`: which `Domain=` the session cookie
 *   was written with (`cookieDomainFor`), so the clearing one matches it.
 * @returns {string[]}
 */
export function signOutCookies(cookieHeader, config, host) {
  const domain = cookieDomainFor(host, config.sessionDomain)
  const opts = { domain, secure: config.secure }
  const presented = parseCookies(cookieHeader)
  const out = [
    clearSessionCookie(opts),
    clearViewCookie(opts),
    clearSiteCookie(config),
    clearWidgetCookie(config)
  ]
  // A shard's own session (`SESSION_COOKIE_NAME=tracy_sess_<name>`, read by the shard half into
  // `config.sessionCookieName`).
  const own = config.deploymentRole === 'shard' ? config.sessionCookieName : null
  if (typeof own === 'string' && own !== SESSION_COOKIE && own.startsWith(`${SESSION_COOKIE}_`))
    out.push(clearNamedSessionCookie(own, opts))
  // The master clears every shard session the browser presents (contract §3, N3): on a shared
  // machine the next person must not open `s1.<parent>` signed in as the one who just left.
  if (config.deploymentRole !== 'shard')
    for (const name of presented.keys())
      if (SHARD_SESSION_NAME.test(name)) out.push(clearNamedSessionCookie(name, opts))
  // The nonce of a ticket still on its way; the shard pointer (`__Host-tracy_shard`) deliberately stays.
  if (presented.has(HANDOFF_COOKIE)) out.push(clearHandoffCookie(opts))
  for (const name of presented.keys()) {
    if (name.startsWith(SEAT_TOKEN_PREFIX)) out.push(clearSeatCookie(name, config))
  }
  return out
}

/**
 * The press, as a cookie, for a page entered already on its session (`workspace/route.js`, the
 * creation door). Not HttpOnly: `@tracy/dsh-tab-link` reads it once on arrival and deletes it.
 * Not a permission — it names what to build; the seat says whether one may. Two minutes: it is
 * read within the page load it was written for, and one left standing would turn the next plain
 * visit to `/new/` into a press. `Path=/new` (no slash), which matches `/new/` and `/new/s/<id>`;
 * the plugin deletes it on the same path, so the two must not drift.
 * @param {{inspiration: string, platform: string}} intent
 */
export function intentCookie(intent, config) {
  const value = encodeURIComponent(
    new URLSearchParams({ inspiration: intent.inspiration, platform: intent.platform }).toString()
  )
  return `${INTENT_COOKIE}=${value}; Path=/new; SameSite=Lax;${config.secure ? ' Secure;' : ''} Max-Age=120`
}
