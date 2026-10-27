import { flushImportResults } from './operation-signal.js'
/**
 * The Node half of `@tracy/dsh-add-site` — where the real work of the IMPORT branch happens.
 *
 * WHY IT MUST EXIST. The import branch signs into the old site's admin page, installs an extension there,
 * then pulls the database and webroot back. None of those three can be done from the browser: the customer's admin
 * door is on another origin so CORS blocks it, and a webroot of several hundred MB through a tab is the wrong
 * place. dsh runs Node and has outbound network — so it does the work.
 *
 * In `tracy-desk` this work was done by the Electron app on the user's machine. The code here is copied from there, and copies
 * almost unchanged because the whole export side is just `fetch` + reading HTML + keeping cookies. The ONLY thing
 * tied to Electron is the sign-in window for sites with two-factor auth — that road was dropped on 31/08, replaced
 * by an account form plus a self-install route.
 *
 * 🔒 NO PASSWORD IS STORED, ANYWHERE. The admin password is used exactly once: sign in → install the extension
 * → the extension mints its own token → only the token is kept. In TCH this rule weighs more than in desk, because dsh
 * runs in a container ON TRACY'S SERVER: a password stored there is a customer's site password sitting
 * on our infrastructure.
 *
 * 🔒 HOLDS NO FLEET SECRET. Every conversation with the seat book goes through `cowork-web`, which exchanges
 * the session cookie for a signed assertion. `FLEET_ACTOR_SECRET` is shared across four Workers — one copy of
 * it in a customer container is a key to impersonate the relay for EVERY site.
 */

import { readFileSync } from 'node:fs'

import { inspectAddress } from './detect.js'
import { draining } from './lease.js'
import { latestExtension, ManifestUnavailable } from './manifest.js'
import type { CoworkPlatform } from './manifest.js'
import { credentialsFrom, restoreRuns, runForSite, runStatus, settleFleetHandovers, startRun } from './run.js'
import { readJsonBody, readTextBody, parseJsonObject, writeJson, BodyTooLarge } from './http.js'
import { SiteHeld, signedByTracy } from './hold.js'
import { answerHold } from './hold-door.js'
import { CredentialStore } from '../client/credentials.mjs'
import { callbackOrigin } from './callback-origin.mjs'
import type { HostContext, WebRoute } from './types.js'

/** Stable cordis plugin name — must match the row in `cordis.patch.yml` (RULE #2). */
export const name = 'tracy-add-site'

/**
 * `webServer` is where routes are attached.
 *
 * 🔒 Every `ctx.<name>` must be in here. cordis throws the moment a property outside `inject` is READ, so
 * a missing name is not a warning but a dead plugin — and dsh still boots, just with half the UI
 * gone, no error, no log.
 */
export const inject = ['webServer', 'sidebarFrame']

const PREFIX = '/api/tracy-add-site'

/**
 * A setting of this dsh: the process env first, then the password gate's env file — the same
 * two places, in the same order, `tracy-site-tools` reads `MCP_TRACY_ORIGIN` from. The fleet
 * writes it into the file (`host-dsh-init.sh`); compose sets it in the env.
 */
