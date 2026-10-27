const DOWN = 40
const SLOW = 25
const STALE_COPYRIGHT_YEARS = 5

/** A website that is down needs replacing; one that is slow, insecure, not mobile-friendly or dated needs work. */
export default {
  id: 'website-health',
  weight: 40,
  holdsScore: true,
  score({ candidate, siteCheck, slowSiteThreshold, now }) {
    if (!candidate.website) return null
    const status = siteCheck?.status
    if (!siteCheck || status === 'queued') return { points: null, reason: 'web.checking' }
    if (status === 'down') return { points: DOWN, reason: 'web.down' }
    if (status !== 'done') return { points: 0, reason: 'web.unknown' }
    const { performance, https, mobileFriendly, copyrightYear } = siteCheck
    const slow =
      (Number.isFinite(performance) && performance < slowSiteThreshold) ||
      https === false ||
      mobileFriendly === false ||
      (Number.isFinite(copyrightYear) && copyrightYear <= now.getFullYear() - STALE_COPYRIGHT_YEARS)
    if (!slow) return { points: 0, reason: 'web.fine' }
    return {
      points: SLOW,
      reason: 'web.slow',
      params: {
        performance: performance ?? null,
        https: https ?? null,
        mobileFriendly: mobileFriendly ?? null,
        copyrightYear: copyrightYear ?? null
      }
    }
  }
}
