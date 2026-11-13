// The customer's answer to the site name question (#593 G4, `plan-site-name-question.mjs`), applied by
// `settleAnswers`. The typed name is trimmed and its white space collapsed, then held to the same rules as every other
// typed answer (`checkAnswer`: not empty, no control character) plus the plain text rules a text field keeps
// (`fieldValueProblems`: no HTML tag, no markdown marker), and to the template's business name limit (its own error
// `site_name_too_long`, which carries the limit, so the chat asks again).
//
// The answer becomes `business.name` with the source `customer-answer` and the site's name (`withheld.siteName`). A
// held name the answer itself writes (as whole words, the held name matching) is the customer's own choice to show it:
// it leaves `withheld.names`, so nothing hides it any more. Any other held name stays hidden everywhere, as before.
import { heldNamesIn } from './held-reviews.mjs'
import { fieldValueProblems } from './page-copy-check.mjs'
import { PlanComposerError } from './plan-composer-error.mjs'
import {
  SITE_NAME_KIND,
  SITE_NAME_QUESTION_ID,
  SITE_NAME_TOPIC,
  limitsOf,
  siteNameLimitOf,
  siteNameMissing,
  siteNameQuestionOf
} from './plan-site-name-question.mjs'
import { SITE_NAME_MISSING_MESSAGE, heldTextsOf, withoutHeldRows } from './plan-withheld.mjs'

/** The plain text rules of a text field a site name keeps (`fieldValueProblems` codes). */
const PLAIN_TEXT_CODES = new Set(['markup', 'markdown'])

/** A typed site name as the site shows it: trimmed, every run of white space one space. */
export const normalisedSiteName = (text) =>
  String(text ?? '')
    .trim()
    .replace(/\s+/gu, ' ')

/**
 * The problems of a site name answer beyond `checkAnswer`: plain text only, and the template's limit.
 * @returns {{problems: Array<{at: string, message: string}>, tooLong?: {limit: number, length: number}}}
 */
export function siteNameProblems(text, limits, at) {
  const value = normalisedSiteName(text)
  const problems = fieldValueProblems({ type: 'text', limit: Infinity }, value)
    .filter((p) => PLAIN_TEXT_CODES.has(p.code))
    .map((p) => ({ at, message: p.message }))
  const limit = siteNameLimitOf(limits)
  const length = [...value].length
  if (length <= limit) return { problems }
  const message = `${length} characters, longer than the ${limit} the template's business name holds`
  return { problems: [...problems, { at, message }], tooLong: { limit, length } }
}

/** The site name question of a profile (its own, or a fresh one held to the template's limit). */
export const siteNameQuestionOfProfile = (profile, limits) =>
  (Array.isArray(profile?.questions) ? profile.questions : []).find((q) => q?.topic === SITE_NAME_TOPIC) ??
  siteNameQuestionOf(limits)

/**
 * The details every site name error carries: the whole question to ask again (`question`) and its id (`questionId`).
 * @param {object} profile the needs profile, or null
 * @param {Map<string, number>} [limits] the template's smallest text limit per data kind
 */
export const siteNameErrorDetails = (profile, limits, extra = {}) => ({
  question: siteNameQuestionOfProfile(profile, limits),
  questionId: SITE_NAME_QUESTION_ID,
  ...extra
})

/** The `site_name_missing` error, with the question to ask (the profile's own, or a fresh one). */
export function siteNameMissingError(profile, limits) {
  return new PlanComposerError(
    'site_name_missing',
    SITE_NAME_MISSING_MESSAGE,
    siteNameErrorDetails(profile, limits),
    { noRerun: true }
  )
}

/** Whether a list of answers answers the site name question with a name (not a skip). */
export const answersSiteName = (answers) =>
  Array.isArray(answers) && answers.some((a) => a?.question === SITE_NAME_TOPIC && a?.text !== undefined)

/**
 * The plan step's early stop, before any model call: the site name is missing and the answers given (a list, not a
 * function that asks) do not answer it, so the plan would be composed with the question still open.
 */
export function stopWithoutSiteName(research, answers, template) {
  if (siteNameMissing(research?.withheld) && Array.isArray(answers) && !answersSiteName(answers))
    throw siteNameMissingError(null, limitsOf(template))
}

/**
 * The `withheld` part of a profile once the site shows `name`: it is the site's name (`siteName`), and a held name it
 * writes as whole words is the customer's own choice to show it, so it leaves `names`. Any other held name stays
 * hidden. The one rule both the site name answer and a card edit of the business name go by.
 */
export function withheldShowing(withheld, name) {
  const held = Array.isArray(withheld?.names) ? withheld.names : []
  const shown = new Set(heldNamesIn(name, held))
  const names = held.filter((n) => !shown.has(n))
  const { names: _old, ...rest } = withheld ?? {}
  return { ...rest, siteName: name, ...(names.length ? { names } : {}) }
}

/** Apply a site name answer to the settled profile (changed in place, as `settleAnswers` does with its copy). */
export function settleSiteName(settled, text, answered) {
  const name = normalisedSiteName(text)
  settled.facts[SITE_NAME_KIND] = [answered(name)]
  if (!settled.withheld) return
  settled.withheld = withheldShowing(settled.withheld, name)
  const kept = withoutHeldRows(settled, heldTextsOf(settled.withheld))
  settled.items = kept.items
  if (kept.rows) settled.rows = kept.rows
}
