const ACTIVE = 20
const RECENT = 10

/**
 * A place that posts often markets itself and will value a website. Days since the last post, read against `now`:
 * the tiers count whole days; `days` keeps the fraction so the tooltip can say "14 hours ago".
 */
export default {
  id: 'marketing',
  weight: ACTIVE,
  score({ social, now }) {
    const at = typeof social?.lastPostAt === 'string' ? Date.parse(social.lastPostAt) : NaN
    if (!Number.isFinite(at)) return { points: null, reason: 'marketing.unknown' }
    const days = Math.max(0, Math.round((now.getTime() - at) / 60_000) / 1440) // to the minute
    const whole = Math.floor(days)
    return {
      points: whole <= 30 ? ACTIVE : whole <= 90 ? RECENT : 0,
      reason: 'marketing.lastPost',
      params: { days }
    }
  }
}
