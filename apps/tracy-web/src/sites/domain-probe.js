/**
 * "Does this domain open THIS site" — asked of the real domain, from outside, over HTTPS (#1037).
 *
 * A customer's own domain used to be called connected when the host's script printed that it had
 * written an ingress rule. That proves a rule exists, not that the name reaches the site: DNS may
 * point elsewhere, the certificate may not exist, another server may be answering. The only thing
 * that proves it is a request to the name itself that comes back from this deployment's own row for
 * the name.
 *
 * 🔒 A CHALLENGE AND A PROOF, NOT A TOKEN SENT AND READ BACK. The request carries a random
 * challenge; the answer must be `HMAC(probe_secret, name, site, challenge)`, where `probe_secret` is
 * minted for this connection attempt and never leaves the database. So an answer proves three
 * things at once: it came from a process that reads this deployment's book (an echo server, a
 * parked page, a redirect cannot make it), for the row of THIS site (another site's row has another
 * secret), for THIS attempt (a new attempt mints a new secret, and an answer kept from an older one
 * no longer verifies).
 *
 * 🔒 AND THEN THE SITE'S OWN PAGE, ASKED AS ANY VISITOR ASKS IT. The proof above is given by the
 * web process from its database: it says the name is routed here, not that the site behind it
 * answers — a stopped CMS would still "prove" a domain whose every page is a 502. So the home page
 * itself is requested, and that request carries NOTHING that tells it from a visitor's: no
 * challenge, no key, an ordinary browser's headers. Whatever answers at the domain cannot treat
 * the probe one way and visitors another by what the request says. What makes the answer a proof
 * is on Tracy's side only: before each request the prober writes a fresh nonce and the path it is
 * about to ask on the name's row (`page.open`, a window of seconds), and the proxy — which reads
 * that row for every own-domain request — signs what it SENT with this attempt's secret into a
 * response header. The same window is the one thing that lets a name still being connected be
 * shown a page of its (published) site: that path, by GET, while it is open.
 *
 * 🔒 THE PROOF IS OF THE BYTES, ALL OF THEM. What the proxy signs is `nonce, path, status, content
 * type, Location, SHA-256 of the whole body it sent` — and it signs only once it has that whole
 * body in hand (`bar/route.js`); a body it could not read to its end gets no proof. The prober
 * reads the answer to ITS end (`readWhole`: a deadline, a ceiling on the bytes on the wire and on
 * the bytes once unpacked, and the transfer must finish cleanly), hashes what it read, and checks
 * the signature over that hash. So a server at the domain that relays the request to Tracy, keeps
 * the signed header and sends a page of its own fails (another body, another hash); and so does an
 * answer that begins like a page and then breaks off, stalls, never ends, or does not unpack.
 *
 * 🔒 CONNECTED MEANS A PAGE WAS SERVED, NOT THAT SOMETHING ANSWERED. The signed status must end in
 * 200 with an HTML document as the body (`servedPage` — a 204, a 206 or an empty 200 is not a
 * page). A redirect that stays on the domain — same scheme, host and port, no credentials — is
 * FOLLOWED, a bounded number of times, each hop proven the same way: `/` → `/en/` ends at the
 * page, `/` → `/` ends nowhere and fails.
 *
 * 🔒 ONLY A PUBLIC ADDRESS IS DIALLED, AND THE ONE THAT WAS CHECKED. The name is the customer's and
 * its records are whatever its owner writes: pointed at `127.0.0.1` or at a metadata address, a
 * probe would be a request Tracy makes inside its own network on a stranger's word. Every address
 * the name resolves to must be public, and the socket is opened to the address that was checked —
 * never resolved a second time (a second answer may differ: DNS rebinding). No cookie, no
 * credential and no redirect is ever followed.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import https from 'node:https'
import zlib from 'node:zlib'
import { BlockList, isIP } from 'node:net'
import { hmacHex } from '../lib/hmac.js'

/** The path the probe asks and the header its challenge rides (`bar/route.js` answers both). */
export const PROBE_PATH = '/__tracy/domain-probe'
export const PROBE_HEADER = 'x-tracy-domain-probe'
/** The proxy's signature of the site's own status on the page request (out; nothing goes in). */
export const PROBE_PAGE_HEADER = 'x-tracy-domain-probe-page'
/**
 * The largest page a proof is given for and read for: on the wire, and once unpacked. The proxy
 * reads a page whole to project it up to the same size (`bar/own-domain-integrity.js`
 * `PROJECTED_MAX`); a home page past it stays pending with the reason `PAGE_TOO_LARGE`.
 */
