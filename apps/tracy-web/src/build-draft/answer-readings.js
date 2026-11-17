/**
 * The answer reading of compose (owner decision of 16/11): when at least one of the owner's answers is typed text on a
 * main button or fact conflict question, ONE call to the standard build model reads those answers before the planner
 * (`answer-reading.mjs` in website-opportunities), so the facts the owner states reach the profile with origin
 * `answer`. It runs once per compose, outside the planner's rerun, and is reserved in the build chat's ledger as its
 * own step `answers` at its own ceiling (`spend-limits.js`), so the compose ceiling still holds the planner only.
 *
 * Nothing here stops a build: no typed answer means no call; a reservation the caps refuse, a model door that cannot
 * be built, a call that fails or a reply that is not usable all answer no reading, and every typed answer stays an
 * owner statement for the page writer.
 */
import { needsAnswerReading, readOwnerAnswers } from 'website-opportunities/domain'
import { planProfileOf } from './engine-steps.js'
import { placeTypedOf } from './gather-place.js'

/**
 * @param {{research: object, answers: object[]}} inputs the compose inputs
 * @param {{kit: object | null, reserve: () => Promise<null | {run: (fn: () => Promise<any>) => Promise<any>}>,
 *   modelOf: () => Promise<{model: Function, cost: () => {costCents?: number}}>}} tools `reserve`: the spend gate for
 *   the step `answers`; `modelOf`: the build model door with its own usage collector
 * @returns {Promise<Map<string, object> | null>} the readings by question id, null when none was made
 */
export async function answerReadingsOf({ research, answers }, { kit, reserve, modelOf }) {
  return readingsOf(planProfileOf(research, kit), answers, { reserve, modelOf })
}

/** The readings of `answers` to the questions of `profile`, or null when none was made (no typed answer, a refusal). */
async function readingsOf(profile, answers, { reserve, modelOf }) {
  if (!needsAnswerReading(profile, answers)) return null
  const spend = await reserve().catch(() => null)
  if (!spend) return null
  const ran = await spend
    .run(async () => {
      const door = await modelOf()
      const readings = await readOwnerAnswers({ profile, answers, model: door.model })
      return { readings, ...door.cost() }
    })
    .catch(() => null)
  return ran?.readings ?? null
}

/**
 * The offered choice a typed answer to one research question means (the place question, the business trade question),
 * read under the ledger step `answers`; null when there is no typed answer, the reading made none, or it was refused.
 * @param {object} question
 * @param {object} answer the stored answer, after `asChosen`
 * @param {{reserve: Function, modelOf: Function}} tools as `answerReadingsOf`
 */
export async function typedChoiceOf(question, answer, tools) {
  if (typeof answer?.text !== 'string' || !answer.text.trim()) return null
  const readings = await readingsOf({ questions: [question] }, [answer], tools)
  return readings?.get(question.id)?.choice ?? null
}

/**
 * The place a typed answer to research's place question means (`gather-place.js`), read by the same call under the
 * same ledger step: the offered choice id the model read (a place, or `none`), or null when there is no typed answer,
 * the reading made none, or it was refused or failed. Research then treats null as None of these, and the caller keeps
 * the owner's text with the owner's description (`placeStatementOf`).
 * @param {object | null} row the draft row
 * @param {string[]} links the links of the research about to run
 * @param {{reserve: Function, modelOf: Function}} tools as `answerReadingsOf`
 * @returns {Promise<string | null>}
 */
export async function placeReadingOf(row, links, tools) {
  const typed = placeTypedOf(row, links)
  return typed ? typedChoiceOf(typed.question, typed.answer, tools) : null
}

/**
 * The owner's description for a research whose typed place answer named no offered place: the typed text joins it, so
 * the business reading reads it as the owner's words (decision D46) instead of dropping it. As given otherwise.
 */
export function placeStatementOf(row, links, readChoice, description) {
  const typed = placeTypedOf(row, links)
  if (!typed || (readChoice && readChoice !== 'none')) return description
  return [description, typed.answer.text.trim()].filter((t) => typeof t === 'string' && t.trim()).join('\n\n')
}