function dshSetting(name: string): string | null {
  const value = process.env[name]?.trim()
  if (value) return value
  const file = process.env.DSH_PASSWORDS_ENV_FILE?.trim()
  if (!file) return null
  try {
    const m = new RegExp(`^${name}=(.+)$`, 'm').exec(readFileSync(file, 'utf8'))
    return m ? m[1]!.trim().replace(/^["']|["']$/g, '') : null
  } catch {
    return null
  }
}

/**
 * Site viewing keys, kept in this process's memory.
 *
 * One store for the whole plugin, not one per request: the sidebar's embed route asks in a
 * call entirely separate from the one that issued the key, so the table must live between the two.
 */
const credentials = new CredentialStore()

/**
 * Ask for a viewing session for the site and keep it, so the sidebar's embed route can send it along.
 *
 * WHY THE HOST HALF DOES THIS rather than the client. The cookie must reach the SITE's host, and in the
 * browser it cannot: the frame is third-party, and on a developer's machine the origin is entirely different. The
 * `/sidebar/frame` route runs server-side so it can send it — but it does not know who is viewing. This place
 * does: the request carries that very person's session cookie.
 *
 * 🔒 HOLDS NO SECRET. It exchanges the session cookie for a token through `cowork-web`, the same road every
 * conversation with the seat book takes.
 * @param body The request body.
 * @param context The caller's cookie and root.
 * @returns The HTTP status and the body to return.
 */
async function handleCredentials(
  body: unknown,
  context: { cookie: string; origin: string }
): Promise<{ status: number; body: unknown }> {
  const input = (body ?? {}) as { siteKey?: unknown; host?: unknown }
  const siteKey = typeof input.siteKey === 'string' ? input.siteKey : ''
  // The host is taken FROM THE CALLER, not derived from the siteKey: the fleet label is a one-way table
  // (`fleetLabel`), so an imported site has a host entirely different from its key.
  const host = typeof input.host === 'string' ? input.host : ''
  if (!siteKey || !host) return { status: 400, body: { code: 'INVALID_REQUEST' } }
  if (!context.origin || !context.cookie) return { status: 401, body: { code: 'NOT_SIGNED_IN' } }

  let response: Response
  try {
    response = await fetch(`${context.origin}/api/sites/${encodeURIComponent(siteKey)}/viewing-session`, {
      method: 'GET',
      headers: { cookie: context.cookie }
    })
  } catch {
    return { status: 502, body: { code: 'SEAT_BOOK_UNREACHABLE' } }
  }
  const answer = (await response.json().catch(() => null)) as { token?: unknown; code?: unknown } | null
  if (!response.ok || typeof answer?.token !== 'string') {
    // Pass the refusal through as is: "not signed in" and "no seat on this site" are two different
    // sentences, and the surface must be able to tell them apart.
    return { status: response.status || 502, body: answer ?? { code: 'NO_VIEWING_SESSION' } }
  }
  credentials.put(host, answer.token)
  // The token is NOT returned to the browser. It is only useful server-side, and a token in the client's hands
  // is a token in someone's console history.
  return { status: 200, body: { ok: true } }
}

const PLATFORMS = new Set<CoworkPlatform>(['joomla', 'wordpress'])

const asPlatform = (value: unknown): CoworkPlatform | null =>
  typeof value === 'string' && PLATFORMS.has(value as CoworkPlatform) ? (value as CoworkPlatform) : null

/**
 * The current extension release for a platform, with its download location.
 *
 * The same answer serves both roads of step 2: the automatic road (the host half installs it) and the
 * self-install road (a link for the customer to press). One source, so it is **impossible** for Tracy to install
 * one version while the manual instructions point to another.
 */
async function handleExtension(body: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
  const platform = asPlatform(body.platform)
  if (!platform) return { status: 400, body: { code: 'UNSUPPORTED_PLATFORM' } }

  try {
    const latest = await latestExtension(platform)
    return { status: 200, body: latest }
  } catch (error) {
    // Four different reasons leave by four different codes: the surface needs to know whether to tell people to retry,
    // or to say plainly that the installer could not be fetched yet. Folding them together makes them guess.
    if (error instanceof ManifestUnavailable) {
      return { status: 502, body: { code: 'EXTENSION_MANIFEST_UNAVAILABLE', reason: error.reason } }
    }
    throw error
  }
}

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

/**
 * Open an import and return the `runId` immediately.
 *
 * 🔒 THE `cowork-web` ROOT AND THE COOKIE BOTH COME FROM THIS REQUEST, not from a body the client declares. The cookie
 * belongs to the person pressing (the browser sends it because dsh serves on the same origin); the root is derived from the `host` header.
 * Taking them from the body would let a call point itself at another server and borrow the session of the person
 * sitting here.
 */
async function handleStart(
  body: Record<string, unknown>,
  context: { cookie: string; origin: string }
): Promise<{ status: number; body: unknown }> {
  const platform = asPlatform(body.platform)
  const siteKey = asString(body.siteKey)
  if (!platform || !siteKey) return { status: 400, body: { code: 'INVALID_REQUEST' } }
  // A claim press (`run.ts` `StartInput.press`): digits or absent, never anything else.
  const press = asString(body.press)
  const after = asString(body.after)
  if ([press, after].some((value) => value !== undefined && !/^\d{1,20}$/.test(value)))
    return { status: 400, body: { code: 'INVALID_REQUEST' } }
  if (!context.cookie) return { status: 401, body: { code: 'NOT_SIGNED_IN' } }
  // A deploy is waiting for running imports to finish; one started now would be cut off (`lease.ts`).
  if (draining()) return { status: 503, body: { code: 'HOST_UPDATING' } }
  // The runs a restart cut are known before a new one is opened: a Continue names one of them, and
  // two runs of one site are never open at once (`startRun`).
  await restoreRuns()

  let run: ReturnType<typeof startRun>
  try {
    run = startRun({
      siteKey,
      platform,
      retryOf: asString(body.retryOf),
      ...(press ? { press } : {}),
      ...(press && after ? { after } : {}),
      adminUrl: asString(body.adminUrl),
      // Sent-but-blank credentials stay sent: blank is `credentials_required`, never "none given" (#530).
      ...credentialsFrom(body),
      webRootUrl: asString(body.webRootUrl),
      origin: context.origin,
      cookie: context.cookie
    })
  } catch (error) {
    // The site's unfinished import is being removed (`hold.ts`): no read begins under it.
    if (error instanceof SiteHeld) return { status: 409, body: { code: 'IMPORT_REMOVING' } }
    throw error
  }
  // Only `id`: the full `RunState` comes out of the `status` door, and holds no password.
  return { status: 202, body: { runId: run.id } }
}

/** How far the import has got. The wizard asks every few seconds. */
async function handleStatus(body: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
  const runId = asString(body.runId)
  const siteKey = asString(body.siteKey)
  // A run a restart cut answers `interrupted`, not `RUN_UNKNOWN` (#1565).
  await restoreRuns()
  const run = runId ? runStatus(runId) : siteKey ? runForSite(siteKey) : undefined
  if (!run) return { status: 404, body: { code: 'RUN_UNKNOWN' } }
  // `now` lets the wizard tell how long the part on its way has been going without trusting the
  // browser's clock to match this host's (#1567).
  return { status: 200, body: { ...run, now: Date.now() } }
}

/** Read only the public site or the supplied admin address; never try signing in. */
async function handleDetect(body: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
  const siteKey = asString(body.siteKey)
  if (!siteKey) return { status: 400, body: { code: 'INVALID_REQUEST' } }
  const adminUrl = asString(body.adminUrl)
  return {
    status: 200,
    body: await inspectAddress(adminUrl ?? siteKey, fetch, !!adminUrl, asPlatform(body.platform) ?? 'joomla')
  }
}

/** The route table — explicit, one function per route. */
const ROUTES: Record<
  string,
  (
    body: Record<string, unknown>,
    context: { cookie: string; origin: string }
  ) => Promise<{ status: number; body: unknown }>
> = {
  extension: handleExtension,
  credentials: handleCredentials,
  detect: (body) => handleDetect(body),
  start: handleStart,
  status: (body) => handleStatus(body)
}

export function apply(ctx: HostContext): void {
  // At boot, not at the first request: a run a deploy cut is marked interrupted and its lease goes
  // even if nobody opens the wizard for a while (#1565). Nothing is re-run.
  void restoreRuns()
  ctx.effect(() => {
    const drain = () => {
      void flushImportResults().catch(() =>
        console.warn('[tracy-add-site] operation result queue unavailable')
      )
      // A finished read a restart or an unreachable tracy-web left unhanded (#1652).
      void settleFleetHandovers().catch(() =>
        console.warn('[tracy-add-site] fleet handover queue unavailable')
      )
    }
    drain()
    const timer = setInterval(drain, 30_000)
    timer.unref?.()
    return () => clearInterval(timer)
  })
  const route: WebRoute = {
    kind: 'prefix',
    path: PREFIX,
    handler: (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { code: 'METHOD_NOT_ALLOWED' })
        return
      }
      // `req.url` carries the query too; only the path selects the work.
      const path = (req.url ?? '').split('?')[0] ?? ''
      const step = path.slice(PREFIX.length).replace(/^\/+/, '')
      // tracy-web's hold on a site it is removing (`hold-door.ts`): signed with this host's seat
      // secret over the exact body, never answered for a caller without it.
      if (step === 'hold') {
        const header = (name: string): string => {
          const value = req.headers[name]
          return (Array.isArray(value) ? value[0] : value) ?? ''
        }
        readTextBody(req)
          .then((raw) => {
            const signed = signedByTracy({
              secret: dshSetting('MCP_SEAT_SECRET'),
              path: `${PREFIX}/hold`,
              body: raw,
              timestamp: header('x-seat-timestamp'),
              nonce: header('x-seat-nonce'),
              signature: header('x-seat-signature')
            })
            if (!signed) return { status: 403, body: { code: 'NOT_TRACY' } }
            return answerHold(parseJsonObject(raw))
          })
          .then((answer) => writeJson(res, answer.status, answer.body))
          .catch((error: unknown) =>
            writeJson(res, error instanceof BodyTooLarge ? 413 : 500, {
              code: error instanceof BodyTooLarge ? 'BODY_TOO_LARGE' : 'INTERNAL_ERROR'
            })
          )
        return
      }
      const handler = ROUTES[step]
      if (!handler) {
        writeJson(res, 404, { code: 'UNKNOWN_STEP' })
        return
      }

      // Cookie and origin come FROM THE REQUEST, never from the body — see `handleStart`.
      //
      // Behind the lane's gateway (dsh-passwords) neither survives the hop: `Host` is rewritten to
      // the upstream (`127.0.0.1:51700`) and every browser cookie is dropped before dsh sees the
      // request (measured 2026-09-04). The Worker in front therefore states both in headers the
      // gateway passes through: `x-forwarded-host` / `x-forwarded-proto` for where to call back,
      // `x-tracy-session` for whom to call as. Those win; the raw `Host` and cookie remain the
      // answer for a local profile, which no proxy stands in front of.
      const first = (name: string): string => {
        const value = req.headers[name]
        return (Array.isArray(value) ? value[0] : value) ?? ''
      }
      const forwardedSession = first('x-tracy-session')
      const cookie = forwardedSession ? `tracy_sess=${forwardedSession}` : (req.headers.cookie ?? '')
      // Where to call back: the dsh's own MCP_TRACY_ORIGIN first, the browser's address last —
      // `callback-origin.mjs` says why the browser's address fails inside a container.
      const origin = callbackOrigin({
        configured: dshSetting('MCP_TRACY_ORIGIN'),
        forwardedHost: first('x-forwarded-host'),
        forwardedProto: first('x-forwarded-proto'),
        host: req.headers.host ?? ''
      })
      const context = { cookie, origin }

      readJsonBody(req)
        .then((body) => handler(body, context))
        .then((answer) => writeJson(res, answer.status, answer.body))
        .catch((error: unknown) => {
          if (error instanceof BodyTooLarge) {
            writeJson(res, 413, { code: 'BODY_TOO_LARGE' })
            return
          }
          // Details are not told outside: the body of an unexpected error may carry a URL, a cookie, or a
          // piece of the customer site's HTML. Operators read the log; users read a code.
          writeJson(res, 500, { code: 'INTERNAL_ERROR' })
        })
    }
  }

  // 🔒 Wrapped in `ctx.effect`: unwrapped, HMR or turning the plugin off leaves the old registration, and
  // the next load throws "duplicate route".
  ctx.effect(() => {
    const dispose = ctx.webServer.register(route)
    return () => dispose()
  }, 'tracy-add-site: host routes')

  /**
   * Tell the sidebar's embed route how to sign the viewer into the site it is fetching.
   *
   * `dsh-better-sidebar` deliberately does not mint keys itself: which seat book, which session format, which header the
   * site's sign-in plugin reads — all of it is a fact of the deployment, which it does not know. It
   * only opens a seam; this is where Tracy answers.
   */
  ctx.effect(
    () => ctx.sidebarFrame.useCredentials((url: URL) => credentials.forHost(url.hostname)),
    'tracy-add-site: frame credentials'
  )
}
