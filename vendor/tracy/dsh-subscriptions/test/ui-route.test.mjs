import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerStatusRoutes } from '../lib/routes/status.js'

const SAME_ORIGIN = { host: 'localhost:5140', origin: 'http://localhost:5140' }

function routesFor(cfg) {
  const routes = []
  const ctx = {
    webServer: { register(spec) { routes.push(spec); return () => {} } },
    effect(fn) { fn(); return () => {} },
  }
  registerStatusRoutes(ctx, {
    live: () => cfg,
    accountsView: async () => [],
    getSettingsApi: () => null,
    store: {},
    history: { recent: () => [] },
    pmL: (x) => x,
  })
  return routes
}

async function call(route, req) {
  const out = { code: 0, body: null }
  const res = {
    writeHead(c) { out.code = c },
    setHeader() {},
    end(b) { out.body = b ? JSON.parse(String(b)) : null },
  }
  await route.handler(req, res)
  return out
}

test('GET /dsh-subscriptions/ui answers the normalised surface options', async () => {
  const route = routesFor({ cardPlacement: 'settings', headerPill: false, slashCommands: false, allowedVendors: ['Claude'] })
    .find((r) => r.path === '/dsh-subscriptions/ui')
  assert.ok(route, '/ui route registered')
  const out = await call(route, { method: 'GET', headers: SAME_ORIGIN })
  assert.equal(out.code, 200)
  assert.deepEqual(out.body, {
    ok: true,
    ui: { cardPlacement: 'settings', headerPill: false, slashCommands: false, allowedVendors: ['claude'] },
  })
})

test('GET /dsh-subscriptions/ui is same-origin only', async () => {
  const route = routesFor({}).find((r) => r.path === '/dsh-subscriptions/ui')
  const out = await call(route, { method: 'GET', headers: { host: 'localhost:5140', 'sec-fetch-site': 'cross-site' } })
  assert.equal(out.code, 403)
})
