import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Config, plainConfig } from '../lib/config-schema.js'
import { uiOptions, vendorAllowed } from '../lib/ui-options.js'

const resolve = (raw) => plainConfig(Config(raw))

test('ui options default to the upstream surfaces: Plugins card, header pill, slash commands, every vendor', () => {
  assert.deepEqual(uiOptions(resolve({})), {
    cardPlacement: 'plugins',
    headerPill: true,
    slashCommands: true,
    allowedVendors: [],
  })
})

test('ui options carry an embedding host choice through the config schema', () => {
  const ui = uiOptions(resolve({
    cardPlacement: 'settings',
    headerPill: false,
    slashCommands: false,
    allowedVendors: ['claude', 'codex'],
  }))
  assert.deepEqual(ui, {
    cardPlacement: 'settings',
    headerPill: false,
    slashCommands: false,
    allowedVendors: ['claude', 'codex'],
  })
})

test('an unknown card placement falls back to the Plugins page', () => {
  assert.equal(uiOptions({ cardPlacement: 'sidebar' }).cardPlacement, 'plugins')
  assert.equal(uiOptions({ cardPlacement: 'both' }).cardPlacement, 'both')
})

test("cardPlacement 'none' is kept through the schema: a host that draws its own surface turns the card off", () => {
  assert.equal(uiOptions(resolve({ cardPlacement: 'none' })).cardPlacement, 'none')
})

test('allowedVendors is trimmed, lower-cased and de-duplicated; junk entries are dropped', () => {
  assert.deepEqual(uiOptions({ allowedVendors: [' Claude ', 'claude', '', 42, null, 'CODEX'] }).allowedVendors, ['claude', 'codex'])
})

test('an empty allowedVendors list allows every vendor; a non-empty one allows only its members', () => {
  assert.equal(vendorAllowed({ allowedVendors: [] }, 'grok'), true)
  assert.equal(vendorAllowed({}, 'grok'), true)
  assert.equal(vendorAllowed({ allowedVendors: ['claude'] }, 'claude'), true)
  assert.equal(vendorAllowed({ allowedVendors: ['claude'] }, 'grok'), false)
})
