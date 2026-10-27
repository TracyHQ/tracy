import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// #65: request and cost history. Stored in
// ~/.dsh/storages/dsh-subscriptions/history.json (JSON array, newest first).
// All IO is best-effort: a write failure must never crash the harness.

export function resolveHistoryDir(customDir) {
  if (customDir) return customDir
  if (process.env.DSH_HISTORY_DIR) return process.env.DSH_HISTORY_DIR
  if (process.env.DSH_STORAGE_DIR) return process.env.DSH_STORAGE_DIR
  if (process.env.DSH_HOME) return join(process.env.DSH_HOME, 'storages', 'dsh-subscriptions')
  return join(homedir(), '.dsh', 'storages', 'dsh-subscriptions')
}

export class HistoryStore {
  constructor(dir = resolveHistoryDir(), ttlMs = 7 * 24 * 60 * 60 * 1000, debounceMs = 0, maxEntries = 1000) {
    this.dir = resolveHistoryDir(dir)
    this.ttlMs = ttlMs
    this.debounceMs = debounceMs
    this.maxEntries = maxEntries
    this.path = join(this.dir, 'history.json')
    this.rows = []
    this._persistTimer = null
    this._load()

    if (typeof process !== 'undefined' && typeof process.on === 'function') {
      this._exitHandler = () => this.flush()
      process.on('beforeExit', this._exitHandler)
    }
  }

  _load() {
    try {
      mkdirSync(this.dir, { recursive: true })
    } catch { /* best-effort */ }
    try {
      const raw = JSON.parse(readFileSync(this.path, 'utf8'))
      if (Array.isArray(raw)) this.rows = raw
    } catch { /* absent/corrupt history is normal */ }
    this._prune()
  }

  _prune() {
    const cutoff = Date.now() - this.ttlMs
    const before = this.rows.length
    this.rows = this.rows.filter((r) => r && r.ts && r.ts >= cutoff)
    if (this.rows.length > this.maxEntries) {
      this.rows = this.rows.slice(0, this.maxEntries)
    }
    if (this.rows.length !== before) this._persist()
  }

  _persist() {
    if (this.debounceMs > 0) {
      if (this._persistTimer) return
      this._persistTimer = setTimeout(() => {
        this._persistTimer = null
        this.flush()
      }, this.debounceMs)
      if (typeof this._persistTimer.unref === 'function') this._persistTimer.unref()
      return
    }
    this.flush()
  }

