/**
 * The business the owner's words are read for (#609, #575): a business known by the name the owner typed and no
 * source row, its profile as the research executor's own profile merge makes it (`mergeProfile`: what the business
 * reading reads), and its trade as Build from my business decides it (`business-trade.js`), the owner's words guiding
 * it when nothing else names one. The WO pieces are injected (`parts`, `build-draft-gather-wiring.js`).
 *
 * 🔒 THE OWNER'S DESCRIPTION IS A SOURCE, NEVER COPY (decision D46): it is read by the business reading as the source
 * `owner-statement` (`gather-reading.js`) and guides the trade only; it is never laid over the profile as a bio.
 */
import { tradeOfResearchProfile } from '../opportunities-build/business-trade.js'

/**
 * @param {{opp: object, rows: object[], googlePlace: object | null, description: string | null, domain: object,
 *   parts: object}} input
 * @returns {{owned: object, merged: object, trade: string}}
 */
export function profileOfRead({ opp, rows, googlePlace, description, domain, parts }) {
  const owned = { ...opp, candidate: { ...opp.candidate } }
  const merged = parts.mergeProfile(owned, rows)
  if (googlePlace) merged.googlePlace = googlePlace
  const own = tradeOfResearchProfile(domain, merged, owned.name)
  const trade = own !== 'other' ? own : parts.tradeOfWords(description)
  if (trade !== 'other') owned.candidate.trade = trade
  return { owned, merged, trade }
}
