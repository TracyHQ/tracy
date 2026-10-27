/**
 * The one cross-site request guard (#662), mounted once by the composition root (`app.js`) in front
 * of every domain that answers on Tracy's own hostname.
 *
 * WHY IT EXISTS. `tracy_sess` is `SameSite=Lax` with `Domain=.tracy.ai`, and every customer site is
 * a `*.tracy.ai` hostname — the SAME site as `cowork.tracy.ai` in the browser's eyes. So a script on
 * any customer page could `fetch(…, {credentials: 'include'})` or submit a form to a Tracy door and
 * the visiting person's cookie rode along: `POST /api/team/invite` with a `text/plain` body created
 * a pending admin invitation, and nothing refused it. `/signin/approve` (#661) and a few `/ops`
 * doors checked `Origin` one by one; this is the rule for all of them.
 *
 * THE RULE, for a POST/PUT/PATCH/DELETE that carries a valid session cookie:
 *   1. Where the request comes from, by Fetch Metadata. `Sec-Fetch-Site` is set by the browser and
 *      no page script can set or alter it, so it is the trust anchor:
 *      - PRESENT: only exactly `same-origin` passes. `same-site` (a customer page on `*.tracy.ai`
 *        calling `cowork.tracy.ai` — the Lax cookie rides along, this is the attack), `cross-site`,
 *        `none`, an empty, unknown, differently cased or repeated value is `403 CSRF_ORIGIN`,
 *        whatever `Origin` says.
 *      - ABSENT: the caller is not a Fetch-Metadata browser — the dsh host half calling a Tracy door
 *        from Node (lease release, apply, artifacts, moment…), curl, a server, or a pre-2020
 *        browser. Fall back to `Origin`: absent or EXACTLY `config.origin` passes; any other value
 *        (foreign, sibling, `null`, empty, repeated, malformed) is `403 CSRF_ORIGIN`. A real
 *        cross-origin browser write always sends `Origin`, so an old browser is still refused; a
 *        server-side caller sends neither and is no forgery vector — it holds the cookie itself.
 *      No other header (`Referer`, `Host`, `X-Forwarded-*`, an actor or session marker) stands in.
 *   2. A body must be declared as what the door reads: `application/json` (any parameters, any
 *      case) unless the door is one of the few in `BODY_TYPES`. `text/plain`, a missing type, or a
 *      form sent to a JSON door is `415 UNSUPPORTED_MEDIA_TYPE` — a "simple" request cannot skip a
 *      preflight on its way to a JSON door. A request with no body at all has nothing to declare.
 *      This applies on the absent-header branch too, so it is never a blanket pass.
 *
 * WHAT IT DOES NOT TOUCH, AND WHY:
 *   - A request with no valid session: nothing in it carries the person's authority, so there is
 *     nothing to forge. Read with `session.js`'s own reader — duplicate cookies, a bad signature or
 *     an expired token mean exactly what they mean to every door. The API host drops `Cookie`
 *     before this runs (`app.js`), so `/v1` and its Bearer keys never meet it.
 *   - `SESSION_FREE_DOORS`: doors that never read the session at all — a host's or GitHub's
 *     signature, the shim's signed relay, a lane's signed actor, a one-shot nonce and secret. A
 *     cookie that happens to ride along must not change what they answer.
 *
 * THE ONE ROUTE WITH ITS OWN POLICY: the dsh workspace proxy (the catch-all). It authenticates by
 * the viewer's seat and a minted grant, strips `Origin`/`Referer` before forwarding, and dsh reads
 * its own bodies (`POST /api/session/uploadFileBinary` is `application/octet-stream`). So a
 * request the router hands to it passes rule 1 exactly like any other, and then keeps whatever
 * body type it declares. Which route answers is never guessed from the path:
 * the composition root declares each route's owner where it mounts it (`owners`), and the guard
 * walks the router's own matches for this request (`matchedRoutes`) in order. A route nobody
 * declared is a Tracy door — so an unknown route fails closed, never into the proxy's policy.
 */
