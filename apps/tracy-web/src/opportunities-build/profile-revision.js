import { createHash } from 'node:crypto'
import { canonicalJson } from 'website-opportunities/src/canonical-json.js'
import { placeProfileFromResearch } from 'website-opportunities/domain/place-profile-from-research.mjs'
import { placeProfileFromDemoRequest } from 'website-opportunities/domain/place-profile-from-demo-request.mjs'
import { assessProfile } from './fact-assessment.js'

export const PROFILE_SNAPSHOT_VERSION = 'place-profile/1'

/**
 * Freeze the original facts, not the lossy legacy projection used by older build engines. The assessment carries the
 * owner's on-site choices (#1791): `overrides`, by default the opportunity's `candidate.factOverrides`, which Research
 * again never overwrites, so every later revision freezes the same decision.
 */
export function freezePlaceProfile({
  research,
  request = research?.demoRequest,
  at,
  overrides = research?.opportunity?.candidate?.factOverrides ?? null
}) {
  const sender = Boolean(request)
  const v2 = request?.schema === 'website-opportunities/demo-request/v2'
  const converted = sender
    ? v2
      ? request.profile
      : placeProfileFromDemoRequest(request)
    : placeProfileFromResearch({
        identity: research.opportunity,
        profile: research.profile,
        brand: research.brand,
        sources: research.rawSources ?? research.sources,
        media: research.media,
        posts: research.posts,
        socialStats: research.socialStats
      })
  const json = canonicalJson(converted)
  const profile = JSON.parse(json)
  const profileHash = createHash('sha256').update(json).digest('hex')
  const origin = sender ? 'sender' : 'research'
  // Legacy field dates are outside the converter's profile; keep them with the policy input.
  const seenAt = {}
  if (!sender) {
    for (const [field, provenance] of Object.entries(research.profile?.provenance ?? {})) {
      const fact = profile.business[field]
      if (fact?.id && provenance?.seenAt) seenAt[fact.id] = provenance.seenAt
    }
  }
  return {
    profile,
    profileSchemaVersion: profile.schemaVersion,
    converterVersion: sender
      ? v2
        ? PROFILE_SNAPSHOT_VERSION
        : 'place-profile-from-demo-request/1'
      : 'place-profile-from-research/1',
    profileHash,
    origin,
    assessment: {
      profileHash,
      evaluatedAt: at,
      seenAt,
      facts: assessProfile(profile, { origin, at, seenAt, overrides })
    }
  }
}

/**
 * `freezePlaceProfile`, or null when the profile cannot be made: the revision is still made, without it, and is read
 * as before the freeze (`placeProfileOfRevision`'s provisional path).
 */
export function freezePlaceProfileOrNull(input, { warn = console.warn } = {}) {
  try {
    return freezePlaceProfile(input)
  } catch (error) {
    warn(`[wo] place profile not frozen: ${error?.message ?? error}`)
    return null
  }
}
