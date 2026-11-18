import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// The model price table stops the quality model (and the vision proof) once validUntil passes.
// Fail CI one week before that, so someone renews quality-prices.json while it still works.
const WARNING_MS = 7 * 24 * 60 * 60 * 1000
const prices = JSON.parse(
  readFileSync(new URL('../src/opportunities-build/quality-prices.json', import.meta.url), 'utf8')
)

test('quality-prices.json is valid for at least 7 more days', () => {
  const expiresAt = Date.parse(prices.validUntil)
  assert.ok(Number.isFinite(expiresAt), 'validUntil must be an ISO timestamp')
  const left = expiresAt - Date.now()
  assert.ok(
    left > WARNING_MS,
    `quality-prices.json expires ${prices.validUntil}: re-verify ${prices.source} (keep peak prices), then renew verifiedAt and validUntil. Until renewed, QUALITY_PRICE_UNKNOWN disables logo and menu photo reading.`
  )
})
