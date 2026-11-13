/**
 * The failures of compose only the owner can lift by answering (#609, #593 G4), turned into an owner turn: the engine
 * ends the step `asking`, with the question to put on the card and, when the owner's answer did not fit, one plain
 * sentence saying why. It is neither a stop nor a fault: nothing broke, the owner has one more thing to say.
 *
 *   - `site_name_missing`: the business name is kept off the site, nothing neutral names it and the site name question
 *     is open. The composer's error carries the question (`details.question`, with the template's limit).
 *   - `site_name_too_long`: the owner's name is longer than the template's business name fields hold
 *     (`details.limit`). The question of the profile compose read is asked again, held to that limit.
 *
 * Without a question to ask (an older composer, a malformed error) it answers null, and the step stops as before.
 */
import { SITE_NAME_TOPIC } from 'website-opportunities/domain'
import { siteNameTooLongSay } from './engine-state.js'

const isQuestion = (q) =>
  q && typeof q === 'object' && q.topic === SITE_NAME_TOPIC && typeof q.id === 'string'

/**
 * @param {any} error the failure compose ended with
 * @param {() => object | null | undefined} profileOf the needs profile compose read (`planProfileOf` with the kit)
 * @returns {{state: 'asking', question: object, say?: string} | null}
 */
export function askingOf(error, profileOf) {
  if (error?.code === 'site_name_missing')
    return isQuestion(error.details?.question) ? { state: 'asking', question: error.details.question } : null
  if (error?.code !== 'site_name_too_long') return null
  const limit = error.details?.limit
  if (!Number.isInteger(limit) || limit < 1) return null
  const questions = profileOf()?.questions
  const asked = (Array.isArray(questions) ? questions : []).find(isQuestion)
  if (!asked) return null
  const question = { ...asked, freeText: { ...asked.freeText, maxLength: limit } }
  return { state: 'asking', question, say: siteNameTooLongSay(limit) }
}
