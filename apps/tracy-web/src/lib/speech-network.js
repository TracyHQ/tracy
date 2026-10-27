/** Admin-configured self-hosted speech endpoints may use private IPs, never cloud metadata. */
import { lookup } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import { Readable } from 'node:stream'
import { BlockList } from 'node:net'
const blocked = new BlockList()
blocked.addSubnet('169.254.0.0', 16)
blocked.addSubnet('0.0.0.0', 8)
blocked.addSubnet('fe80::', 10, 'ipv6')
blocked.addSubnet('::ffff:169.254.0.0', 112, 'ipv6')
blocked.addSubnet('::ffff:0.0.0.0', 104, 'ipv6')
blocked.addAddress('100.100.100.200')
blocked.addAddress('::', 'ipv6')
blocked.addAddress('fd00:ec2::254', 'ipv6')
export function metadataAddress(address) {
  return blocked.check(address, address.includes(':') ? 'ipv6' : 'ipv4')
}
export function speechLookup(hostname, options, callback) {
  lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error)
    if (!addresses.length || addresses.some(({ address }) => metadataAddress(address)))
      return callback(new Error('Speech destination is blocked'))
    const family = options?.family
    const usable = family ? addresses.filter((row) => row.family === family) : addresses
    if (!usable.length) return callback(new Error('Speech destination has no usable address'))
    if (options?.all) callback(null, usable)
    else callback(null, usable[0].address, usable[0].family)
  })
}

/** Pin the DNS answer used by the connection, reject redirects, cancel on browser abort. */
export function localSpeechFetch(url, init) {
  return new Promise((resolve, reject) => {
    const address = new URL(url)
    if (metadataAddress(address.hostname.replace(/^\[|\]$/g, '')))
      return reject(new Error('Speech destination is blocked'))
    const request = (address.protocol === 'https:' ? https : http).request(
      address,
      {
        method: init.method,
        headers: init.headers,
        signal: init.signal,
        lookup: speechLookup
      },
      (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400) {
          response.destroy()
          reject(new Error('Speech redirects are not allowed'))
          return
        }
        const headers = new Headers()
        for (const [name, value] of Object.entries(response.headers))
          if (value) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
        resolve(new Response(Readable.toWeb(response), { status: response.statusCode, headers }))
      }
    )
    request.on('error', reject)
    request.end(init.body)
  })
}
