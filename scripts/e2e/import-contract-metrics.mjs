import { toolResultOf } from '../measure/session-metrics.mjs'

function promptCount(value, prompt) {
  if (!value || typeof value !== 'object') return 0
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + promptCount(item, prompt), 0)
  return Object.entries(value).reduce(
    (sum, [key, item]) => sum + (key === 'text' && item === prompt ? 1 : promptCount(item, prompt)),
    0
  )
}

/** Only rows after the matching user message and through its first turn end belong to this sample. */
export function correlatedTurn(rows, prompt, occurrence = 0) {
  // V4 begins a turn BEFORE committing its user message. Inspect each turn interval,
  // rather than assigning queued messages to whichever start happens to follow delivery.
  const starts = rows.flatMap((row, at) => (row.type === 'turn/start' ? [at] : []))
  let matched = 0
  for (const [index, start] of starts.entries()) {
    const next = starts[index + 1] ?? rows.length
    const interval = rows.slice(start, next)
    // A spliced inbox may consume several queued messages in one turn. Count actual messages,
    // and never match a prompt merely because it is a substring of a different user request.
    const messages = interval.filter((row) => row.type === 'user/message')
    const candidates = messages.length
      ? messages
      : interval.filter((row) => row.type === 'agent/inbox/spliced')
    const count = candidates.reduce((sum, row) => sum + promptCount(row.data, prompt), 0)
    const prior = matched
    matched += count
    if (occurrence < prior || occurrence >= matched) continue
    const end = interval.findIndex((row) => row.type === 'turn/end')
    return { completed: end >= 0, rows: interval.slice(0, end < 0 ? undefined : end + 1) }
  }
  const user = rows.findIndex((r) => r.type === 'user/message' && promptCount(r.data, prompt) > 0)
  if (occurrence > 0 || (starts.length && user >= starts[0])) return { completed: false, rows: [] }
  const start = rows.findIndex((r, at) => user >= 0 && at > user && r.type === 'turn/start')
  const end = rows.findIndex((r, at) => start >= 0 && at > start && r.type === 'turn/end')
  return { completed: end >= 0, rows: start < 0 ? [] : rows.slice(start, end < 0 ? undefined : end + 1) }
}

export function turnMetrics(rows) {
  const metrics = {
    toolCalls: 0,
    errors: 0,
    noViewer: 0,
    byTool: {},
    cacheRead: null,
    cacheWrite: null,
    newInput: null,
    output: null,
    llmMs: null,
    usageMessages: 0
  }
  const names = {
    cacheRead: 'cacheReadTokens',
    cacheWrite: 'cacheWriteTokens',
    newInput: 'uncachedInputTokens',
    output: 'outputTokens',
    llmMs: 'llmMs'
  }
  const missing = new Set()
  for (const row of rows) {
    if (row.type === 'tool/call') {
      metrics.toolCalls++
      const name = row.data?.name ?? 'unknown'
      metrics.byTool[name] = (metrics.byTool[name] ?? 0) + 1
    }
    if (row.type === 'tool/result') {
      const result = toolResultOf(row)
      if (result.isError || /"ok"\s*:\s*false/.test(result.text)) metrics.errors++
      if (result.text.includes('"NO_VIEWER"')) metrics.noViewer++
    }
    if (row.type === 'assistant/message') {
      metrics.usageMessages++
      for (const [key, field] of Object.entries(names)) {
        const usage = row.data?.usage
        // Restored dsh TokenUsage inputTokens is NON-CACHED; adapters subtract cache hits.
        // Missing optional cache counters remain unknown instead of being invented as zero.
        const value = key === 'newInput' ? (usage?.[field] ?? usage?.inputTokens) : usage?.[field]
        if (typeof value !== 'number') missing.add(key)
        else metrics[key] = (metrics[key] ?? 0) + value
      }
    }
  }
  for (const key of missing) metrics[key] = null
  metrics.totalInput = [metrics.cacheRead, metrics.cacheWrite, metrics.newInput].some((n) => n == null)
    ? null
    : metrics.cacheRead + metrics.cacheWrite + metrics.newInput
  return metrics
}

export function totalMetrics(turns) {
  const totals = {
    turns: turns.length,
    completed: turns.filter((t) => t.completed).length,
    oraclePassed: turns.filter((t) => t.oraclePassed).length,
    byTool: {}
  }
  for (const key of [
    'toolCalls',
    'errors',
    'noViewer',
    'elapsedMs',
    'usageMessages',
    'cacheRead',
    'cacheWrite',
    'totalInput',
    'newInput',
    'output',
    'llmMs'
  ])
    totals[key] = turns.some((turn) => turn[key] == null)
      ? null
      : turns.reduce((sum, turn) => sum + turn[key], 0)
  for (const turn of turns)
    for (const [name, count] of Object.entries(turn.byTool))
      totals.byTool[name] = (totals.byTool[name] ?? 0) + count
  return totals
}
