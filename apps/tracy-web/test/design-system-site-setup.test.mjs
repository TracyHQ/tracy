import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'
import { mountDesignSystem } from '../src/sites/design-system.js'

function mounted(site) {
  const app = new Hono()
  const calls = []
  mountDesignSystem(app, {
    requireGrant: async () => ({ email: 'owner@example.test', grant: { role: 'owner' } }),
    siteByKey: async () => site,
    toolsetRefusal: async () => null,
    runJob: async () => {
      calls.push('container')
      return { ok: true, output: JSON.stringify({ ok: true, slot: null }) }
    },
    store: { latest: async () => null },
    ds: {
      refero: async () => {
        calls.push('library')
        return []
      },
      templateKeyOf: () => null,
      contractFor: () => ({ reason: 'NO_TEMPLATE' }),
      versionKeyOf: () => ({ key: null, version: null })
    }
  })
  return { app, calls }
}

for (const platform of ['wordpress', 'joomla', 'emdash']) {
  test(`unbuilt ${platform}: read reports setup without accessing a container or library`, async () => {
    const { app, calls } = mounted({ platform, origin: 'fleet_born', attached: false, address: null })
    const res = await app.request('/api/sites/reserved.example.test/design-system')
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.reason, 'SITE_NOT_READY')
    assert.equal(body.platform, platform)
    assert.equal(body.canApply, false)
    assert.equal(body.supported, false)
    assert.equal(body.worn, null)
    assert.equal(body.last, null)
    assert.deepEqual(calls, [])
  })
}

test('a provisioned site still reads its container before handover finishes', async () => {
  const { app, calls } = mounted({
    platform: 'wordpress',
    origin: 'fleet_born',
    attached: false,
    address: 'https://built.example.test'
  })
  const body = await (await app.request('/api/sites/built.example.test/design-system')).json()
  assert.equal(body.reason, 'NO_TEMPLATE')
  assert.ok(calls.includes('container'))
})

test('an attached legacy site without an address still reads its container', async () => {
  const { app, calls } = mounted({
    platform: 'wordpress',
    origin: 'fleet_born',
    attached: true,
    address: null
  })
  const body = await (await app.request('/api/sites/legacy.example.test/design-system')).json()
  assert.notEqual(body.reason, 'SITE_NOT_READY')
  assert.ok(calls.includes('container'))
})

test('an imported site keeps its imported-site explanation', async () => {
  const { app, calls } = mounted({
    platform: 'wordpress',
    origin: 'migrated',
    attached: false,
    address: null
  })
  const body = await (await app.request('/api/sites/imported.example.test/design-system')).json()
  assert.equal(body.reason, 'SITE_IMPORTED')
  assert.ok(!calls.includes('container'))
})
