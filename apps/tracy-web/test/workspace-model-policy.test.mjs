import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allowedModelProviders, filterModelCatalog, forwardModelHttp } from '../src/workspace/model-policy.js'
import { modelWire } from '../src/lib/model-wire.js'
import { sealSecret } from '../src/lib/secret-box.js'

const providers = [
  { id: 'deepseek', presetId: 'deepseek', enabled: true, configured: true },
  { id: 'openrouter', presetId: 'openrouter', enabled: false, configured: true }
]
const catalog = {
  default: { provider: 'deepseek-official', model: 'deepseek-flash' },
  groups: [
    { id: 'deepseek-official', models: [{ id: 'deepseek-flash' }] },
    { id: 'openrouter', models: [{ id: 'other' }] }
  ],
  routableProviders: ['deepseek-official', 'openrouter'],
  failures: [{ id: 'openrouter' }]
}

test('disabled, unreadable and unconfigured operator accounts are excluded', () => {
  assert.deepEqual([...allowedModelProviders(providers)], ['deepseek-official'])
  assert.equal(allowedModelProviders([{ ...providers[0], keyUnreadable: true }]).size, 0)
  assert.equal(allowedModelProviders([{ ...providers[0], configured: false }]).size, 0)
  assert.equal(allowedModelProviders([{ ...providers[0], id: 'custom' }]).size, 0)
  assert.deepEqual([...allowedModelProviders([{ ...providers[1], enabled: true }])], ['openrouter'])
})

test('catalog removes disabled provider from choices and preserves the actual host default', () => {
  const filtered = filterModelCatalog(catalog, allowedModelProviders(providers))
  assert.deepEqual(
    filtered.groups.map((g) => g.id),
    ['deepseek-official']
  )
  assert.deepEqual(filtered.routableProviders, ['deepseek-official'])
  assert.deepEqual(filtered.failures, [])
  assert.deepEqual(filterModelCatalog(catalog, new Set()).default, catalog.default)
})

test('proxy reads current ops state and rejects stale picks before reaching dsh', async (t) => {
  const secret = 'model-policy-test-secret'
  const cipher = await sealSecret('fixture-key', secret)
  let enabled = false
  let orAliases = {}
  const pool = {
    query: async () => ({
      rows: ['deepseek', 'openrouter'].map((id) => ({
        id,
        preset_id: id,
        enabled: id === 'deepseek' || enabled,
        name: id,
        api_key_cipher: cipher,
        updated_at: new Date(),
        models: id === 'openrouter' ? [{ id: 'other', name: 'Original other' }] : [],
        model_aliases: id === 'deepseek' ? { 'deepseek-flash': 'Tracy Fast' } : orAliases
      }))
    })
  }
  let calls = 0
  let selected
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (url.pathname.endsWith('/selectModel')) {
      selected = JSON.parse(await new Response(init.body).text()).payload.args.request
      return Response.json({ result: { ok: true, value: { selected } } })
    }
    calls++
    return Response.json({
      type: 'server-response',
      rpcId: 'test',
      result: { ok: true, value: structuredClone(catalog) }
    })
  })
  const options = { mount: '/site', viewerHost: 'tracy.test:8080' }
  const deps = { pool, config: { sessionSecret: secret } }
  const wire = modelWire(secret)
  const call = (method, payload = { args: {} }) => {
    const path = `/site/api/session/${method}`
    return forwardModelHttp(
      new Request(`http://tracy.test:8080${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: 'test', method: `session/${method}`, payload })
      }),
      new URL(`http://dsh${path}`),
      options,
      deps
    )
  }
  const first = await (await call('modelCatalog')).json()
  assert.deepEqual(first.result.value.routableProviders, [wire.providerId('deepseek-official')])
  assert.equal(first.result.value.groups[0].models[0].name, 'Tracy Fast')
  assert.equal(first.result.value.groups[0].models[0].id, wire.modelId('deepseek-official', 'deepseek-flash'))
  const denied = await (
    await call('selectModel', {
      args: {
        request: {
          sessionId: 'session-test',
          provider: 'openrouter',
          model: 'other'
        }
      }
    })
  ).json()
  assert.equal(denied.result.error.code, 'session/model-unavailable')
  assert.equal(calls, 1)
  const publicSelection = {
    sessionId: 'session-test',
    provider: wire.providerId('deepseek-official'),
    model: wire.modelId('deepseek-official', 'deepseek-flash')
  }
  const accepted = await (await call('selectModel', { args: { request: publicSelection } })).json()
  assert.deepEqual(selected, { ...publicSelection, provider: 'deepseek-official', model: 'deepseek-flash' })
  assert.equal(accepted.result.value.selected.model, publicSelection.model)
  const bad = await (
    await call('selectModel', {
      args: { request: { ...publicSelection, model: wire.modelId('openrouter', 'other') } }
    })
  ).json()
  assert.equal(bad.result.ok, false)
  const labels = await (
    await call('modelLabels', {
      args: {
        request: {
          provider: wire.providerId('openrouter'),
          model: wire.modelId('openrouter', 'other')
        }
      }
    })
  ).json()
  assert.deepEqual(labels.result.value, { providerName: 'openrouter', modelName: 'Original other' })
  const rawLabels = await (
    await call('modelLabels', { args: { request: { provider: 'openrouter', model: 'other' } } })
  ).json()
  assert.equal(rawLabels.result.value, null)
  // Enabling a provider for the backend does not expose its catalog until the operator aliases a model.
  enabled = true
  const second = await (await call('modelCatalog')).json()
  assert.deepEqual(second.result.value.routableProviders, [wire.providerId('deepseek-official')])
  // Once the operator approves one model with an alias, only that model appears under the route.
  orAliases = { other: 'Tracy Pro' }
  const third = await (await call('modelCatalog')).json()
  assert.deepEqual(
    third.result.value.routableProviders,
    ['deepseek-official', 'openrouter'].map(wire.providerId)
  )
  const orGroup = third.result.value.groups.find((g) => g.id === wire.providerId('openrouter'))
  assert.deepEqual(
    orGroup.models.map((m) => m.name),
    ['Tracy Pro']
  )
  assert.equal(orGroup.models[0].id, wire.modelId('openrouter', 'other'))
  // The approved model can now be selected through its wire id.
  const okOther = await (
    await call('selectModel', {
      args: {
        request: {
          sessionId: 'session-test',
          provider: wire.providerId('openrouter'),
          model: wire.modelId('openrouter', 'other')
        }
      }
    })
  ).json()
  assert.deepEqual(selected, { sessionId: 'session-test', provider: 'openrouter', model: 'other' })
  assert.equal(okOther.result.value.selected.model, wire.modelId('openrouter', 'other'))
})
