import { Hono } from 'hono'
import {
  clearSeatCookie,
  clearSiteCookie,
  intentCookie,
  parseCookies,
  seatCookie,
  seatTokenCookieName,
  signOutCookies,
  SITE_COOKIE,
  siteCookie
} from '../lib/cookies.js'
import { requestLanguage } from '../lib/i18n/index.js'
import { opsFor } from '../lib/ops-signal.js'
import { roleOnSite } from '../lib/role-on-site.js'
import { toolsetsOn } from '../lib/role-policy.js'
import { siteSeatGrant } from '../lib/seat-grant.js'
import { sessionFromCookieHeader, sessionWithExpiry } from '../lib/session.js'
import { dshRpc, usernameOfToken } from '../lib/dsh-rpc.js'
import { signInSource, sourceQuery } from '../lib/sign-in-source.js'
import { referrerOf } from '../lib/referrer.js'
import { isDesktopApp } from '../lib/desktop-surface.js'
import { IMPORT_NOT_FINISHED, importRecoveryPath } from '../lib/import-pending.js'
import { forwardHttp } from './proxy.js'
import { forwardModelHttp } from './model-policy.js'
import {
  buildIntentOf,
  DSH_ROOT_FILES,
  grantFingerprint,
  ONBOARDING_MOUNT,
  ONBOARDING_SCOPE,
  onboardingGrant,
  scopeForPath,
  seatCookieValue,
  seatTokenFromCookie,
  upstreamUrl,
  keepsMount
} from './scope.js'
import { mintSeatSession } from './seat-door.js'
import { TEMPLATE_DOORS, resolveTemplate } from './template-intent.js'

export { DSH_ROOT_FILES } from './scope.js'

// The one path under a mount answered to a viewer with no session — dsh-passwords' own
// `PUBLIC_MANIFEST_PATH` (`anonymousManifest` below says why).
const PUBLIC_MANIFEST_PATH = '/manifest.webmanifest'

// dsh-passwords' own sign-out door and password page, under a mount (the card's Sign out below).
const DSH_LOGOUT = '/gateway/logout'
const DSH_PASSWORD_PAGE = '/gateway/login'

/**
 * Split a path into the site it names (a dotted first segment, unless it's one of dsh's own
 * root files) and what's left for that site's dsh to answer. Anything else — `/`, `/agent`,
 * `/assets/x.js` — is the root: mount `''`. The creation workspace (`/new/…`) is a third scope
 * `scopeForPath` tells apart; this older shape keeps answering "no site" for it, which is what
 * every caller of THIS function (the Referer rule below, `bar/`) means by the question.
 *
 * @param {string} pathname - the request path.
 * @returns {{siteKey: string|null, mount: string, rest: string}} the split.
 */
export function resolveSite(pathname) {
  const located = scopeForPath(pathname)
  if (located.scope !== 'site') return { siteKey: null, mount: '', rest: pathname }
  return { siteKey: located.siteKey, mount: located.mount, rest: located.rest }
}

/**
 * The site named by a same-origin Referer page (`/<siteKey>` or `/<siteKey>/…`), or null.
 *
 * Ported from `siteFromReferer` in `workers/cowork-web/src/worker.js` — since 06/09 dsh IS the
 * shell (ADR 0014 §1), so a root asset path (`/assets/x.js`, from `<base href="/">`) names no
 * site on its own; the page that requested it is the only place the site survives.
 *
 * @param {string|null} refererHeader - the incoming `Referer` header, if any.
 * @param {string} origin - the request's own origin; a cross-origin Referer is never trusted.
 * @returns {string|null} the site, or null.
 */
export function siteFromReferer(refererHeader, origin) {
  if (!refererHeader) return null
  let referer
  try {
    referer = new URL(refererHeader)
  } catch {
    return null
  }
  if (referer.origin !== origin) return null
  return resolveSite(referer.pathname).siteKey
}

/** Cookie that remembers the last site a viewer opened. A pointer, not a credential — every
 * request still asks the seat door about the real siteKey; a forged cookie only changes which
 * site gets asked, never the answer. */
// The pointer cookie itself lives in `lib/cookies.js` — `identity/route.js` forgets it on sign-out,
// and a domain never imports another. Re-exported so this route's callers and tests keep one name.
export { SITE_COOKIE }

/**
 * The scope a request is in, and how to forward it — the ONE rule, shared by the HTTP route and
 * the WebSocket upgrade in `server.js` (which reaches it through `workspaceResolver` below).
 *
 * Order, as production keeps it (`workers/cowork-web/src/worker.js:455`): the path — which names
 * a site OR the creation workspace outright — then the Referer of the page that asked, then the
 * `tracy_site` pointer. Only a path-named scope owns a mount, because only it is anchored under
 * `/<siteKey>` or `/new`; a site recovered from the Referer or the cookie is answering a root path
 * (`<base href="/">`), so the path is forwarded exactly as it came.
 *
 * Since 20/09 a site page is served under its own mount too (`keepsMount`, scope.js), so its
 * assets, RPC and socket all arrive as `/<siteKey>/…` and name the site by themselves. The
 * Referer and the pointer are what a page from BEFORE that day still stands on — its socket in
 * particular: a browser sends no Referer with a WebSocket handshake, so without the pointer that
 * socket has no site and dsh never connects ("Loading workspaces..." with nothing in any log).
 * The creation workspace never had that dependency: its socket is opened under `/new/`.
 *
 * @param {{pathname: string, referer?: string|null, cookieHeader?: string|null, origin: string}} req - the request's parts.
 * @returns {{scope: 'site'|'onboarding'|'root', siteKey: string|null, mount: string, rest: string, named: boolean}} the scope and the forwarding shape.
 */
