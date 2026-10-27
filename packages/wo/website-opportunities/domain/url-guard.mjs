import { isIP } from 'node:net'

const DEFAULT_PORTS = { 'http:': '80', 'https:': '443' }

// [base, prefixLength]
const BLOCKED_V4 = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
].map(([ip, len]) => [v4ToInt(ip), len])

export class UrlBlockedError extends Error {
  constructor(reason, url) {
    super(`URL blocked: ${reason}`)
    this.name = 'UrlBlockedError'
    this.code = 'URL_BLOCKED'
    this.reason = reason
    if (url) this.url = url
  }
}

function v4ToInt(ip) {
  return ip.split('.').reduce((acc, p) => ((acc << 8) | Number(p)) >>> 0, 0)
}

function v4Blocked(n) {
  return BLOCKED_V4.some(([base, len]) => len === 0 || n >>> (32 - len) === base >>> (32 - len))
}

// Returns 16 bytes or null.
function parseV6(ip) {
  let s = ip.toLowerCase()
  const zone = s.indexOf('%')
  if (zone >= 0) s = s.slice(0, zone)
  const lastColon = s.lastIndexOf(':')
  const dotted = s.slice(lastColon + 1)
  if (dotted.includes('.')) {
    if (isIP(dotted) !== 4) return null
    const n = v4ToInt(dotted)
    s = `${s.slice(0, lastColon + 1)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const parse = (part) =>
    part === '' ? [] : part.split(':').map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN))
  const head = parse(halves[0])
  const rest = halves.length === 2 ? parse(halves[1]) : []
  const words = [...head]
  if (halves.length === 2) {
    const fill = 8 - head.length - rest.length
    if (fill < 1) return null
    for (let i = 0; i < fill; i++) words.push(0)
  }
  words.push(...rest)
  if (words.length !== 8 || words.some((w) => !Number.isInteger(w) || w < 0 || w > 0xffff)) return null
  return words
}

function v6Blocked(words) {
  const [w0, w1, w2, w3, w4, w5, w6, w7] = words
  const embedded = ((w6 << 16) | w7) >>> 0
  const zeroPrefix = w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0 && w4 === 0
  if (zeroPrefix && w5 === 0 && w6 === 0 && (w7 === 0 || w7 === 1)) return true // :: and ::1
  if (zeroPrefix && w5 === 0xffff) return v4Blocked(embedded) // IPv4-mapped
  // Translation/tunnel prefixes reach an IPv4 host through a gateway we cannot see: block them whole.
  if (zeroPrefix && w5 === 0) return true // ::/96 IPv4-compatible (deprecated)
  if (w0 === 0x64 && w1 === 0xff9b && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0) return true // 64:ff9b::/96 NAT64
  if (w0 === 0x64 && w1 === 0xff9b && w2 === 1) return true // 64:ff9b:1::/48 local-use NAT64
  if (w0 === 0x2002) return true // 2002::/16 6to4
  if (w0 === 0x2001 && w1 === 0) return true // 2001::/32 Teredo
  if ((w0 & 0xfe00) === 0xfc00) return true // fc00::/7 ULA
  if ((w0 & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((w0 & 0xffc0) === 0xfec0) return true // fec0::/10 site-local (deprecated)
  if ((w0 & 0xff00) === 0xff00) return true // multicast
  if (w0 === 0x2001 && w1 === 0x0db8) return true // documentation
  if (w0 === 0x100 && w1 === 0 && w2 === 0 && w3 === 0) return true // discard prefix
  return false
}

export function isBlockedAddress(address) {
  const raw = String(address ?? '').replace(/^\[|\]$/g, '')
  const kind = isIP(raw)
  if (kind === 4) return v4Blocked(v4ToInt(raw))
  if (kind === 6) {
    const words = parseV6(raw)
    return words ? v6Blocked(words) : true
  }
  return true
}

/**
 * Throws UrlBlockedError ({code:'URL_BLOCKED', reason}) unless the URL is http(s), has no credentials,
 * uses a default port (or one in `allowPorts`) and every DNS answer is a public address.
 * Call again on every redirect hop: a later lookup may answer differently (DNS rebinding).
 */
export async function assertPublicUrl(url, { resolve } = {}, { allowPorts = [] } = {}) {
  let u
  try {
    u = url instanceof URL ? new URL(url.href) : new URL(String(url))
  } catch {
    throw new UrlBlockedError('invalid_url')
  }
  if (!(u.protocol in DEFAULT_PORTS)) throw new UrlBlockedError('scheme', u.protocol)
  if (u.username || u.password) throw new UrlBlockedError('credentials')
  if (u.port && u.port !== DEFAULT_PORTS[u.protocol] && !allowPorts.map(String).includes(u.port)) {
    throw new UrlBlockedError('port')
  }
  const host = u.hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase()
  if (!host) throw new UrlBlockedError('invalid_url')
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new UrlBlockedError('private_address')
    return u
  }
  if (host === 'localhost' || host.endsWith('.localhost')) throw new UrlBlockedError('private_address')
  if (typeof resolve !== 'function') throw new UrlBlockedError('dns_unavailable')
  let answers
  try {
    answers = await resolve(host)
  } catch {
    throw new UrlBlockedError('dns_failed')
  }
  if (!Array.isArray(answers) || answers.length === 0) throw new UrlBlockedError('dns_empty')
  if (answers.some((a) => isBlockedAddress(a?.address))) throw new UrlBlockedError('private_address')
  return u
}
