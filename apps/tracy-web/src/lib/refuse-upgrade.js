/**
 * Refusing a WebSocket handshake, shared by the two sockets this app takes on its `upgrade` event:
 * the dsh workspace splice (`workspace/upgrade.js`) and voice input (`speech/relay.js`). Moved here
 * from `workspace/proxy.js` (which re-exports it) when the second one arrived, since a domain may
 * not import a sibling domain (`test/module-graph.test.mjs`).
 */

/** The reason phrase of each status a handshake is refused with. */
const REFUSAL_REASONS = {
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  429: 'Too Many Requests',
  502: 'Bad Gateway',
  503: 'Service Unavailable'
}

/**
 * Refuse a WebSocket handshake with an HTTP status instead of a bare close (#888).
 *
 * A socket closed with no answer is what the Cloudflare tunnel in front reports as an unreachable
 * origin, and the edge turns it into a `502` for the browser — a broken gateway, whatever the real
 * reason was. One short answer with the true status, then the socket is closed. A `503` (the
 * handshake could not be served right now: no database, dsh being redeployed) says when to retry.
 * @param {import('node:stream').Duplex} socket - the browser's socket, not yet spliced.
 * @param {keyof typeof REFUSAL_REASONS} status
 */
export function refuseUpgrade(socket, status) {
  if (socket.destroyed || socket.writableEnded) return
  const lines = [
    `HTTP/1.1 ${status} ${REFUSAL_REASONS[status] ?? 'Error'}`,
    'connection: close',
    'content-length: 0',
    'cache-control: no-store'
  ]
  if (status === 503) lines.push('retry-after: 5')
  // The answer may still be flushing when the caller takes its own `error` listener off; a browser
  // reset in that gap must close this socket, not surface as an uncaught exception that ends the
  // process for every site.
  socket.on('error', () => socket.destroy())
  socket.end(`${lines.join('\r\n')}\r\n\r\n`, () => socket.destroy())
}