import { matchedRoutes } from 'hono/route'
import { json } from './http.js'
import { sessionFromCookieHeader } from './session.js'

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** Doors whose handlers never read `tracy_sess` — each authenticates its caller another way. */
const SESSION_FREE_DOORS = [
  // The landing waitlist authenticates only its signed token, never a session cookie.
  { method: 'POST', path: /^\/api\/beta\/waitlist$/ },
  // A host's own secret, GitHub's webhook secret (`github/route.js`).
  { method: 'POST', path: /^\/fleet\/git-token$/ },
  { method: 'POST', path: /^\/github\/(?:push|release)$/ },
  // The shim's signed relay (`mail/site-mail/route.js`).
  { method: 'POST', path: /^\/_site-mail$/ },
  // A lane's sign-in round: a nonce and client secret, or the signed `x-tracy-actor` (`lanes/route.js`).
  { method: 'POST', path: /^\/auth\/link\/browser$/ },
  { method: 'POST', path: /^\/auth\/link\/[^/]+\/exchange$/ },
  { method: 'POST', path: /^\/auth\/otp\/(?:start|verify)$/ },
  // The desktop app redeeming its approved round (`identity/route.js`): the nonce and client secret
  // are the authority, and the door checks `Origin` (exact, absent refused) and JSON itself. It reads
  // no session, so a stale cookie in the app's jar — sent from the main process, with no same-origin
  // Fetch Metadata — must not turn its answer into `CSRF_ORIGIN`. Its cancel door has the same rules.
  { method: 'POST', path: /^\/auth\/link\/[^/]+\/(?:session|cancel)$/ },
  // One-click unsubscribe: the signed token in the mail's List-Unsubscribe header is the whole
  // authority, and Gmail's POST comes cookie-less from its own servers (`notifications/route.js`).
  { method: 'POST', path: /^\/api\/notifications\/unsubscribe$/ },
  // The same for real invitation mail (`invitations/real-unsubscribe.js`): a one-time token in the
  // path, no session read.
  { method: 'POST', path: /^\/invitations\/(?:unsubscribe|one-click)\/[A-Za-z0-9_-]{1,100}$/ },
  // Telegram's update for the Customer Service bot: its `X-Telegram-Bot-Api-Secret-Token` header is
  // the whole authority (`assistant/route.js`); no session is read, whatever cookie rides along.
  { method: 'POST', path: /^\/api\/assistant\/telegram\/webhook$/ },
  // Tracy's Discord bot: `x-tracy-discord-secret` is the whole authority (`discord/route.js`).
  { method: 'POST', path: /^\/api\/discord\/(?:link\/start|link\/verify|events)$/ },
  // Another deployment pushing place research: `x-tracy-wo-places-secret` is the whole authority
  // (`website-opportunities/src/place-ingest-door.js`).
  { method: 'POST', path: /^\/api\/internal\/wo-places\/v1\/ingest$/ },
  // A shard's signed calls to its master (`shards/doors.js`): `x-shard-*` over the shard's own secret.
  {
    method: 'POST',
    path: /^\/api\/shards\/[a-z][a-z0-9]{0,15}\/(?:labels\/reserve|events|custom-hostname|check)$/
  },
  // A shard's adopt door: the master's `x-shard-*` signature is the whole authority (`shard/adopt.js`).
  { method: 'POST', path: /^\/_shard\/adopt$/ }
]

const JSON_ONLY = ['application/json']
const FORMS = ['application/x-www-form-urlencoded', 'multipart/form-data']

/**
 * The doors that read something other than JSON. `types: null` = any declared type: the door reads
 * raw bytes and judges them itself (a picture's format, size and name — `ops/quickstarts.js`).
 */
