import { forwardUpgrade, refuseUpgrade } from './proxy.js'
import { upstreamUrl } from './scope.js'
import { sessionFromCookieHeader, withViewAs } from '../lib/session.js'

/**
 * The raw `upgrade` listener that splices a browser's WebSocket into a host's dsh (`server.js`).
 *
 * 🔒 IT NEVER THROWS OUT OF ITSELF. Node calls an `upgrade` listener and drops the promise an async
 * one returns, so a rejection inside it is an unhandled rejection, and that ends the process: on the
 * stand (11/10/2026) one passing Docker DNS failure (`getaddrinfo EAI_AGAIN postgres`, thrown by the
 * resolver's database read while dsh was being rebuilt) took tracy-web down for every site
 * (`Exited (1)`). A failure here is one handshake's: it is logged in one line, that socket is closed,
 * and the service keeps serving; the browser's client reconnects on its own.
 *
 * The same holds for the client socket itself: Node takes its own `error` listener off a socket it
 * hands to `upgrade`, so a browser that resets the connection while the checks below await would emit
 * an `error` nobody listens to — an uncaught exception, the same crash. One listener is put on first
 * and taken off once `forwardUpgrade` has added the splice's own teardown.
 *
 * 🔒 A REFUSED HANDSHAKE IS ANSWERED WITH ITS STATUS, NEVER WITH A BARE CLOSE (#888). tracy-web sits
 * behind a Cloudflare tunnel, and `cloudflared` reports a socket closed with no answer as "Unable to
 * reach the origin service … EOF", which the edge hands the browser as `502`. Measured on dev
 * 11/10/2026: every `remote.mux` failure in the tunnel log was that EOF — a tab of a deleted site
 * retrying every 14 s for an hour, a session with no seat, the minutes a dsh redeploy takes — and
 * all of them read as "Tracy's gateway is broken". `refuseUpgrade` says which one it was.
 *
 * @param {{
 *   resolver: any,
 *   config: { origin: string, sessionSecret: string },
 *   log?: { log: (...a: any[]) => void, warn: (...a: any[]) => void },
 *   session?: (cookieHeader: string | null, secret: string) => Promise<string | null>,
 *   forward?: typeof forwardUpgrade
 * }} deps - `resolver`: the workspace resolver (`workspaceResolver`), null without a pool.
 * @returns {(req: import('node:http').IncomingMessage, socket: import('node:stream').Duplex, head: Buffer) => Promise<void>}
 */
export function upgradeListener({
  resolver,
  config,
  log = console,
  session = sessionFromCookieHeader,
  forward = forwardUpgrade
}) {
  return async (req, socket, head) => {
    const early = (error) => log.warn(`[ws] client socket error before the splice: ${errorText(error)}`)
    socket.on('error', early)
    try {
      await splice(req, socket, head)
      // Spliced (or closed): the splice's own teardown listens from here on.
      socket.off('error', early)
    } catch (error) {
      log.warn(`[ws] handshake for ${String(req.url ?? '/').slice(0, 120)} dropped: ${errorText(error)}`)
      refuseUpgrade(socket, 503)
    }
  }

  async function splice(req, socket, head) {
    if (!resolver) return refuseUpgrade(socket, 503)
    const url = new URL(req.url ?? '/', config.origin)
    // A page served under its own mount (`/new/`, and since 20/09 `/<siteKey>/` too) opens its
    // socket under that mount, so the handshake path names the scope by itself. A site page still
    // on the old shape (`<base href="/">`) opens it at a ROOT path, and a browser sends no Referer
    // with a handshake — the `tracy_site` pointer is what says which site that socket belongs to.
    let located = resolver.locate({
      pathname: url.pathname,
      referer: req.headers.referer ?? null,
      cookieHeader: req.headers.cookie ?? null,
      origin: config.origin
    })
    located = await resolver.canonicalize(located)
    if (located.scope === 'root') return refuseUpgrade(socket, 404)
    // An admin's view of a customer (`/ops` › View as user) opens its socket as that customer, the same
    // identity the page's seat cookie was minted for; a handshake carries no middleware scope of its own.
    const email = await withViewAs(true, () => session(req.headers.cookie ?? null, config.sessionSecret))
    if (!email) return refuseUpgrade(socket, 401)
    const seat = await resolver.seatFor({ located, email })
    if (seat.refused) return refuseUpgrade(socket, 403)
    // No cookie, or one minted for a different grant than the one in force: refused here, and
    // the page's next HTTP request re-mints — the client reconnects on its own after that.
    const token = resolver.tokenFor({ seat, cookieHeader: req.headers.cookie ?? null })
    if (!token) return refuseUpgrade(socket, 401)
    const target = upstreamUrl(seat.dsh.origin, located, url.search, { prefixed: seat.prefixed })
    log.log(`[ws] ${located.siteKey ?? located.scope} → ${target.origin}${target.pathname}`)
    forward(req, socket, head, target, {
      seatToken: token,
      mount: located.mount,
      viewerHost: url.host
    })
  }
}

/** One line of an error: its code when it has one (`EAI_AGAIN`), then its message. */
function errorText(error) {
  const e = /** @type {any} */ (error)
  const code = typeof e?.code === 'string' ? `${e.code} ` : ''
  return `${code}${String(e?.message ?? e)
    .replace(/\s+/g, ' ')
    .slice(0, 200)}`
}
