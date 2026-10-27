import http from 'node:http'

// #89: temporary loopback server to catch the OAuth callback.
// Listens on the redirect_uri registered with the provider (vendor-fixed
// port: codex localhost:1455, grok 127.0.0.1:56121). Accepts a GET with
// code/state, serves an HTML page and shuts down after the first request.

const OK_HTML = '<!doctype html><meta charset="utf-8"><title>Subscriptions</title><p>Signed in. You can close this tab and return to Settings.</p>'
const ERR_HTML = '<!doctype html><meta charset="utf-8"><title>Subscriptions</title><p>Login failed. Return to Settings and paste the redirected URL.</p>'

/**
 * Start the loopback server and wait for the callback.
 * @param {object} opts
 * @param {string} opts.redirectUri  registered redirect_uri (localhost/127.0.0.1)
 * @param {number} opts.timeoutMs    server lifetime
 * @param {(query: URLSearchParams) => Promise<string>} opts.onCode
 *        called with the callback request query; returns HTML for the browser.
 *        Throwing means an authorization error (ERR_HTML is served).
 * @returns {Promise<{url: string, close: () => void}>}
 */
export function startLoopback({ redirectUri, timeoutMs = 10 * 60 * 1000, onCode }) {
  const parsed = new URL(redirectUri)
  if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    throw new Error(`loopback redirect requires localhost, got ${parsed.hostname}`)
  }
  const port = Number(parsed.port) || 80
  const path = parsed.pathname

  const state = { server: null, timer: null, done: false }
  const promise = new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://127.0.0.1:${port}`)
      // The provider may redirect to a suffixed path (e.g. /auth/callback/extra)
      if (!url.pathname.startsWith(path)) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(ERR_HTML)
        return
      }
      if (state.done) return
      state.done = true
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      Promise.resolve(onCode(url.searchParams))
        .then((html) => res.end(html || OK_HTML))
        .catch(() => res.end(ERR_HTML))
        .finally(() => {
          clearTimeout(state.timer)
          server.close()
          resolve({ ok: true })
        })
    })
    server.on('error', (err) => {
      state.done = true
      clearTimeout(state.timer)
      reject(err)
    })
    state.server = server
    server.listen(port, parsed.hostname, () => {})
    state.timer = setTimeout(() => {
      if (state.done) return
      state.done = true
      server.close()
      reject(new Error('loopback timeout: no callback received'))
    }, timeoutMs)
  })
  return promise
}
