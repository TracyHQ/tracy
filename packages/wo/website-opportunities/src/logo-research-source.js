/** A recorded logo reading on the operator's existing source table, without candidates or credentials. */
export function logoResearchSourceOf(research) {
  if (!research?.vision) return null
  const { status, reason } = research.vision
  const unavailable = ['not_configured', 'not_tested', 'unavailable'].includes(status)
  return {
    source: 'logo',
    status,
    collectedAt: research.at ?? null,
    attemptedAt: research.at ?? null,
    stale: false,
    lastError: unavailable
      ? {
          code: 'LOGO_VISION_NOT_RUN',
          message: reason || 'Logo text was not read because no ready vision model was available.'
        }
      : null
  }
}
