import { test } from 'node:test'
import assert from 'node:assert/strict'
import { modelWire } from '../src/lib/model-wire.js'

const secret = 'test-deployment-secret'
test('public IDs are stable, route-specific and independent of display aliases', () => {
  const a = modelWire(secret),
    b = modelWire(secret)
  assert.equal(a.providerId('deepseek-official'), b.providerId('deepseek-official'))
  assert.equal(a.modelId('deepseek-official', 'model'), b.modelId('deepseek-official', 'model'))
  assert.notEqual(a.modelId('deepseek-official', 'model'), a.modelId('openrouter', 'model'))
  assert.notEqual(
    a.modelId('deepseek-official', 'model'),
    modelWire('other secret').modelId('deepseek-official', 'model')
  )
  assert.equal(a.providerId('seat-plan-codex--account'), 'seat-plan-codex--account')
})

test('catalog, defaults, replies, history and stream projections share public IDs', () => {
  const wire = modelWire(secret)
  const selection = { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'high' }
  const catalog = {
    default: selection,
    groups: [
      { id: selection.provider, name: 'Tracy AI', models: [{ id: selection.model, name: 'Fast' }] },
      { id: 'seat-plan-codex--account', name: 'Personal', models: [{ id: 'gpt-model', name: 'GPT' }] }
    ],
    routableProviders: [selection.provider],
    failures: []
  }
  const publicCatalog = wire.encode(catalog)
  const publicSelection = {
    ...selection,
    provider: publicCatalog.groups[0].id,
    model: publicCatalog.groups[0].models[0].id
  }
  assert.deepEqual(publicCatalog.default, publicSelection)
  assert.deepEqual(publicCatalog.groups[1], catalog.groups[1])
  const snapshot = {
    type: 'item',
    value: { values: { modelSelection: { lastUsed: selection, next: selection } } }
  }
  assert.deepEqual(wire.encode(snapshot).value.values.modelSelection.next, publicSelection)
  assert.deepEqual(wire.encode({ selected: selection }).selected, publicSelection)
  const event = { type: 'request/header', data: { header: { config: selection } } }
  assert.deepEqual(wire.encode(event).data.header.config, publicSelection)
  assert.equal(JSON.stringify(wire.encode({ catalog, snapshot, event })).includes('deepseek-flash'), false)
  assert.deepEqual(catalog.default, selection)
  assert.deepEqual(wire.encode({ text: 'deepseek-flash', name: 'Original fallback' }), {
    text: 'deepseek-flash',
    name: 'Original fallback'
  })
})
