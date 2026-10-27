import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as cursor from '../lib/vendors/cursor.js'

test('cursor providerInfo and defaults', () => {
  assert.equal(cursor.id, 'cursor')
  assert.equal(cursor.providerInfo().name, 'Cursor')
  const defs = cursor.defaults()
  assert.ok(defs.models.includes('composer-2'))
})

test('cursor listModels returns models with contextWindow', async () => {
  const models = await cursor.listModels(null, cursor.defaults())
  assert.ok(models.length >= 3)
  const composer = models.find((m) => m.id === 'composer-2')
  assert.equal(composer.contextWindow, 200000)
})

test('cursor usage parses request percentage', async () => {
  const fetchImpl = async () => ({
    ok: true,
    text: async () => JSON.stringify({ numRequests: 150, maxRequestUsage: 500, plan: 'Pro' }),
  })
  const snap = await cursor.usage({ accessToken: 'tok' }, {}, fetchImpl)
  assert.ok(snap)
  assert.equal(snap.usedPercent, 30)
  assert.equal(snap.plan, 'Pro')
})
