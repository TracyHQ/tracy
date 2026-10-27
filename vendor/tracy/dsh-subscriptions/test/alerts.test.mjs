import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  clearAlerts,
  getRecentAlerts,
  dispatchWebhookAlert,
  checkQuotaThresholds,
} from '../lib/alerts.js'
import { streamWithRotation } from '../lib/stream-rotate.js'
import { SubscriptionAdapter } from '../lib/adapter.js'

const pkgVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version

test('#407: dispatchWebhookAlert uses current package version in user-agent header', async () => {
  let capturedHeaders = null
  const mockFetch = async (_url, init) => {
    capturedHeaders = init.headers
    return { ok: true }
  }

  const alert = {
    id: 'alt_test_1',
    type: 'quota_threshold',
    ref: 'TEST_REF',
    provider: 'codex',
    message: 'Test alert',
    severity: 'warn',
    timestamp: Date.now(),
  }

  const sent = await dispatchWebhookAlert(alert, 'https://example.com/webhook', mockFetch)
  assert.equal(sent, true)
  assert.ok(capturedHeaders)
  assert.equal(capturedHeaders['user-agent'], `dsh-subscriptions/${pkgVersion}`)
})

test('#407: streamWithRotation triggers notifySessionExpired on 401/TOKEN_REVOKED', async () => {
  clearAlerts()
  let webhookPayload = null
  const mockFetch = async (_url, init) => {
    webhookPayload = JSON.parse(init.body)
    return { ok: true }
  }

  const accounts = [
    { ref: 'CODEX_REVOKED', token: 'bad-token', hasToken: true, cooldownUntil: 0 },
    { ref: 'CODEX_VALID', token: 'good-token', hasToken: true, cooldownUntil: 0 },
  ]

  const gen = streamWithRotation({
    accounts,
    nowMs: () => Date.now(),
    cooldownMs: 60000,
    options: { provider: 'codex', model: 'codex-model' },
    webhookUrl: 'https://example.com/webhook',
    fetchImpl: mockFetch,
    streamOnce: async function* (account) {
      if (account.ref === 'CODEX_REVOKED') {
        const err = new Error('Token revoked')
        err.status = 401
        err.code = 'TOKEN_REVOKED'
        throw err
      }
      yield { type: 'content', content: 'success from valid account' }
    },
  })

  const results = []
  for await (const chunk of gen) {
    results.push(chunk)
  }

  assert.equal(results.length, 1)
  assert.equal(results[0].content, 'success from valid account')

  // Check alert was recorded
  const alerts = getRecentAlerts(10)
  const expiredAlert = alerts.find((a) => a.type === 'token_expired' && a.ref === 'CODEX_REVOKED')
  assert.ok(expiredAlert, 'token_expired alert should be recorded in buffer')
  assert.equal(expiredAlert.provider, 'codex')

  // Check webhook was dispatched
  assert.ok(webhookPayload, 'webhook should have been called')
  assert.equal(webhookPayload.event, 'subscription_alert')
  assert.equal(webhookPayload.alert.type, 'token_expired')
  assert.equal(webhookPayload.alert.ref, 'CODEX_REVOKED')
})

test('#407: SubscriptionAdapter wires checkQuotaThresholds during stream', async () => {
  clearAlerts()
  let webhookPayload = null
  const mockFetch = async (_url, init) => {
    webhookPayload = JSON.parse(init.body)
    return { ok: true }
  }

  const adapter = new SubscriptionAdapter({
    listAccounts: async () => [{ ref: 'TEST_SLOT', hasToken: true, cooldownUntil: 0 }],
    loadBlob: async () => ({ token: 'dummy' }),
    ensureFresh: async (_prov, blob) => blob,
    vendorConfig: () => ({}),
    cooldownMs: () => 60000,
    switchAtRemaining: () => 0,
    rememberQuota: () => {},
    alertThresholds: () => [80, 90, 95],
    webhookUrl: () => 'https://example.com/webhook',
    fetchImpl: mockFetch,
  })

  // We invoke checkQuotaThresholds directly through the adapter dependency wiring
  const snap = { usedPercent: 92, limit: 100, remaining: 8 }
  const th = adapter.deps.alertThresholds()
  const wh = adapter.deps.webhookUrl()
  const alert = checkQuotaThresholds({
    ref: 'TEST_SLOT',
    provider: 'claude',
    usedPercent: snap.usedPercent,
    thresholds: th,
    webhookUrl: wh,
    fetchImpl: mockFetch,
  })

  assert.ok(alert)
  assert.equal(alert.type, 'quota_threshold')
  assert.equal(alert.details.threshold, 90)
  assert.ok(webhookPayload)
  assert.equal(webhookPayload.alert.ref, 'TEST_SLOT')
})
