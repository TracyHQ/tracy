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
import {
  PLACE_CHOICE_TOPIC,
  asChosen,
  isTyped,
  placeChoiceQuestionOf,
  placeOfChoice
} from 'website-opportunities/domain'
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

/** The question and the stored answer to it for a research of `links`, or null. */
function asked(row, links) {
  if (!placeAsked(row) || !sameLinks(row.engine.inputs?.links, links)) return null
  const question = row.engine.question
  const answer = (Array.isArray(row.answers) ? row.answers : []).find((a) => a?.question === question.id)
  return { question, answer }
}

/**
 * The typed answer to the place question the answer reading must read first (`answer-readings.js`): `{question,
 * answer}`, or null when there is none or it is exactly one of the offered choices.
 */
export function placeTypedOf(row, links) {
  const found = asked(row, links)
  return found?.answer && isTyped(asChosen(found.answer, found.question), found.question) ? found : null
}

/**
 * The owner's answer to the place question for a research of `links`: the picked place, `'none'`, or undefined when
 * the draft asks no place question for these links or holds no answer to it yet. A typed answer counts as the choice
 * the answer reading read in it (`readChoice`), else as none; code reads nothing in it.
 * @param {object | null} row the draft row (`engine-store.js readEngineRow`)
 * @param {string[]} links the links of the research about to run
 * @param {string | null} [readChoice] the offered choice id the answer reading read in a typed answer
 */
export function placeAnswerOf(row, links, readChoice = null) {
  const found = asked(row, links)
  if (!found) return undefined
  const { question, answer } = found
  const read =
    readChoice && answer ? { schema: answer.schema, question: answer.question, choice: readChoice } : null
  return placeOfChoice(question, read ?? answer) ?? undefined
}
