/**
 * The two ways a request reaches a host's dsh. HTTP goes through fetch; a WebSocket upgrade is
 * spliced at the socket — Hono never sees it, which is why server.js owns the `upgrade` event.
 * Ported from cowork-web's proxyToAgent (headers) and dev-fleet.mjs (the splice).
 */
import net from 'node:net'
import { outgoingCookieHeader, relabelSetCookie } from '../lib/cookies.js'
import { refuseUpgrade } from '../lib/refuse-upgrade.js'
import { proxiedSessionToken } from '../lib/session.js'

const HOP_BY_HOP = ['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host', 'origin', 'referer']

// fetch() already decodes a compressed body before we ever see `upstream.body` — these headers
// describe the WIRE bytes dsh sent (compressed encoding, compressed length, or a byte range cut
// from the compressed body), not the decoded bytes we're about to send on. Copying them anyway
// tells the browser to gunzip plain text, which fails the whole request (measured live: Chrome
// refuses the page with a content-decoding error while curl, which never asked to decode,
// doesn't notice). The server framing this response — @hono/node-server — must recompute all of
// these itself from the decoded body, so none of them may survive the copy.
//
// The rest of this list is the ordinary hop-by-hop set (RFC 7230 §6.1) on the RESPONSE side —
// `connection`/`keep-alive`/`proxy-connection`/`te`/`trailer`/`upgrade` describe OUR connection
// to dsh, not the browser's connection to us, and fetch() does not strip them on the way in
// (measured directly: a plain `connection: keep-alive` from the upstream passes straight through
// `upstream.headers` untouched — undici treats it as an ordinary response header).
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
 * @param {Request} request - the browser's request, as Hono hands it over.
 * @param {URL} target - where on the host's dsh it goes (`workspace/scope.js`'s `upstreamUrl`).
 * @param {object} opts
 * @param {string} opts.mount - what `x-forwarded-prefix` says; `''` sends no prefix at all.
 * @param {string} [opts.locationPrefix] - what a same-origin `Location` from dsh is prefixed with
 *   on the way back. Defaults to `mount`, the shape a site's dsh needs (it answers at the root, so
 *   its redirects are relativised under the site). The creation workspace passes `''`: its
 *   forwarded path carries `/new` and the gateway already writes the mount into every redirect it
 *   hands to the browser — prefixing again would make `/new/new/…`.
 */
export async function forwardHttp(
  request,
  target,
  { mount, seatToken, seatCookieName, viewerHost, locationPrefix = mount }
) {
  const headers = new Headers(request.headers)
  for (const h of HOP_BY_HOP) headers.delete(h)
  if (mount) headers.set('x-forwarded-prefix', mount)
  else headers.delete('x-forwarded-prefix')
  const cookie = outgoingCookieHeader(request.headers.get('cookie'), seatToken)
  if (cookie) headers.set('cookie', cookie)
  else headers.delete('cookie')
  headers.set('x-forwarded-host', viewerHost)
  headers.set('x-forwarded-proto', new URL(request.url).protocol.replace(':', ''))
  // Who the viewer is, stated outright — the cookie above cannot say it. `outgoingCookieHeader`
  // drops every `tracy_*` cookie before dsh sees the request, and that is right: dsh has no
  // business reading Tracy's session. But a plugin's host half INSIDE that dsh calls back here as
  // the viewer, and with neither cookie nor forwarded session it refuses itself with
  // NOT_SIGNED_IN — the whole import dies at its first call, after the person has already typed
  // their site's admin password. The Worker this proxy replaced carried the same header for the
  // same reason (`workers/cowork-web/src/worker.js:249-251`).
  //
  // 🔒 ALWAYS SET, NEVER MERGED. Anything that reaches this proxy can put this name on its own
  // request, and the host half sends whatever session it is handed wherever `x-forwarded-host`
  // points. Deriving it from the cookie we just verified — and deleting it when there is none —
  // is what keeps a forged header from becoming somebody's session.
  const viewerSession = proxiedSessionToken(request.headers.get('cookie'))
  if (viewerSession) headers.set('x-tracy-session', viewerSession)
  else headers.delete('x-tracy-session')
  const init = { method: request.method, headers, redirect: 'manual', signal: request.signal }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body
    init.duplex = 'half'
  }
  // 🔒 A dsh THAT IS NOT ANSWERING MUST NOT LEAVE THIS AS AN UNCAUGHT `TypeError: fetch failed`.
  // It did until 11/09, and the cost was measured twice on the dev machine: `build-dsh-image.yml`
  // redeploys dsh routinely (its `start_period` alone is 180s), and for that whole window every
  // door through this proxy died with a stack trace naming an IP and a port — no door, no host,
  // no site. The browser got whatever the edge makes of a crashed handler (Cloudflare turns it
  // into its own 503 page), so a person saw a dialog that simply did nothing, and the server log
  // did not say which dialog.
  //
  // JSON and not an HTML page: almost everything through here is the dsh client's own `fetch`,
  // and it renders a `code` it can read. `messagePage` lives in `bar/` — a sibling domain the
  // module graph does not let this file reach — and a second copy of that shell here would be a
  // second thing to keep in step for a case measured in seconds per deploy.
  let upstream
  try {
    upstream = await fetch(target, init)
  } catch (error) {
    // ⚠ AN ABORT IS NOT AN OUTAGE. When the BROWSER goes away mid-request, `fetch` rejects here
    // too — and turning that into a 502 would both hide a cancelled request behind an error page
    // and break the contract the caller relies on (`test/proxy.test.mjs` asserts this promise
    // REJECTS on abort, which is how the outbound fetch is proven to be cancelled with it).
    if (request.signal?.aborted || error?.name === 'AbortError') throw error
    const cause = error?.cause?.code ?? error?.message ?? 'unknown'
    console.error(
      `[workspace] ${request.method} ${new URL(request.url).pathname} → ${target.origin}: ${cause}`
    )
    return Response.json(
      { code: 'WORKSPACE_UNREACHABLE', reason: cause },
      { status: 502, headers: { 'cache-control': 'no-store' } }
    )
  }
  const out = new Headers(upstream.headers)
  for (const h of RESPONSE_REFRAMED) out.delete(h)
  const location = upstream.headers.get('location')
  if (location) {
    const to = new URL(location, target)
    if (to.origin === target.origin) out.set('location', `${locationPrefix}${to.pathname}${to.search}`)
  }
  const planted = upstream.headers.getSetCookie?.() ?? []
  if (planted.length > 0) {
    out.delete('set-cookie')
    for (const c of relabelSetCookie(planted, seatCookieName)) out.append('set-cookie', c)
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out
  })
}

