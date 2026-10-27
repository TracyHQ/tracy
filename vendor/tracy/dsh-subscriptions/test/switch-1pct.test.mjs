
import { test } from "node:test"
import assert from "node:assert/strict"
import { pickAccount } from "../lib/rotate.js"

test("1% threshold switches to next account", () => {
  const now = 1000000
  const accounts = [
    { ref: "A", hasToken: true, quota: { remaining: 1, limit: 100, resetAt: now + 60000 }, cooldownUntil: 0 },
    { ref: "B", hasToken: true, quota: { remaining: 50, limit: 100, resetAt: now + 60000 }, cooldownUntil: 0 },
  ]
  const pick = pickAccount(accounts, now, { switchAtRemaining: 0.01 })
  assert.equal(pick.ref, "B")
})

test("reset within 1min switches even if remaining is not below threshold", () => {
  const now = 1000000
  const accounts = [
    { ref: "A", hasToken: true, quota: { remaining: 3, limit: 100, resetAt: now + 30000 }, cooldownUntil: 0 },
    { ref: "B", hasToken: true, quota: { remaining: 50, limit: 100, resetAt: now + 60000 }, cooldownUntil: 0 },
  ]
  const pick = pickAccount(accounts, now, { switchAtRemaining: 0.01 })
  assert.equal(pick.ref, "B")
})

test("reset far, remaining above threshold -> eligible", () => {
  const now = 1000000
  const accounts = [
    { ref: "A", hasToken: true, quota: { remaining: 50, limit: 100, resetAt: now + 3600000 }, cooldownUntil: 0 },
  ]
  const pick = pickAccount(accounts, now, { switchAtRemaining: 0.01 })
  assert.equal(pick.ref, "A")
})

test("default threshold 0.01 works when opts not provided", () => {
  const now = 1000000
  const accounts = [
    { ref: "A", hasToken: true, quota: { remaining: 0, limit: 100, resetAt: now + 60000 }, cooldownUntil: 0 },
    { ref: "B", hasToken: true, quota: { remaining: 50, limit: 100, resetAt: now + 60000 }, cooldownUntil: 0 },
  ]
  const pick = pickAccount(accounts, now, {})
  assert.equal(pick.ref, "B")
})

test("reset just passed makes account eligible again", () => {
  const now = 1000000
  const accounts = [
    { ref: "A", hasToken: true, quota: { remaining: 1, limit: 100, resetAt: now - 1000 }, cooldownUntil: 0 },
    { ref: "B", hasToken: true, quota: { remaining: 50, limit: 100, resetAt: now + 60000 }, cooldownUntil: 0 },
  ]
  const pick = pickAccount(accounts, now, { switchAtRemaining: 0.01 })
  assert.equal(pick.ref, "A")
})
