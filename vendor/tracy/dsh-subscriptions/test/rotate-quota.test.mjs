import { test } from "node:test"
import assert from "node:assert/strict"
import { pickAccount } from "../lib/rotate.js"

test("skips account with remaining below threshold", () => {
  const now = 1000000
  const accounts = [
    { ref: "A", hasToken: true, quota: { remaining: 2, limit: 100, resetAt: now+60000 }, cooldownUntil: 0 },
    { ref: "B", hasToken: true, quota: { remaining: 50, limit: 100, resetAt: now+60000 }, cooldownUntil: 0 },
  ]
  const pick = pickAccount(accounts, now, { switchAtRemaining: 5 })
  assert.equal(pick.ref, "B")
})

test("reset passed makes account eligible again", () => {
  const now = 1000000
  const accounts = [
    { ref: "A", hasToken: true, quota: { remaining: 1, limit: 100, resetAt: now-1000 }, cooldownUntil: 0 },
    { ref: "B", hasToken: true, quota: { remaining: 50, limit: 100, resetAt: now+60000 }, cooldownUntil: 0 },
  ]
  const pick = pickAccount(accounts, now, { switchAtRemaining: 5 })
  assert.equal(pick.ref, "A")
})

test("prefers known good over unknown, unknown over exhausted", () => {
  const now = 1000
  const good = { ref: "GOOD", hasToken: true, quota: { remaining: 50, limit: 100 }, cooldownUntil: 0 }
  const unknown = { ref: "UNK", hasToken: true, quota: null, cooldownUntil: 0 }
  const bad = { ref: "BAD", hasToken: true, quota: { remaining: 1, limit: 100, resetAt: now+60000 }, cooldownUntil: 0 }
  // good first even if order unknown first
  assert.equal(pickAccount([unknown, good, bad], now, { switchAtRemaining: 5 }).ref, "GOOD")
  // if good removed, unknown beats bad
  assert.equal(pickAccount([bad, unknown], now, { switchAtRemaining: 5 }).ref, "UNK")
})

test("fraction threshold works", () => {
  const now = 1000
  const a = { ref: "A", hasToken: true, quota: { remaining: 5, limit: 100 }, cooldownUntil: 0 } // 5% remaining
  const b = { ref: "B", hasToken: true, quota: { remaining: 20, limit: 100 }, cooldownUntil: 0 } // 20%
  assert.equal(pickAccount([a,b], now, { switchAtRemaining: 0.1 }).ref, "B")
  assert.equal(pickAccount([a,b], now, { switchAtRemaining: 0.04 }).ref, "A")
})

test("when all below threshold, fallback to first exhausted", () => {
  const now = 1000
  const a = { ref: "A", hasToken: true, quota: { remaining: 1, limit: 100, resetAt: now+60000 }, cooldownUntil: 0 }
  const b = { ref: "B", hasToken: true, quota: { remaining: 2, limit: 100, resetAt: now+60000 }, cooldownUntil: 0 }
  const pick = pickAccount([a,b], now, { switchAtRemaining: 5 })
  assert.equal(pick.ref, "A")
})

test("cooldown skipped over soft exhausted account (#444)", () => {
  const now = 1000
  const cool = { ref: "C", hasToken: true, quota: { remaining: 50, limit: 100 }, cooldownUntil: now+60000 }
  const exhausted = { ref: "E", hasToken: true, quota: { remaining: 1, limit: 100, resetAt: now+60000 }, cooldownUntil: 0 }
  // #444: cooldown is hard-blocked, soft exhausted account with remaining quota is preferred
  assert.equal(pickAccount([cool, exhausted], now, { switchAtRemaining: 5 }).ref, "E")
  // without threshold, cooldown is tier 2, good is tier 0
  const good = { ref: "G", hasToken: true, quota: { remaining: 50, limit: 100 }, cooldownUntil: 0 }
  assert.equal(pickAccount([cool, good], now, { switchAtRemaining: 5 }).ref, "G")
})

test("threshold 0 disables", () => {
  const now = 1000
  const a = { ref: "A", hasToken: true, quota: { remaining: 1, limit: 100 }, cooldownUntil: 0 }
  const b = { ref: "B", hasToken: true, quota: { remaining: 50, limit: 100 }, cooldownUntil: 0 }
  assert.equal(pickAccount([a,b], now, { switchAtRemaining: 0 }).ref, "A")
})