/**
 * The failures of compose only the owner can lift by answering (#609, #593 G4), turned into an owner turn: the engine
 * ends the step `asking`, with the question to put on the card and, when the owner's answer did not fit, one plain
 * sentence saying why. It is neither a stop nor a fault: nothing broke, the owner has one more thing to say.
 *
 *   - `site_name_missing`: the business name is kept off the site, nothing neutral names it and the site name question
 *     is open. The composer's error carries the question (`details.question`, with the template's limit).
 *   - `site_name_too_long`: the owner's name is longer than the template's business name fields hold
 *     (`details.limit`): asked again, held to that limit, with the limit in plain words.
 *   - `site_name_invalid`: the name is empty or holds a control character, markup or markdown: asked again with one
 *     plain sentence.
 *
 * Every site name error carries the whole question to ask (`details.question`) and its id (`details.questionId`);
 * the question is taken from there, never rebuilt. Without a question (a malformed error) it answers null, and the
 * step stops as before.
 */
import { SITE_NAME_TOPIC } from 'website-opportunities/domain'
import { SITE_NAME_INVALID_SAY, siteNameTooLongSay } from './engine-state.js'

const isQuestion = (q) =>
  q && typeof q === 'object' && q.topic === SITE_NAME_TOPIC && typeof q.id === 'string'

/**
 * @param {any} error the failure compose ended with
 * @returns {{state: 'asking', question: object, say?: string} | null}
 */
export function askingOf(error) {
  const question = error?.details?.question
  if (!isQuestion(question)) return null
  if (error.code === 'site_name_missing') return { state: 'asking', question }
  if (error.code === 'site_name_invalid') return { state: 'asking', question, say: SITE_NAME_INVALID_SAY }
  if (error.code !== 'site_name_too_long') return null
  const limit = error.details?.limit
  if (!Number.isInteger(limit) || limit < 1) return null
  return {
    state: 'asking',
    question: { ...question, freeText: { ...question.freeText, maxLength: limit } },
    say: siteNameTooLongSay(limit)
  }
}
