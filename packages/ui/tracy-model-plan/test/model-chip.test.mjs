/**
 * How the chip at the head of a chat names a subscription route's vendor (`src/client/model-chip.ts`
 * `routeVendor`), from the account status the page keeps (`account-status.ts`).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { routeVendor } from '../src/client/model-chip.ts'

test("a subscription route names its vendor as the broker spells it, else the vendor's id", () => {
  const status = {
    enabled: true,
    providers: [
      { id: 'claude', name: 'Claude' },
      { id: 'grok', name: 'Grok' }
    ],
    connections: [
      { connectionId: 'c1', provider: 'copilot', name: 'GitHub Copilot', account: 'me', connected: true }
    ]
  }
  assert.equal(routeVendor('seat-plan-grok', status), 'Grok')
  assert.equal(routeVendor('seat-plan-claude', status), 'Claude')
  // No longer offered but still connected: the connection carries the name.
  assert.equal(routeVendor('seat-plan-copilot', status), 'GitHub Copilot')
  assert.equal(routeVendor('seat-plan-antigravity', status), 'antigravity')
  assert.equal(routeVendor('seat-plan-codex', undefined), 'codex', 'the status not read yet: the id')
})
