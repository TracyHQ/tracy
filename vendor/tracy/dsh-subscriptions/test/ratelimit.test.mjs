import { test } from "node:test"
import assert from "node:assert/strict"
import { parseHeaders, parseBody, quotaSnapshot, PROVIDER_BODY_FIELDS } from "../lib/ratelimit.js"

test("parseHeaders reads x-ratelimit headers", () => {
  const h = new Headers({ "x-ratelimit-remaining": "42", "x-ratelimit-limit": "100", "x-ratelimit-reset": String(Math.floor(Date.now()/1000)+60) })
  const out = parseHeaders(h)
  assert.equal(out.remaining, 42)
  assert.equal(out.limit, 100)
  assert.ok(out.resetAt > Date.now())
})

test("parseHeaders handles retry-after seconds", () => {
  const now = 1700000000000
  const h = { "retry-after": "120" }
  const out = parseHeaders(h, now)
  assert.equal(out.resetAt, now + 120*1000)
})

test("parseHeaders handles epoch reset", () => {
  const now = 1700000000000
  const epoch = Math.floor(now/1000)+3600
  const out = parseHeaders({ "x-ratelimit-reset": String(epoch) }, now)
  assert.equal(out.resetAt, epoch*1000)
})

test("parseHeaders returns null when no headers", () => {
  assert.equal(parseHeaders({}), null)
})

test("parseBody finds provider fields", () => {
  const json = { remaining: 10, limit: 100, reset_at: "2026-08-25T12:00:00Z" }
  const out = parseBody("codex", json)
  assert.equal(out.remaining, 10)
  assert.equal(out.limit, 100)
  assert.ok(out.resetAt)
})

test("quotaSnapshot merges header and body and computes usedPercent", () => {
  const h = { "x-ratelimit-remaining": "30" }
  const b = { limit: 100 }
  const snap = quotaSnapshot("codex", h, b, 1700000000000)
  assert.equal(snap.remaining, 30)
  assert.equal(snap.limit, 100)
  assert.equal(snap.usedPercent, 70)
  assert.equal(snap.measuredAt, 1700000000000)
})

test("quotaSnapshot ignores empty", () => {
  assert.equal(quotaSnapshot("codex", {}, null), null)
})

test("provider tables are extendable", () => {
  assert.ok(PROVIDER_BODY_FIELDS.codex.remaining.includes("remaining"))
  assert.ok(PROVIDER_BODY_FIELDS._common.remaining.includes("remaining"))
})
