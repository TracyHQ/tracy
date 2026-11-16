/**
 * The trade must-haves of one opportunity as the Details and Outreach doors answer them (`domain/trade-must-haves.mjs`):
 * what its trade's customers expect on its website, which of these the business's current website offers as research
 * read it (the website source row: no new fetch), the reason the opportunity score gives for it, and one outreach line
 * per capability the old site is known to lack that the demo really has. Null for a trade with no must-haves, or a place
 * whose website is none of its own (a listing site's page).
 */
import { isListingUrl } from '../domain/link-kinds.mjs'
import { decideSubTrade } from '../domain/sub-trades.mjs'
import { briefTradeOf } from '../domain/trades.mjs'
import { assessMustHaves, mustHaveArguments, oldSiteReadOf } from '../domain/trade-must-haves.mjs'
import tradeMustHavesRule from '../domain/scoring/trade-must-haves.mjs'

/**
 * @param {{opportunity: any, profile: any, sources: any[], demoOffers?: Record<string, boolean> | null}} input
 *   `profile` is the research profile (`mergeProfile`, or a snapshot view's), `sources` the source rows with their
 *   `collected`, `demoOffers` what the latest live demo's brief offers (`demoOffersOfBrief`), null without a demo.
 */
export function mustHavesView({ opportunity, profile, sources, demoOffers = null }) {
  const candidate = opportunity?.candidate ?? {}
  const websiteRow = (Array.isArray(sources) ? sources : []).find((s) => s?.source === 'website') ?? null
  const website = websiteRow?.ref ?? candidate.website ?? null
  if (!website || isListingUrl(website)) return null
  const googlePlace = profile?.googlePlace ?? null
  const trade = briefTradeOf({ candidate, googlePlace, menuItems: profile?.menuItems })
  const subTrade =
    decideSubTrade({ trade, reading: profile?.businessReading ?? null, googlePlace, candidate })?.id ?? null
  const assessment = assessMustHaves({ trade, subTrade, website, read: oldSiteReadOf(websiteRow) })
  if (!assessment) return null
  const answer = tradeMustHavesRule.score({ candidate: { website }, siteCheck: null, mustHaves: assessment })
  return {
    ...assessment,
    // The reason this assessment adds to the opportunity score, as `scoreOpportunity({mustHaves})` lists it.
    scoreReason: answer
      ? answer.params === undefined
        ? [answer.reason, answer.points]
        : [answer.reason, answer.points, answer.params]
      : null,
    demo: demoOffers ?? null,
    arguments: mustHaveArguments(assessment, demoOffers ?? null)
  }
}
