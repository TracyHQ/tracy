/**
 * A loopback HTTP proxy that only dials public addresses, for HTTP clients that cannot pin DNS themselves
 * (e.g. `impit`, whose Chrome TLS fingerprint must pass through untouched).
 *
 * Both `CONNECT host:port` tunnels and absolute-URI `GET http://host/…` requests follow one chain:
 * check the per-process token, resolve the name ONCE, refuse the whole request if any answer is blocked,
 * then connect to the already-checked IP literal, so a rebinding DNS server never gets a second say.
 * There is no direct-connect fallback: anything that fails here fails for the client.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { promises as dnsPromises } from 'node:dns'
import { once } from 'node:events'
import http, { STATUS_CODES } from 'node:http'
import net from 'node:net'

const PROXY_USER = 'tracy'

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
])
// Never forwarded upstream: Host is rebuilt from the URL; the body is not forwarded (GET/HEAD only).
const REQUEST_DROP = new Set([...HOP_BY_HOP, 'host', 'forwarded', 'content-length'])

/**
 * @param {{
 *   isBlockedAddress: (ip: string) => boolean,
 *   lookup?: (host: string, options: { all: true, verbatim: true }) => Promise<{ address: string, family: number }[]>,
 *   allowedPorts?: number[],
 *   connectTimeoutMs?: number,
 *   log?: (event: string, details: object) => void
 * }} deps
 * @returns {Promise<{
 *   proxyUrl: string,
 *   close: () => Promise<void>,
 *   stats: () => { tunnels: number, forwards: number, refused: number }
 * }>}
 */
export async function startGuardedProxy({
  isBlockedAddress,
  lookup = dnsPromises.lookup,
  allowedPorts = [80, 443],
  connectTimeoutMs = 10_000,
  log
}) {
  if (typeof isBlockedAddress !== 'function') throw new TypeError('isBlockedAddress is required')
  const token = randomBytes(32).toString('hex')
  const expectedAuth = Buffer.from(`Basic ${Buffer.from(`${PROXY_USER}:${token}`).toString('base64')}`)
  const ports = new Set(allowedPorts.map(Number))
  const counts = { tunnels: 0, forwards: 0, refused: 0 }
  const sockets = new Set()

  const note = (event, details) => {
    try {
      log?.(event, details)
    } catch {}
  }
  const track = (socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    socket.on('error', () => {})
  }
  const authorized = (header) => {
    const got = Buffer.from(String(header ?? ''))
    return got.length === expectedAuth.length && timingSafeEqual(got, expectedAuth)
  }

  // -> { ip } | { status } ; never hands the hostname to anything that resolves again.
  async function resolveTarget(host) {
    if (net.isIP(host))
      return isBlockedAddress(host) ? { status: 403, reason: 'blocked_address' } : { ip: host }
    let answers
    try {
      answers = await lookup(host, { all: true, verbatim: true })
    } catch {
      return { status: 502, reason: 'dns_failed' }
    }
    if (!Array.isArray(answers) || answers.length === 0) return { status: 403, reason: 'dns_empty' }
    if (answers.some((a) => isBlockedAddress(a?.address))) return { status: 403, reason: 'blocked_address' }
    return { ip: answers[0].address }
  }

  function rejectSocket(socket, status, reason, target) {
    if (status !== 502) counts.refused++
    note('refused', { status, reason, target })
    const auth = status === 407 ? `Proxy-Authenticate: Basic realm="${PROXY_USER}"\r\n` : ''
    if (socket.destroyed) return
    socket.end(
      `HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\n${auth}Connection: close\r\nContent-Length: 0\r\n\r\n`,
      () => socket.destroy()
    )
  }

  function rejectResponse(res, status, reason, target) {
    if (status !== 502) counts.refused++
    note('refused', { status, reason, target })
    if (res.headersSent) return res.destroy()
    const headers = { connection: 'close', 'content-length': '0' }
    if (status === 407) headers['proxy-authenticate'] = `Basic realm="${PROXY_USER}"`
    res.writeHead(status, headers)
    res.end()
  }

  async function onConnect(req, client, head) {
    track(client)
    if (!authorized(req.headers['proxy-authorization'])) return rejectSocket(client, 407, 'auth')
    const target = parseConnectTarget(req.url)
    if (!target) return rejectSocket(client, 400, 'bad_authority')
    if (!ports.has(target.port)) return rejectSocket(client, 403, 'port', req.url)

    // Keep the socket flowing so a client that leaves mid-lookup is seen; hold any early bytes.
    const early = head?.length ? [head] : []
    let gone = false
    const onEarly = (chunk) => early.push(chunk)
    const onGone = () => (gone = true)
    client.on('data', onEarly)
    client.once('end', onGone)
    client.once('close', onGone)

    const resolved = await resolveTarget(target.host)
    if (gone || client.destroyed) return client.destroy()
    if (resolved.status) return rejectSocket(client, resolved.status, resolved.reason, req.url)

    const upstream = net.connect({ host: resolved.ip, port: target.port })
    track(upstream)
    let established = false
    upstream.setTimeout(connectTimeoutMs, () => upstream.destroy(new Error('connect timeout')))
    upstream.once('connect', () => {
      established = true
      upstream.setTimeout(0)
      client.removeListener('data', onEarly)
      if (gone || client.destroyed) {
        client.destroy()
        return upstream.destroy()
      }
      counts.tunnels++
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      for (const chunk of early) upstream.write(chunk)
      upstream.pipe(client)
      client.pipe(upstream)
    })
    upstream.on('error', () => {
      if (!established) rejectSocket(client, 502, 'upstream_failed', req.url)
      else client.destroy()
    })
    upstream.on('close', (hadError) => {
      if (!established) return
      if (hadError) client.destroy()
      else client.end()
    })
    client.on('close', () => upstream.destroy())
  }

  async function onRequest(req, res) {
    req.resume()
    if (!authorized(req.headers['proxy-authorization'])) return rejectResponse(res, 407, 'auth')
    if (req.method !== 'GET' && req.method !== 'HEAD') return rejectResponse(res, 405, 'method')
    const target = parseForwardTarget(req.url)
    if (!target) return rejectResponse(res, 400, 'bad_url')
    if (!ports.has(target.port)) return rejectResponse(res, 403, 'port', target.origin)
    const resolved = await resolveTarget(target.host)
    if (res.destroyed || req.socket.destroyed) return
    if (resolved.status) return rejectResponse(res, resolved.status, resolved.reason, target.origin)

    const headers = forwardHeaders(req.rawHeaders)
    headers.host = target.hostHeader
    const upstream = http.request({
      host: resolved.ip,
      port: target.port,
      method: req.method,
      path: target.path,
      headers,
      setHost: false,
      agent: false,
      timeout: connectTimeoutMs
    })
    counts.forwards++
    upstream.on('socket', track)
    upstream.on('timeout', () => upstream.destroy(new Error('upstream timeout')))
    upstream.on('response', (up) => {
      upstream.setTimeout(0)
      res.writeHead(up.statusCode ?? 502, up.statusMessage, responseHeaders(up.rawHeaders))
      up.on('error', () => res.destroy())
      up.pipe(res)
    })
    upstream.on('error', () => rejectResponse(res, 502, 'upstream_failed', target.origin))
    // Client gone (or done): stop reading from the origin.
    res.on('close', () => upstream.destroy())
    upstream.end()
  }

  const server = http.createServer({ requireHostHeader: false })
  server.on('connect', (req, client, head) => {
    onConnect(req, client, head).catch(() => client.destroy())
  })
  server.on('request', (req, res) => {
    onRequest(req, res).catch(() => res.destroy())
  })
  // An explicit listener keeps Upgrade requests off the forward path on every Node version.
  server.on('upgrade', (req, socket) => {
    track(socket)
    rejectSocket(socket, 400, 'upgrade')
  })
  server.on('clientError', (_err, socket) => {
    if (!socket.writable) return socket.destroy()
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n', () =>
      socket.destroy()
    )
  })
  server.on('connection', track)

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  server.unref()
  const { port } = server.address()

  return {
    proxyUrl: `http://${PROXY_USER}:${token}@127.0.0.1:${port}`,
    stats: () => ({ ...counts }),
    async close() {
      const closed = new Promise((resolve) => server.close(() => resolve()))
      for (const socket of sockets) socket.destroy()
      server.closeAllConnections()
      await closed
    }
  }
}

