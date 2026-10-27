/**
 * Provider-reported usage of the model attempts in one site chat turn. DSH's TokenUsage
 * counters are disjoint: input is uncached, cache read/write are separate; reasoning is
 * already part of output. Each durable assistant settlement is one attempt. Its embedded
 * stream contains cumulative usage updates: use the last, never sum the updates and message.
 * This measures site-chat model attempts only, not seeding, help, speech or side-model calls.
 */
/** @param {any} n */
const count = (n) => Number.isSafeInteger(n) && n >= 0

/** @param {any} raw */
function counters(raw) {
  if (!raw || !count(raw.inputTokens) || !count(raw.outputTokens)) return null
  const keys = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']
  if (keys.some((key) => raw[key] !== undefined && !count(raw[key]))) return null
  const out = Object.fromEntries(keys.map((key) => [key, raw[key] ?? 0]))
  const sum = Object.values(out).reduce((a, b) => a + b, 0)
  if (!count(sum)) return null
  // totalTokens, when supplied, is the adapter's authoritative aggregate.
  out.totalTokens = raw.totalTokens === undefined ? sum : raw.totalTokens
  if (!count(out.totalTokens)) return null
  return out
}

/** @param {readonly any[] | undefined} events @param {number} turn */
export function tokenUsageOf(events, turn) {
  /** @type {Record<string, number>} */
  const totals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0 }
  let measured = 0
  let missing = 0
  let lastSeq = 0
  const seen = new Set()
  const steps = new Set()
  const settled = new Set()
  for (const [index, event] of (events ?? []).entries()) {
    if (event?.data?.turn !== turn) continue
    const seq = count(event.seq) ? event.seq : index + 1
    lastSeq = Math.max(lastSeq, seq)
    if (event.type === 'step/start') steps.add(event.data.step)
    if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') continue
    if (seen.has(seq)) continue
    seen.add(seq)
    settled.add(event.data.step)
    let raw = event.data.usage
    if (raw === undefined) {
      for (const record of event.data.stream ?? []) {
        const chunk = record?.chunk ?? record
        if (chunk?.type === 'usage') raw = chunk.usage
      }
    }
    const usage = counters(raw)
    if (!usage) {
      missing++
      continue
    }
    measured++
    for (const key of Object.keys(totals)) totals[key] += usage[key]
  }
  // A step cut short before any durable assistant settlement must not look fully measured.
  for (const step of steps) if (!settled.has(step)) missing++
  if (measured === 0) return null
  if (!Object.values(totals).every(count)) return null
  return { version: 1, ...totals, measured, missing, lastSeq }
}
