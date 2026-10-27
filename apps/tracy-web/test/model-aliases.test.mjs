import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeModelAliases, normalizeProviderAlias, saveModelAliases } from '../src/lib/llm-store.js'
import { aliasModelCatalog, tracyModelIdentity } from '../src/lib/model-providers.js'

test('aliases trim names and an empty value restores the original name', () => {
  assert.deepEqual(normalizeModelAliases({ 'deepseek-flash': '  Tracy Fast  ', other: '  ' }), {
    'deepseek-flash': 'Tracy Fast'
  })
  for (const value of [null, [], 'name', { model: 1 }, { model: 'a\nb' }, { model: 'x'.repeat(121) }])
    assert.equal(normalizeModelAliases(value), null)
})

test('deployment aliases change names only, leaving personal account models untouched', () => {
  const catalog = {
    groups: [
      {
        id: 'deepseek-official',
        name: 'DeepSeek',
        models: [
          { id: 'deepseek-flash', name: 'Long name', inputModalities: ['image'] },
          { id: 'other', name: 'Original' }
        ]
      },
      { id: 'openrouter', models: [{ id: 'vendor/model', name: 'Vendor model' }] },
      { id: 'seat-plan-codex--account', models: [{ id: 'deepseek-flash', name: 'Personal model' }] }
    ]
  }
  const result = aliasModelCatalog(catalog, [
    {
      id: 'deepseek',
      presetId: 'deepseek',
      providerAlias: 'Tracy AI',
      modelAliases: { 'deepseek-flash': 'Tracy Fast', other: '' }
    },
    { id: 'openrouter', presetId: 'openrouter', modelAliases: { 'vendor/model': 'Tracy Pro' } },
    { id: 'seat-plan-codex--account', presetId: null, modelAliases: { 'deepseek-flash': 'Wrong' } }
  ])
  assert.equal(result.groups[0].name, 'Tracy AI')
  assert.equal(result.groups[0].models[0].name, 'Tracy Fast')
  assert.equal(result.groups[0].models[0].id, 'deepseek-flash')
  assert.deepEqual(result.groups[0].models[0].inputModalities, ['image'])
  assert.equal(result.groups[0].models[1].name, 'Original')
  assert.equal(result.groups[1].models[0].name, 'Tracy Pro')
  assert.equal(result.groups[2].models[0].name, 'Personal model')
  assert.equal(catalog.groups[0].models[0].name, 'Long name')
})

test('alias writes do not replace the fetched model list or credentials', async () => {
  let query
  const pool = {
    query: async (sql, values) => {
      query = { sql, values }
      return { rows: [{ id: 'deepseek' }] }
    }
  }
  assert.equal(await saveModelAliases(pool, 'deepseek', { model: 'Friendly' }, 'admin'), true)
  assert.match(query.sql, /model_aliases = \$2/)
  assert.doesNotMatch(query.sql, /api_key_cipher|models =/)
  assert.deepEqual(query.values, ['deepseek', '{"model":"Friendly"}', 'admin', null])
})

test('provider aliases validate and blank values restore vendor names', () => {
  assert.equal(normalizeProviderAlias('  Tracy AI  '), 'Tracy AI')
  assert.equal(normalizeProviderAlias('  '), '')
  for (const value of [null, 1, 'x'.repeat(121), 'bad\nname'])
    assert.equal(normalizeProviderAlias(value), null)
})

test('Tracy prompt identity follows current aliases and never labels a personal route', () => {
  const providers = [
    {
      id: 'deepseek',
      presetId: 'deepseek',
      name: 'DeepSeek',
      providerAlias: 'Tracy AI',
      modelAliases: { flash: 'Friendly' },
      models: [{ id: 'flash', name: 'Original' }]
    }
  ]
  assert.deepEqual(tracyModelIdentity(providers, { provider: 'deepseek-official', model: 'flash' }), {
    providerName: 'Tracy AI',
    modelName: 'Friendly'
  })
  providers[0].modelAliases = {}
  providers[0].providerAlias = ''
  assert.deepEqual(tracyModelIdentity(providers, { provider: 'deepseek-official', model: 'flash' }), {
    providerName: 'DeepSeek',
    modelName: 'Original'
  })
  assert.equal(tracyModelIdentity(providers, { provider: 'seat-plan-codex--account', model: 'flash' }), null)
})
