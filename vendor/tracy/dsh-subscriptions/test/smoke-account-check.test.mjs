import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { registerStatusRoutes } from '../lib/routes/status.js'

function makeMockCtx() {
  const routes = []
  return {
    routes,
    webServer: {
      register(route) {
        routes.push(route)
      },
    },
    effect(fn) {
      fn()
    },
  }
}

function makeMockRes() {
  let statusCode = 200
  let body = ''
  return {
    writeHead(code) {
      statusCode = code
    },
    end(str) {
      body = str
    },
    getStatusCode() {
      return statusCode
    },
    getJson() {
      return JSON.parse(body || '{}')
    },
  }
}

test('POST /dsh-subscriptions/check returns latencyMs and account health', async () => {
  const ctx = makeMockCtx()
  const store = {
    loggedInProviders: async () => ['codex'],
    describeRef: async () => ({ configured: true, label: 'Work', usagePercent: 25 }),
    loadBlob: async () => ({ accessToken: 'token', label: 'Work', email: 'test@example.com' }),
    ensureFresh: async (p, b) => b,
    rememberQuota: () => {},
  }
  const state = {
    store,
    live: () => ({ slots: [{ provider: 'codex', index: 1, ref: 'CODEX_OAUTH_1' }] }),
    history: {
      size: () => 0,
      recent: () => [],
      add: () => {},
      telemetrySummary: () => ({ totalRequests: 0 }),
    },
    accountsView: async () => [{ provider: 'codex', index: 1, configured: true }],
  }

  registerStatusRoutes(ctx, state)
  const checkRoute = ctx.routes.find((r) => r.path === '/dsh-subscriptions/check')
  assert.ok(checkRoute, '/check route must be registered')

  const req = new EventEmitter()
  req.method = 'POST'
  req.headers = { host: '127.0.0.1:3080', 'content-type': 'application/json' }

  const res = makeMockRes()
  const p = checkRoute.handler(req, res)

  globalThis.setImmediate(() => {
    req.emit('data', Buffer.from(JSON.stringify({ provider: 'codex', index: 1 })))
    req.emit('end')
  })

  await p

  assert.equal(res.getStatusCode(), 200)
  const data = res.getJson()
  assert.equal(data.provider, 'codex')
  assert.equal(data.index, 1)
  assert.ok(typeof data.latencyMs === 'number', 'latencyMs should be a number')
  assert.ok(data.latencyMs >= 0, 'latencyMs should be non-negative')
  assert.equal(data.email, 'test@example.com')
})
