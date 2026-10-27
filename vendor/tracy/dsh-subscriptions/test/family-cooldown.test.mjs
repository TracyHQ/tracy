import { test } from 'node:test'
import assert from 'node:assert/strict'
import { modelFamily, pickAccount, markCooldown, cooldownBlocks } from '../lib/rotate.js'

test('#87: family classification per provider', () => {
  assert.equal(modelFamily('claude', 'claude-sonnet-4-5-thinking'), 'reasoning')
  assert.equal(modelFamily('claude', 'claude-haiku-4'), 'standard')
  assert.equal(modelFamily('grok', 'grok-4-fast-reasoning'), 'reasoning')
  assert.equal(modelFamily('grok', 'grok-4'), 'standard')
  assert.equal(modelFamily('codex', 'gpt-5.1-codex'), 'reasoning')
  assert.equal(modelFamily('antigravity', 'gemini-3-pro'), 'standard')
  assert.equal(modelFamily('codex', ''), 'reasoning')
})

test('#87: markCooldown scopes to family and merges', () => {
  const a = markCooldown({ ref: 'X' }, 1000, 60000, 'reasoning')
  assert.equal(a.cooldownFamilies.join(','), 'reasoning')
  const b = markCooldown(a, 2000, 60000, 'standard')
  assert.equal(b.cooldownFamilies.join(','), 'reasoning,standard')
  assert.ok(b.cooldownUntil >= 62000)
  const legacy = markCooldown({ ref: 'Y' }, 1000, 60000)
  assert.equal(legacy.cooldownFamilies, undefined)
})

test('#87: scoped cooldown blocks only its family', () => {
  const acc = { ref: 'X', hasToken: true, cooldownUntil: Date.now() + 60000, cooldownFamilies: ['reasoning'] }
  assert.equal(cooldownBlocks(acc, 'reasoning'), true)
  assert.equal(cooldownBlocks(acc, 'standard'), false)
  assert.equal(cooldownBlocks(acc), true)
  const legacy = { ref: 'Y', hasToken: true, cooldownUntil: Date.now() + 60000 }
  assert.equal(cooldownBlocks(legacy, 'standard'), true)
})

test('#87: reasoning cooldown does not starve standard models', () => {
  const now = Date.now()
  const a = markCooldown({ ref: 'A', hasToken: true }, now, 60000, 'reasoning')
  const b = { ref: 'B', hasToken: true }
  const pool = [a, b]
  const forReasoning = pickAccount(pool, now + 1000, { family: 'reasoning' })
  assert.equal(forReasoning && forReasoning.ref, 'B')
  const forStandard = pickAccount(pool, now + 1000, { family: 'standard' })
  assert.ok(forStandard && (forStandard.ref === 'A' || forStandard.ref === 'B'))
})
