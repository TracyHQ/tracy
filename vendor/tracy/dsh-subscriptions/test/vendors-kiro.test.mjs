import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as kiro from '../lib/vendors/kiro.js'

test('kiro providerInfo and defaults', () => {
  assert.equal(kiro.id, 'kiro')
  assert.equal(kiro.providerInfo().name, 'AWS Kiro')
  const defs = kiro.defaults()
  assert.ok(defs.models.includes('claude-sonnet-5'))
})

test('kiro listModels returns models with contextWindow', async () => {
  const models = await kiro.listModels()
  assert.ok(models.length >= 3)
  const sonnet = models.find((m) => m.id === 'claude-sonnet-5')
  assert.equal(sonnet.contextWindow, 1000000)
})

test('kiro usage parses used percentage and plan', async () => {
  const fetchImpl = async () => ({
    ok: true,
    text: async () => JSON.stringify({ usedPercent: 42, plan: 'Enterprise' }),
  })
  const snap = await kiro.usage({ accessToken: 'tok' }, {}, fetchImpl)
  assert.ok(snap)
  assert.equal(snap.usedPercent, 42)
  assert.equal(snap.plan, 'Enterprise')
})
