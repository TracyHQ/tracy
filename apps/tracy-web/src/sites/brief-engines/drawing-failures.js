/** Provider responses are untrusted: classify them, then log only our fixed reason vocabulary. */
export function drawingFailureReason(error) {
  const words = [error?.message ?? error, error?.status, error?.code, error?.cause?.code].join(' ')
  if (
    /\b402\b|out of credit|insufficient.{0,40}(credit|balance|fund)|requires.{0,60}balance|payment required/i.test(
      words
    )
  )
    return 'out of credit'
  if (/\b429\b|rate.?limit|too many requests/i.test(words)) return 'rate limit'
  if (
    /\b404\b|no endpoints found|model.{0,60}(not found|does not exist|not available)|unknown model|invalid model/i.test(
      words
    )
  )
    return 'model not found'
  if (/timed?\s*out|too long|abort|ETIMEDOUT/i.test(words)) return 'timeout'
  if (/network|fetch failed|socket|ECONN|ENOTFOUND|EAI_AGAIN/i.test(words)) return 'network'
  return 'model failed'
}

/** Never include a provider URL, response, key, prompt or user data in the failure log. */
export function logDrawingFailure(reasonClass, refusal = null) {
  const known = new Set(['face-found', 'text-found', 'logo-found', 'labeller-unavailable', 'blurred-region'])
  const detail = known.has(refusal) ? ` (${refusal})` : ''
  console.warn(`[brief-drawing] picture failed: ${reasonClass}${detail}`)
}
