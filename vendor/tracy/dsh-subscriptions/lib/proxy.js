// #88: per-account proxy support.
// http/https proxies -> undici ProxyAgent; socks5 -> undici Agent with a socks connector.
import { ProxyAgent, Agent, fetch as undiciFetch } from 'undici'
import tls from 'node:tls'
import { SocksClient } from 'socks'

const cache = new Map()

export function parseProxyUrl(raw) {
  const s = String(raw || '').trim()
  if (!s) return null
  let u
  try { u = new URL(s) } catch { return null }
  const scheme = u.protocol.replace(':', '')
  if (scheme !== 'http' && scheme !== 'https' && scheme !== 'socks5') return null
  if (!u.hostname) return null
  const port = Number(u.port) || (scheme === 'socks5' ? 1080 : (scheme === 'https' ? 443 : 80))
  const auth = u.username
    ? { username: decodeURIComponent(u.username), password: decodeURIComponent(u.password || '') }
    : null
  return { href: s, scheme, host: u.hostname, port, auth }
}

function socksDispatcher(p) {
  return new Agent({
    connect: (opts, callback) => {
      SocksClient.createConnection({
        proxy: {
          host: p.host,
          port: p.port,
          type: 5,
          ...(p.auth ? { userId: p.auth.username, password: p.auth.password } : {}),
        },
        command: 'connect',
        destination: { host: opts.hostname || opts.host, port: Number(opts.port) || 443 },
      }).then(({ socket }) => {
        if (String(opts.protocol) !== 'https:') {
          callback(null, socket)
          return
        }
        const tlsSocket = tls.connect({
          socket,
          servername: opts.servername || opts.hostname || opts.host,
        })
        tlsSocket.once('secureConnect', () => callback(null, tlsSocket))
        tlsSocket.once('error', (e) => callback(e))
      }).catch(callback)
    },
  })
}

function httpDispatcher(p) {
  return new ProxyAgent({
    uri: p.href,
    ...(p.auth ? { token: 'Basic ' + Buffer.from(p.auth.username + ':' + p.auth.password).toString('base64') } : {}),
  })
}

/** Returns a fetch bound to the proxy dispatcher, or null for empty/invalid proxy. Dispatchers are cached per URL. */
export function proxyFetch(raw) {
  const p = parseProxyUrl(raw)
  if (!p) return null
  let f = cache.get(p.href)
  if (!f) {
    const d = p.scheme === 'socks5' ? socksDispatcher(p) : httpDispatcher(p)
    f = (url, init = {}) => undiciFetch(url, { ...init, dispatcher: d })
    cache.set(p.href, f)
  }
  return f
}

/** Pick the fetch for an account ref: per-slot proxy -> deps.fetchImpl -> global fetch. */
export function pickFetch(deps, ref) {
  if (typeof deps?.fetchForRef === 'function') {
    const f = deps.fetchForRef(ref)
    if (f) return f
  }
  return deps?.fetchImpl || fetch
}
