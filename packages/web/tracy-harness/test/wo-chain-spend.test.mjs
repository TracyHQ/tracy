import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatUsd } from '../src/wo-chain-builds-api.ts'

test('unknown chain spend is not printed as a measured zero', () => {
  assert.equal(formatUsd(null), '—')
  assert.equal(formatUsd(Number.NaN), '—')
  assert.equal(formatUsd(0), '$0.00')
  assert.equal(formatUsd(0.0025), '$0.0025')
  assert.equal(formatUsd(1.25), '$1.25')
})
