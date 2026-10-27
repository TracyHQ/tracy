import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAccountStore } from '../lib/accounts.js'
import { registerOauthRoutes } from '../lib/routes/oauth.js'
import { registerAccountsRoutes } from '../lib/routes/accounts.js'
import { registerStatusRoutes } from '../lib/routes/status.js'
import { exportVault } from '../lib/vault.js'

const ONLY_CLAUDE = { allowedVendors: ['claude'], slots: [] }
const SAME_ORIGIN = { host: 'localhost:5140', origin: 'http://localhost:5140' }

function fakeCredentials() {
  const written = new Map()
  return {
    written,
    async resolve(ref) { return written.has(ref) ? { value: written.get(ref) } : null },
    async set(ref, value) { written.set(ref, value) },
    async unset(ref) { written.delete(ref) },
  }
}

function storeWith(cfg, credentials) {
  return createAccountStore({
    credentials,
    getConfig: () => cfg,
    fetchImpl: async () => { throw new Error('no network in tests') },
    onLimitNotice: () => {},
  })
}

function routes(register, cfg, extra = {}) {
  const list = []
  const ctx = {
    webServer: { register(spec) { list.push(spec); return () => {} } },
    effect(fn) { fn(); return () => {} },
  }
  register(ctx, {
    live: () => cfg,
    accountsView: async () => [],
    getSettingsApi: () => null,
    syncCustomVendors: () => {},
    syncAdapter: async () => {},
    stripLegacySlots: (s) => s,
    refreshModels: async () => {},
    store: { saveBlob: async () => { throw new Error('saveBlob must not be reached') } },
    pending: new Map(),
    redirectFor: () => 'http://localhost:5140/cb',
    sweepPending: () => {},
    history: { recent: () => [] },
    pmL: (x) => x,
    ...extra,
  })
  return (path) => list.find((r) => r.path === path)
}

async function call(route, req) {
  const out = { code: 0, body: null }
  const chunks = req.body === undefined ? [] : [Buffer.from(JSON.stringify(req.body))]
  const request = {
    method: req.method,
    headers: { ...SAME_ORIGIN, 'content-type': 'application/json' },
    url: req.url || route.path,
    async *[Symbol.asyncIterator]() { yield* chunks },
    on(ev, fn) {
      if (ev === 'data') for (const c of chunks) fn(c)
      if (ev === 'end') fn()
      return this
    },
  }
  const res = {
    writeHead(c) { out.code = c },
    setHeader() {},
    end(b) { try { out.body = b ? JSON.parse(String(b)) : null } catch { out.body = String(b) } },
  }
  await route.handler(request, res)
  return out
}

test('the account store refuses to persist a credential for a vendor outside allowedVendors', async () => {
  const credentials = fakeCredentials()
  const store = storeWith(ONLY_CLAUDE, credentials)
  await assert.rejects(store.saveBlob('GROK_OAUTH_1', { accessToken: 'x' }), (e) => e.code === 'VENDOR_NOT_ALLOWED')
  assert.equal(credentials.written.size, 0)
  await store.saveBlob('CLAUDE_OAUTH_1', { accessToken: 'x' })
  assert.equal(credentials.written.size, 1)
})

test('an account stored before its vendor was dropped from allowedVendors keeps saving its refreshed token', async () => {
  const credentials = fakeCredentials()
  await storeWith({ slots: [] }, credentials).saveBlob('GROK_OAUTH_1', { accessToken: 'old' })
  const store = storeWith(ONLY_CLAUDE, credentials)
  await store.saveBlob('GROK_OAUTH_1', { accessToken: 'rotated' })
  assert.match(credentials.written.get('GROK_OAUTH_1'), /rotated/)
})

test('the account store persists any vendor when allowedVendors is empty', async () => {
  const credentials = fakeCredentials()
  await storeWith({ slots: [] }, credentials).saveBlob('GROK_OAUTH_1', { accessToken: 'x' })
  assert.equal(credentials.written.size, 1)
})

