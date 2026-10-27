// Test-only: a stand-in for Cloudflare's `/zones/{zone}/custom_hostnames` API, in memory. Nothing it
// does reaches a network: `fetchImpl` answers in-process, and `listen()` serves the same answers on
// 127.0.0.1 for a test that runs tracy-web against an API base URL (the own-domain pilot).
//
//   cf.hostnames            id → { id, hostname, status, ssl: { status, validation_records } }
//   cf.calls                every call as `METHOD path` (the query string included)
//   cf.state                what a NEW hostname starts as: { status, ssl, records }
//   cf.set(name, state)     move an existing hostname (Cloudflare validating it, issuing its certificate)
//   cf.seed(name)           a hostname of that name that somebody else made
//   cf.fail                 (call) => undefined | { status, body } | 'hang' | 'land-then-hang'
//                           'hang' answers nothing until the caller's deadline; 'land-then-hang'
//                           does what was asked, then answers nothing (a create whose answer is lost)
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { cloudflareHostnames } from '../src/sites/site-domain-provider.js'

export const FAKE_ZONE = '0123456789abcdef0123456789abcdef'
export const FAKE_TOKEN = 'fake-cloudflare-token-never-printed'

export function fakeCloudflare({ zoneId = FAKE_ZONE, token = FAKE_TOKEN, callMs = 300 } = {}) {
  const cf = {
    zoneId,
    token,
    hostnames: new Map(),
    calls: [],
    state: { status: 'active', ssl: 'active', records: [] },
    fail: () => undefined
  }
  const view = (h) => ({ ...h, ssl: { ...h.ssl } })
  const ok = (result, status = 200) => ({ status, body: { success: true, errors: [], result } })
  const error = (status, code, message) => ({ status, body: { success: false, errors: [{ code, message }] } })
  const byName = (name) => [...cf.hostnames.values()].find((h) => h.hostname === name) ?? null
  const make = (name, state = cf.state) => {
    const h = {
      id: randomUUID(),
      hostname: name,
      status: state.status,
      ssl: { status: state.ssl, method: 'http', type: 'dv', validation_records: state.records ?? [] },
      created_at: new Date().toISOString()
    }
    cf.hostnames.set(h.id, h)
    return h
  }
  cf.seed = (name) => make(name, { status: 'active', ssl: 'active' })
  cf.set = (name, state) => {
    const h = byName(name)
    if (!h) throw new Error(`no hostname ${name}`)
    if (state.status) h.status = state.status
    if (state.ssl) h.ssl.status = state.ssl
    if (state.records) h.ssl.validation_records = state.records
  }
  cf.byName = byName

  /** One call, answered as Cloudflare answers it. */
  cf.handle = ({ method, path, search, authorization, body }) => {
    const base = `/client/v4/zones/${zoneId}/custom_hostnames`
    if (authorization !== `Bearer ${token}`) return error(403, 10000, 'Authentication error')
    if (!path.startsWith(base)) return error(404, 7003, 'Could not route')
    const id = decodeURIComponent(path.slice(base.length).replace(/^\//, ''))
    if (method === 'POST' && id === '') {
      const name = body?.hostname
      if (typeof name !== 'string') return error(400, 1409, 'hostname required')
      if (byName(name)) return error(409, 1406, 'Duplicate custom hostname found.')
      const made = make(name)
      if (typeof body.custom_origin_server === 'string') made.custom_origin_server = body.custom_origin_server
      return ok(view(made), 201)
    }
    if (method === 'GET' && id === '') {
      const name = new URLSearchParams(search).get('hostname')
      return ok([...cf.hostnames.values()].filter((h) => !name || h.hostname === name).map(view))
    }
    const h = cf.hostnames.get(id)
    if (!h) return error(404, 1436, 'Custom hostname not found')
    if (method === 'GET') return ok(view(h))
    if (method === 'DELETE') {
      cf.hostnames.delete(id)
      return ok({ id })
    }
    return error(405, 10405, 'Method not allowed')
  }

  cf.fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input))
    const method = init.method ?? 'GET'
    const call = `${method} ${url.pathname}${url.search}`
    cf.calls.push(call)
    const asked = {
      method,
      path: url.pathname,
      search: url.search,
      authorization: new Headers(init.headers).get('authorization'),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : null
    }
    const failing = cf.fail({ method, path: url.pathname, search: url.search, call })
    const hang = () =>
      new Promise((_, reject) => {
        const stop = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        if (init.signal?.aborted) stop()
        init.signal?.addEventListener('abort', stop, { once: true })
      })
    if (failing === 'hang') return hang()
    if (failing === 'land-then-hang') {
      cf.handle(asked)
      return hang()
    }
    const answer = failing ?? cf.handle(asked)
    return new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { 'content-type': 'application/json' }
    })
  }

  cf.client = cloudflareHostnames({
    zoneId,
    token,
    apiBase: 'https://cf.test/client/v4',
    fetchImpl: cf.fetchImpl,
    callMs
  })

  /** Serve the same API on 127.0.0.1; answers `{ apiBase, close }`. */
  cf.listen = async () => {
    const server = createServer((req, res) => {
      let raw = ''
      req.on('data', (chunk) => (raw += chunk))
      req.on('end', () => {
        const url = new URL(req.url, 'http://127.0.0.1')
        cf.calls.push(`${req.method} ${url.pathname}${url.search}`)
        let body = null
        try {
          body = raw ? JSON.parse(raw) : null
        } catch {}
        const answer = cf.handle({
          method: req.method,
          path: url.pathname,
          search: url.search,
          authorization: req.headers.authorization ?? null,
          body
        })
        res.writeHead(answer.status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(answer.body))
      })
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    return {
      apiBase: `http://127.0.0.1:${server.address().port}/client/v4`,
      close: () => new Promise((resolve) => server.close(resolve))
    }
  }
  return cf
}
