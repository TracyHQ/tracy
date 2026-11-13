// The site name question (#593 G4): while research keeps the business name off the site and nothing neutral names it,
// the customer is asked, in free text, for a name the site may show. It is a Contract B question on the `site-name`
// topic, made by the same helper and worded like the needs profile's other questions (`needs-profile-questions.mjs`;
// prompts are English and only choice labels are per language, and this question has no choice). It never prints the
// held name. Pure, imports no plan module, so `plan-withheld.mjs` may attach it.
import { cappedLength, kindLimitsOf, storeBlocksOf } from './answer-field-limits.mjs'
import { SITE_NAME_TOPIC } from './build-contract-questions.mjs'
import { FREE_TEXT_MAX, contractQuestionOf } from './needs-profile-questions.mjs'

export { SITE_NAME_TOPIC }
/** The id of the site name question in a needs profile. */
export const SITE_NAME_QUESTION_ID = 'site-name'
/** The data kind a site name answer becomes. */
export const SITE_NAME_KIND = 'business.name'
export const SITE_NAME_PROMPT =
  'Your site will not show the business name we found. What name should your site show instead?'

/** Whether nothing names the site: the business name is held and no neutral identity stands in for it. */
export const siteNameMissing = (withheld) => withheld?.name === true && !withheld.siteName

/** The template's limit per data kind, from `limits` or from a block store and a library; an empty map without one. */
export function limitsOf({ limits, blockStore, library } = {}) {
  if (limits instanceof Map) return limits
  return blockStore ? kindLimitsOf(storeBlocksOf(blockStore, library)) : new Map()
}

/** How long a site name may be: the question's own cap lowered to the template's business name limit. */
export const siteNameLimitOf = (limits) =>
  cappedLength(FREE_TEXT_MAX[SITE_NAME_TOPIC], SITE_NAME_KIND, limits)

/** The site name question, its free text held to the template's business name fields (`kindLimitsOf`). */
export const siteNameQuestionOf = (limits) =>
  contractQuestionOf(SITE_NAME_TOPIC, SITE_NAME_PROMPT, [], null, siteNameLimitOf(limits))

/** The questions with the site name question first when the site name is missing, without it otherwise. */
export function withSiteNameQuestion(questions, withheld, limits) {
  const others = (Array.isArray(questions) ? questions : []).filter((q) => q?.topic !== SITE_NAME_TOPIC)
  return siteNameMissing(withheld) ? [siteNameQuestionOf(limits), ...others] : others
}
