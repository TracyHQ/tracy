/**
 * The trade of a researched business, as Build from my business decides it once its research is done (`own-site.js`
 * `researchedTrade`) and the build chat's research reads it too (`build-draft/research-trade.js`): Google's types when
 * the place was matched, else the schema.org type its own website states, else its own words (the name first, then
 * its bio and cuisines, `tradeOfWords`). `other` when none of them names one. Pure.
 * @param {object} domain the Website Opportunities domain (`tradeOfPlace`, `tradeOfSchemaType`)
 * @param {object | null | undefined} profile the research read's profile (`freezeDemoResearchInput`, a revision's
 *   `research.profile`)
 * @param {string | null | undefined} name the business's name when the profile holds none
 */
import { tradeOfWords } from '../lib/wo-revision-choice.js'

export function tradeOfResearchProfile(domain, profile, name) {
  const google = profile?.googlePlace ?? null
  const byGoogle = google
    ? domain.tradeOfPlace({ primaryType: google.primaryType, types: google.types })
    : 'other'
  const typed = byGoogle !== 'other' ? byGoogle : domain.tradeOfSchemaType(profile?.businessType)
  const named = typed !== 'other' ? typed : tradeOfWords(profile?.name ?? name)
  return named !== 'other'
    ? named
    : tradeOfWords(profile?.bio, Array.isArray(profile?.cuisine) ? profile.cuisine.join(' ') : null)
}
