/** Shared Find decoration: cache reads and the domain's opportunity score, with no collector admission. */
import { mergeFindCheck } from './find-research.js'
import { SOCIAL_STAT_NETWORKS } from './social-stats.js'

function handlesOf(socials) {
  if (!socials || typeof socials !== 'object') return []
  return SOCIAL_STAT_NETWORKS.filter((n) => typeof socials[n] === 'string' && socials[n]).map((n) => ({
    network: n,
    url: socials[n]
  }))
}

function socialOf(socials, stats) {
  const out = {}
  for (const { network, url } of handlesOf(socials)) if (stats[url]) out[network] = stats[url]
  return Object.keys(out).length > 0 ? out : null
}

function freshestPostAt(social) {
  let best = null
  for (const stat of Object.values(social ?? {})) {
    const at = typeof stat?.lastPostAt === 'string' ? Date.parse(stat.lastPostAt) : Number.NaN
    if (Number.isFinite(at) && (best === null || at > best)) best = at
  }
  return best === null ? null : new Date(best).toISOString()
}

export async function decorateFindCandidates({
  domain,
  candidates,
  settings,
  siteChecks = null,
  socialStats = null,
  statuses = new Map(),
  now = Date.now
}) {
  const lift = typeof domain.withSiteSocials === 'function' ? domain.withSiteSocials : null
  const [knownStatuses, checks] = await Promise.all([
    statuses,
    siteChecks?.lookup(candidates.map((cand) => cand.website).filter(Boolean)) ?? {}
  ])
  const socialsOf = candidates.map((candidate) => {
    const siteCheck = mergeFindCheck(
      candidate.siteCheck,
      (candidate.website && checks[candidate.website]) || null
    )
    return lift ? lift(candidate.socials, siteCheck) : candidate.socials
  })
  const stats = socialStats ? await socialStats.lookup(socialsOf.flatMap(handlesOf)) : {}
  const at = new Date(now())
  const scorer = typeof domain.scoreOpportunity === 'function' ? domain.scoreOpportunity : null
  return candidates.map((candidate, i) => {
    const known = knownStatuses.get(`${candidate.provider}\n${candidate.providerId}`)
    const status =
      known === 'demo' ? 'demo' : candidate.status === 'researched' ? 'researched' : (known ?? 'new')
    const siteCheck = mergeFindCheck(
      candidate.siteCheck,
      (candidate.website && checks[candidate.website]) || null
    )
    const socials = socialsOf[i]
    const social = socialOf(socials, stats)
    const lastPostAt = freshestPostAt(social)
    const score = scorer
      ? scorer({
          candidate,
          siteCheck,
          social: lastPostAt ? { lastPostAt } : null,
          status,
          slowSiteThreshold: settings.slowSiteThreshold,
          now: at
        })
      : null
    return {
      ...candidate,
      socials,
      chainSuspect: candidate.chainSuspect === true,
      status,
      siteCheck,
      social,
      score
    }
  })
}

/** Find's sortRows('score', -1): descending opportunity, missing values last, stable ties. */
export function rankFindCandidates(candidates) {
  return candidates
    .map((candidate, i) => ({ candidate, i, score: candidate.score?.score ?? null }))
    .sort((a, b) => {
      if (a.score === null || b.score === null)
        return a.score === b.score ? a.i - b.i : a.score === null ? 1 : -1
      return a.score === b.score ? a.i - b.i : b.score - a.score
    })
    .map(({ candidate }) => candidate)
}
