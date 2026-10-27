import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveFallbackVendor, mapFallbackModel } from '../lib/cascade.js'
import {
  needsWarmupProbe,
  enterProbing,
  resolveWarmupSuccess,
  resolveWarmupFailure,
  isQuarantined,
  STATUS_ACTIVE,
  STATUS_PROBING,
  STATUS_QUARANTINE,
  REASON_RATE_LIMIT,
} from '../lib/quarantine.js'
import {
  recordAlert,
  getRecentAlerts,
  checkQuotaThresholds,
  notifySessionExpired,
  clearAlerts,
} from '../lib/alerts.js'
import { calculateBurnRatePerHour, computePacingRisk } from '../lib/forecast.js'
import { exportVault, importVault } from '../lib/vault.js'
import { pickAccount } from '../lib/rotate.js'

test('#349: resolveFallbackVendor resolves next eligible candidate without cycles', () => {
  const available = ['copilot', 'cursor']
  const target = resolveFallbackVendor('claude', available)
  assert.equal(target, 'copilot')

  // Visited avoids cycles
  const visited = new Set(['copilot'])
  const nextTarget = resolveFallbackVendor('claude', available, {}, visited)
  assert.equal(nextTarget, 'cursor')

  // Custom chain overrides default
  const custom = { claude: ['cursor', 'copilot'] }
  assert.equal(resolveFallbackVendor('claude', available, custom), 'cursor')

  // Empty if none available
  assert.equal(resolveFallbackVendor('claude', ['unknown_provider']), null)
})

test('#349: mapFallbackModel maps model id across vendors appropriately', () => {
  assert.equal(mapFallbackModel('claude', 'claude-3-7-sonnet', 'copilot'), 'claude-3-5-sonnet')
  assert.equal(mapFallbackModel('claude', 'claude-3-7-sonnet', 'codex'), 'gpt-4o')
  assert.equal(mapFallbackModel('codex', 'gpt-4o', 'cursor'), 'gpt-4o')
})

test('#350: quarantine warmup lifecycle and exponential backoff on probe failure', () => {
  const now = 1000000
  const account = {
    ref: 'TEST_REF',
    status: STATUS_QUARANTINE,
    quarantineUntil: now - 100, // expired
    quarantineReason: REASON_RATE_LIMIT,
    quarantineAttempts: 1,
  }

  // Needs warmup probe because quarantine deadline passed
  assert.equal(needsWarmupProbe(account, now), true)

  // Enter probing
  const probing = enterProbing(account)
  assert.equal(probing.status, STATUS_PROBING)
  assert.equal(isQuarantined(probing, now), true) // probing is treated as quarantined for live traffic

  // Successful probe restores to active
  const restored = resolveWarmupSuccess(probing, now)
  assert.equal(restored.status, STATUS_ACTIVE)
  assert.equal(restored.quarantineUntil, 0)
  assert.equal(restored.quarantineReason, null)
  assert.equal(isQuarantined(restored, now), false)

  // Failed probe doubles backoff and extends quarantine
  const failed = resolveWarmupFailure(probing, REASON_RATE_LIMIT, now)
  assert.equal(failed.status, STATUS_QUARANTINE)
  assert.equal(failed.quarantineAttempts, 2)
  assert.ok(failed.quarantineUntil > now)
})

test('#351: alerts recording, deduplication, and threshold detection', async () => {
  clearAlerts()
  const now = Date.now()

  // First alert records successfully
  const a1 = recordAlert({
    type: 'quota_threshold',
    ref: 'CODEX_OAUTH_1',
    provider: 'codex',
    message: '90% reached',
    severity: 'warn',
    nowMs: now,
  })
  assert.ok(a1)
  assert.equal(a1.provider, 'codex')

  // Immediate duplicate within dedup window returns null
  const a2 = recordAlert({
    type: 'quota_threshold',
    ref: 'CODEX_OAUTH_1',
    provider: 'codex',
    message: '90% reached again',
    nowMs: now + 5000,
  })
  assert.equal(a2, null)

  // Check quota thresholds helper
  let webhookPayload = null
  const mockFetch = async (_url, init) => {
    webhookPayload = JSON.parse(init.body)
    return { ok: true }
  }

  const triggered = checkQuotaThresholds({
    ref: 'CLAUDE_OAUTH_1',
    provider: 'claude',
    usedPercent: 96,
    thresholds: [80, 90, 95],
    webhookUrl: 'https://example.com/webhook',
    fetchImpl: mockFetch,
    nowMs: now,
  })
  assert.ok(triggered)
  assert.equal(triggered.severity, 'error')
  assert.equal(triggered.details.threshold, 95)
  assert.ok(webhookPayload)
  assert.equal(webhookPayload.event, 'subscription_alert')

  // Session expired helper
  const expAlert = notifySessionExpired({
    ref: 'GROK_OAUTH_1',
    provider: 'grok',
    webhookUrl: 'https://example.com/webhook',
    fetchImpl: mockFetch,
    nowMs: now,
  })
  assert.ok(expAlert)
  assert.equal(expAlert.type, 'token_expired')

  const list = getRecentAlerts(10)
  assert.ok(list.length >= 3)
})

