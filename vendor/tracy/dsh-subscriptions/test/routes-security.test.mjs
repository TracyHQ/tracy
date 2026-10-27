import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseProxyUrl } from '../lib/proxy.js'
import { registerProxyRoutes } from '../lib/routes/proxy.js'
import { registerStatusRoutes } from '../lib/routes/status.js'
import { registerAccountsRoutes } from '../lib/routes/accounts.js'
import { publicConfig } from '../lib/config-schema.js'
import { isTrustedSettingsRequest, isSameOrigin, sanitizeRequestHeaders } from '../lib/http.js'

// #302: the /proxy route is the only prefix route with a caller-controlled
// path. These tests pin its traversal containment and the provider
// allowlist, plus parseProxyUrl scheme hardening.

function harness() {
  const routes = []
  const requested = []
  const ctx = {
    webServer: { register(spec) { routes.push(spec); return () => {} } },
    effect(fn) { fn(); return () => {} },
    log: { warn() {}, error() {}, info() {} },
  }
  const state = {
    live: () => ({}),
    subscriptions: {
      async request(input) {
        requested.push(input)
        return { status: 200, text: async () => '{"ok":true}' }
      },
    },
  }
  registerProxyRoutes(ctx, state)
  const proxy = routes.find((r) => r.path === '/dsh-subscriptions/proxy')
  assert.ok(proxy, 'proxy route registered')
  return { proxy, requested }
}

function statusHarness() {
  const routes = []
  const ctx = {
    webServer: { register(spec) { routes.push(spec); return () => {} } },
    effect(fn) { fn(); return () => {} },
    log: { warn() {}, error() {}, info() {} },
    connection: { requestRejection: (req) => { if (req?.headers?.cookie === "token=secret") return undefined; if (req?.headers?.["sec-fetch-site"] === "same-origin") return undefined; return 401; } },
  }
  const state = {
    NS: 'dsh-subscriptions',
    live: () => ({ slots: [] }),
    accountsView: async () => [],
    getSettingsApi: () => ({ replace: async () => {} }),
    syncCustomVendors: () => {},
    syncAdapter: async () => {},
    stripLegacySlots: () => {},
    store: {
      clearRef: async () => {},
      loggedInProviders: async () => [],
      describeRef: async () => ({}),
      listAccounts: async () => [],
    },
    history: {
      add: () => {},
      list: () => [],
      recent: () => [],
      size: () => 0,
      telemetrySummary: () => ({
        totalRequests: 0,
        requests24h: 0,
        successRequests: 0,
        errorRequests: 0,
        successRate: 100,
        avgLatencyMs: 0,
      }),
    },
    diagnosticsReport: async () => ({ ok: true }),
    pmL: (s) => s,
    pmE: (s) => s,
  }
  registerStatusRoutes(ctx, state)
  return routes
}

function accountsHarness() {
  const routes = []
  const ctx = {
    webServer: { register(spec) { routes.push(spec); return () => {} } },
    effect(fn) { fn(); return () => {} },
    log: { warn() {}, error() {}, info() {} },
  }
  const state = {
    refForSlot: () => 'CODEX_OAUTH_1',
    store: {
      slots: async () => [],
      clearRef: async () => {},
      accounts: async () => [],
    },
    resetCredits: {
      inspect: async () => ({ availableCount: 1 }),
      info: async () => ({ availableCount: 1 }),
      begin: async () => ({}),
    },
  }
  registerAccountsRoutes(ctx, state)
  return routes
}

const res = () => {
  const s = { code: 0, body: '' }
  return { get code() { return s.code }, set code(v) { s.code = v }, get body() { return s.body }, set body(v) { s.body = v }, writeHead(c) { s.code = c }, end(b) { s.body = b || '' }, setHeader() {} }
}

test('unknown provider is rejected with 404 before any request', async () => {
  const { proxy, requested } = harness()
  const r = res()
  await proxy.handler({ method: 'GET', url: '/dsh-subscriptions/proxy/not-a-vendor/path', headers: { 'sec-fetch-site': 'same-origin' } }, r)
  assert.equal(r.code, 404)
  assert.equal(requested.length, 0)
})

