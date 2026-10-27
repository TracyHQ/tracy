import test from 'node:test'
import assert from 'node:assert/strict'

test('lib/index.js loads cleanly and exports valid plugin metadata', async () => {
  const mod = await import('../lib/index.js')
  assert.equal(typeof mod.apply, 'function', 'apply should be a function')
  assert.equal(typeof mod.Config, 'function', 'Config should be a schema function')
  assert.equal(mod.name, '@goodandready/dsh-subscriptions')
  // Verify Config schema instantiates without throwing TypeError
  const defaultCfg = mod.plainConfig(mod.Config({}))
  assert.equal(defaultCfg.composerQuota, 'off')
})
