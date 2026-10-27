import { normalizeSlots, vendorConfig } from '../accounts.js'
import { analyzeSessionEvents } from '../analyze-session.js'
import { isTrustedSettingsRequest, readBody, safeJsonHandler, writeJson } from '../http.js'
import { proxyFetch } from '../proxy.js'
import { isProvider } from '../refs.js'

export function registerProxyRoutes(ctx, state) {
  const {
    live,
    subscriptions,
  } = state


  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/analyze-session',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      const raw = await readBody(req, 128 * 1024).catch(() => Buffer.alloc(0))
      let body = {}
      try { body = JSON.parse(raw.toString('utf8') || '{}') } catch { body = {} }
      const events = Array.isArray(body && body.events) ? body.events : []
      const analysis = analyzeSessionEvents(events)
      writeJson(res, 200, { ok: true, analysis })
    }),
  }), 'dsh-subscriptions: /analyze-session')




  // HTTP proxy to the provider API through subscriptions.request.
  // Same-origin only, path allowlist, rotation and quota as with models.
  // The token never leaves the process - only the provider's response goes out.
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/dsh-subscriptions/proxy',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'POST' && req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET or POST' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      const url = new URL(req.url || '/', 'http://localhost')
      const parts = url.pathname.replace(/^\/dsh-subscriptions\/proxy\//, '').split('/').filter(Boolean)
      const provider = parts[0]
      const restPath = '/' + parts.slice(1).join('/') + (url.search || '')
      if (!isProvider(provider)) {
        writeJson(res, 404, { ok: false, error: { code: 'provider', message: 'unknown provider' } })
        return
      }
      let body
      if (req.method === 'POST') {
        try {
          body = JSON.parse((await readBody(req, 1024 * 1024)).toString('utf8'))
        } catch {
          writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
          return
        }
      }
      try {
        const out = await subscriptions.request({
          provider,
          path: restPath,
          method: req.method === 'POST' ? 'POST' : 'GET',
          body,
          headers: {},
        })
        const text = await out.text()
        try {
          const json = JSON.parse(text)
          writeJson(res, out.status || 200, json)
        } catch {
          res.writeHead(out.status || 200, { 'Content-Type': 'application/json' })
          res.end(text)
        }
      } catch (e) {
        const status = e && e.status ? e.status : (e && e.code === 'FORBIDDEN' ? 403 : (e && e.code === 'AUTH' ? 401 : 502))
        writeJson(res, status, { ok: false, error: { code: e && e.code || 'VENDOR', message: String(e && e.message || e).slice(0, 300) } })
      }
    }),
  }), 'dsh-subscriptions: proxy')


  // #88: account proxy check - a real request to the provider endpoint with latency measurement.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/proxy-check',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      let body
      try {
        body = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8'))
      } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      const provider = String(body.provider || '')
      const index = Number(body.index || 1)
      if (!isProvider(provider)) {
        writeJson(res, 400, { ok: false, error: { code: 'provider', message: 'unknown provider' } })
        return
      }
      const slots = normalizeSlots(live().slots)
      const slot = slots.find((s) => s.provider === provider && s.index === index)
      const proxyUrl = (slot && slot.proxyUrl) || ''
      const DEFAULT_BASE = {
        codex: 'https://chatgpt.com/backend-api/codex',
        claude: 'https://api.anthropic.com',
        grok: 'https://api.x.ai/v1',
        antigravity: 'https://cloudcode-pa.googleapis.com',
      }
      const base = String((vendorConfig(provider, live()) || {}).baseUrl || DEFAULT_BASE[provider] || '').replace(/\/$/, '')
      const started = Date.now()
      try {
        const impl = (proxyUrl && proxyFetch(proxyUrl)) || fetch
        if (proxyUrl && impl === fetch) throw new Error('invalid proxy URL')
        const out = await impl(base + '/models', {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(10000),
        })
        // Any HTTP response (including 401/403) means the proxy and endpoint are reachable.
        writeJson(res, 200, { ok: true, status: out.status, latencyMs: Date.now() - started, viaProxy: !!proxyUrl })
      } catch (e) {
        writeJson(res, 200, {
          ok: false,
          latencyMs: Date.now() - started,
          viaProxy: !!proxyUrl,
          error: { code: (e && e.code) || 'NETWORK', message: String((e && e.message) || e).slice(0, 200) },
        })
      }
    }),
  }), 'dsh-subscriptions: proxy-check')
}
