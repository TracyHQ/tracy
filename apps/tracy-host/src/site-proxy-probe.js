/** A header-only probe with an explicit virtual Host; Node fetch can discard that header. */
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

export function probeSiteProxy(url, { headers, signal } = {}) {
  const target = new URL(url)
  const request = target.protocol === 'https:' ? httpsRequest : httpRequest
  return new Promise((resolve, reject) => {
    const req = request(target, { method: 'HEAD', headers, signal, agent: false }, (res) => {
      const received = new Headers()
      for (const [key, value] of Object.entries(res.headers)) {
        if (value !== undefined) received.set(key, Array.isArray(value) ? value.join(', ') : value)
      }
      // No response bytes are retained, including a server that incorrectly sends a HEAD body.
      res.destroy()
      resolve({ status: res.statusCode, headers: received })
    })
    req.once('error', reject)
    req.end()
  })
}
