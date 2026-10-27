import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { HistoryStore } from "../lib/history.js"

function tmp() {
  return mkdtempSync(join(tmpdir(), "dsub-hist-"))
}

test("history add + recent order", () => {
  const dir = tmp()
  try {
    const h = new HistoryStore(dir, 7 * 24 * 60 * 60 * 1000)
    h.add({ provider: "codex", model: "gpt-5", path: "/responses", status: 200 })
    h.add({ provider: "claude", model: "claude-4", path: "/v1/messages", status: 200 })
    assert.equal(h.size(), 2)
    const r = h.recent(1)
    assert.equal(r.length, 1)
    assert.equal(r[0].provider, "claude") // newest first
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("history persists to disk", () => {
  const dir = tmp()
  try {
    const h = new HistoryStore(dir, 7 * 24 * 60 * 60 * 1000)
    h.add({ provider: "grok", model: "grok-4", path: "/responses", status: 200 })
    const h2 = new HistoryStore(dir, 7 * 24 * 60 * 60 * 1000)
    assert.equal(h2.size(), 1)
    assert.equal(h2.recent(1)[0].provider, "grok")
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("history prunes expired rows by ttl", () => {
  const dir = tmp()
  try {
    const h = new HistoryStore(dir, 1000) // 1s ttl
    h.add({ provider: "codex", path: "/responses", status: 200 })
    assert.equal(h.size(), 1)
    // simulate old row by writing directly then reloading with short ttl
    const path = join(dir, "history.json")
    const old = Date.now() - 5000
    const rows = [{ ts: old, provider: "codex", path: "/responses", status: 200 }]
    writeFileSync(path, JSON.stringify(rows))
    const h2 = new HistoryStore(dir, 1000)
    assert.equal(h2.size(), 0) // pruned
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("history debounceMs writes asynchronously or on flush", async () => {
  const dir = tmp()
  try {
    const h = new HistoryStore(dir, 7 * 24 * 60 * 60 * 1000, 200)
    h.add({ provider: "codex", model: "gpt-5", path: "/responses", status: 200 })
    assert.equal(h.size(), 1)
    h.flush()
    const raw = JSON.parse(readFileSync(join(dir, "history.json"), "utf8"))
    assert.equal(raw.length, 1)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("#377: history caps entries at maxEntries and evicts oldest", () => {
  const dir = tmp()
  try {
    const h = new HistoryStore(dir, 7 * 24 * 60 * 60 * 1000, 0, 3)
    h.add({ provider: "codex", id: 1 })
    h.add({ provider: "claude", id: 2 })
    h.add({ provider: "grok", id: 3 })
    h.add({ provider: "antigravity", id: 4 })
    assert.equal(h.size(), 3)
    const items = h.all()
    assert.equal(items[0].id, 4) // newest
    assert.equal(items[1].id, 3)
    assert.equal(items[2].id, 2)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("#377: history dispose clears state and flushes pending writes", () => {
  const dir = tmp()
  try {
    const h = new HistoryStore(dir, 7 * 24 * 60 * 60 * 1000, 500, 10)
    h.add({ provider: "codex", id: 1 })
    h.dispose()
    assert.equal(h.size(), 0)
    const raw = JSON.parse(readFileSync(join(dir, "history.json"), "utf8"))
    assert.equal(raw.length, 1)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("history accountsTelemetry and accountTelemetry computes ttft and tps averages", () => {
  const dir = tmp()
  try {
    const h = new HistoryStore(dir, 7 * 24 * 60 * 60 * 1000)
    h.add({ provider: "codex", ref: "CODEX_OAUTH_1", status: 200, ms: 500, ttftMs: 200, tps: 45.5, outputTokens: 90 })
    h.add({ provider: "codex", ref: "CODEX_OAUTH_1", status: 200, ms: 600, ttftMs: 300, tps: 35.5, outputTokens: 70 })
    h.add({ provider: "claude", ref: "CLAUDE_OAUTH_1", status: 200, ms: 800, ttftMs: 400, tps: 50.0, outputTokens: 100 })

    const telem = h.telemetrySummary()
    assert.ok(telem.accounts)
    assert.equal(telem.accounts["CODEX_OAUTH_1"].totalRequests, 2)
    assert.equal(telem.accounts["CODEX_OAUTH_1"].avgTtftMs, 250)
    assert.equal(telem.accounts["CODEX_OAUTH_1"].lastTtftMs, 300)
    assert.equal(telem.accounts["CODEX_OAUTH_1"].avgTps, 40.5)
    assert.equal(telem.accounts["CODEX_OAUTH_1"].lastTps, 35.5)
    assert.equal(telem.accounts["CODEX_OAUTH_1"].totalOutputTokens, 160)

    const single = h.accountTelemetry("CLAUDE_OAUTH_1")
    assert.equal(single.totalRequests, 1)
    assert.equal(single.avgTtftMs, 400)
    assert.equal(single.avgTps, 50.0)

    assert.equal(h.accountTelemetry("NON_EXISTENT"), null)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
