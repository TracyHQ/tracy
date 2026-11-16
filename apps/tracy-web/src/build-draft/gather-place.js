/**
 * Which place the owner's Google link means, when it matches more than one (#609): two branches under one name. The
 * old Website Opportunities path shows a picker (its 409 `GOOGLE_LINK_AMBIGUOUS` answer); the build chat asks the
 * same thing as a question card, through the engine's owner turn (`engine-asking.js`), and reads the picked place
 * with the link door's own picked place reader (`link-fields.js`, `place`).
 *
 *   research -> the link is ambiguous -> the step ends `asking` with the place choice question (nothing read yet)
 *   -> the owner answers (`PUT /answers`) -> the same research runs again with the pick (`place`) or `none`
 *
 * The research runs again either when the chat asks for the plan (`engine-route.js`, compose door) or for the same
 * research again; both read the owner's answer here. Pure.
 */
import { PLACE_CHOICE_TOPIC, placeChoiceQuestionOf, placeOfChoice } from 'website-opportunities/domain'
import { EngineStepError } from './engine-steps.js'

/** The stop of a research whose Google link matches more than one place, with the question to ask. */
export function placeAmbiguousError(candidates) {
  const question = placeChoiceQuestionOf(candidates)
  return Object.assign(
    new EngineStepError('place_ambiguous', 'the Google link matches more than one place', { noRerun: true }),
    { details: { question, questionId: question.id } }
  )
}

/** Whether the draft's research ended asking which place is the owner's. */
export const placeAsked = (row) =>
  row?.engine?.step === 'research' &&
  row.engine.state === 'asking' &&
  row.engine.question?.topic === PLACE_CHOICE_TOPIC

const sameLinks = (a, b) =>
  Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((l, i) => l === b[i])

/**
 * The owner's answer to the place question for a research of `links`: the picked place, `'none'`, or undefined when
 * the draft asks no place question for these links or holds no answer to it yet.
 * @param {object | null} row the draft row (`engine-store.js readEngineRow`)
 * @param {string[]} links the links of the research about to run
 */
export function placeAnswerOf(row, links) {
  if (!placeAsked(row) || !sameLinks(row.engine.inputs?.links, links)) return undefined
  const question = row.engine.question
  const answer = (Array.isArray(row.answers) ? row.answers : []).find((a) => a?.question === question.id)
  return placeOfChoice(question, answer) ?? undefined
}