const BODY_TYPES = [
  // The sign-in pages' own `<form>`s, and the JSON their script sends (`identity/route.js`'s `isForm`).
  {
    method: 'POST',
    path: /^\/(?:login|verify|auth\/signout|signin\/approve|signin\/deny|signin\/code|signin\/verify)$/,
    types: [...JSON_ONLY, ...FORMS]
  },
  { method: 'POST', path: /^\/api\/sites\/[^/]+\/comments\/attachments$/, types: ['multipart/form-data'] },
  { method: 'POST', path: /^\/oauth\/authorize$/, types: ['application/x-www-form-urlencoded'] },
  // The device-flow consent page's own `<form>` (`mcp/device.js`).
  { method: 'POST', path: /^\/connect$/, types: ['application/x-www-form-urlencoded'] },
  // The logo and favicon of "Customize your site" (`sites/brand-files.js`).
  { method: 'POST', path: /^\/api\/sites\/brand-files$/, types: ['multipart/form-data'] },
  // A file the customer attaches to a Help question (`assistant/files.js`).
  { method: 'POST', path: /^\/api\/assistant\/attachments$/, types: ['multipart/form-data'] },
  // Real campaign uploads are binary, but keep the same session and origin checks.
  {
    method: 'POST',
    path: /^\/api\/ops\/invitations\/real\/imports\/preview$/,
    types: ['application/octet-stream', 'text/csv']
  },
  {
    method: 'POST',
    path: /^\/api\/ops\/invitations\/real\/campaigns\/[^/]+\/templates\/preview$/,
    types: ['application/octet-stream', 'application/zip']
  },
  { method: 'PUT', path: /^\/api\/ops\/templates\/[^/]+\/shots\/[^/]+$/, types: null },
  // A voice turn's timings (`speech/trace.js`): `navigator.sendBeacon` sends its string as
  // `text/plain`, and a page that is closing has no other way to send it. Numbers only, read as JSON,
  // and rule 1 (same origin) still holds.
  { method: 'POST', path: /^\/api\/speech\/trace$/, types: [...JSON_ONLY, 'text/plain'] }
]

/** `Hono#route` wraps a sub-app's handler when that sub-app has its own error handler. */
const COMPOSED_HANDLER = '__COMPOSED_HANDLER'

/** Owners the composition root declares for the routes it mounts (`owners` below). */
export const MIDDLEWARE = 'middleware'
export const WORKSPACE_PROXY = 'workspace-proxy'

/**
 * Who answers this request: `'proxy'` when the router hands it to the workspace proxy, `'tracy'`
 * otherwise. Walks the routes the router matched, in the order it will run them: middleware steps
 * aside; a route declared `{ stepsAside }` steps aside when its own predicate says so (the `/v1`
 * layer off the API host — the same predicate its handlers read); the first route left is the one
 * that answers. Only a declared workspace-proxy route yields `'proxy'`; anything else, declared or
 * not, is a Tracy door.
 */
function ownerOf(c, owners) {
  for (const route of matchedRoutes(c)) {
    const declared = owners.get(route.handler[COMPOSED_HANDLER] ?? route.handler)
    if (declared === MIDDLEWARE) continue
    if (typeof declared?.stepsAside === 'function' && declared.stepsAside(c)) continue
    return declared === WORKSPACE_PROXY ? 'proxy' : 'tracy'
  }
  return 'tracy'
}

const matches = (rules, method, path) => rules.find((rule) => rule.method === method && rule.path.test(path))

/** `application/json; charset=utf-8` → `application/json`; absent → `''`. */
function mediaType(header) {
  return (header ?? '').split(';')[0].trim().toLowerCase()
}