  /** Write pending updates to disk immediately. */
  flush() {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer)
      this._persistTimer = null
    }
    try {
      mkdirSync(this.dir, { recursive: true })
      writeFileSync(this.path, JSON.stringify(this.rows))
    } catch { /* best-effort */ }
  }

  /** Add one entry. Returns the history length. */
  add(entry) {
    if (!entry || typeof entry !== 'object') return this.rows.length
    this.rows.unshift({ ts: Date.now(), ...entry })
    if (this.rows.length > this.maxEntries) {
      this.rows = this.rows.slice(0, this.maxEntries)
    }
    this._prune()
    this._persist()
    return this.rows.length
  }

  /** Last N entries (newest first). */
  dispose() {
    this.flush()
    if (this._persistTimer) {
      clearTimeout(this._persistTimer)
      this._persistTimer = null
    }
    if (this._exitHandler && typeof process !== "undefined" && typeof process.removeListener === "function") {
      process.removeListener("beforeExit", this._exitHandler)
      this._exitHandler = null
    }
    this.rows = []
  }

  recent(n) {
    return this.rows.slice(0, n)
  }

  all() {
    return this.rows
  }

  size() {
    return this.rows.length
  }

  /** Summarize session and 24-hour telemetry for UI stat cards. */
  accountTelemetry(ref) {
    if (!ref) return null
    let count = 0
    let ttftSum = 0
    let ttftCount = 0
    let lastTtft = null
    let tpsSum = 0
    let tpsCount = 0
    let lastTps = null
    let totalOutputTokens = 0
    let latencySum = 0
    let lastLatency = 0

    for (const r of this.rows) {
      if (r.ref !== ref) continue
      count++
      if (typeof r.ms === "number" && r.ms > 0) {
        latencySum += r.ms
        if (!lastLatency) lastLatency = r.ms
      }
      if (typeof r.ttftMs === "number" && r.ttftMs >= 0) {
        ttftSum += r.ttftMs
        ttftCount++
        if (lastTtft === null) lastTtft = r.ttftMs
      }
      if (typeof r.tps === "number" && r.tps > 0) {
        tpsSum += r.tps
        tpsCount++
        if (lastTps === null) lastTps = r.tps
      }
      if (typeof r.outputTokens === "number" && r.outputTokens > 0) {
        totalOutputTokens += r.outputTokens
      }
    }
    if (count === 0) return null
    return {
      totalRequests: count,
      avgLatencyMs: count > 0 ? Math.round(latencySum / count) : 0,
      lastLatencyMs: lastLatency,
      avgTtftMs: ttftCount > 0 ? Math.round(ttftSum / ttftCount) : null,
      lastTtftMs: lastTtft,
      avgTps: tpsCount > 0 ? Math.round((tpsSum / tpsCount) * 10) / 10 : null,
      lastTps: lastTps,
      totalOutputTokens,
    }
  }

  accountsTelemetry() {
    const map = {}
    for (const r of this.rows) {
      if (!r.ref) continue
      if (!map[r.ref]) {
        map[r.ref] = {
          count: 0,
          latencySum: 0,
          lastLatency: 0,
          ttftSum: 0,
          ttftCount: 0,
          lastTtft: null,
          tpsSum: 0,
          tpsCount: 0,
          lastTps: null,
          totalOutputTokens: 0,
        }
      }
      const st = map[r.ref]
      st.count++
      if (typeof r.ms === "number" && r.ms > 0) {
        st.latencySum += r.ms
        if (!st.lastLatency) st.lastLatency = r.ms
      }
      if (typeof r.ttftMs === "number" && r.ttftMs >= 0) {
        st.ttftSum += r.ttftMs
        st.ttftCount++
        if (st.lastTtft === null) st.lastTtft = r.ttftMs
      }
      if (typeof r.tps === "number" && r.tps > 0) {
        st.tpsSum += r.tps
        st.tpsCount++
        if (st.lastTps === null) st.lastTps = r.tps
      }
      if (typeof r.outputTokens === "number" && r.outputTokens > 0) {
        st.totalOutputTokens += r.outputTokens
      }
    }
    const out = {}
    for (const [ref, st] of Object.entries(map)) {
      out[ref] = {
        totalRequests: st.count,
        avgLatencyMs: st.count > 0 ? Math.round(st.latencySum / st.count) : 0,
        lastLatencyMs: st.lastLatency,
        avgTtftMs: st.ttftCount > 0 ? Math.round(st.ttftSum / st.ttftCount) : null,
        lastTtftMs: st.lastTtft,
        avgTps: st.tpsCount > 0 ? Math.round((st.tpsSum / st.tpsCount) * 10) / 10 : null,
        lastTps: st.lastTps,
        totalOutputTokens: st.totalOutputTokens,
      }
    }
    return out
  }

  /** Summarize session and 24-hour telemetry for UI stat cards. */
  telemetrySummary() {
    const total = this.rows.length
    if (total === 0) {
      return {
        totalRequests: 0,
        requests24h: 0,
        successRequests: 0,
        errorRequests: 0,
        successRate: 100,
        avgLatencyMs: 0,
        lastLatencyMs: 0,
        lastRequestAt: null,
        lastProvider: null,
        lastModel: null,
        accounts: {},
      }
    }
    let success = 0
    let error = 0
    let totalMs = 0
    let latencyCount = 0
    const now = Date.now()
    const last24h = now - 24 * 60 * 60 * 1000
    let count24h = 0
    let totalPromptTokens = 0
    let totalCompletionTokens = 0
    let totalCacheReadTokens = 0

    for (const r of this.rows) {
      if (r.ts >= last24h) count24h++
      const st = Number(r.status || 0)
      if (st >= 200 && st < 400) success++
      else if (st >= 400) error++
      if (typeof r.ms === 'number' && r.ms > 0) {
        totalMs += r.ms
        latencyCount++
      }
      if (typeof r.inputTokens === 'number') totalPromptTokens += r.inputTokens
      if (typeof r.outputTokens === 'number') totalCompletionTokens += r.outputTokens
      if (typeof r.cacheReadTokens === 'number') totalCacheReadTokens += r.cacheReadTokens
    }

    const first = this.rows[0] // newest first
    return {
      totalRequests: total,
      requests24h: count24h,
      successRequests: success,
      errorRequests: error,
      successRate: total > 0 ? Math.round((success / total) * 100) : 100,
      avgLatencyMs: latencyCount > 0 ? Math.round(totalMs / latencyCount) : 0,
      lastLatencyMs: (first && typeof first.ms === 'number') ? first.ms : 0,
      lastRequestAt: (first && first.ts) || null,
      lastProvider: (first && first.provider) || null,
      lastModel: (first && first.model) || null,
      totalPromptTokens,
      totalCompletionTokens,
      totalCacheReadTokens,
      cacheHitPercent: totalPromptTokens > 0
        ? Math.round((totalCacheReadTokens / totalPromptTokens) * 1000) / 10
        : 0,
      accounts: this.accountsTelemetry(),
    }
  }
}