export function siteForRequest({ pathname, referer = null, cookieHeader = null, origin }) {
  const located = scopeForPath(pathname)
  if (located.scope !== 'root') return { ...located, named: true }
  const siteKey = siteFromReferer(referer, origin) ?? parseCookies(cookieHeader).get(SITE_COOKIE) ?? null
  return { scope: siteKey ? 'site' : 'root', siteKey, mount: '', rest: pathname, named: false }
}

/**
 * The seat every request in a scope is admitted on — the grant the door is asked for, the cookie
 * it lives in, and the fingerprint that ties the two together. One function for the HTTP route
 * and the socket splice, so the two can never disagree about which cookie, which host, or which
 * grant a request stands on.
 *
 * @param {object} deps - `config`, `sites`, `pool`, `seats` as `workspaceRoutes` takes them. A
 *   `workspaces` dep (the old role-policy reader) is still accepted and ignored (ADR 0028).
 * @returns {{
 *   locate: typeof siteForRequest,
 *   seatFor: (input: {located: object, email: string}) => Promise<{dsh: object, host: string|null, cookieName: string, grant: object, fingerprint: string, role: string|null}|{refused: 'no-host'|'no-seat'}>,
 *   tokenFor: (input: {seat: object, cookieHeader: string|null}) => string|null
 * }}
 */
export function workspaceResolver({ config, sites, pool = null, seats = null }) {
  // The role's FIXED toolsets (ADR 0028, `seats/roles.js`), injected because this domain may not
  // import that one: `toolsetsFor` when the composition root hands it in, `permissionsFor` (the
  // older wiring) otherwise. Neither wired is "nothing": the door reads an ABSENT list as "use the
  // role default", so a missing dependency must not be allowed to mean "whatever dsh thinks".
  const toolsetsOf = (role) => {
    if (typeof seats?.toolsetsFor === 'function') return seats.toolsetsFor(role)
    if (typeof seats?.permissionsFor === 'function') return toolsetsOn(seats.permissionsFor, role)
    return []
  }
  return {
    locate: siteForRequest,
    async canonicalize(located) {
      if (located.scope !== 'site' || typeof sites.canonicalKey !== 'function') return located
      return { ...located, siteKey: await sites.canonicalKey(located.siteKey) }
    },
    async seatFor({ located, email }) {
      if (located.scope === ONBOARDING_SCOPE) {
        const dsh = sites.dshOf(config.defaultHost)
        if (!dsh) return { refused: 'no-host' }
        const grant = onboardingGrant(email, config)
        return {
          dsh,
          host: config.defaultHost,
          cookieName: seatTokenCookieName(dsh.origin, ONBOARDING_SCOPE),
          grant,
          fingerprint: await grantFingerprint(grant, ONBOARDING_SCOPE, config.sessionSecret),
          role: grant.role
        }
      }
      // The seat's LIVE role on THIS site — the ONE question standing between a signed-in viewer
      // and a workspace, and the exact check Plan 1 skipped (this function used to hand out
      // `owner` to anyone with a valid session cookie, never asking the seat book at all: measured
      // in a browser, a revoked teammate kept the whole workspace, and a stranger who had never
      // been invited got full owner access on first visit). `roleOnSite` fails CLOSED on every
      // axis — no `pool`, no `seats`, no account, no live grant, or the lookup itself throwing all
      // answer `null` — so a missing dependency here refuses rather than falling back to a role.
      const role = await roleOnSite(pool, seats, email, located.siteKey)
      if (!role) return { refused: 'no-seat' }
      const host = await sites.hostOf(located.siteKey)
      const dsh = host ? sites.dshOf(host) : null
      if (!dsh) return { refused: 'no-host', host }
      const scope = await sites.siteScope(located.siteKey)
      // The toolset list is the seat book's answer (the role's fixed set, ADR 0028), sent as a
      // result rather than left to the lane's own role default (ADR 0001 §3) — an EMPTY list for a
      // viewer, which the door reads as read-only. Sent even when it equals that default — the
      // fingerprint below is what notices a role that moved, and it can only notice what it was told.
      const grant = siteSeatGrant({
        email,
        role,
        label: await sites.labelOf(located.siteKey),
        siteKey: located.siteKey,
        toolsets: toolsetsOf(role)
      })
      return {
        dsh,
        host,
        cookieName: seatTokenCookieName(dsh.origin, scope),
        grant,
        fingerprint: await grantFingerprint(grant, scope, config.sessionSecret),
        // `site.prefix_aware` — the per-site way out of the `/<siteKey>/` mount (`keepsMount`).
        prefixed:
          typeof sites.prefixAwareOf === 'function' ? await sites.prefixAwareOf(located.siteKey) : true,
        role
      }
    },
    tokenFor({ seat, cookieHeader }) {
      return seatTokenFromCookie(cookieHeader, seat.cookieName, seat.fingerprint)
    }
  }
}

/**
 * Everything not claimed by another domain goes to a host's dsh. Plan 2 (spec §4.3) closes the
 * gap Plan 1 left open: minting used to grant `owner` to any signed-in email, unconditionally,
 * never consulting the seat book. Now the seat's LIVE role on THIS site is what gets minted, and
 * a viewer with no live seat — no row, still pending, or revoked, `roleOnSite`'s own fail-closed
 * contract reads all three the same way — gets no session at all: redirected to that site's own
 * "ask to join" door (`seats/route.js`'s `/:label/join`) instead.
 *
 * Since 13/09 there is a second kind of workspace beside a site's: the viewer's own creation
 * workspace under `/new/` (`scope.js` says why it is a path). A signed-in viewer who holds no
 * site lands there instead of on a "no sites" page, and a build intent — from the public Design
 * inspiration page, or from the side card inside any workspace — always opens there, never in a
 * site the viewer happens to hold: creating a site must not write into an old one.
 */