/**
 * Whether the request carries body bytes, judged from its framing — never by reading it. A browser
 * sends `Content-Length: 0` for an empty form or a bodiless POST, and NO length at all for a
 * bodiless `fetch(…, { method: 'DELETE' })`.
 *
 * `overHttp1`: the request arrived on an HTTP/1.x socket. There, a message with neither
 * `Content-Length` nor `Transfer-Encoding` has no body (RFC 9112 §6.3), whatever the adapter shows:
 * `@hono/node-server` hands every non-GET/HEAD request a body stream, so `request.body` is never
 * null for a real DELETE — reading it as "a body with no type" refused every bodiless DELETE with
 * 415 (comments, team members, keys… measured 01/10). Only a request built in-process (tests'
 * `app.fetch`) states no length and is judged by its body stream; HTTP/2 framing has no such
 * rule either, so it falls back the same fail-closed way.
 */
function hasBody(request, overHttp1) {
  const length = request.headers.get('content-length')
  if (length !== null) return length.trim() !== '0'
  if (request.headers.has('transfer-encoding')) return true
  if (overHttp1) return false
  return request.body !== null
}

/**
 * Whether `@hono/node-server` handed this request over from an HTTP/1.x socket (`c.env.incoming`
 * is Node's `IncomingMessage`). Absent for `app.fetch` in-process, unless the caller passed the
 * env on — the composition root's re-dispatches do, since they replay the same HTTP request.
 */
function arrivedOverHttp1(c) {
  return c.env?.incoming?.httpVersionMajor === 1
}

/**
 * Rule 1: did this write come from Tracy's own origin? `Sec-Fetch-Site`, when the browser sent it,
 * decides alone; tested with `has`, so an empty value counts as present (and is refused). Only when
 * it is absent does `Origin` decide, and then an absent `Origin` passes too.
 */
function fromOwnOrigin(headers, ownOrigin) {
  if (headers.has('sec-fetch-site')) return headers.get('sec-fetch-site') === 'same-origin'
  const origin = headers.get('origin')
  return origin === null || origin === ownOrigin
}

/**
 * Whether the request carries a session any door would accept. Doors read the session with the
 * wall clock (`lib/http.js`) or with the app's injected clock (`identity/route.js`); the guard
 * applies when EITHER would accept it, so no door sees a session the guard did not.
 */
async function carriesSession(cookieHeader, config, now) {
  if (!cookieHeader) return false
  if (await sessionFromCookieHeader(cookieHeader, config.sessionSecret)) return true
  return Boolean(now && (await sessionFromCookieHeader(cookieHeader, config.sessionSecret, now())))
}

/**
 * @param {{
 *   config: { origin: string, sessionSecret: string },
 *   now?: () => number,
 *   owners?: Map<Function, typeof MIDDLEWARE | typeof WORKSPACE_PROXY | { stepsAside: (c: import('hono').Context) => boolean }>
 * }} deps - `owners`: route handler → its declared owner, filled by the composition root as it
 *   mounts each router (some after this guard is mounted in front of them). Read per request.
 * @returns {import('hono').MiddlewareHandler}
 */
export function csrfGuard({ config, now, owners = new Map() }) {
  return async (c, next) => {
    const method = c.req.method
    if (!MUTATING.has(method)) return next()
    // The routed path (`c.req.path`, decoded as the router decodes it), so the exemptions below
    // name exactly the door the router will pick — never a spelling of it the router would not.
    const path = c.req.path
    if (matches(SESSION_FREE_DOORS, method, path)) return next()
    const request = c.req.raw
    if (!(await carriesSession(request.headers.get('cookie'), config, now))) return next()

    if (!fromOwnOrigin(request.headers, config.origin)) {
      c.header('cache-control', 'no-store')
      return json(c, { code: 'CSRF_ORIGIN' }, 403)
    }
    if (ownerOf(c, owners) === 'proxy') return next()

    if (!hasBody(request, arrivedOverHttp1(c))) return next()
    const door = matches(BODY_TYPES, method, path)
    const types = door ? door.types : JSON_ONLY
    if (types !== null && !types.includes(mediaType(request.headers.get('content-type')))) {
      c.header('cache-control', 'no-store')
      return json(c, { code: 'UNSUPPORTED_MEDIA_TYPE' }, 415)
    }
    return next()
  }
}