test('dot-dot traversal is neutralized by URL normalization, never forwarded', async () => {
  const { proxy, requested } = harness()
  const r = res()
  await proxy.handler({ method: 'GET', url: '/dsh-subscriptions/proxy/codex/../../admin/secret', headers: { 'sec-fetch-site': 'same-origin' } }, r)
  assert.equal(r.code, 404, 'normalized path must not resolve to a valid provider')
  assert.equal(requested.length, 0)
})

test('percent-encoded traversal is resolved by the URL parser and contained', async () => {
  const { proxy, requested } = harness()
  const r = res()
  // WHATWG URL resolves %2e%2e as a dot segment, so the normalized path
  // leaves no valid provider behind: the request is rejected, not forwarded.
  await proxy.handler({ method: 'GET', url: '/dsh-subscriptions/proxy/codex/%2e%2e/other', headers: { 'sec-fetch-site': 'same-origin' } }, r)
  assert.equal(r.code, 404)
  assert.equal(requested.length, 0)
})

test('a valid provider path is forwarded with the declared provider', async () => {
  const { proxy, requested } = harness()
  const r = res()
  await proxy.handler({ method: 'GET', url: '/dsh-subscriptions/proxy/grok/v1/billing', headers: { 'sec-fetch-site': 'same-origin' } }, r)
  assert.equal(requested.length, 1)
  assert.equal(requested[0].provider, 'grok')
  assert.equal(requested[0].path, '/v1/billing')
})

test('parseProxyUrl allows only http, https and socks5', () => {
  assert.equal(parseProxyUrl('http://p:8080').scheme, 'http')
  assert.equal(parseProxyUrl('https://p').port, 443)
  assert.equal(parseProxyUrl('socks5://u:p@p:1080').auth.username, 'u')
  assert.equal(parseProxyUrl('socks5://p').port, 1080)
  assert.equal(parseProxyUrl('ftp://p'), null)
  assert.equal(parseProxyUrl('file:///etc/passwd'), null)
  assert.equal(parseProxyUrl('gopher://p'), null)
  assert.equal(parseProxyUrl('data:text/html,x'), null)
  assert.equal(parseProxyUrl(''), null)
  assert.equal(parseProxyUrl('not a url'), null)
  assert.equal(parseProxyUrl('http://'), null)
})

const READ_ROUTES_STATUS = [
  '/dsh-subscriptions/status',
  '/dsh-subscriptions/history',
  '/dsh-subscriptions/telemetry',
  '/dsh-subscriptions/alerts',
  '/dsh-subscriptions/config',
  '/dsh-subscriptions/diagnostics',
]

test('#371, #374: read status routes reject cross-site and unauthenticated requests with 403', async () => {
  const routes = statusHarness()
  for (const path of READ_ROUTES_STATUS) {
    const route = routes.find((r) => r.path === path)
    assert.ok(route, `route ${path} should be registered`)

    // Cross-site via sec-fetch-site
    const r1 = res()
    await route.handler({ method: 'GET', url: path, headers: { 'sec-fetch-site': 'cross-site' } }, r1)
    assert.equal(r1.code, 403, `${path} should reject cross-site sec-fetch-site`)
    assert.deepEqual(JSON.parse(r1.body), { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })

    // Cross-site via Origin header mismatch
    const r2 = res()
    await route.handler({ method: 'GET', url: path, headers: { origin: 'http://evil.com', host: 'localhost:5140' } }, r2)
    assert.equal(r2.code, 403, `${path} should reject evil origin`)
    assert.deepEqual(JSON.parse(r2.body), { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })

    // #341: Fail-closed when no origin headers are provided (external request)
    const r3 = res()
    await route.handler({ method: 'GET', url: path, headers: {} }, r3)
    assert.equal(r3.code, 403, `${path} should reject request without origin headers`)
  }
})

