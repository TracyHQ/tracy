/**
 * The gate's two journals, read into memory and kept in step with every line the gate appends.
 * The gate is the only writer of both files, so the in-memory view is the file.
 *
 * `sites.jsonl` (plan §4.1, §4.4) — one transaction per (lane, buildId):
 *   intent { key: 'create:<lane>:<buildId>', op: 'create', door, lane, runId, buildId, label,
 *            siteKey (expected), email, pr, uncapped }
 *   intent { key: 'delete:<siteKey>', op: 'delete', lane, runId, siteKey }
 *   result { id, ok, status?, siteKey?, error?, reconciled? }
 *   orphan { siteKey, runId }
 * `chat.jsonl` — one intent per forwarded chat call:
 *   intent { key: 'chat:<site>', lane, runId, pr, site, door }, result { id, status },
 *   ended  { site }  (appended through `/__qa/turn-ended` by the watchdog)
 *
 * Exports:
 *   openSiteBook(path): SiteBook
 *   openChatBook(path): ChatBook
 *
 * SiteBook:
 *   intent(data): string                     // appends; returns the id
 *   result(id, data): void
 *   orphan(siteKey, runId): void             // once per siteKey
 *   unknown(): object[]                      // intents without a result, oldest first
 *   hasTx(key, runId): boolean
 *   createOps(lane, runId): number           // distinct capped create transactions this run
 *   liveSites(lane, runId): number           // capped transactions that hold (or may hold) a site
 *   siteRecord(siteKey, runId): { lane, pr } | null   // the live owner of a site this run
 *   knownSiteKeys(): Set<string>
 *   lines(): object[]
 * ChatBook:
 *   intent(data): string; result(id, data): void; ended(site): void
 *   count({ runId, lane, pr? }): number
 *   lastOnSite(site): { at: number, ended: number | null } | null
 */
import { appendLine, openJournal, readLines } from '../lib/journal.mjs'

export function openSiteBook(path) {
  const j = openJournal(path)
  const intents = new Map() // id -> intent line
  const results = new Map() // id -> result lines[]
  const orphans = new Set()
  const all = []

  const take = (line) => {
    all.push(line)
    if (line.t === 'intent') intents.set(line.id, line)
    else if (line.t === 'result') {
      if (!results.has(line.id)) results.set(line.id, [])
      results.get(line.id).push(line)
    } else if (line.t === 'orphan') orphans.add(line.siteKey)
  }
  for (const line of readLines(path).lines) take(line)

  const lastLine = () => readLines(path).lines.at(-1)

  /** Every create transaction: key -> { lane, runId, pr, uncapped, siteKey, state } */
  function transactions() {
    const tx = new Map()
    for (const it of intents.values()) {
      if (it.op !== 'create') continue
      const cur = tx.get(it.key) ?? {
        key: it.key,
        lane: it.lane,
        runId: it.runId,
        pr: it.pr ?? null,
        uncapped: !!it.uncapped,
        siteKey: it.siteKey,
        ok: false,
        pending: false
      }
      const rs = results.get(it.id)
      if (!rs) cur.pending = true
      else
        for (const r of rs)
          if (r.ok) {
            cur.ok = true
            if (r.siteKey) cur.siteKey = r.siteKey
          }
      tx.set(it.key, cur)
    }
    return tx
  }

  function deleted(runId) {
    const gone = new Set()
    for (const it of intents.values()) {
      if (it.op !== 'delete' || it.runId !== runId) continue
      if ((results.get(it.id) ?? []).some((r) => r.ok)) gone.add(it.siteKey)
    }
    return gone
  }

  return {
    intent(data) {
      const id = j.intent(data.key, data)
      take(lastLine())
      return id
    },
    result(id, data) {
      j.result(id, data)
      take(lastLine())
    },
    orphan(siteKey, runId) {
      if (orphans.has(siteKey)) return
      j.append('orphan', { siteKey, runId })
      take(lastLine())
    },
    unknown() {
      return [...intents.values()].filter((it) => !results.has(it.id))
    },
    hasTx(key, runId) {
      for (const it of intents.values()) if (it.key === key && it.runId === runId) return true
      return false
    },
    createOps(lane, runId) {
      let n = 0
      for (const t of transactions().values()) if (t.lane === lane && t.runId === runId && !t.uncapped) n++
      return n
    },
    liveSites(lane, runId) {
      const gone = deleted(runId)
      let n = 0
      for (const t of transactions().values())
        if (
          t.lane === lane &&
          t.runId === runId &&
          !t.uncapped &&
          (t.ok || t.pending) &&
          !gone.has(t.siteKey)
        )
          n++
      return n
    },
    siteRecord(siteKey, runId) {
      if (deleted(runId).has(siteKey)) return null
      for (const t of transactions().values())
        if (t.runId === runId && t.siteKey === siteKey && (t.ok || t.pending))
          return { lane: t.lane, pr: t.pr }
      return null
    },
    knownSiteKeys() {
      const keys = new Set(orphans)
      for (const it of intents.values()) if (it.siteKey) keys.add(it.siteKey)
      for (const rs of results.values()) for (const r of rs) if (r.siteKey) keys.add(r.siteKey)
      return keys
    },
    lines: () => [...all]
  }
}

export function openChatBook(path) {
  const j = openJournal(path)
  const intents = []
  const endedAt = new Map() // site -> ms
  for (const line of readLines(path).lines) {
    if (line.t === 'intent') intents.push(line)
    else if (line.t === 'ended') endedAt.set(line.site, Date.parse(line.at))
  }
  return {
    intent(data) {
      const id = j.intent(data.key, data)
      intents.push({ ...data, t: 'intent', id, at: new Date().toISOString() })
      return id
    },
    result(id, data) {
      j.result(id, data)
    },
    ended(site) {
      appendLine(path, { t: 'ended', site, at: new Date().toISOString() })
      endedAt.set(site, Date.now())
    },
    count({ runId, lane, pr }) {
      return intents.filter(
        (i) => i.runId === runId && i.lane === lane && (pr === undefined || String(i.pr) === String(pr))
      ).length
    },
    lastOnSite(site) {
      const last = intents.findLast((i) => i.site === site)
      if (!last) return null
      const at = Date.parse(last.at)
      const ended = endedAt.get(site)
      return { at, ended: ended !== undefined && ended >= at ? ended : null }
    }
  }
}