// Lives in lib/ since voice input (`speech/relay.js`) refuses its handshakes the same way (#888).
export { refuseUpgrade }

export function forwardUpgrade(req, socket, head, target, { seatToken, mount, viewerHost }) {
  let spliced = false
  const upstream = net.connect(Number(target.port || 80), target.hostname, () => {
    spliced = true
    const headers = { ...req.headers }
    const cookie = outgoingCookieHeader(req.headers.cookie ?? null, seatToken)
    if (cookie) headers.cookie = cookie
    else delete headers.cookie
    if (mount) headers['x-forwarded-prefix'] = mount
    // The gateway refuses any upgrade whose `Origin` does not match the host it believes it is
    // published under, and for a loopback proxy that host comes from `x-forwarded-host` — falling
    // back to `Host`, which the next line overwrites with the gateway's own address. Send the
    // viewer's host, exactly as `forwardHttp` does, or the browser's `Origin` is compared against
    // dsh's own address, never matches, and EVERY socket is refused with 403 before any role is
    // even read. The page then loops: the client treats its first stream as the connection's
    // lifeline, retries forever, and the workspace sits on "Loading workspaces..." — measured in
    // a real browser, and invisible to every test that did not speak to the real gateway.
    headers['x-forwarded-host'] = viewerHost
    // …and drop the browser's own `Origin`/`Referer`, exactly as `forwardHttp` does through
    // HOP_BY_HOP. `x-forwarded-host` alone is not enough: the gateway only reads it when the
    // connection reaches it from loopback, and a gateway inside a container sees this proxy
    // arrive on the Docker bridge instead. It then compares the browser's `Origin` against its
    // own `Host` and refuses. Stripping the header is what the check itself asks for — it passes
    // any request that carries no `Origin` — and it is what the Worker this replaced already did.
    // The trust boundary is this proxy: it verified the session and minted the seat before any
    // byte reached dsh, so the browser's cross-origin story adds nothing here.
    for (const h of ['origin', 'referer']) delete headers[h]
    headers.host = target.host
    const lines = Object.entries(headers).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    upstream.write(
      `${req.method} ${target.pathname}${target.search} HTTP/1.1\r\n${lines.join('\r\n')}\r\n\r\n`
    )
    if (head.length > 0) upstream.write(head)
    socket.pipe(upstream)
    upstream.pipe(socket)
  })
  // 'error' alone isn't enough: `.destroy()` with no error argument never emits 'error' — the
  // ordinary way a browser tab closes, a network drops, or a laptop sleeps. And 'close' alone
  // isn't enough either: both `socket` (a hijacked http.Server upgrade socket) and `upstream`
  // (a bare net.connect()) default to allowHalfOpen semantics where the *far* end's FIN only
  // fires 'end' on the readable side — 'close' does not follow until something explicitly ends
  // or destroys the socket. Left alone, a plain, graceful client disconnect (no error, and never
  // reaching a full local 'close') leaves the connection to dsh half-open forever: confirmed by
  // direct reproduction — with only 'close'/'error' handlers, `socket`'s `readableEnded` flips
  // true, `destroyed` never does, and the paired dsh connection sits open indefinitely. Treating
  // 'end' the same as 'close'/'error' — full teardown of both legs, no half-open passthrough —
  // is correct for a WebSocket splice: unlike an HTTP request/response, there's no meaning here
  // for "the browser is done sending but still expects more from dsh" or vice versa. `.destroy()`
  // on an already-destroyed socket is a documented no-op, so it's safe for more than one of these
  // to fire for the same teardown, whichever side leaves first.
  const teardown = (from, to) => {
    const kill = () => to.destroy()
    from.on('error', kill)
    from.on('close', kill)
    from.on('end', kill)
  }
  // dsh not there at all (refused, unresolvable — the minutes a redeploy takes): nothing was spliced
  // yet, so the browser is told so with a status, not handed a bare close the edge calls a 502.
  const leaveBrowser = () => (spliced ? socket.destroy() : refuseUpgrade(socket, 503))
  for (const event of ['error', 'close', 'end']) upstream.on(event, leaveBrowser)
  teardown(socket, upstream)
}