export const PAGE_BYTES_MAX = 5 * 1024 * 1024
/** How long one page request may take from its first byte sent to its last byte read. */
const PAGE_MS = 20000
/** How many redirects that stay on the name are followed to reach its page. */
const PAGE_HOPS = 3
const PAGE_PATH_MAX = 2048
const NONCE = /^[a-f0-9]{32,64}$/

/**
 * Whether an answer is a page being served: status 200, an HTML content type, and a body that
 * is an HTML document. The ONE definition of "the site serves its page" — the probe of an own
 * domain and the check a removal makes of the Tracy address (`address.js` `addressStanding`) both
 * read it, so neither can call an empty answer, a partial one or a non-page a page.
 * 🔒 `body` IS THE WHOLE BODY, READ TO ITS END WITHOUT AN ERROR (`readWhole`). A caller that could
 * not read it whole has no page to ask this about.
 * @param {{ status: number, contentType: string | null | undefined, body: string }} answer -
 *   `body`: every byte of the answer, decoded byte for byte
 */
export function servedPage({ status, contentType, body }) {
  if (status !== 200) return false
  const type = String(contentType ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  if (type !== 'text/html' && type !== 'application/xhtml+xml') return false
  return /<(?:!doctype\s+html|html|head|body)[\s>]/i.test(String(body ?? ''))
}
/** How long the whole request may take, and the most of an answer that is read. */
const PROBE_MS = 8000
const ANSWER_MAX = 256
const CHALLENGE = /^[a-f0-9]{32,64}$/

/** Addresses nothing on the public internet is reached at. */
const NOT_PUBLIC = new BlockList()
for (const [net, bits] of [
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
  ['224.0.0.0', 3]
])
  NOT_PUBLIC.addSubnet(net, bits, 'ipv4')
for (const [net, bits] of [
  ['::', 127],
  // NAT64 (well-known and local-use) and Teredo carry an IPv4 destination somebody else chooses.
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['fec0::', 10],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8]
])
  NOT_PUBLIC.addSubnet(net, bits, 'ipv6')

/**
 * The sixteen bytes of an IPv6 address in any spelling `net.isIP` accepts (`::`, a dotted tail), or
 * null. A zone (`fe80::1%eth0`) is not an address a public name resolves to.
 */
