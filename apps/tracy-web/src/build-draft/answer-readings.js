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

/**
 * @param {{research: object, answers: object[]}} inputs the compose inputs
 * @param {{kit: object | null, reserve: () => Promise<null | {run: (fn: () => Promise<any>) => Promise<any>}>,
 *   modelOf: () => Promise<{model: Function, cost: () => {costCents?: number}}>}} tools `reserve`: the spend gate for
 *   the step `answers`; `modelOf`: the build model door with its own usage collector
 * @returns {Promise<Map<string, object> | null>} the readings by question id, null when none was made
 */
export async function answerReadingsOf({ research, answers }, { kit, reserve, modelOf }) {
  const profile = planProfileOf(research, kit)
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
