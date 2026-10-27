/**
 * The opening hours a researched business's site shows (`domain/hours-check.mjs`), decided on every read with the
 * person's choice on the candidate (`hoursPick`), so a choice made after research needs no new run. The brief makes
 * the same decision from the same inputs.
 */
import { decideHours, hoursPickOf } from '../domain/hours-check.mjs'

/**
 * The profile with `hoursCheck` (`HoursDecision`): what the site shows, why, and each source's hours.
 * @param {any} profile @param {{ opportunity?: any }} [read]
 */
export function withHoursDecision(profile, { opportunity = null } = {}) {
  if (!profile || typeof profile !== 'object') return profile
  const cand = opportunity?.candidate ?? {}
  const google = profile.googlePlace ?? {}
  const hoursCheck = decideHours({
    profile,
    googleHours: Array.isArray(google.openingHours) ? google.openingHours : [],
    trade: typeof cand.trade === 'string' && cand.trade ? cand.trade : 'food',
    words: [cand.category, cand.primaryType, google.primaryType, profile.businessType, profile.name],
    pick: hoursPickOf(cand)
  })
  return { ...profile, hoursCheck }
}
