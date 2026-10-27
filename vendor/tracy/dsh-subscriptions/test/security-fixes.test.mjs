import test from 'node:test'
import assert from 'node:assert/strict'
import { isAllowed, createSubscriptionsService } from '../lib/subscriptions.js'
import { timingSafeCompare, isTrustedSettingsRequest } from '../lib/http.js'
import { registerOauthRoutes } from '../lib/routes/oauth.js'
import { registerStatusRoutes } from '../lib/routes/status.js'

function createMockRes() {
  return {
    code: 0,
    headers: {},
    body: '',
    writeHead(code, headers) {
      this.code = code
      this.headers = headers || {}
    },
    end(str) {
      this.body = str || ''
    },
  }
}

test('#487: isAllowed rejects dot-segment path traversal attacks', () => {
  assert.equal(isAllowed('codex', '/models/../../../evil'), false)
  assert.equal(isAllowed('codex', '/models/%2e%2e/%2e%2e/evil'), false)
  assert.equal(isAllowed('codex', '/models/%2E%2E/%2E%2E/evil'), false)
  assert.equal(isAllowed('codex', '//evil.com/models'), false)
  assert.equal(isAllowed('codex', '/backend-api/codex/models/../../evil'), false)
  assert.equal(isAllowed('claude', '/v1/messages/../../evil'), false)
  assert.equal(isAllowed('grok', '/v1/models/../../../etc/passwd'), false)

  // Legitimate paths pass
  assert.equal(isAllowed('codex', '/models'), true)
  assert.equal(isAllowed('codex', '/models/gpt-4o'), true)
  assert.equal(isAllowed('codex', '/backend-api/codex/models'), true)
  assert.equal(isAllowed('claude', '/v1/messages'), true)
  assert.equal(isAllowed('grok', '/v1/models'), true)
  assert.equal(isAllowed('antigravity', '/v1/models'), true)
})

test('#487: subscriptions.request enforces normalized URL boundary and allowlist', async () => {
  let requestedUrl = null
  let authHeader = null

  const svc = createSubscriptionsService({
    listAccounts: async () => [{ hasToken: true, ref: 'CODEX_OAUTH_1', quota: null, cooldownUntil: 0 }],
    loadBlob: async () => ({ accessToken: 'SECRET_TOKEN', refreshToken: 'rt', expiresAt: Date.now() + 100000 }),
    ensureFresh: async (_p, b) => b,
    vendorConfig: () => ({ baseUrl: 'https://chatgpt.com/backend-api/codex' }),
    cooldownMs: () => 30 * 60 * 1000,
    switchAtRemaining: () => 0,
    rememberCooldown: () => {},
    rememberQuota: () => {},
    fetchImpl: async (url, opts) => {
      requestedUrl = url
      authHeader = opts.headers?.Authorization
      return {
        ok: true,
        status: 200,
        headers: { get: () => null, forEach: () => {} },
        text: async () => '{}',
        clone: () => ({ text: async () => '{}' }),
      }
    },
  })

  // 1. Path traversal attempt is blocked
  await assert.rejects(
    () => svc.request({ provider: 'codex', path: '/models/../../../evil' }),
    (err) => err.code === 'FORBIDDEN'
  )
  assert.equal(requestedUrl, null)
  assert.equal(authHeader, null)

  // 2. Protocol-relative URL is blocked
  await assert.rejects(
    () => svc.request({ provider: 'codex', path: '//evil.com/models' }),
    (err) => err.code === 'FORBIDDEN'
  )

  // 3. Encoded traversal is blocked
  await assert.rejects(
    () => svc.request({ provider: 'codex', path: '/models/%2e%2e/%2e%2e/evil' }),
    (err) => err.code === 'FORBIDDEN'
  )

  // 4. Valid relative path resolves properly to full URL
  const res = await svc.request({ provider: 'codex', path: '/responses' })
  assert.equal(res.ok, true)
  assert.equal(requestedUrl, 'https://chatgpt.com/backend-api/codex/responses')
  assert.equal(authHeader, 'Bearer SECRET_TOKEN')

  // 5. Valid relative path already starting with basePath resolves without duplicate
  requestedUrl = null
  const res2 = await svc.request({ provider: 'codex', path: '/backend-api/codex/responses' })
  assert.equal(res2.ok, true)
  assert.equal(requestedUrl, 'https://chatgpt.com/backend-api/codex/responses')
})