let shared = null

/**
 * One proxy per process: every caller gets the same promise. Closing it lets the next call start a fresh one.
 * @param {Parameters<typeof startGuardedProxy>[0]} deps
 */
export function sharedGuardedProxy(deps) {
  if (!shared) {
    const started = startGuardedProxy(deps).then((proxy) => ({
      ...proxy,
      async close() {
        if (shared === started) shared = null
        await proxy.close()
      }
    }))
    shared = started
    started.catch(() => {
      if (shared === started) shared = null
    })
  }
  return shared
}

// CONNECT authority must be exactly host:port — no userinfo, path, query or backslash.
function parseConnectTarget(raw) {
  const authority = String(raw ?? '')
  if (!/^[^\s@/?#\\]+:\d{1,5}$/.test(authority)) return null
  let u
  try {
    u = new URL(`http://${authority}`)
  } catch {
    return null
  }
  const port = Number(authority.slice(authority.lastIndexOf(':') + 1))
  const host = bareHost(u.hostname)
  return host ? { host, port } : null
}

function parseForwardTarget(raw) {
  const text = String(raw ?? '')
  if (/[\s\\]/.test(text) || !/^http:\/\//i.test(text)) return null
  const authority = text.slice('http://'.length).split(/[/?#]/, 1)[0]
  if (!authority || authority.includes('@')) return null
  let u
  try {
    u = new URL(text)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' || u.username || u.password) return null
  const host = bareHost(u.hostname)
  if (!host) return null
  return {
    host,
    port: u.port ? Number(u.port) : 80,
    path: `${u.pathname}${u.search}`,
    hostHeader: u.host,
    origin: u.origin
  }
}

function bareHost(hostname) {
  return hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase()
}

function connectionTokens(rawHeaders) {
  const tokens = new Set()
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (rawHeaders[i].toLowerCase() !== 'connection') continue
    for (const t of rawHeaders[i + 1].split(',')) tokens.add(t.trim().toLowerCase())
  }
  return tokens
}

function forwardHeaders(rawHeaders) {
  const named = connectionTokens(rawHeaders)
  return collect(
    rawHeaders,
    (name) => !REQUEST_DROP.has(name) && !named.has(name) && !name.startsWith('x-forwarded-')
  )
}

function responseHeaders(rawHeaders) {
  const named = connectionTokens(rawHeaders)
  return collect(rawHeaders, (name) => !HOP_BY_HOP.has(name) && !named.has(name))
}

function collect(rawHeaders, keep) {
  const out = {}
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const name = rawHeaders[i].toLowerCase()
    if (!keep(name)) continue
    const value = rawHeaders[i + 1]
    if (name in out) out[name] = [].concat(out[name], value)
    else out[name] = value
  }
  return out
}
