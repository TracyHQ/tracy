/**
 * The saved profile of one opportunity as the Profile card reads it (#537 R18): the place profile the latest brief
 * revision froze (else the place profile of the current research) with the owner's changes of today laid on
 * (`domain/saved-profile.mjs savedProfileOf`), and every fact's decision on it. `GET /:id`, `GET /:id/place-profile`
 * and the fact value door read it, so the card shows, and the owner edits, exactly what the next brief states.
 */
import { readPlaceProfileWithInputs } from './place-profile-read.js'
import { validatePlaceProfile } from '../domain/place-profile.mjs'
import { factDecisions } from '../domain/fact-assessment.mjs'
import { briefFactsOf } from '../domain/brief-facts.mjs'
import { briefTradeOf } from '../domain/trades.mjs'
import { savedProfileOf, stampDecisions } from '../domain/saved-profile.mjs'
import { untrackedUrl } from '../domain/social-links.mjs'

/** The profile as the card reads it: a source's page without share tracking, as every link Tracy shows (#1780 item 10). */
function untracked(profile) {
  if (!Array.isArray(profile?.sources)) return profile
  return {
    ...profile,
    sources: profile.sources.map((s) =>
      typeof s?.ref === 'string' ? { ...s, ref: untrackedUrl(s.ref) ?? s.ref } : s
    )
  }
}

/**
 * @param {any} pool
 * @param {{host?: any, accountId: string, opp: any}} input `host` the host seam (`frozenPlaceProfileOf`)
 * @returns {Promise<{error: 'PROFILE_UNAVAILABLE'} | {profile: any, decisions: any[], revisionId?: string,
 *   siteName?: string}>} `profile` the saved profile with each fact's `onSite`, `decidedBy`, `confidence` and
 *   `reasons`; `decisions` one row per fact the brief states, as before
 */
export async function savedPlaceProfileOf(pool, { host, accountId, opp }) {
  // 🔒 One decision per fact (#1791): the profile the latest brief revision froze, judged at the time and with the
  // dates its assessment used and the owner's choices of today, listing exactly the facts that brief states. Before
  // any revision (or with a host that keeps none), the place profile of the current research.
  const frozen = (await host?.frozenPlaceProfileOf?.(pool, { accountId, opportunityId: opp.id })) ?? null
  const read = await readPlaceProfileWithInputs(pool, { opportunityId: opp.id })
  const research = frozen?.profile ?? read?.profile
  if (!research || !validatePlaceProfile(research).ok) return { error: 'PROFILE_UNAVAILABLE' }
  const saved = savedProfileOf(opp.candidate ?? {}, research, {
    research: read?.research ?? null,
    media: read?.media ?? []
  })
  const decided = factDecisions(saved, {
    origin: frozen?.origin ?? 'research',
    at: frozen?.at ?? new Date().toISOString(),
    seenAt: frozen?.seenAt ?? {}
  })
  const food = briefTradeOf({ candidate: opp.candidate ?? {}, googlePlace: null }) === 'food'
  const stated = new Set(frozen?.factIds ?? [])
  const decisions = briefFactsOf(saved, { food, decisions: decided })
    .filter((f) => !frozen?.factIds || stated.has(f.id))
    .map((f) => ({
      factId: f.id,
      field: f.field,
      confidence: f.confidence,
      onSite: f.onSite,
      decidedBy: f.decidedBy,
      reasons: f.reasons
    }))
  // While the name is held (the brief froze it off and the owner has not shown it since), the card names the neutral
  // identity the site goes by instead (`siteNameOf`), so it never reads as the name on the site.
  const nameOff = decisions.some((d) => d.field === 'name' && d.onSite === false)
  return {
    profile: untracked(stampDecisions(saved, decided)),
    decisions,
    ...(frozen ? { revisionId: frozen.revisionId } : {}),
    ...(nameOff && frozen?.siteName ? { siteName: frozen.siteName } : {})
  }
}
