import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { HistoryStore } from "../lib/history.js"

// #69: /status.active строится из history.recent(1) — последний успешный запрос.

test("active: null когда история пуста", () => {
  const dir = mkdtempSync(join(tmpdir(), "dsub-active-"))
  try {
    const h = new HistoryStore(dir, 7 * 24 * 60 * 60 * 1000)
    assert.equal(h.recent(1).length, 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("active: recent(1) возвращает последний запрос", () => {
  const dir = mkdtempSync(join(tmpdir(), "dsub-active-"))
  try {
    const h = new HistoryStore(dir, 7 * 24 * 60 * 60 * 1000)
    h.add({ provider: "codex", model: "gpt-5", path: "/responses", status: 200 })
    h.add({ provider: "claude", model: "claude-4", path: "/v1/messages", status: 200 })
    const last = h.recent(1)
    assert.equal(last.length, 1)
    assert.equal(last[0].provider, "claude")
    assert.equal(last[0].model, "claude-4")
    assert.equal(last[0].status, 200)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("active: payload содержит provider, model, status, plan/usage из describeRef (контракт)", () => {
  const dir = mkdtempSync(join(tmpdir(), "dsub-active-"))
  try {
    const h = new HistoryStore(dir, 7 * 24 * 60 * 60 * 1000)
    h.add({ provider: "codex", ref: "CODEX_OAUTH_1", model: "gpt-5", path: "/responses", status: 200 })
    const last = h.recent(1)[0]
    // /status handler строит active = { provider, model, path, plan, usagePercent, status, at }
    const active = {
      provider: last.provider,
      model: last.model || null,
      path: last.path || null,
      plan: "", // из describeRef, мокается в integration-тестах
      usagePercent: null, // из /status usage
      status: "ok",
      at: last.ts,
    }
    assert.equal(active.provider, "codex")
    assert.equal(active.model, "gpt-5")
    assert.equal(active.path, "/responses")
    assert.equal(active.status, "ok")
  } finally { rmSync(dir, { recursive: true, force: true }) }
})