test('#371, #374: reset-credits and discover-local reject cross-site and unauthenticated requests with 403', async () => {
  const routes = accountsHarness()
  const testCases = [
    { path: '/dsh-subscriptions/reset-credits', url: '/dsh-subscriptions/reset-credits?provider=codex&index=1' },
    { path: '/dsh-subscriptions/discover-local', url: '/dsh-subscriptions/discover-local' },
  ]

  for (const tc of testCases) {
    const route = routes.find((r) => r.path === tc.path)
    assert.ok(route, `${tc.path} route should be registered`)

    // Cross-site via sec-fetch-site
    const r1 = res()
    await route.handler({ method: 'GET', url: tc.url, headers: { 'sec-fetch-site': 'cross-site' } }, r1)
    assert.equal(r1.code, 403, `${tc.path} should reject cross-site sec-fetch-site`)
    assert.deepEqual(JSON.parse(r1.body), { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })

    // Cross-site via Origin header mismatch
    const r2 = res()
    await route.handler({ method: 'GET', url: tc.url, headers: { origin: 'http://evil.com', host: 'localhost:5140' } }, r2)
    assert.equal(r2.code, 403, `${tc.path} should reject evil origin`)
    assert.deepEqual(JSON.parse(r2.body), { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })

    // #341: Fail closed without headers
    const r3 = res()
    await route.handler({ method: 'GET', url: tc.url, headers: {} }, r3)
    assert.equal(r3.code, 403, `${tc.path} should reject request without headers`)
  }
})

test('#371, #374: read routes allow same-origin requests', async () => {
  const statusRoutes = statusHarness()
  for (const path of READ_ROUTES_STATUS) {
    const route = statusRoutes.find((r) => r.path === path)
    const r = res()
    await route.handler({ method: 'GET', url: path, headers: { host: 'localhost:5140', 'sec-fetch-site': 'same-origin' } }, r)
    assert.equal(r.code, 200, `${path} should allow same-origin`)
  }

  const accountsRoutes = accountsHarness()
  const resetRoute = accountsRoutes.find((r) => r.path === '/dsh-subscriptions/reset-credits')
  const r1 = res()
  await resetRoute.handler({ method: 'GET', url: '/dsh-subscriptions/reset-credits?provider=codex&index=1', headers: { host: 'localhost:5140', 'sec-fetch-site': 'same-origin' } }, r1)
  assert.equal(r1.code, 200, 'reset-credits should allow same-origin')

  const discoverRoute = accountsRoutes.find((r) => r.path === '/dsh-subscriptions/discover-local')
  const r2 = res()
  await discoverRoute.handler({ method: 'GET', url: '/dsh-subscriptions/discover-local', headers: { host: 'localhost:5140', 'sec-fetch-site': 'same-origin' } }, r2)
  assert.equal(r2.code, 200, 'discover-local should allow same-origin')
})

test('#242: publicConfig redacts nested proxy and custom-vendor credentials', () => {
  const raw = {
    codexClientId: 'client-123',
    claudeClientSecret: 'secret-456',
    slots: [
      { provider: 'codex', index: 1, proxyUrl: 'http://bob:mypassword123@proxy.lan:8080' },
      { provider: 'claude', index: 1, proxyUrl: 'http://nologin-proxy.lan:8080' },
    ],
    customVendors: [
      {
        id: 'custom-ai',
        apiKey: 'sk-live-secret-key-999',
        token: 'token-abc',
        headers: {
          Authorization: 'Bearer sk-bearer-token-111',
          'X-Custom-Key': 'key-222',
          Accept: 'application/json',
        },
      },
    ],
  }

  const pub = publicConfig(raw)

  assert.equal(pub.codexClientId, 'client-123')
  assert.equal(pub.claudeClientSecret, '••••••')
  assert.equal(pub.slots[0].proxyUrl, 'http://bob:••••••@proxy.lan:8080')
  assert.equal(pub.slots[1].proxyUrl, 'http://nologin-proxy.lan:8080')
  assert.equal(pub.customVendors[0].apiKey, '••••••')
  assert.equal(pub.customVendors[0].token, '••••••')
  assert.equal(pub.customVendors[0].headers.Authorization, '••••••')
  assert.equal(pub.customVendors[0].headers['X-Custom-Key'], '••••••')
  assert.equal(pub.customVendors[0].headers.Accept, 'application/json')
})

