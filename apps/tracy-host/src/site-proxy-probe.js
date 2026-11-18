/**
 * A header-only probe with an explicit virtual Host; Node fetch discards that header. `method` is HEAD unless said (the link
 * check asks a GET when a HEAD is refused); the body is never read either way.
 */
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

export function probeSiteProxy(url, { headers, signal, method = 'HEAD' } = {}) {
  const target = new URL(url)
  const request = target.protocol === 'https:' ? httpsRequest : httpRequest
  return new Promise((resolve, reject) => {
    const req = request(target, { method, headers, signal, agent: false }, (res) => {
      const received = new Headers()
      for (const [key, value] of Object.entries(res.headers)) {
        if (value !== undefined) received.set(key, Array.isArray(value) ? value.join(', ') : value)
      }
      // No response bytes are retained, including a server that incorrectly sends a HEAD body, or a GET's body.
      res.destroy()
      resolve({ status: res.statusCode, headers: received })
    })
    req.once('error', reject)
    req.end()
  })
}
