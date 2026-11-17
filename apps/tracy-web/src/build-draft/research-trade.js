/**
 * The trade the build chat's research ends with (#575), the one the template list is offered for (`/templates`,
 * `kits.templatesFor`). It is the step chain's own decision, in its own order, never a second classifier:
 *
 *   1. the brief's trade: the saved business's own trade (`briefTradeOf`, the candidate's trade);
 *   2. the place profile's classification (`statedTradeOf`): the trade the step chain derived from the categories its
 *      sources state (Google's types, a website's schema.org type, a social page's category), frozen with the brief;
 *   3. Build from my business's decision over the research read (`tradeOfResearchProfile`): Google's types, the
 *      schema.org type, then the business's own name, bio and cuisines;
 *   4. the owner's own words in the chat, read by the same word rule as its name and bio (`tradeOfWords`).
 *
 * Null when none names a trade: the chat then asks the owner (`business-trade-question.mjs`), never "no template fits".
 */
import { statedTradeOf, TRADES } from 'website-opportunities/domain'
import { tradeOfWords } from '../lib/wo-revision-choice.js'
import { tradeOfResearchProfile } from '../opportunities-build/business-trade.js'

/** Whether a trade names one: a code of the taxonomy, not `other` nor `unknown`. */
export const isKnownTrade = (trade) =>
  typeof trade === 'string' && trade !== 'other' && TRADES.includes(trade)

/**
 * @param {{revision: {brief?: object, place_profile?: object | null, research?: object | null}, domain: object,
 *   description?: string | null}} input `revision`: the step chain's content brief row; `description`: the owner's
 *   words in the chat
 * @returns {string | null}
 */
export function researchTradeOf({ revision, domain, description = null }) {
  const steps = [
    () => revision?.brief?.trade,
    () => statedTradeOf(revision?.place_profile?.profile ?? null),
    () =>
      tradeOfResearchProfile(domain, revision?.research?.profile ?? null, revision?.brief?.business?.name),
    () => tradeOfWords(description)
  ]
  for (const step of steps) {
    const trade = step()
    if (isKnownTrade(trade)) return trade
  }
  return null
}