function ipv6Bytes(address) {
  if (address.includes('%')) return null
  let text = address
  const dotted = /^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text)
  if (dotted) {
    const [a, b, c, d] = dotted.slice(2).map(Number)
    text = `${dotted[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const groups = (part) => (part === '' ? [] : part.split(':'))
  const head = groups(halves[0])
  const tail = halves.length === 2 ? groups(halves[1]) : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null
  const all = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  const bytes = []
  for (const group of all) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null
    const value = Number.parseInt(group, 16)
    bytes.push(value >> 8, value & 0xff)
  }
  return bytes
}

/**
 * The IPv4 address an IPv6 address carries inside it, when it is one of the forms that are only
 * another way to reach an IPv4 host, or null. 🔒 JUDGED FROM THE BYTES, NEVER FROM THE SPELLING:
 * `::ffff:127.0.0.1`, `::ffff:7f00:1` and `0:0:0:0:0:ffff:7f00:1` are one address.
 *   ::ffff:0:0/96    IPv4-mapped          ::ffff:0:0:0/96  IPv4-translated (SIIT)
 *   ::/96            IPv4-compatible      2002::/16        6to4 (the IPv4 address is bits 16–48)
 */
function embeddedIpv4(bytes) {
  const zero = (from, to) => bytes.slice(from, to).every((byte) => byte === 0)
  const dotted = (at) => bytes.slice(at, at + 4).join('.')
  if (zero(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) return dotted(12)
  if (zero(0, 8) && bytes[8] === 0xff && bytes[9] === 0xff && zero(10, 12)) return dotted(12)
  // `::` and `::1` are in this range too, and read as 0.0.0.0 and 0.0.0.1: not public either.
  if (zero(0, 12)) return dotted(12)
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return dotted(2)
  return null
}

/** Whether `address` is one a probe may dial: a public IPv4 or IPv6 address. */
export function publicAddress(address) {
  const text = String(address)
  const family = isIP(text)
  if (family === 0) return false
  if (family === 4) return !NOT_PUBLIC.check(text, 'ipv4')
  const bytes = ipv6Bytes(text)
  if (bytes === null) return false
  // An IPv4 address written as IPv6 is judged as the IPv4 address it is.
  const inner = embeddedIpv4(bytes)
  if (inner !== null) return !NOT_PUBLIC.check(inner, 'ipv4')
  // The canonical spelling, so the list is asked about the address and not about how it was typed.
  const canonical = Array.from({ length: 8 }, (_, i) => ((bytes[i * 2] << 8) | bytes[i * 2 + 1]).toString(16))
  return !NOT_PUBLIC.check(canonical.join(':'), 'ipv6')
}

/** The proof of one challenge for one row. */
export function probeProof(secret, { name, siteKey, challenge }) {
  return hmacHex(secret, `tracy-domain-probe\n${name}\n${siteKey}\n${challenge}`)
}

/**
 * What `/__tracy/domain-probe` answers for the row a hostname resolved to (`address.js`
 * `ownDomainByName`), or null — refused like any other path — when there is nothing to prove: no
 * attempt in hand, a challenge that is not one, or a name whose route the host never installed.
 * @param {{ name: string, state: string, routedAt: unknown, probeSecret: string | null,
 *   site: { site_key: string } | null }} own
 * @param {string | null} challenge
 */
export async function probeAnswer(own, challenge) {
  if (!own?.site || typeof own.probeSecret !== 'string' || own.probeSecret === '') return null
  if (typeof challenge !== 'string' || !CHALLENGE.test(challenge)) return null
  if (own.state !== 'active' && !(own.state === 'pending' && own.routedAt)) return null
  return probeProof(own.probeSecret, { name: own.name, siteKey: own.site.site_key, challenge })
}

/** The SHA-256 of a body, as the proof names it. */
export const bodyDigest = (bytes) => createHash('sha256').update(bytes).digest('hex')

/**
 * The proxy's word for "this is what I sent for the page request for `path`": the status, the
 * content type, the `Location` and the digest of EVERY byte of the body, for this site, name and
 * nonce. One field per line, and none of them can hold a line break (a header value cannot).
 */
export function pageProof(secret, { name, siteKey, nonce, path, status, contentType, location, digest }) {
  const line = (value) => String(value ?? '').replace(/[\r\n]/g, ' ')
  return hmacHex(
    secret,
    [
      'tracy-domain-probe-page-v2',
      name,
      siteKey,
      nonce,
      line(path),
      Number(status),
      line(contentType),
      line(location),
      line(digest)
    ].join('\n')
  )
}

/**
 * A body read to its end: `{ bytes }`, or `{ error }` — `PAGE_TOO_LARGE` past `max`,
 * `PAGE_INCOMPLETE` when it failed, was cut off or did not end before `ms`. Never a prefix.
 * @param {ReadableStream<Uint8Array> | null | undefined} body - a fetch `Response`'s
 * @param {{ max?: number, ms?: number }} [limits]
 * @returns {Promise<{ bytes: Buffer } | { error: 'PAGE_TOO_LARGE' | 'PAGE_INCOMPLETE' }>}
 */
export async function readWhole(body, { max = PAGE_BYTES_MAX, ms = PAGE_MS } = {}) {
  if (!body) return { bytes: Buffer.alloc(0) }
  const reader = body.getReader()
  const chunks = []
  let size = 0
  let timer
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve('late'), ms)
    timer.unref?.()
  })
  try {
    for (;;) {
      const next = await Promise.race([reader.read(), late])
      if (next === 'late') return { error: 'PAGE_INCOMPLETE' }
      if (next.done) return { bytes: Buffer.concat(chunks) }
      size += next.value.length
      if (size > max) return { error: 'PAGE_TOO_LARGE' }
      chunks.push(Buffer.from(next.value))
    }
  } catch {
    return { error: 'PAGE_INCOMPLETE' }
  } finally {
    clearTimeout(timer)
    reader.cancel().catch(() => {})
  }
}

const sameText = (a, b) => {
  const left = Buffer.from(String(a ?? ''))
  const right = Buffer.from(String(b ?? ''))
  return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * Whether a request on an own domain is the page this attempt's probe is asking for right now, for
 * the row the hostname resolved to: null (an ordinary request, served or refused by the row's state
 * alone), or the function that signs what the proxy sent in answer. Decided by the row and
 * nothing the request carries: the window the prober opened is still open (`own.page`, read with
 * the row on the database's clock), and the request is a GET of exactly the path it named.
 * @param {Parameters<typeof probeAnswer>[0] & { page?: { nonce: string, path: string } | null }} own
 * @param {{ method: string, path: string }} asked - `path`: pathname and query as requested
 * @returns {Promise<null | ((sent: { status: number, contentType: string | null,
 *   location: string | null, digest: string }) => Promise<string>)>}
 */
export async function probePage(own, { method, path }) {
  if (!own?.site || typeof own.probeSecret !== 'string' || own.probeSecret === '') return null
  if (own.state !== 'active' && !(own.state === 'pending' && own.routedAt)) return null
  const page = own.page
  if (!page || typeof page.nonce !== 'string' || !NONCE.test(page.nonce)) return null
  if (method !== 'GET' || typeof page.path !== 'string' || page.path !== path) return null
  const about = { name: own.name, siteKey: own.site.site_key, nonce: page.nonce, path }
  return (sent) => pageProof(own.probeSecret, { ...about, ...sent })
}

/**
 * The whole body of a Node response, unpacked: `done({ bytes })` only when the transfer finished
 * cleanly AND the unpacking reached its own end; otherwise `done({ error })`. A body that is cut
 * off, stalls past the caller's deadline, grows past `PAGE_BYTES_MAX` (on the wire or unpacked), is
 * packed in a way this cannot undo or does not unpack, is not a body that was read.
 */
function readPage(response, done) {
  const coding = String(response.headers['content-encoding'] ?? 'identity')
    .trim()
    .toLowerCase()
  const unpack =
    coding === 'gzip' || coding === 'x-gzip'
      ? zlib.createGunzip()
      : coding === 'deflate'
        ? zlib.createInflate()
        : coding === 'br'
          ? zlib.createBrotliDecompress()
          : null
  let ended = false
  const end = (answer) => {
    if (ended) return
    ended = true
    response.destroy()
    unpack?.destroy()
    done(answer)
  }
  if (unpack === null && coding !== 'identity' && coding !== '') return end({ error: 'PAGE_INCOMPLETE' })
  const chunks = []
  let wire = 0
  let size = 0
  response.on('data', (chunk) => {
    wire += chunk.length
    if (wire > PAGE_BYTES_MAX) return end({ error: 'PAGE_TOO_LARGE' })
    if (unpack) return unpack.write(chunk)
    size += chunk.length
    chunks.push(chunk)
  })
  // 'end' is the message read to its last byte; a socket that closes first is not (`complete`).
  response.on('end', () => {
    if (!response.complete) return end({ error: 'PAGE_INCOMPLETE' })
    if (unpack) return unpack.end()
    end({ bytes: Buffer.concat(chunks) })
  })
  response.on('aborted', () => end({ error: 'PAGE_INCOMPLETE' }))
  response.on('error', () => end({ error: 'PAGE_INCOMPLETE' }))
  response.on('close', () => {
    if (!response.complete) end({ error: 'PAGE_INCOMPLETE' })
  })
  if (!unpack) return
  unpack.on('data', (chunk) => {
    size += chunk.length
    if (size > PAGE_BYTES_MAX) return end({ error: 'PAGE_TOO_LARGE' })
    chunks.push(chunk)
  })
  // The unpacked stream ends only after the packed one was whole and well-formed to its trailer.
  unpack.on('end', () => end({ bytes: Buffer.concat(chunks) }))
  unpack.on('error', () => end({ error: 'PAGE_INCOMPLETE' }))
}

/**
 * One HTTPS GET to `address` as `name`. Never follows anything.
 *   kind 'route'  `/__tracy/domain-probe` with the challenge → `{ status: 200, body }`
 *   kind 'page'   `path`, as a browser asks for a page — nothing in the request says it is a probe
 *                 → `{ status, proof, location, contentType, bytes }` (`bytes`: the WHOLE body,
 *                 unpacked — an answer whose body could not be read to its end is an `{ error }`)
 * or `{ error }`.
 */
function requestOnce({
  name,
  address,
  family,
  port,
  challenge,
  ca,
  kind = 'route',
  path = '/',
  pageMs = PAGE_MS
}) {
  return new Promise((resolve) => {
    let done = false
    const end = (answer) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(answer)
    }
    const request = https.request(
      {
        host: name,
        servername: name,
        port,
        path: kind === 'page' ? path : PROBE_PATH,
        method: 'GET',
        agent: false,
        ...(ca ? { ca } : {}),
        headers:
          kind === 'page'
            ? {
                accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
                'accept-encoding': 'identity',
                'accept-language': 'en',
                'user-agent': 'Mozilla/5.0'
              }
            : { [PROBE_HEADER]: challenge, accept: 'text/plain', 'user-agent': 'tracy-domain-probe' },
        // The address that was checked, whatever DNS would say now.
        lookup: (_host, options, callback) =>
          options?.all ? callback(null, [{ address, family }]) : callback(null, address, family)
      },
      (response) => {
        const status = response.statusCode ?? 0
        if (kind === 'page') {
          const header = (name) =>
            typeof response.headers[name] === 'string' ? response.headers[name] : null
          const answer = {
            status,
            proof: header(PROBE_PAGE_HEADER),
            location: header('location'),
            contentType: header('content-type')
          }
          return readPage(response, (read) =>
            end(read.error ? { error: read.error } : { ...answer, bytes: read.bytes })
          )
        }
        if (status >= 300 && status < 400) {
          response.destroy()
          return end({ error: 'REDIRECT' })
        }
        if (status !== 200) {
          response.destroy()
          return end({ error: 'HTTP_STATUS' })
        }
        let body = ''
        response.setEncoding('latin1')
        response.on('data', (chunk) => {
          body += chunk
          if (body.length > ANSWER_MAX) {
            response.destroy()
            end({ error: 'TOO_LARGE' })
          }
        })
        response.on('end', () => end({ status, body }))
        response.on('error', () => end({ error: 'CONNECT_FAILED' }))
      }
    )
    const timer = setTimeout(
      () => {
        request.destroy()
        end({ error: kind === 'page' ? 'PAGE_INCOMPLETE' : 'TIMEOUT' })
      },
      kind === 'page' ? pageMs : PROBE_MS
    )
    timer.unref?.()
    request.on('error', (error) => {
      const code = typeof error?.code === 'string' ? error.code : ''
      const tls =
        code.startsWith('ERR_TLS') ||
        code.startsWith('CERT_') ||
        code.includes('CERT') ||
        code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
        code === 'EPROTO' ||
        code === 'ERR_SSL_WRONG_VERSION_NUMBER'
      end({ error: tls ? 'TLS_INVALID' : 'CONNECT_FAILED' })
    })
    request.end()
  })
}

/**
 * The addresses of `name`, by the resolver own domains are read with: `{ addresses }` or `{ error }`.
 * Both families are asked; a family with no record is not an error while the other has one.
 */
async function addressesOf(name, resolver, askMs) {
  const ask = (question) => {
    let timer
    const late = new Promise((resolve) => {
      timer = setTimeout(() => resolve({ error: 'DNS_TIMEOUT' }), askMs)
      timer.unref?.()
    })
    const asked = Promise.resolve()
      .then(question)
      .then(
        (answer) => ({ answer }),
        (error) => {
          const code = typeof error?.code === 'string' ? error.code : ''
          if (code === 'ENOTFOUND') return { error: 'DNS_NXDOMAIN' }
          if (code === 'ENODATA') return { answer: [] }
          if (code === 'ETIMEOUT') return { error: 'DNS_TIMEOUT' }
          return { error: 'DNS_FAILED' }
        }
      )
    return Promise.race([asked, late]).finally(() => clearTimeout(timer))
  }
  const [v4, v6] = await Promise.all([ask(() => resolver.resolve4(name)), ask(() => resolver.resolve6(name))])
  const list = (found) =>
    Array.isArray(found.answer) ? found.answer.filter((value) => typeof value === 'string') : []
  const addresses = [
    ...list(v4).map((address) => ({ address, family: 4 })),
    ...list(v6).map((address) => ({ address, family: 6 }))
  ]
  if (addresses.length > 0) return { addresses }
  return { error: v4.error ?? v6.error ?? 'DNS_NO_ADDRESS' }
}

/**
 * Ask the real domain whether it opens the site of this row, for this attempt.
 *
 *   ok      the answer is this row's proof of the challenge just sent, AND the site's home page
 *           was then served through the name to an ordinary request: status 200 with an HTML
 *           document, reached directly or by redirects that stay on the domain
 *   failed  anything else, with why (`error`): `DNS_NXDOMAIN` · `DNS_NO_ADDRESS` · `DNS_TIMEOUT` ·
 *           `DNS_FAILED` (the name does not resolve) · `ADDRESS_NOT_PUBLIC` (it resolves to an
 *           address nothing public is at) · `TLS_INVALID` (no valid certificate for the name) ·
 *           `CONNECT_FAILED` · `TIMEOUT` · `REDIRECT` · `HTTP_STATUS` (not 200) · `EMPTY` ·
 *           `TOO_LARGE` · `WRONG_ANSWER` (something answered 200 that is not this site's row: an
 *           echo, another server, another site, an older attempt) · `PAGE_NOT_SITE` (the route
 *           proof was right but the page was not answered through this deployment's proxy for this
 *           attempt: something else serves the pages, or the site is not published) ·
 *           `SITE_NOT_ANSWERING` (the proxy asked the site and it answered an error, or nothing) ·
 *           `PAGE_REDIRECT` (the site sends its home page to another host, or round in a circle) ·
 *           `PAGE_EMPTY` (the site answered, but with no page: an empty or partial answer, or one
 *           that is not an HTML document) · `PAGE_INCOMPLETE` (the page could not be read to its
 *           end: cut off, stalled, never ending, or packed in a way that does not unpack) ·
 *           `PAGE_TOO_LARGE` (the page is past `PAGE_BYTES_MAX`) · `NO_ATTEMPT` (the row is no
 *           longer this attempt's)
 *
 * @param {{ name: string, siteKey: string, secret: string }} row
 * @param {object} deps
 * @param {{ resolve4: Function, resolve6: Function }} deps.resolver
 * @param {{ allowPrivate?: boolean, port?: number, ca?: string }} [deps.options] - a local stand's
 *   own: its TLS front is on a private address, behind its own CA. Production passes none.
 * @param {typeof requestOnce} [deps.request] - replaceable by a test
 * @param {{ open: (asked: { path: string, nonce: string }) => Promise<boolean>,
 *   close: () => Promise<unknown> }} deps.page - the page window on the name's row
 *   (`address.js` `confirmOwnDomains`): `open` writes the nonce and path about to be asked and
 *   answers whether the row is still this attempt's; `close` shuts it
 * @param {number} [deps.dnsAskMs]
 * @param {number} [deps.pageMs] - how long one page request may take, first byte sent to last read
 * @returns {Promise<{ status: 'ok' } | { status: 'failed', error: string }>}
 */
export async function probeDomain(
  row,
  {
    resolver,
    options = {},
    request = requestOnce,
    dnsAskMs = 5000,
    challenge = randomBytes(24).toString('hex'),
    page,
    pageNonce = () => randomBytes(24).toString('hex'),
    pageMs = PAGE_MS
  }
) {
  const failed = (error) => ({ status: 'failed', error })
  if (typeof row.secret !== 'string' || row.secret === '') return failed('NO_ATTEMPT')
  const found = await addressesOf(row.name, resolver, dnsAskMs)
  if (found.error) return failed(found.error)
  // Every address, not only the one dialled: a name that also resolves somewhere private is not one
  // whose answer says where visitors land.
  if (options.allowPrivate !== true && !found.addresses.every(({ address }) => publicAddress(address)))
    return failed('ADDRESS_NOT_PUBLIC')
  const target = found.addresses.find(({ family }) => family === 4) ?? found.addresses[0]
  if (isIP(target.address) === 0) return failed('DNS_FAILED')
  const dial = {
    name: row.name,
    address: target.address,
    family: target.family,
    port: Number.isInteger(options.port) ? options.port : 443,
    ca: options.ca,
    pageMs
  }
  const ask = async (input) => {
    try {
      return (await request({ ...dial, ...input })) ?? { error: 'CONNECT_FAILED' }
    } catch {
      return { error: 'CONNECT_FAILED' }
    }
  }
  const about = { name: row.name, siteKey: row.siteKey }
  // 1. The route: this deployment's own row for the name answers, for this attempt.
  const answer = await ask({ kind: 'route', challenge })
  if (answer.error) return failed(answer.error)
  const said = String(answer.body ?? '').trim()
  if (said === '') return failed('EMPTY')
  if (!sameText(said, await probeProof(row.secret, { ...about, challenge }))) return failed('WRONG_ANSWER')
  // 2. The site: its home page, asked as a visitor asks it, through the same name and the same
  // checked address — followed while it redirects within the domain, each hop proven on its own.
  if (!page) return failed('NO_ATTEMPT')
  let path = '/'
  try {
    for (let hop = 0; hop <= PAGE_HOPS; hop++) {
      const nonce = pageNonce()
      if ((await page.open({ path, nonce })) !== true) return failed('NO_ATTEMPT')
      const got = await ask({ kind: 'page', path })
      if (got.error) return failed(got.error)
      const status = Number(got.status)
      if (!Number.isInteger(status) || typeof got.proof !== 'string') return failed('PAGE_NOT_SITE')
      // 🔒 THE BYTES THAT WERE READ, HASHED HERE — never a digest the answer supplies. A request
      // function that hands back no whole body has not read a page.
      if (!(got.bytes instanceof Uint8Array)) return failed('PAGE_INCOMPLETE')
      const sent = {
        status,
        contentType: got.contentType ?? null,
        location: got.location ?? null,
        digest: bodyDigest(got.bytes)
      }
      if (!sameText(got.proof, await pageProof(row.secret, { ...about, nonce, path, ...sent })))
        return failed('PAGE_NOT_SITE')
      if (status >= 300 && status < 400) {
        let to = null
        try {
          to = new URL(String(got.location ?? ''), `https://${row.name}${path}`)
        } catch {
          /* A Location that is no URL leads nowhere on the domain. */
        }
        const here =
          to !== null &&
          to.protocol === 'https:' &&
          to.hostname.toLowerCase() === row.name &&
          (to.port === '' || Number(to.port) === dial.port) &&
          to.username === '' &&
          to.password === ''
        if (!here) return failed('PAGE_REDIRECT')
        path = `${to.pathname}${to.search}`
        if (path.length > PAGE_PATH_MAX) return failed('PAGE_REDIRECT')
        continue
      }
      if (status >= 200 && status < 300)
        return servedPage({
          status,
          contentType: got.contentType,
          body: Buffer.from(got.bytes).toString('latin1')
        })
          ? { status: 'ok' }
          : failed('PAGE_EMPTY')
      return failed('SITE_NOT_ANSWERING')
    }
    // Still redirecting after every hop allowed: no page was reached.
    return failed('PAGE_REDIRECT')
  } finally {
    await Promise.resolve()
      .then(() => page.close())
      .catch(() => {})
  }
}
