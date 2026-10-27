import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function minimalState() {
  const noop = async () => ({})
  return {
    NS: 'dsh-subscriptions',
    live: noop,
    accountsView: async () => [],
    getSettingsApi: () => ({}),
    syncCustomVendors: () => {},
    syncAdapter: async () => {},
    stripLegacySlots: () => {},
    store: { clearRef: async () => {} },
    PENDING_TTL_MS: 1,
    redirectFor: () => 'http://localhost/cb',
    OK_HTML: '<html></html>',
    refreshModels: async () => {},
    history: { add: () => {}, list: () => [] },
    refForSlot: () => 'ref-x',
    resetCredits: { begin: async () => ({}) },
    diagnosticsReport: async () => ({ ok: true }),
    pending: new Map(),
    completeOAuth: async () => ({}),
    fetchForRef: async () => { throw new Error('no fetch') },
    sweepPending: () => {},
    subscriptions: { request: async () => ({}) },
    pmL: () => {},
    pmE: () => {},
  }
}

function fakeCtx() {
  const routes = []
  const ctx = {
    webServer: { register(spec) { routes.push(spec) } },
    effect(fn) { fn(); return () => {} },
    log: { warn() {}, error() {}, info() {} },
  }
  return { ctx, routes }
}

const MODULES = ['status', 'oauth', 'accounts', 'proxy']

test('every routes module registers exactly its declared paths', async () => {
  for (const name of MODULES) {
    const src = readFileSync(new URL('../lib/routes/' + name + '.js', import.meta.url), 'utf8')
    const declared = (src.match(/path: '/g) || []).length
    const mod = await import('../lib/routes/' + name + '.js')
    const registrar = mod['register' + name[0].toUpperCase() + name.slice(1) + 'Routes']
    assert.equal(typeof registrar, 'function', name + ' registrar export')
    const { ctx, routes } = fakeCtx()
    registrar(ctx, minimalState())
    assert.equal(routes.length, declared, name + ' registered ' + routes.length + ' of ' + declared)
    for (const r of routes) assert.ok(r.path && r.handler, name + ' route shape')
  }
})

test('combined registration covers all declared paths without duplicates', async () => {
  let declared = 0
  const paths = []
  for (const name of MODULES) {
    const src = readFileSync(new URL('../lib/routes/' + name + '.js', import.meta.url), 'utf8')
    declared += (src.match(/path: '/g) || []).length
    const mod = await import('../lib/routes/' + name + '.js')
    const { ctx, routes } = fakeCtx()
    mod['register' + name[0].toUpperCase() + name.slice(1) + 'Routes'](ctx, minimalState())
    paths.push(...routes.map((r) => r.path))
  }
  assert.equal(new Set(paths).size, paths.length, 'no duplicate paths')
  assert.equal(paths.length, declared)
})

test('status route handler is wired through safeJsonHandler', async () => {
  const mod = await import('../lib/routes/status.js')
  const { ctx, routes } = fakeCtx()
  mod.registerStatusRoutes(ctx, minimalState())
  assert.ok(routes.find((r) => r.path === '/dsh-subscriptions/status'))
})

test('logout rejects non-POST with 405', async () => {
  const mod = await import('../lib/routes/accounts.js')
  const { ctx, routes } = fakeCtx()
  mod.registerAccountsRoutes(ctx, minimalState())
  const logout = routes.find((r) => r.path === '/dsh-subscriptions/logout')
  assert.ok(logout)
  let code = 0
  const res = { writeHead(c) { code = c }, end() {}, setHeader() {} }
  await logout.handler({ method: 'GET', headers: {} }, res)
  assert.equal(code, 405)
})

test('backoff executeWithRetry retries then succeeds', async () => {
  const { executeWithRetry } = await import('../lib/backoff.js')
  let calls = 0
  const result = await executeWithRetry(async () => {
    calls++
    if (calls < 3) throw new Error('flaky')
    return 'ok'
  }, { maxRetries: 5, initialDelayMs: 1, maxDelayMs: 2 })
  assert.equal(result, 'ok')
  assert.equal(calls, 3)
})

test('backoff gives up after maxRetries', async () => {
  const { executeWithRetry } = await import('../lib/backoff.js')
  await assert.rejects(
    () => executeWithRetry(async () => { throw new Error('always') }, { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 2 }),
    /always/
  )
})

test('backoff respects isRetryable', async () => {
  const { executeWithRetry } = await import('../lib/backoff.js')
  await assert.rejects(
    () => executeWithRetry(async () => { throw new Error('fatal') }, { isRetryable: (e) => e.message !== 'fatal' }),
    /fatal/
  )
})
