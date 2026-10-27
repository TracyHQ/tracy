import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { exportVault, importVault } from '../lib/vault.js'
import { resolveFallbackVendor } from '../lib/cascade.js'
import { SubscriptionAdapter } from '../lib/adapter.js'
import { isSwitchableError } from '../lib/rotate.js'
import { encryptWithPassphrase } from '../lib/crypto.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test('#360: vault import strictly rejects invalid schema and unauthorized blob injection', () => {
  const passphrase = 'SafePassphrase999'

  // 1. Valid export & import
  const validSlots = [{ provider: 'claude', index: 1, label: 'Work' }]
  const validBlobs = { CLAUDE_OAUTH_1: { token: 'secret' } }
  const validExport = exportVault({ slots: validSlots, blobs: validBlobs }, passphrase)
  const imported = importVault(validExport.vault, passphrase)
  assert.equal(imported.ok, true)
  assert.equal(imported.slots.length, 1)
  assert.equal(imported.blobs.CLAUDE_OAUTH_1.token, 'secret')

  // 2. Reject injection of undeclared blob (not in declared slots)
  const orphanBlobPayload = JSON.stringify({
    format: 'dsh-subscriptions-vault-v1',
    slots: [{ provider: 'claude', index: 1 }],
    blobs: {
      CLAUDE_OAUTH_1: { token: 'secret' },
      INJECTED_KEY: { evil: 'true' },
    },
  })
  const injectedVault = encryptWithPassphrase(orphanBlobPayload, passphrase)
  assert.throws(() => {
    importVault(injectedVault, passphrase)
  }, /invalid vault credential: expected a declared slot/)

  // 3. Reject invalid provider in slot
  const invalidProviderPayload = JSON.stringify({
    format: 'dsh-subscriptions-vault-v1',
    slots: [{ provider: 'malicious_provider', index: 1 }],
    blobs: {},
  })
  assert.throws(() => {
    importVault(encryptWithPassphrase(invalidProviderPayload, passphrase), passphrase)
  }, /invalid vault slot/)

  // 4. Reject duplicate slot
  const duplicateSlotPayload = JSON.stringify({
    format: 'dsh-subscriptions-vault-v1',
    slots: [
      { provider: 'claude', index: 1 },
      { provider: 'claude', index: 1 },
    ],
    blobs: { CLAUDE_OAUTH_1: { token: '1' } },
  })
  assert.throws(() => {
    importVault(encryptWithPassphrase(duplicateSlotPayload, passphrase), passphrase)
  }, /duplicate vault slot/)

  // 5. Reject invalid slot index (< 1 or float)
  const badIndexPayload = JSON.stringify({
    format: 'dsh-subscriptions-vault-v1',
    slots: [{ provider: 'claude', index: 0 }],
    blobs: {},
  })
  assert.throws(() => {
    importVault(encryptWithPassphrase(badIndexPayload, passphrase), passphrase)
  }, /invalid vault slot/)

  // 6. Reject non-object blob value
  const badBlobValPayload = JSON.stringify({
    format: 'dsh-subscriptions-vault-v1',
    slots: [{ provider: 'claude', index: 1 }],
    blobs: { CLAUDE_OAUTH_1: 'not-an-object' },
  })
  assert.throws(() => {
    importVault(encryptWithPassphrase(badBlobValPayload, passphrase), passphrase)
  }, /invalid vault credential/)
})

test('#361: cascading fallback cycle avoidance and abort signal handling', async () => {
  // Cycle avoidance with visited set
  const available = ['claude', 'copilot', 'cursor']
  const visited = new Set(['claude'])
  const next1 = resolveFallbackVendor('claude', available, {}, visited)
  assert.equal(next1, 'copilot')

  visited.add('copilot')
  const next2 = resolveFallbackVendor('copilot', available, {}, visited)
  assert.equal(next2, 'cursor')

  visited.add('cursor')
  const next3 = resolveFallbackVendor('cursor', available, {}, visited)
  assert.equal(next3, null) // all visited, cycle prevented

  // SubscriptionAdapter: abort signal aborts before cascading
  let cascadeCalled = false
  const adapter = new SubscriptionAdapter({
    accountsFor: () => [],
    cascadingFallback: async function* () {
      cascadeCalled = true
      yield { type: 'delta', delta: 'fallback' }
    },
  })

  const controller = new AbortController()
  controller.abort() // pre-aborted

  const err = new Error('Quota exceeded')
  err.code = 'QUOTA'
  assert.ok(isSwitchableError(err))

  // When signal is aborted, cascadingFallback must NOT be triggered
  await assert.rejects(async () => {
    for await (const _ of adapter.stream({
      provider: 'claude',
      model: 'claude-3-5-sonnet',
      messages: [{ role: 'user', content: 'hi' }],
      signal: controller.signal,
    })) {}
  })
  assert.equal(cascadeCalled, false)
})

test('#364: client i18n keys for Health Matrix and plugin title exist in lib/client.js', () => {
  const clientSrc = fs.readFileSync(path.join(__dirname, '../lib/client.js'), 'utf8')
  
  // EN keys
  const expectedKeys = [
    'healthMatrix',
    'healthAccount',
    'healthScore',
    'healthLatency',
    'healthStatus',
    'healthQuota',
    'healthQuarantine',
    'healthWarmup',
    'healthActive',
    'healthIdle',
  ]

  for (const k of expectedKeys) {
    assert.ok(clientSrc.includes(`"${k}":`), `client.js missing key: ${k}`)
  }

  // plugins.item label localization
  assert.ok(clientSrc.includes("label: () => t('title') || 'Subscriptions'"))
})