test('OAuth start is refused for a vendor outside allowedVendors, before any vendor URL is built', async () => {
  const route = routes(registerOauthRoutes, ONLY_CLAUDE)('/dsh-subscriptions/oauth/start')
  const out = await call(route, { method: 'GET', url: '/dsh-subscriptions/oauth/start?provider=grok&index=1' })
  assert.equal(out.code, 403)
  assert.equal(out.body.error.code, 'vendor_not_allowed')
})

test('OAuth start still answers for an allowed vendor', async () => {
  const route = routes(registerOauthRoutes, ONLY_CLAUDE)('/dsh-subscriptions/oauth/start')
  const out = await call(route, { method: 'GET', url: '/dsh-subscriptions/oauth/start?provider=claude&index=1' })
  assert.notEqual(out.code, 403)
})

test('device login start is refused for a vendor outside allowedVendors', async () => {
  const route = routes(registerOauthRoutes, ONLY_CLAUDE)('/dsh-subscriptions/oauth/device/start')
  const out = await call(route, { method: 'POST', body: { provider: 'copilot', index: 1 } })
  assert.equal(out.code, 403)
  assert.equal(out.body.error.code, 'vendor_not_allowed')
})

test('token import and CLI import are refused for a vendor outside allowedVendors', async () => {
  const find = routes(registerAccountsRoutes, ONLY_CLAUDE)
  const token = await call(find('/dsh-subscriptions/import-token'), { method: 'POST', body: { provider: 'grok', index: 1, apiKey: 'k' } })
  assert.equal(token.code, 403)
  assert.equal(token.body.error.code, 'vendor_not_allowed')
  const local = await call(find('/dsh-subscriptions/import-local'), { method: 'POST', body: { provider: 'codex', index: 1 } })
  assert.equal(local.code, 403)
  assert.equal(local.body.error.code, 'vendor_not_allowed')
})

test('the settings card is offered only the allowed vendors', async () => {
  const route = routes(registerStatusRoutes, ONLY_CLAUDE)('/dsh-subscriptions/config')
  const out = await call(route, { method: 'GET' })
  assert.equal(out.code, 200)
  assert.deepEqual(out.body.providers.map((p) => p.id), ['claude'])
})

test('a pending device login is refused, without polling the vendor, once its vendor is outside allowedVendors', async () => {
  const pending = new Map([['st1', { kind: 'device', provider: 'copilot', index: 1, ref: 'COPILOT_OAUTH_1', createdAt: Date.now() }]])
  const route = routes(registerOauthRoutes, ONLY_CLAUDE, { pending, fetchForRef: () => async () => { throw new Error('vendor must not be polled') } })('/dsh-subscriptions/oauth/device/poll')
  const out = await call(route, { method: 'POST', body: { state: 'st1' } })
  assert.equal(out.code, 403)
  assert.equal(out.body.error.code, 'vendor_not_allowed')
  assert.equal(pending.has('st1'), false)
})

test('a vault import keeps the allowed vendors and skips the others whole', async () => {
  const saved = []
  const { vault } = exportVault({
    slots: [{ provider: 'claude', index: 1 }, { provider: 'grok', index: 1 }],
    blobs: { CLAUDE_OAUTH_1: { accessToken: 'a' }, GROK_OAUTH_1: { accessToken: 'b' } },
  }, 'correct horse battery')
  let replaced = null
  const route = routes(registerAccountsRoutes, ONLY_CLAUDE, {
    store: { saveBlob: async (ref) => { saved.push(ref) } },
    getSettingsApi: () => ({ replace: async (cfg) => { replaced = cfg } }),
  })('/dsh-subscriptions/vault/import')
  const out = await call(route, { method: 'POST', body: { passphrase: 'correct horse battery', vault } })
  assert.equal(out.code, 200, JSON.stringify(out.body))
  assert.deepEqual(saved, ['CLAUDE_OAUTH_1'])
  assert.deepEqual(replaced.slots.map((s) => s.provider), ['claude'])
  assert.equal(out.body.skipped, 1)
})
