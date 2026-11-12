// 15 = the web points a slow site leaves (40 − 25): a slow site that also lacks a must-have reaches the 40 a site that
// is down gets, never more.
const WEIGHT = 15

/**
 * A website that lacks what its trade's customers expect to do on it (a restaurant's menu, a salon's booking:
 * `trade-must-haves.mjs`) needs work, as a slow one does. Its points are the share of the trade's must-haves the site is
 * known to lack. It applies only to a caller that passes the assessment (`evidence.mustHaves`) and to a place with a
 * website of its own that is up: with no assessment it adds no reason, so every score made without one is unchanged.
 * An assessment whose must-haves are only unknown answers `points: null`: never read as missing.
 */
export default {
  id: 'trade-must-haves',
  weight: WEIGHT,
  score({ candidate, siteCheck, mustHaves }) {
    if (!mustHaves || !candidate.website || siteCheck?.status === 'down') return null
    const list = Array.isArray(mustHaves.mustHaves) ? mustHaves.mustHaves : []
    if (!list.length) return null
    const missing = list.filter((m) => m.state === 'missing').map((m) => m.id)
    const unknown = list.filter((m) => m.state === 'unknown').map((m) => m.id)
    if (missing.length)
      return {
        points: Math.round((WEIGHT * missing.length) / list.length),
        reason: 'trade.missing',
        params: { trade: mustHaves.trade, missing, unknown }
      }
    if (unknown.length) return { points: null, reason: 'trade.unknown', params: { trade: mustHaves.trade, unknown } }
    return { points: 0, reason: 'trade.complete', params: { trade: mustHaves.trade } }
  }
}
