import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getVendor } from '../lib/vendors/index.js'

test('vendors without usage API return null or unknown rather than synthetic percentages (#454)', async () => {
  const dummy = { accessToken: 'dummy_token', apiKey: 'dummy_key', token: 'dummy_token' }

  // 1. Fully unknown vendors must return null
  for (const name of ['qwen', 'ernie', 'spark', 'jetbrains']) {
    const v = getVendor(name)
    const snap = await v.usage(dummy, {}, async () => {})
    assert.equal(snap, null, `${name} must not return synthetic percentage`)
  }

  // 2. Plan-only vendors must return usedPercent: null
  for (const [name, expectedPlan] of [
    ['perplexity', 'Perplexity Pro'],
    ['replit', 'Replit Core'],
    ['cody', 'Cody Pro'],
  ]) {
    const v = getVendor(name)
    const snap = await v.usage(dummy, {}, async () => {})
    assert.ok(snap, `${name} returns metadata`)
    assert.equal(snap.usedPercent, null, `${name} usedPercent must be null`)
    assert.equal(snap.plan, expectedPlan)
  }

  // 3. Copilot returns actual plan and usedPercent: null when upstream does not give used_percent
  const copilotVendor = getVendor('copilot')
  const fakeFetch = async () => ({
    ok: true,
    text: async () => JSON.stringify({ plan: { name: 'Business' } }),
  })
  const copilotSnap = await copilotVendor.usage(dummy, {}, fakeFetch)
  assert.ok(copilotSnap)
  assert.equal(copilotSnap.usedPercent, null, 'copilot usedPercent must not be synthetic 10%')
  assert.equal(copilotSnap.plan, 'Business')
})
