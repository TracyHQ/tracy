/** Validate a host's bounded usage snapshot before recording any moment job. */
export function momentUsage(body, turnId) {
  const raw = body?.usage
  if (raw == null) return null
  if (typeof turnId !== 'string' || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1)
    return false
  const keys = [
    'inputTokens',
    'outputTokens',
    'cacheReadTokens',
    'cacheWriteTokens',
    'totalTokens',
    'measured',
    'missing',
    'lastSeq'
  ]
  if (keys.some((key) => !Number.isSafeInteger(raw[key]) || raw[key] < 0 || raw[key] > 1e12)) return false
  if (raw.measured === 0 || raw.lastSeq === 0) return false
  return { version: 1, ...Object.fromEntries(keys.map((key) => [key, raw[key]])) }
}