test("#379: PUT /config revision CAS conflict detection", async () => {
  const routes = statusHarness()
  const route = routes.find((r) => r.path === "/dsh-subscriptions/config")
  assert.ok(route, "config route should be registered")

  // 1. GET /config returns initial revision
  const r1 = res()
  await route.handler({ method: "GET", url: "/dsh-subscriptions/config", headers: { host: "localhost:5140", "sec-fetch-site": "same-origin" } }, r1)
  assert.equal(r1.code, 200)
  const d1 = JSON.parse(r1.body)
  const rev = d1.revision
  assert.ok(typeof rev === "number", "revision must be a number")

  // 2. PUT with matching revision succeeds
  const r2 = res()
  const req2 = {
    method: "PUT",
    url: "/dsh-subscriptions/config",
    headers: { host: "localhost:5140", "sec-fetch-site": "same-origin" },
    on(event, handler) {
      if (event === "data") handler(Buffer.from(JSON.stringify({ revision: rev, config: {} })))
      if (event === "end") handler()
    }
  }
  await route.handler(req2, r2)
  assert.equal(r2.code, 200)
  const d2 = JSON.parse(r2.body)
  assert.equal(d2.revision, rev + 1)

  // 3. PUT with stale revision returns 409 Conflict
  const r3 = res()
  const req3 = {
    method: "PUT",
    url: "/dsh-subscriptions/config",
    headers: { host: "localhost:5140", "sec-fetch-site": "same-origin" },
    on(event, handler) {
      if (event === "data") handler(Buffer.from(JSON.stringify({ revision: rev, config: {} })))
      if (event === "end") handler()
    }
  }
  await route.handler(req3, r3)
  assert.equal(r3.code, 409)
  const d3 = JSON.parse(r3.body)
  assert.equal(d3.ok, false)
  assert.equal(d3.error.code, "conflict")

  // 4. PUT without revision returns 428 Precondition Required (#379)
  const r4 = res()
  const req4 = {
    method: "PUT",
    url: "/dsh-subscriptions/config",
    headers: { host: "localhost:5140", "sec-fetch-site": "same-origin" },
    on(event, handler) {
      if (event === "data") handler(Buffer.from(JSON.stringify({ config: {} })))
      if (event === "end") handler()
    }
  }
  await route.handler(req4, r4)
  assert.equal(r4.code, 428)
  const d4 = JSON.parse(r4.body)
  assert.equal(d4.ok, false)
  assert.equal(d4.error.code, "precondition_required")
})

test('#385: POST /analyze-session rejects cross-site and unauthenticated requests with 403', async () => {
  assert.ok(typeof isTrustedSettingsRequest === 'function')
  const routes = []
  const ctx = {
    webServer: { register(spec) { routes.push(spec); return () => {} } },
    effect(fn) { fn(); return () => {} },
    log: { warn() {}, error() {}, info() {} },
  }
  const state = { live: () => ({}), subscriptions: {} }
  registerProxyRoutes(ctx, state)
  const route = routes.find((r) => r.path === '/dsh-subscriptions/analyze-session')
  assert.ok(route, 'analyze-session route should be registered')

  // Cross-site via sec-fetch-site
  const r1 = res()
  await route.handler({ method: 'POST', url: '/dsh-subscriptions/analyze-session', headers: { 'sec-fetch-site': 'cross-site' } }, r1)
  assert.equal(r1.code, 403)
  assert.deepEqual(JSON.parse(r1.body), { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })

  // Cross-site via Origin header mismatch
  const r2 = res()
  await route.handler({ method: 'POST', url: '/dsh-subscriptions/analyze-session', headers: { origin: 'http://evil.com', host: 'localhost:5140' } }, r2)
  assert.equal(r2.code, 403)

  // Fail-closed without origin headers
  const r3 = res()
  await route.handler({ method: 'POST', url: '/dsh-subscriptions/analyze-session', headers: {} }, r3)
  assert.equal(r3.code, 403)

  // Same-origin allowed
  const r4 = res()
  const req4 = {
    method: 'POST',
    url: '/dsh-subscriptions/analyze-session',
    headers: { host: 'localhost:5140', 'sec-fetch-site': 'same-origin' },
    on(event, handler) {
      if (event === 'data') handler(Buffer.from(JSON.stringify({ events: [] })))
      if (event === 'end') handler()
    },
  }
  await route.handler(req4, r4)
  assert.equal(r4.code, 200)
  assert.equal(JSON.parse(r4.body).ok, true)
})

