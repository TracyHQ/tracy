/** Provider totals are already de-duplicated by the site-chat recorder; absent data stays unknown. */
export function summarizeTokenUsage(turns, minimum = 20) {
  const measured = turns.filter(
    (turn) => Number.isSafeInteger(turn.token_usage?.totalTokens) && turn.token_usage.totalTokens >= 0
  )
  const values = measured.map((turn) => turn.token_usage.totalTokens).sort((a, b) => a - b)
  const at = (q) => values[Math.ceil(values.length * q) - 1]
  return {
    total: measured.length ? values.reduce((sum, value) => sum + value, 0) : null,
    measuredRequests: measured.length,
    requests: turns.length,
    partialRequests: measured.filter((turn) => turn.token_usage.missing > 0).length,
    perRequest: {
      n: measured.length,
      median: measured.length >= minimum ? at(0.5) : null,
      p90: measured.length >= 100 ? at(0.9) : null
    }
  }
}
