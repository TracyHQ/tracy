/**
 * Session Cache & Token Analyzer.
 * Parses Harness turn usage and reports cache efficiency.
 */

export function analyzeSessionEvents(events = []) {
  let promptTokens = 0
  let cachedTokens = 0
  let completionTokens = 0
  let totalCalls = 0
  const callRecords = []

  let prevPrompt = 0
  for (const ev of events) {
    if (!ev) continue
    const usage = ev.usage || (ev.type === 'usage' ? ev.usage : null) || (ev.data && ev.data.usage)
    if (!usage) continue

    const p = Number(usage.inputTokens ?? usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokens ?? 0)
    const c = Number(usage.cacheReadTokens ?? usage.prompt_tokens_details?.cached_tokens ?? usage.cache_read_input_tokens ?? usage.cached_tokens ?? usage.cachedTokens ?? 0)
    const comp = Number(usage.outputTokens ?? usage.completion_tokens ?? usage.output_tokens ?? usage.completionTokens ?? 0)

    if (p <= 0 && comp <= 0) continue

    totalCalls++
    promptTokens += p
    cachedTokens += c
    completionTokens += comp

    let classification = 'cold_start'
    if (totalCalls > 1) {
      if (c > 0 && p > 0 && (c / p) >= 0.5) {
        classification = 'cache_hit'
      } else if (p > prevPrompt) {
        classification = 'delta'
      } else {
        classification = 'affinity_miss'
      }
    }
    prevPrompt = p

    callRecords.push({
      call: totalCalls,
      prompt: p,
      cached: c,
      completion: comp,
      classification,
      hitRate: p > 0 ? Math.round((c / p) * 100) : 0,
    })
  }

  const weightedCacheHitPercent = promptTokens > 0
    ? Math.round((cachedTokens / promptTokens) * 1000) / 10
    : 0

  return {
    totalCalls,
    promptTokens,
    cachedTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    weightedCacheHitPercent,
    savedTokens: cachedTokens,
    calls: callRecords,
  }
}