test("#445: sanitizeRequestHeaders strips sensitive Authorization/Cookie headers on unauthorized external origins", () => {
  assert.equal(isSameOrigin("https://api.openai.com/v1", "https://api.openai.com/v2"), true)
  assert.equal(isSameOrigin("https://api.openai.com", "https://evil.com"), false)

  const headers = { Authorization: "Bearer secret-token", Cookie: "session=123", "Content-Type": "application/json" }
  const clean = sanitizeRequestHeaders("https://evil.com/api", { headers }, { allowedOrigins: ["https://api.openai.com"] })
  assert.equal(clean.Authorization, undefined)
  assert.equal(clean.Cookie, undefined)
  assert.equal(clean["Content-Type"], "application/json")

  const allowed = sanitizeRequestHeaders("https://api.openai.com/v1/chat", { headers }, { allowedOrigins: ["https://api.openai.com"] })
  assert.equal(allowed.Authorization, "Bearer secret-token")
})

test("#374: remote unauthenticated GET /config and /status rejected with 403; public health allows GET without metadata", async () => {
  const routes = statusHarness()
  const configRoute = routes.find((r) => r.path === '/dsh-subscriptions/config')
  const statusRoute = routes.find((r) => r.path === '/dsh-subscriptions/status')
  const healthRoute = routes.find((r) => r.path === '/dsh-subscriptions/health')

  assert.ok(configRoute, 'config route should be registered')
  assert.ok(statusRoute, 'status route should be registered')
  assert.ok(healthRoute, 'health route should be registered')

  // Remote unauthenticated request with matching Origin and Host
  const r1 = res()
  await configRoute.handler({
    method: 'GET',
    url: '/dsh-subscriptions/config',
    headers: { host: 'victim.example', origin: 'http://victim.example' },
    socket: { remoteAddress: '192.0.2.12' },
  }, r1)
  assert.equal(r1.code, 403, 'remote unauthenticated /config must be rejected with 403')

  const r2 = res()
  await statusRoute.handler({
    method: 'GET',
    url: '/dsh-subscriptions/status',
    headers: { host: 'victim.example', origin: 'http://victim.example' },
    socket: { remoteAddress: '192.0.2.12' },
  }, r2)
  assert.equal(r2.code, 403, 'remote unauthenticated /status must be rejected with 403')

  // Remote request with credentials allowed
  const r3 = res()
  await configRoute.handler({
    method: 'GET',
    url: '/dsh-subscriptions/config',
    headers: { host: 'victim.example', origin: 'https://victim.example', cookie: 'token=secret' },
    socket: { remoteAddress: '192.0.2.12' },
  }, r3)
  assert.equal(r3.code, 200, 'authenticated remote /config must be allowed')

  // Public health endpoint allowed without credentials and contains no metadata
  const r4 = res()
  await healthRoute.handler({
    method: 'GET',
    url: '/dsh-subscriptions/health',
    headers: { host: 'victim.example' },
    socket: { remoteAddress: '192.0.2.12' },
  }, r4)
  assert.equal(r4.code, 200, 'public /health must return 200')
  const body4 = JSON.parse(r4.body)
  assert.equal(body4.ok, true)
  assert.equal(body4.status, 'healthy')
  assert.equal(body4.config, undefined)
  assert.equal(body4.accounts, undefined)
})
