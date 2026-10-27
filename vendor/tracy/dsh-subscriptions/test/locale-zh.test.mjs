import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('client bundle contains both en and zh locales with matching key structure', () => {
  const src = fs.readFileSync('lib/client.js', 'utf8')
  
  // Extract en and zh definitions
  const enMatch = src.match(/const en = (\{[\s\S]*?\});/)
  const zhMatch = src.match(/const zh = (\{[\s\S]*?\});/)
  assert.ok(enMatch, 'const en must be defined')
  assert.ok(zhMatch, 'const zh must be defined')
  
  const en = JSON.parse(enMatch[1])
  const zh = JSON.parse(zhMatch[1])
  
  const enKeys = Object.keys(en).sort()
  const zhKeys = Object.keys(zh).sort()
  
  assert.deepEqual(zhKeys, enKeys, 'zh locale dictionary keys must match en dictionary exactly')
  assert.ok(enKeys.length > 100, 'dictionary should have over 100 translation keys')
  
  // Ensure no Cyrillic in en dictionary
  for (const [k, v] of Object.entries(en)) {
    assert.ok(!/[\u0400-\u04FF]/.test(v), `en[${k}] should not contain Cyrillic characters`)
  }
})

test('INSTRUCTIONS has stepsEn and stepsZh for all configured providers', () => {
  const src = fs.readFileSync('lib/client.js', 'utf8')
  assert.ok(!src.includes('stepsRu:'), 'INSTRUCTIONS should not contain legacy stepsRu')
  assert.ok(src.includes('stepsEn:'), 'INSTRUCTIONS must contain stepsEn')
  assert.ok(src.includes('stepsZh:'), 'INSTRUCTIONS must contain stepsZh')
})