test('#488: oauth/start rejects untrusted cross-origin requests with 403', async () => {
  const routes = []
  const ctx = {
    webServer: { register(spec) { routes.push(spec); return () => {} } },
    effect(fn) { fn(); return () => {} },
    connection: { requestRejection: () => 401 },
  }
  const pending = new Map()
  registerOauthRoutes(ctx, {
    live: () => ({}),
    pending,
    redirectFor: () => 'http://localhost/cb',
  })

  const oauthStart = routes.find((r) => r.path === '/dsh-subscriptions/oauth/start')
  assert.ok(oauthStart, 'oauth/start route registered')

  // Remote untrusted request rejected with 403
  const res403 = createMockRes()
  await oauthStart.handler({
    method: 'GET',
    url: '/dsh-subscriptions/oauth/start?provider=codex&index=1',
    headers: { host: 'attacker.example', origin: 'http://attacker.example' },
    socket: { remoteAddress: '198.51.100.20' },
  }, res403)

  assert.equal(res403.code, 403)
  const body403 = JSON.parse(res403.body)
  assert.equal(body403.ok, false)
  assert.equal(body403.error.code, 'forbidden')
  assert.equal(pending.size, 0, 'no pending PKCE row minted on untrusted request')
})

test('#490: status routes clamp negative limit to 1', async () => {
  const routes = []
  const ctx = {
    webServer: { register(spec) { routes.push(spec); return () => {} } },
    effect(fn) { fn(); return () => {} },
  }
  let historyQueriedLimit = null
  registerStatusRoutes(ctx, {
    live: () => ({}),
    accountsView: async () => [],
    history: {
      size: () => 5,
      recent: (limit) => { historyQueriedLimit = limit; return [] },
    },
    getRecentAlerts: () => [],
  })

  const historyRoute = routes.find((r) => r.path === '/dsh-subscriptions/history')
  const alertsRoute = routes.find((r) => r.path === '/dsh-subscriptions/alerts')
  assert.ok(historyRoute)
  assert.ok(alertsRoute)

  // Query with negative limit
  const res1 = createMockRes()
  await historyRoute.handler({
    method: 'GET',
    url: '/dsh-subscriptions/history?limit=-10',
    headers: { host: 'localhost' },
  }, res1)
  assert.equal(res1.code, 200)
  assert.equal(historyQueriedLimit, 1, 'negative history limit clamped to 1')

  const res2 = createMockRes()
  await alertsRoute.handler({
    method: 'GET',
    url: '/dsh-subscriptions/alerts?limit=-5',
    headers: { 'sec-fetch-site': 'same-origin' },
  }, res2)
  assert.equal(res2.code, 200)
  const body2 = JSON.parse(res2.body)
  assert.equal(body2.ok, true)
  assert.ok(Array.isArray(body2.alerts))
})

test('#492: timingSafeCompare operates in constant time and handles mismatches safely', () => {
  assert.equal(timingSafeCompare('my-secret-token', 'my-secret-token'), true)
  assert.equal(timingSafeCompare('my-secret-token', 'my-secret-tokeX'), false)
  assert.equal(timingSafeCompare('short', 'much-longer-token-string'), false)
  assert.equal(timingSafeCompare('', ''), true)
  assert.equal(timingSafeCompare('a', ''), false)
  assert.equal(timingSafeCompare(null, 'secret'), false)
  assert.equal(timingSafeCompare(undefined, 'secret'), false)
  assert.equal(timingSafeCompare(123, 123), false)
})

test('#492: isTrustedSettingsRequest uses timingSafeCompare for DSH_AUTH_TOKEN', () => {
  const origEnv = process.env.DSH_AUTH_TOKEN
  try {
    process.env.DSH_AUTH_TOKEN = 'super-secret-auth-token-12345'

    // Matching Bearer token
    assert.equal(isTrustedSettingsRequest({
      headers: { authorization: 'Bearer super-secret-auth-token-12345' },
    }), true)

    // Mismatched Bearer token
    assert.equal(isTrustedSettingsRequest({
      headers: { authorization: 'Bearer wrong-secret-token' },
      socket: { remoteAddress: '198.51.100.1' },
    }), false)

    // Matching cookie token
    assert.equal(isTrustedSettingsRequest({
      headers: { cookie: 'other=1; token=super-secret-auth-token-12345' },
    }), true)

    // Mismatched cookie token
    assert.equal(isTrustedSettingsRequest({
      headers: { cookie: 'other=1; token=wrong' },
      socket: { remoteAddress: '198.51.100.1' },
    }), false)
  } finally {
    process.env.DSH_AUTH_TOKEN = origEnv
  }
})