// `now` isn't used yet — kept in the signature to match app.js's uniform route-builder call
// shape (identityRoutes takes one too), and to be ready the day this route needs a clock.
/** How long one visit to a site's workspace lasts for usage: page loads inside it are one `site.entered`. */
export const ENTERED_WINDOW_MS = 30 * 60_000

/**
 * The dedupe key of a `site.entered` signal: the person, the site and the half hour it fell in.
 * @param {string} email
 * @param {string} siteKey
 * @param {number} at - epoch ms
 */
export function enteredKey(email, siteKey, at) {
  return `entered:${email.toLowerCase()}:${siteKey}:${Math.floor(at / ENTERED_WINDOW_MS)}`
}

export function workspaceRoutes({
  config,
  sites,
  seatDoor = { mintSeatSession },
  pool = null,
  seats = null,
  // Tracy's own styled pages, handed in by the composition root. `bar/` is a sibling domain and
  // `test/module-graph.test.mjs` forbids reaching it from here — same route the mail templates
  // take into `seats/` and `identity/` (`app.js`'s own comment on that).
  pages = {
    noSites: null,
    workspaceUnavailable: null,
    templateLanding: null,
    templateNotOnTracy: null,
    templateLookupFailed: null
  },
  now: _now = Date.now,
  modelAccounts = undefined,
  fetchImpl = fetch,
  // A template waiting on the signed-in account (plan B6): `peek(email)` at the root landing of
  // the app, `put(email, template, platform)` when the web shows the template page (the app finds
  // it after it is installed), `take(email, template)` when the app shows it. Null where identity
  // is not wired.
  intents = null
}) {
  const app = new Hono()
  const resolver = workspaceResolver({ config, sites, pool, seats })

  // What the caller asked for, not what we would rather send. A browser NAVIGATION carries
  // `text/html` in `Accept`; the dsh client's own `fetch` does not, and handing it HTML is handing
  // it something it will parse into rubbish.
  const wantsHtml = (c) => (c.req.header('accept') ?? '').includes('text/html')

  /**
   * A workspace that cannot be provided — the creation workspace or a site's own (#796): a page for
   * a navigation, `body` for a fetch. The page carries the whole address asked for, so the retry
   * lands where the person was going; the internal cause stays in the machine answer.
   *
   * `kept` is whether pressing the retry link repeats the request: true for a GET, whose whole
   * input is its address. A form POST refused here was never passed on and its body is not in the
   * link, so that page says what was sent was not saved instead of promising nothing was lost.
   */
  /**
   * The address asked for, as a link that stays on the origin it was asked on. A pathname may
   * begin with `//` (`GET //evil.example`), and a browser reads `href="//evil.example"` as another
   * host — escaping the HTML does not change that, and a `Location` header is read the same way.
   * The leading slashes are folded into one, and the result is resolved against the request's
   * own origin to make sure of it. Used wherever the address asked for is handed back as a link
   * or a redirect to itself.
   */
  const sameOriginPath = (url) => {
    const path = `/${url.pathname.replace(/^[/\\]+/, '')}${url.search}`
    try {
      return new URL(path, url.origin).origin === url.origin ? path : '/'
    } catch {
      return '/'
    }
  }

  const unavailable = (c, email, url, body, headers = null) => {
    if (wantsHtml(c) && pages.workspaceUnavailable) {
      const response = pages.workspaceUnavailable(email, {
        retryHref: sameOriginPath(url),
        kept: c.req.method === 'GET' || c.req.method === 'HEAD',
        origin: config.origin,
        lang: requestLanguage(c)
      })
      if (headers) for (const [name, value] of new Headers(headers)) response.headers.append(name, value)
      return response
    }
    const response = c.json(body, body.code === 'HOST_NOT_CONFIGURED' ? 501 : 502)
    if (headers) for (const [name, value] of new Headers(headers)) response.headers.append(name, value)
    return response
  }

  app.all('/*', async (c) => {
    const url = new URL(c.req.url)
    const cookieHeader = c.req.header('cookie') ?? null
    // 🔒 A CREATION INTENT OUTRANKS THE SITE POINTER. `/agent?inspiration=…` and `/?inspiration=…`
    // are the doors from the public Design inspiration page, and they arrive on browsers that may
    // still carry `tracy_site` from whoever was signed in before — measured 13/09: account B,
    // fresh from sign-in with an intent, landed on "Ask to join" for account A's site, because
    // the pointer resolved the root path to A's site before the intent was ever read. The pointer
    // is a hint for a site page's root assets; it is never where a NEW site gets made.
    // `?template=<JoomlArt id>` (10/2026): joomlart.com's Download button and the JoomlArt sign-in
    // door name a template the way JoomlArt does, not as a card id + platform pair. Translate it
    // here, once, into the intent the lines below already understand (`template-intent.js`); a
    // template Tracy does not offer gets a page that points back to the member area, and a
    // catalogue that cannot be read gets "try again" — never a bare workspace, never a 404 that
    // sends a person away for a template Tracy may well offer.
    const templateAsk = url.searchParams.get('template')
    if (
      templateAsk !== null &&
      !url.searchParams.has('inspiration') &&
      TEMPLATE_DOORS.has(url.pathname) &&
      wantsHtml(c)
    ) {
      const lang = requestLanguage(c)
      let landing = null
      try {
        // `platform=` names which of a template's quickstarts the page the person came from meant
        // (joomlart.com's Joomla template page says joomla); anything else is as good as unsaid.
        const platformAsk = url.searchParams.get('platform')
        landing = pool
          ? await resolveTemplate(pool, templateAsk, {
              desktopDownloadUrl: config.desktopDownloadUrl,
              platform: ['joomla', 'wordpress', 'emdash'].includes(platformAsk ?? '') ? platformAsk : null
            })
          : null
      } catch {
        return pages.templateLookupFailed
          ? pages.templateLookupFailed({ lang })
          : c.text('Try again in a minute', 503)
      }
      if (!landing)
        return pages.templateNotOnTracy
          ? pages.templateNotOnTracy(templateAsk, { lang })
          : c.text('Not found', 404)
      // Both ways out of the landing need a session (the workspace mints a seat, the download
      // door checks the cookie), so the sign-in comes first and brings the person straight back.
      // The page the person came from (`lib/referrer.js`): kept through sign-in on `next`, and
      // handed to the Download link so the download door can record it. Staff-only data.
      const ref = referrerOf({
        ref: url.searchParams.get('ref'),
        referer: c.req.header('referer'),
        origin: config.origin
      })
      const signedIn = await sessionFromCookieHeader(cookieHeader, config.sessionSecret)
      if (!signedIn) {
        const back = new URL(url)
        if (ref) back.searchParams.set('ref', ref)
        return c.redirect(`/login?next=${encodeURIComponent(sameOriginPath(back))}`, 302)
      }
      // The web and the app draw the same page; the web adds an offer of Tracy Desktop (plan
      // tasks/todo-quickstart-desktop-only.md). The user agent only picks that offer and the
      // handoff below (`lib/desktop-surface.js`), never what the person may do.
      const desktop = isDesktopApp(c.req.header('user-agent'))
      if (intents) {
        // In the app, shown once is consumed once: it is not sent here again from the root. On the
        // web the row is WRITTEN, not consumed — whoever arrived (JoomlArt round, email code,
        // Google), the app they install next and sign in to as the same account opens this page,
        // on the same quickstart.
        if (desktop) await intents.take(signedIn, landing.template)
        else await intents.put(signedIn, landing.template, landing.platform)
      }
      if (ref && landing.downloadHref)
        landing.downloadHref = `${landing.downloadHref}?${new URLSearchParams({ ref })}`
      return pages.templateLanding
        ? pages.templateLanding(landing, { lang, desktop, email: signedIn })
        : c.redirect(landing.buildHref, 302)
    }
    const intentDoor =
      (url.pathname === '/' || url.pathname === '/agent' || url.pathname === '/agent/') &&
      buildIntentOf(url.searchParams)
    if (intentDoor) return c.redirect(`${ONBOARDING_MOUNT}/${url.search}`, 302)
    let located = resolver.locate({
      pathname: url.pathname,
      referer: c.req.header('referer') ?? null,
      cookieHeader,
      origin: url.origin
    })
    located = await resolver.canonicalize(located)
    // `tracy_site` is only a pointer and can outlive a deleted site. Do not let a stale pointer
    // turn a fresh root navigation into the deleted site's join page; forget it and continue
    // through the normal landing branch. Named paths remain fail-closed below, while root assets
    // with a stale pointer become an honest 404.
    if (located.scope === 'site' && !located.named && !(await sites.hostOf(located.siteKey))) {
      located = { scope: 'root', siteKey: null, mount: '', rest: url.pathname, named: false }
      c.header('set-cookie', clearSiteCookie(config))
    }
    const session = await sessionWithExpiry(cookieHeader, config.sessionSecret)
    const email = session?.email ?? null
    // An admin's view of a customer (`/ops` › View as user) is not that customer's visit.
    const viewing = Boolean(session?.act)

    // The same rule for a pointer that outlived its OWNER rather than its site. A signed-in viewer
    // who reaches a site only through the pointer (`named: false` — nothing in the path asked for
    // it) and holds no seat there never asked for that site: the pointer was set by whoever used
    // this browser before. Forget it and land them as themselves. `/auth/signout` clears the
    // pointer too, but a session can end without that door (expiry, a cleared cookie jar), and
    // the join page is the right answer only for a site a person actually navigated to. Measured
    // 14/09: a brand-new account's first screen was "Ask to join" for the previous account's site.
    if (located.scope === 'site' && !located.named && email) {
      const pointed = await resolver.seatFor({ located, email })
      if (pointed.refused === 'no-seat') {
        located = { scope: 'root', siteKey: null, mount: '', rest: url.pathname, named: false }
        c.header('set-cookie', clearSiteCookie(config))
      }
    }

    // 🔒 AN UNFINISHED IMPORT IS NEVER OPENED AS A WORKSPACE (`lib/import-pending.js`). Its seat is
    // accepted at the claim, before the read, and a read that failed keeps the row for Retry
    // (#1578), but its host folder is built only by the provision at the end — so dsh answered
    // `workspace/invalid-path` and drew "Choose workspace" with a composer that could do nothing.
    // A pointer to one is forgotten like a stale pointer, so the person lands as if it were not
    // there (a ready site first). A path that names one, for someone holding a seat on it, goes to
    // the import recovery page; a stranger still gets the join page below.
    const unfinished =
      located.scope === 'site' && email && sites.importPending
        ? await sites.importPending(located.siteKey)
        : false
    if (unfinished && !located.named) {
      located = { scope: 'root', siteKey: null, mount: '', rest: url.pathname, named: false }
      c.header('set-cookie', clearSiteCookie(config))
    }

    // dsh's own public root files (a PWA manifest, a favicon) are the same document no matter
    // which site's dsh answers, and must never sit behind the seat gate below them — measured
    // live (chrome-acceptance.md): `GET /manifest.webmanifest` fell into the `!email` branch a
    // few lines down and came back a `302` to `/login?next=…`, then a `200` HTML *login page*
    // under a `.webmanifest` URL. Forwarded with no seat token when a site IS resolvable: dsh gets
    // to answer an unauthenticated hit on this path however it already does for anyone else
    // hitting it that way. No site resolvable at all is the one case genuinely outside this
    // app's answer: an honest 404, never the HTML shell.
    if (DSH_ROOT_FILES.has(url.pathname.slice(1))) {
      if (!located.siteKey) return c.text('Not found', 404)
      const host = await sites.hostOf(located.siteKey)
      const dsh = host ? sites.dshOf(host) : null
      if (!dsh) return c.text('Not found', 404)
      return forwardHttp(c.req.raw, upstreamUrl(dsh.origin, located, url.search), {
        mount: located.mount,
        viewerHost: url.host
      })
    }

    // ── The root: nothing named a site, and this is not the creation workspace ──────────────────
    if (located.scope === 'root') {
      // The Worker-era shell path. With a build intent it is the door to the creation workspace;
      // without one it is `/`. Either way it never reaches dsh, which does not serve it.
      // (With an intent it never gets here — see `intentDoor` above.)
      if (url.pathname === '/agent' || url.pathname === '/agent/') return c.redirect(`/${url.search}`, 302)
      // A stranger goes to the guest site only when this deployment HAS it. `GUEST_SITE_KEY` does
      // two jobs: it is the public landing, and it names the site whose guest seat the
      // `/design-inspiration` brand door is minted on (`public/route.js`) — and the second needs
      // only a folder on the host, not a site row. Measured 14/09 on dev and local with the key set
      // for the brand door's sake: a new account signing in from `/` came out at
      // `/<label>/join?next=/tracy.test/` → "Unknown site". The landing half holds only when the
      // site is real; otherwise the stranger gets the door they always got.
      if (!email) {
        // 🔒 CARRY THE DESTINATION. A mail link such as "Manage notifications" points at
        // `/?settings=notifications`; a bare `/login` dropped it, so after signing in the person
        // landed on their site with Settings closed (measured 06/10 on cowork.tracy.site). An
        // address with anything besides `utm_*` goes to `/login?next=<path+query>`, which
        // `/login` runs through `safePath` like every other `next`, and it signs in first even
        // where a guest landing exists, because the guest site is not where the link was going.
        const destination = [...url.searchParams.keys()].some((key) => !key.startsWith('utm_'))
        const guest =
          !destination && config.guestSiteKey && (await sites.hostOf(config.guestSiteKey))
            ? config.guestSiteKey
            : null
        if (guest) return c.redirect(`/${guest}/`, 302)
        // 🔒 CARRY THE LINK'S SOURCE. A campaign link (mail, blog) points at `/?utm_…`, and the bare
        // `/login` this used to answer dropped it, so every first sign-in from it counted as having
        // no source (measured 05/10 on cowork.tracy.ai). Only the cleaned `utm_*` ride along
        // (`lib/sign-in-source.js`), on `/login`'s own query, beside `next` when there is one.
        const source = sourceQuery(signInSource(url.searchParams))
        const query = [destination && `next=${encodeURIComponent(url.pathname + url.search)}`, source]
          .filter(Boolean)
          .join('&')
        return c.redirect(query ? `/login?${query}` : '/login', 302)
      }
      // A TEMPLATE WAITING ON THE ACCOUNT (plan B6). The JoomlArt sign-in door and the web
      // template page write it; a Tracy Desktop that signs in as the same person lands here, on
      // `/`, and is sent to that template's page — on the quickstart the page named — instead of
      // the last site. The APP only: the web page keeps the row for the app, so a browser that
      // followed it would be sent back to the template page every time it went home. HTML
      // navigations only — a fetch for `/` is never a person arriving.
      if (intents && wantsHtml(c) && isDesktopApp(c.req.header('user-agent'))) {
        const waiting = await intents.peek(email)
        if (waiting) {
          const ask = new URLSearchParams({ template: waiting.template })
          if (waiting.platform) ask.set('platform', waiting.platform)
          return c.redirect(`/new?${ask}`, 302)
        }
      }
      const landing = seats && pool ? await seats.defaultSiteFor(pool, email) : null
      // 🔒 CARRY THE PATH. `/${landing}/` alone was right for the bare root and silently wrong
      // for everything else that lands here. A plugin's client on a page from before 20/09
      // builds ROOT-ABSOLUTE doors — that page is served with `<base href="/">` (see
      // `siteForRequest`'s own note) and the site is recovered from the Referer or the
      // `tracy_site` pointer. When neither is there,
      // `/api/tracy-design-inspiration/catalog` was answered with a 302 to `/<landing>/`, the
      // API path thrown away; `fetch` follows it, gets the workspace's HTML, and the plugin shows
      // a generic "couldn't load the library" with nothing anywhere naming a cause. Measured
      // 10/09 in a browser. Appending the path costs nothing at the bare root — `url.pathname`
      // is `/` there, so this produces exactly the string it produced before — and turns every
      // other case into the door that actually answers.
      if (landing) return c.redirect(`/${landing}${url.pathname}${url.search}`, 302)
      // Every accepted seat is an import that never finished: the recovery page, where its run is
      // read back from the host and Retry or Continue are offered — never the import's empty site.
      const unfinishedImport =
        wantsHtml(c) && seats && pool && seats.unfinishedImportFor
          ? await seats.unfinishedImportFor(pool, email)
          : null
      if (unfinishedImport) return c.redirect(importRecoveryPath(unfinishedImport), 302)
      // 🔒 SIGNED IN AND HOLDING NOTHING. Until 13/09 a navigation got the "no sites" page (or the
      // guest landing, when one was configured) and a fetch got `NO_SITES`. The page was a dead
      // end with a sentence on it; the guest landing is somebody else's site. Both stood in the
      // way of the one thing this person can actually do — create a site — so a navigation now
      // opens their own creation workspace. Since 14/09 that workspace greets them with "Let's
      // build your first site" and two cards that each open their own tab, so the redirect no
      // longer pins a tab (`?tab=tracy:design-inspiration` until 15/09): a panel sliding out on its
      // own next to that choice was a second voice (15/09). A fetch keeps its code: a
      // root-absolute door with no site behind it is still an honest 404, and the creation
      // workspace never asks at the root (its base is `/new/`).
      if (!wantsHtml(c)) return c.json({ code: 'NO_SITES' }, 404)
      // 🔒 AN INVITATION WAITING IS THE NEXT STEP (C1 04/10). Until then this answered the
      // "An invitation is waiting" page: a list of sites with nothing to press but a link to each
      // site's join door. The creation workspace opens on the Inbox instead, where the invitation
      // is a card with Accept and Decline, and Accept lands in the site itself.
      const invites = pool && seats?.pendingInvitesFor ? await seats.pendingInvitesFor(pool, email) : []
      if (invites.length > 0) return c.redirect(`${ONBOARDING_MOUNT}/?tab=tracy:inbox`, 302)
      return c.redirect(`${ONBOARDING_MOUNT}/`, 302)
    }

    // dsh-passwords' own password page, where its settings card sends the browser after its Sign
    // out (and its rename). Every dsh behind this proxy has a seat secret, and that page is a 404
    // there — the sign-in door is Tracy's. The address means "sign in to this workspace", so it
    // goes to the workspace: `/login?next=<mount>/` below when signed out, the workspace itself
    // when not. A path redirect only; no seat is read or minted for it.
    if ((c.req.method === 'GET' || c.req.method === 'HEAD') && located.rest === DSH_PASSWORD_PAGE)
      return c.redirect(`${located.mount}/`, 302)

    if (!email) {
      const manifest = await anonymousManifest(c, url, located)
      if (manifest) return manifest
      return c.redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`, 302)
    }

    const seat = await resolver.seatFor({ located, email })
    if (seat.refused === 'no-seat') {
      // No live seat: never mint a session. Sent to the same door `seats/route.js` already built
      // for exactly this visitor — the "ask to join" page at `/:label/join` — rather than a bare
      // 403, since that page already tells an invited-but-not-yet-accepted viewer apart from a
      // total stranger and gives either one an actual next step. `next` carries them back to what
      // they actually came for once they do get in.
      const label = await sites.labelOf(located.siteKey)
      return c.redirect(`/${label}/join?next=${encodeURIComponent(url.pathname + url.search)}`, 302)
    }
    if (unfinished) {
      if (!wantsHtml(c)) return c.json({ code: IMPORT_NOT_FINISHED, siteKey: located.siteKey }, 409)
      return c.redirect(importRecoveryPath(located.siteKey), 302)
    }
    if (seat.refused === 'no-host') {
      if (located.scope === ONBOARDING_SCOPE)
        return unavailable(c, email, url, { code: 'HOST_NOT_CONFIGURED', reason: 'no host is configured' })
      return unavailable(c, email, url, { code: 'HOST_NOT_CONFIGURED', host: seat.host })
    }

    const { dsh, cookieName, grant, fingerprint } = seat
    /** This request, on to the site's dsh as the seat holding `seatToken`. */
    const forward = (seatToken) =>
      forwardModelHttp(
        c.req.raw,
        upstreamUrl(dsh.origin, located, url.search, { prefixed: seat.prefixed }),
        {
          mount: located.mount,
          // With the mount kept on the forwarded path, dsh's own redirects already carry it (the
          // gateway writes `mountOf(req)` into every Location it hands back) — prefixing again would
          // make `/<site>/<site>/…`. A site forwarded at the root (pointer-resolved, or switched off)
          // answers root redirects that are relativised under its mount, as before.
          locationPrefix: keepsMount(located, { prefixed: seat.prefixed }) ? '' : located.mount,
          seatToken,
          seatCookieName: cookieName,
          viewerHost: url.host
        },
        {
          pool,
          config,
          modelAccounts:
            modelAccounts && located.siteKey ? () => modelAccounts(email, located.siteKey) : undefined
        }
      )
    // 🔒 A LINK FROM BEFORE THE PREFIX — `/s/<id>` at the root, tied to a site only by the pointer
    // cookie — sits in open tabs, history and messages. A NAVIGATION to one is sent to the address
    // the site has now; a fetch is not, because the page that made it is still on the old shape
    // (`<base href="/">`) and every asset it asks for is a root path that must keep answering.
    if (located.scope === 'site' && !located.named && seat.prefixed !== false && wantsHtml(c))
      return c.redirect(`/${located.siteKey}${url.pathname}${url.search}`, 302)
    let token = resolver.tokenFor({ seat, cookieHeader })
    // 🔒 THE CARD'S SIGN OUT IS TRACY'S SIGN-OUT. dsh-passwords' settings card posts
    // `<mount>/gateway/logout`; dsh revokes the seat token, closes the account's sockets, and
    // answers with its sign-in redirect. Read as a stale seat (below), that answer became a 302
    // back to this same address: the browser re-sent it as a GET, a fresh seat was minted on the
    // way, and dsh answered 405 — nobody was signed out (measured 09/10 on a private stand). A
    // seat is minted from the Tracy session, so ending the seat alone ends nothing; the person
    // asked to sign out, and this answers what `POST /auth/signout` answers to a form. The held
    // seat still goes to dsh first so its token is revoked there; none is minted just to be
    // ended, and a dsh that is not answering does not keep anyone signed in. Only the POST: the
    // cross-site guard (`lib/csrf.js`) has already refused it unless it came from Tracy's origin.
    if (c.req.method === 'POST' && located.rest === DSH_LOGOUT) {
      if (token) {
        const ended = await forward(token).catch((error) => {
          if (c.req.raw.signal?.aborted || error?.name === 'AbortError') throw error
          return null
        })
        await ended?.body?.cancel()
      }
      for (const value of signOutCookies(cookieHeader, config, url.host))
        c.header('set-cookie', value, { append: true })
      return c.redirect('/login', 303)
    }
    let minted = false
    if (!token) {
      // No cookie, a cookie minted for a different grant (another account on this browser, a
      // role or policy that moved), or one from before fingerprints: ask the door. For the
      // creation workspace the door also makes and registers the personal folder, and a refusal
      // there is "lane not ready", answered as such rather than as a blank page or a "no sites"
      // sentence about a different problem.
      token = await seatDoor.mintSeatSession({ origin: dsh.origin, secret: dsh.seatSecret, grant })
      if (!token) {
        if (located.scope === ONBOARDING_SCOPE)
          return unavailable(c, email, url, {
            code: 'SEAT_DOOR_REFUSED',
            reason: 'the workspace door refused'
          })
        return unavailable(c, email, url, { code: 'SEAT_DOOR_REFUSED' })
      }
      minted = true
      c.header('set-cookie', seatCookie(cookieName, seatCookieValue(fingerprint, token), config))
      if (located.scope === 'site' && located.named)
        c.header('set-cookie', siteCookie(located.siteKey, config), { append: true })
    }
    // A PRESS ENTERS ON ITS SESSION (20/09). `/new/?inspiration=…&platform=…` used to be forwarded
    // as it stood: the page loaded bare, the side card started a session for the press, dsh wrote
    // `s/<id>` onto the bar, the side card stripped the intent — three address changes before the
    // form was even in sight. The session is made here instead, through the same door the page
    // would use (`dsh-rpc.js`), in the seat's own folder, and the press is sent to
    // `/new/s/<id>?tab=tracy:add-site&design=<id>` with the intent in a cookie: the page loads
    // once and the address already says everything the side card would write. Only for a
    // navigation to the bare mount — a `/new/s/<id>?inspiration=` link keeps its own session —
    // and only when dsh answers: otherwise the address is forwarded as before, and the page does
    // what it did.
    //
    // 🔒 THE TAB IS ADD SITE, NOT BUILD (24/09/2026: one creation flow). The gallery's
    // pick is no longer the entrance to a second way of making a site — it rides in as the
    // wizard's `design`, on a door (`POST /api/sites`) that has always accepted one. `design`
    // stays on the address on purpose, where `inspiration`/`platform` are stripped by the mirror
    // (`withTabParams`): those two are an intent, spent on arrival, while this one only says which
    // template the form in sight is holding — a reload that lost it would quietly swap the
    // customer's chosen look for the default.
    //
    // This string is typed out rather than read from `@tracy/core/tab-link`'s `creationTabFor()`
    // because this app depends on no Tracy package; the contract lives there and this is its one
    // copy. A change there needs a change here.
    const intent =
      located.scope === ONBOARDING_SCOPE && located.rest === '/' && wantsHtml(c)
        ? buildIntentOf(url.searchParams)
        : null
    // Never in an admin's view: starting the customer's creation session ahead of time is a write.
    if (intent && !viewing) {
      const ahead = await creationSessionAhead({ dsh, token, intent })
      if (ahead) {
        c.header('set-cookie', intentCookie(intent, config), { append: true })
        const query = new URLSearchParams({ tab: 'tracy:add-site', design: intent.inspiration })
        return c.redirect(`${ONBOARDING_MOUNT}/s/${encodeURIComponent(ahead)}?${query.toString()}`, 302)
      }
    }
    // The same address, intent and all: a `?inspiration=…` on the way in is still there on the
    // way back, which is what lets the side card open the Build tab it was asked for.
    if (minted) return c.redirect(sameOriginPath(url), 302)

    let res = await forward(token)
    if (res.status === 401 || isSignInRedirect(res)) {
      // A rejected response is discarded; release its stream before a bounded retry.
      try {
        await res.body?.cancel()
      } catch {}
      if (c.req.method === 'GET' || c.req.method === 'HEAD') {
        const fresh = await seatDoor.mintSeatSession({ origin: dsh.origin, secret: dsh.seatSecret, grant })
        if (fresh) {
          res = await forward(fresh)
          if (res.status !== 401 && !isSignInRedirect(res)) {
            res.headers.append(
              'set-cookie',
              seatCookie(cookieName, seatCookieValue(fingerprint, fresh), config)
            )
            if (located.scope === 'site' && located.named)
              res.headers.append('set-cookie', siteCookie(located.siteKey, config))
            return res
          }
          try {
            await res.body?.cancel()
          } catch {}
        }
      }
      return unavailable(
        c,
        email,
        url,
        {
          code: 'SEAT_UPSTREAM_UNAVAILABLE',
          reason: 'the workspace lane rejected the session'
        },
        { 'set-cookie': clearSeatCookie(cookieName, config) }
      )
    }
    // Plant the pointer on EVERY request that names a site and passes the seat check, not only on
    // the one that minted the seat — and onto THIS response, because a proxied Response carries
    // its own headers and never sees `c.header()`. A seat lives twelve hours and the pointer
    // thirty days, so a viewer whose seat was minted before the pointer existed — or who cleared
    // it — would keep a working seat and never get a pointer back; every root path would then
    // rest on the Referer alone, and a WebSocket handshake carries none. That viewer's socket is
    // refused and the workspace waits on "Loading workspaces..." for good. Measured in a browser.
    if (located.scope === 'site' && located.named)
      res.headers.append('set-cookie', siteCookie(located.siteKey, config))
    // Usage (plan `tasks/todo-do-dung-that.md` U3): a person opened a site's workspace page. One
    // signal per person, site and half hour, so a reload is not a second visit; the first visit and a
    // return on another day are read from these. Never awaited, a failure only logged.
    if (
      located.scope === 'site' &&
      located.named &&
      !viewing &&
      c.req.method === 'GET' &&
      wantsHtml(c) &&
      res.status === 200
    )
      void opsFor(pool).record('site.entered', {
        email,
        siteKey: located.siteKey,
        dedupeKey: enteredKey(email, located.siteKey, _now())
      })
    return res
  })

  /**
   * The workspace's PWA manifest under a mount, forwarded for a viewer with no session — or null,
   * and the caller answers exactly as it did before (the `/login?next=` redirect).
   *
   * 🔒 EXACTLY `GET|HEAD <mount>/manifest.webmanifest`, AND NOTHING ELSE. Browsers fetch
   * `<link rel="manifest">` WITHOUT cookies (no `crossorigin="use-credentials"` on dsh's page), so
   * this request never carries a session however signed in the viewer is. It came back a `302` to
   * `/login?next=…`, and every workspace page logged "Manifest: Line: 1, column: 1, Syntax error."
   * twice (measured 28/09 on cowork.tracy.site, #519). dsh-passwords already answers this one path
   * to an anonymous request (`PUBLIC_MANIFEST_PATH`, vendor/tracy/dsh-passwords/src/permissions.ts):
   * a static document, the same for every viewer, carrying nothing about any site or account.
   * The match is on the resolved path (`located.rest`), never the query string, so no other path
   * or method rides on it. The dsh is found by the same rule a seat would use — a site's own host,
   * the default host for `/new` — and a site or host that cannot be found returns null, so an
   * unknown site still answers the way it always has. No seat is minted and no cookie planted.
   * @param {import('hono').Context} c
   * @param {URL} url
   * @param {{scope: string, siteKey: string|null, mount: string, rest: string, named: boolean}} located
   * @returns {Promise<Response|null>}
   */
  async function anonymousManifest(c, url, located) {
    const method = c.req.method
    if (method !== 'GET' && method !== 'HEAD') return null
    if (!located.named || located.rest !== PUBLIC_MANIFEST_PATH) return null
    let dsh = null
    let prefixed = true
    if (located.scope === ONBOARDING_SCOPE) {
      dsh = config.defaultHost ? sites.dshOf(config.defaultHost) : null
    } else if (located.scope === 'site') {
      const host = await sites.hostOf(located.siteKey)
      dsh = host ? sites.dshOf(host) : null
      if (dsh && typeof sites.prefixAwareOf === 'function')
        prefixed = await sites.prefixAwareOf(located.siteKey)
    }
    if (!dsh) return null
    const kept = keepsMount(located, { prefixed })
    return forwardHttp(c.req.raw, upstreamUrl(dsh.origin, located, url.search, { prefixed }), {
      mount: located.mount,
      locationPrefix: kept ? '' : located.mount,
      seatToken: null,
      viewerHost: url.host
    })
  }

  /**
   * Whether a dsh answer is its "no session here" redirect rather than a page.
   *
   * dsh-passwords answers a navigation whose seat token it no longer honours (revoked, expired)
   * with a REDIRECT to its sign-in target, not a 401 (`noSessionAnswer`, vendor/tracy/dsh-passwords
   * /src/seat.ts): on a host dsh that target is Tracy's own origin, absolute and bare
   * (`signInPath` in gateway.ts), and a site lane's is `<mount>/gateway/{login,tracy}`. Only a
   * caller carrying the Worker's Access header gets the 401 — this app sends none. That file's own
   * comment says the fix has two halves and the proxy's is to read that redirect as a rejection;
   * the Worker had it, the port did not. Forwarded as it stood, a revoked seat sent the browser to
   * `http://tracy-web:51710`, a compose-internal name nothing outside resolves (measured 25/09,
   * right after a site deleted and added back under the same name kept its old seat cookie).
   * @param {Response} res
   * @returns {boolean}
   */
  function isSignInRedirect(res) {
    if (res.status < 300 || res.status >= 400) return false
    const location = res.headers.get('location')
    if (!location) return false
    let target
    try {
      target = new URL(location, 'http://relative.invalid')
    } catch {
      return false
    }
    // An absolute Location with nothing after the origin is the host dsh's sign-in target.
    const bareOrigin = /^https?:\/\//i.test(location) && target.pathname === '/' && !target.search
    return bareOrigin || /\/gateway\/(login|tracy)\/?$/.test(target.pathname)
  }

  /**
   * The creation session for one press, made before the browser moves. The seat's folder is
   * `<home>/<account name>` — the door made and registered it when the seat was minted
   * (`onboardingGrant` says `home`); `workspace/create` here is idempotent and only asks for its
   * id, because the session must be made BY WORKSPACE ID: made by `cwd` it belongs to no
   * workspace, the gateway's first-baseline seeding of the seat's grants leaves it out, and dsh
   * drops it from the address (`sites/route.js` `sessionMadeAhead` has the measurement). Null on
   * any refusal.
   * @param {{dsh: {origin: string}, token: string, intent: {inspiration: string, platform: string}}} input
   * @returns {Promise<string | null>}
   */
  async function creationSessionAhead({ dsh, token, intent }) {
    const username = usernameOfToken(token)
    if (!username || !config.onboardingHome) return null
    const rpc = (endpoint, request) =>
      dshRpc({ origin: dsh.origin, mount: ONBOARDING_MOUNT, token, endpoint, request, fetchImpl })
    const ws = await rpc('workspace/create', { path: `${config.onboardingHome}/${username}` })
    const workspaceId = ws?.workspace?.workspaceId
    if (typeof workspaceId !== 'string' || workspaceId === '') return null
    const made = await rpc('session/create', { workspaceId, agentPreset: `designer-${intent.platform}` })
    return typeof made?.sessionId === 'string' && /^[A-Za-z0-9_-]+$/.test(made.sessionId)
      ? made.sessionId
      : null
  }

  return app
}
