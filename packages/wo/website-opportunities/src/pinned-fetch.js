/**
 * A `fetch` for crawling untrusted addresses that checks the address it ACTUALLY connects to.
 *
 * The domain's `fetchLimited` checks each URL against its own DNS answer, but a platform `fetch`
 * resolves the name again at connect time, and a rebinding DNS server can answer a private address
 * the second time. Here the connection's own `lookup` refuses any blocked address, so what is
 * checked is what is dialled. Redirects are never followed (the caller follows them, re-checking).
 */
import { lookup as dnsLookup } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import { Readable } from 'node:stream'

const NO_BODY = new Set([101, 204, 205, 304])

/**
 * @param {{ isBlockedAddress: () => Promise<(address: string) => boolean>, lookup?: typeof dnsLookup }} deps
 *   `isBlockedAddress` resolves to the domain's check (loaded lazily); `lookup` is a test seam.
 * @returns {(input: string | URL, init?: RequestInit) => Promise<Response>}
 */
export function createPinnedFetch({ isBlockedAddress, lookup = dnsLookup }) {
  return async function pinnedFetch(input, init = {}) {
    const blocked = await isBlockedAddress()
    const url = new URL(String(input))
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      throw new TypeError(`unsupported scheme ${url.protocol}`)
    const guardedLookup = (hostname, options, callback) => {
      lookup(hostname, options, (error, address, family) => {
        if (error) return callback(error)
        const list = Array.isArray(address) ? address : [{ address, family }]
        if (list.length === 0 || list.some((a) => blocked(a.address)))
          return callback(
            Object.assign(new Error(`blocked address for ${hostname}`), { code: 'URL_BLOCKED' })
          )
        return callback(null, address, family)
      })
    }
    const headers = new Headers(init.headers ?? {})
    const body =
      init.body == null
        ? null
        : Buffer.from(typeof init.body === 'string' ? init.body : await new Response(init.body).arrayBuffer())
    if (body) headers.set('content-length', String(body.length))
    const transport = url.protocol === 'https:' ? https : http
    return new Promise((resolve, reject) => {
      const req = transport.request(
        url,
        {
          method: init.method ?? 'GET',
          headers: Object.fromEntries(headers),
          lookup: guardedLookup,
          signal: init.signal ?? undefined
        },
        (res) => {
          const out = new Headers()
          for (const [k, v] of Object.entries(res.headers))
            for (const one of Array.isArray(v) ? v : [v]) if (v !== undefined) out.append(k, String(one))
          const status = res.statusCode ?? 502
          if (NO_BODY.has(status) || status < 200) {
            res.resume()
            return resolve(new Response(null, { status: status < 200 ? 502 : status, headers: out }))
          }
          resolve(new Response(/** @type {any} */ (Readable.toWeb(res)), { status, headers: out }))
        }
      )
      req.on('error', (error) => {
        // Hostname blocked at connect time: the same error the URL guard throws.
        if (error?.code === 'URL_BLOCKED')
          reject(Object.assign(new Error(error.message), { code: 'URL_BLOCKED', reason: 'private_address' }))
        else reject(error)
      })
      req.end(body ?? undefined)
    })
  }
}
