import test from 'node:test'
import assert from 'node:assert/strict'
import { Config, plainConfig, publicConfig, restoreMaskedSecrets } from '../lib/config-schema.js'
import { vendorConfig } from '../lib/accounts.js'
import { createAdapterManager } from '../lib/adapter-manager.js'

test('#489: Config schema declares and preserves vendor-specific prefixes, originators, and models', () => {
  const rawInput = {
    antigravityModels: ['custom-gemini-model-1'],
    codexOriginator: 'custom_codex_originator',
    codexSystemPrefix: 'Custom Codex Prompt Prefix',
    codexModels: [{ id: 'gpt-custom-1', name: 'Custom GPT 1' }],
    claudeSystemPrefix: 'Custom Claude System Prefix',
    claudeModels: [{ id: 'claude-custom-1', name: 'Custom Claude 1' }],
    grokModels: [{ id: 'grok-custom-1', name: 'Custom Grok 1' }],
  }

  // Parse through Config
  const parsed = plainConfig(Config(plainConfig(rawInput)))

  assert.deepEqual(parsed.antigravityModels, ['custom-gemini-model-1'])
  assert.equal(parsed.codexOriginator, 'custom_codex_originator')
  assert.equal(parsed.codexSystemPrefix, 'Custom Codex Prompt Prefix')
  assert.deepEqual(parsed.codexModels, [{ id: 'gpt-custom-1', name: 'Custom GPT 1' }])
  assert.equal(parsed.claudeSystemPrefix, 'Custom Claude System Prefix')
  assert.deepEqual(parsed.claudeModels, [{ id: 'claude-custom-1', name: 'Custom Claude 1' }])
  assert.deepEqual(parsed.grokModels, [{ id: 'grok-custom-1', name: 'Custom Grok 1' }])

  // vendorConfig reads from parsed config
  const agVendor = vendorConfig('antigravity', parsed)
  assert.deepEqual(agVendor.models, ['custom-gemini-model-1'])

  const codexVendor = vendorConfig('codex', parsed)
  assert.equal(codexVendor.originator, 'custom_codex_originator')
  assert.equal(codexVendor.systemPrefix, 'Custom Codex Prompt Prefix')
  assert.deepEqual(codexVendor.models, [{ id: 'gpt-custom-1', name: 'Custom GPT 1' }])

  const claudeVendor = vendorConfig('claude', parsed)
  assert.equal(claudeVendor.systemPrefix, 'Custom Claude System Prefix')
  assert.deepEqual(claudeVendor.models, [{ id: 'claude-custom-1', name: 'Custom Claude 1' }])

  const grokVendor = vendorConfig('grok', parsed)
  assert.deepEqual(grokVendor.models, [{ id: 'grok-custom-1', name: 'Custom Grok 1' }])
})

test('#252 & #489: clientSecret is isolated from Config (stored in credentials) while customVendors and generic secrets are masked', () => {
  const schemaKeys = Object.keys(Config.dict || {})
  assert.ok(!schemaKeys.includes('antigravityClientSecret'), 'antigravityClientSecret must NOT exist in Config (#252)')
  assert.ok(!schemaKeys.includes('codexClientSecret'), 'codexClientSecret must NOT exist in Config (#252)')

  const customVendorConfig = {
    customVendors: [
      {
        id: 'mycustom',
        clientSecret: 'custom-secret-123',
        apiKey: 'api-key-456',
      }
    ]
  }

  const masked = publicConfig(customVendorConfig)
  assert.equal(masked.customVendors[0].clientSecret, '••••••')
  assert.equal(masked.customVendors[0].apiKey, '••••••')

  // UI saves back the masked values without change
  const restored = restoreMaskedSecrets(masked, customVendorConfig)
  assert.equal(restored.customVendors[0].clientSecret, 'custom-secret-123')
  assert.equal(restored.customVendors[0].apiKey, 'api-key-456')
})

test('#494: adapter manager tolerates missing or mock host APIs without crashing', () => {
  const store = {
    listAccounts: async () => [],
    loggedInProviders: async () => ['codex'],
    loadBlob: async () => ({}),
    ensureFresh: async () => ({}),
    rememberCooldown: () => {},
    rememberQuarantine: () => {},
    getQuarantine: () => null,
    probeWarmup: () => {},
    rememberQuota: () => {},
    getQuota: () => null,
    refreshUsage: async () => {},
    saveBlob: async () => {},
    rememberRequest: () => {},
    recordSuccess: () => {},
    recordSwitch: () => {},
  }

  // ctx with no llm at all
  const mgr = createAdapterManager({
    ctx: {},
    live: () => ({ slots: [{ provider: 'codex', ref: 'CODEX_1' }] }),
    store,
    logger: { info() {}, warn() {}, debug() {} },
  })

  // Calling syncAdapter should not throw when ctx.llm.registerAdapter is absent
  assert.doesNotThrow(() => {
    mgr.syncAdapter(['codex'])
  })
})
