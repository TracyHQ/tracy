import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSubscriptionsService } from '../lib/subscriptions.js'

test('history row carries ms timing', async () => {
  let row = null
  const svc = createSubscriptionsService({
    listAccounts: async () => [{ hasToken: true, ref: 'CODEX_OAUTH_1', quota: null, cooldownUntil: 0 }],
    loadBlob: async () => ({ accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 100000 }),
    ensureFresh: async (p, b) => b,
    vendorConfig: () => ({ baseUrl: 'https://chatgpt.com/backend-api/codex' }),
    cooldownMs: () => 30 * 60 * 1000,
    switchAtRemaining: () => 0,
    rememberCooldown: () => {},
    rememberQuota: () => {},
    recordHistory: (entry) => { row = entry },
    fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => null, forEach: () => {} }, text: async () => '{}', clone: () => ({ text: async () => '{}' }) }),
  })
  await svc.request({ provider: 'codex', path: '/responses', method: 'POST', body: { model: 'x' } })
  assert.ok(row, 'recordHistory called')
  assert.equal(typeof row.ms, 'number')
  assert.ok(row.ms >= 0)
})
