import WebSocket, { WebSocketServer } from 'ws'
import { outgoingCookieHeader } from '../lib/cookies.js'
import { modelWire } from '../lib/model-wire.js'
import { refuseUpgrade } from './proxy.js'

/** Relay admitted dsh streams while keeping deployment routing IDs behind the web boundary. */
export function modelUpgrade(secret) {
  const wire = modelWire(secret)
  const acceptor = new WebSocketServer({ noServer: true, perMessageDeflate: false })
  return (req, socket, head, target, { seatToken, mount, viewerHost }) => {
    const headers = {
      'x-forwarded-host': viewerHost,
      ...(mount ? { 'x-forwarded-prefix': mount } : {}),
      cookie: outgoingCookieHeader(req.headers.cookie ?? null, seatToken) ?? ''
    }
    const address = new URL(target)
    address.protocol = address.protocol === 'https:' ? 'wss:' : 'ws:'
    const protocols = String(req.headers['sec-websocket-protocol'] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const upstream = new WebSocket(address, protocols, {
      headers,
      perMessageDeflate: false,
      handshakeTimeout: 15000
    })
    let client
    const stop = () => {
      upstream.terminate()
      client?.terminate()
    }
    socket.on('error', stop)
    socket.on('close', stop)
    upstream.on('unexpected-response', (_request, response) => {
      const status = [401, 403, 404, 502, 503].includes(response.statusCode) ? response.statusCode : 503
      response.resume()
      refuseUpgrade(socket, status)
      stop()
    })
    upstream.on('error', () => {
      if (!client) refuseUpgrade(socket, 503)
      stop()
    })
    upstream.on('close', () => {
      if (!client) refuseUpgrade(socket, 503)
      client?.terminate()
    })
    upstream.once('open', () => {
      if (socket.destroyed) return stop()
      try {
        acceptor.handleUpgrade(req, socket, head, (downstream) => {
          client = downstream
          client.on('error', stop)
          client.on('close', stop)
          // Await each send's completion before reading more: a slow tab cannot build an unbounded queue.
          client.on('message', (data, binary) => {
            try {
              const privateFrame = JSON.stringify(wire.decode(JSON.parse(data.toString())))
              client.pause()
              upstream.send(privateFrame, { binary }, (error) => {
                if (error) stop()
                else client.resume()
              })
            } catch {
              stop()
            }
          })
          upstream.on('message', (data, binary) => {
            try {
              const publicFrame = JSON.stringify(wire.encode(JSON.parse(data.toString())))
              upstream.pause()
              client.send(publicFrame, { binary }, (error) => {
                if (error) stop()
                else upstream.resume()
              })
            } catch {
              // A frame we cannot transform must never bypass the routing boundary unchanged.
              stop()
            }
          })
        })
      } catch {
        refuseUpgrade(socket, 503)
        stop()
      }
    })
  }
}