test('#352: burn-rate calculation and auto-pacing risk score', () => {
  const now = Date.now()
  const HOUR = 3600 * 1000

  // 10% consumed over 2 hours = 5% per hour
  const samples = [
    { at: now - 2 * HOUR, pct: 90 },
    { at: now - 1 * HOUR, pct: 85 },
    { at: now, pct: 80 },
  ]
  const pace = calculateBurnRatePerHour(samples, now)
  assert.ok(Math.abs(pace - 5) < 0.1)

  // Risk: 80% remaining at 20%/hr will exhaust in 4 hours. If reset is in 6 hours -> risk high!
  const risky = computePacingRisk(80, 20, now + 6 * HOUR, now)
  assert.equal(risky.survivesReset, false)
  assert.ok(risky.pacingRisk > 0)

  // Safe: 80% remaining at 5%/hr will exhaust in 16 hours. Reset in 6 hours -> safe!
  const safe = computePacingRisk(80, 5, now + 6 * HOUR, now)
  assert.equal(safe.survivesReset, true)
  assert.equal(safe.pacingRisk, 0)
})

test('#352: pickAccount prioritizes accounts with lower pacing risk', () => {
  const now = Date.now()
  const acc1 = {
    ref: 'ACC_RISKY',
    hasToken: true,
    pacingRisk: 75,
    quota: { resetAt: now + 3600000, remaining: 10, limit: 100 },
  }
  const acc2 = {
    ref: 'ACC_SAFE',
    hasToken: true,
    pacingRisk: 0,
    quota: { resetAt: now + 3600000, remaining: 10, limit: 100 },
  }

  const chosen = pickAccount([acc1, acc2], now)
  assert.equal(chosen.ref, 'ACC_SAFE')
})

test('#353: encrypted vault export and import with AES-256-GCM', () => {
  const passphrase = 'SecretPassword123'
  const slots = [
    { provider: 'claude', index: 1, label: 'Work' },
    { provider: 'copilot', index: 1, label: 'Personal' },
  ]
  const blobs = {
    CLAUDE_OAUTH_1: { accessToken: 'tok_claude', email: 'claude@test.com' },
    COPILOT_OAUTH_1: { accessToken: 'tok_copilot', email: 'gh@test.com' },
  }

  const exportResult = exportVault({ slots, blobs }, passphrase)
  assert.ok(exportResult.ok)
  assert.ok(exportResult.vault.startsWith('DSHE2:') || exportResult.vault.startsWith('DSHE1:'))
  assert.equal(exportResult.slotCount, 2)
  assert.equal(exportResult.blobCount, 2)

  // Import with correct passphrase
  const importResult = importVault(exportResult.vault, passphrase)
  assert.ok(importResult.ok)
  assert.equal(importResult.slots.length, 2)
  assert.equal(importResult.blobs.CLAUDE_OAUTH_1.email, 'claude@test.com')
  assert.equal(importResult.blobs.COPILOT_OAUTH_1.accessToken, 'tok_copilot')

  // Rejects invalid passphrase
  assert.throws(() => {
    importVault(exportResult.vault, 'WrongPassword')
  }, /failed to decrypt vault/)

  // Rejects corrupted payload
  assert.throws(() => {
    importVault('corrupted_string', passphrase)
  }, /missing DSHE1 header/)
})
