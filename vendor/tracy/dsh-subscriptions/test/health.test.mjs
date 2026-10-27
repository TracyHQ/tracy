function fakeCredentials() {
  const map = new Map()
  return {
    async set(k, v) { map.set(k, v) },
    async get(k) { return map.get(k) || null },
    async unset(k) { map.delete(k) },
  }
}
import { createAccountStore } from "../lib/accounts.js"

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  emptyHealth, recordSwitch, recordExhaust, recordBroken,
  computeHealthScore, healthBadge,
} from "../lib/health.js"
import { pickAccount } from "../lib/rotate.js"

test("health score starts at 100", () => {
  assert.equal(computeHealthScore(emptyHealth()), 100)
  assert.equal(computeHealthScore(null), 100)
})

test("penalties: switch 5, exhaust 10, broken 15", () => {
  let h = emptyHealth()
  h = recordSwitch(h)
  assert.equal(computeHealthScore(h), 95)
  h = recordExhaust(h)
  assert.equal(computeHealthScore(h), 85)
  h = recordBroken(h)
  assert.equal(computeHealthScore(h), 70)
})

test("score never goes below 0", () => {
  let h = emptyHealth()
  for (let i = 0; i < 20; i++) h = recordBroken(h)
  assert.equal(computeHealthScore(h), 0)
})

test("badge reflects score", () => {
  assert.equal(healthBadge(null), "unknown")
  assert.equal(healthBadge(90), "healthy")
  assert.equal(healthBadge(60), "tired")
  assert.equal(healthBadge(10), "broken")
})

test("pickAccount prefers higher healthScore within healthy tier", () => {
  const now = 1000000
  const accounts = [
    { ref: "A", hasToken: true, quota: { remaining: 50, limit: 100, resetAt: now + 60000 }, cooldownUntil: 0, healthScore: 100 },
    { ref: "B", hasToken: true, quota: { remaining: 50, limit: 100, resetAt: now + 60000 }, cooldownUntil: 0, healthScore: 60 },
  ]
  assert.equal(pickAccount(accounts, now, { switchAtRemaining: 0.01 }).ref, "A")
})

test("adapter lifecycle hooks update request counts and health score", async () => {
  const store = createAccountStore({ credentials: fakeCredentials(), getConfig: () => ({}) })
  const ref = "CODEX_OAUTH_1"
  store.rememberRequest(ref)
  assert.equal(store.getRequestCount(ref), 1)

  store.recordExhaust(ref)
  const h1 = store.getHealth(ref)
  assert.equal(h1.exhaustions, 1)

  store.recordSuccess(ref)
  assert.equal(store.getHealth(ref), null)
})
