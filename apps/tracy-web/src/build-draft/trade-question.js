/**
 * The business trade question of the build chat (#575): research that ends with no trade (`research-trade.js` found
 * none in any source nor in the owner's words) asks the owner what kind of business it is, with a button for each trade
 * the template catalogue offers designs for (`kits.trades`) and a free text the answer reading reads (ledger step
 * `answers`). The answer is the trade the template list is offered for; it is kept on the research record once read,
 * so a typed answer is read once.
 */
import { asChosen, businessTradeQuestionOf, TRADES, tradeOfAnswer } from 'website-opportunities/domain'
import { typedChoiceOf } from './answer-readings.js'

/**
 * The research record as the draft keeps it: with the trade question when research found no trade.
 * @param {object} record the research step's record
 * @param {{trades?: () => string[]}} kits the AI quickstart catalogue
 */
export function withTradeQuestion(record, kits) {
  if (typeof record?.trade === 'string' || !record) return record
  const offered = typeof kits?.trades === 'function' ? kits.trades() : TRADES
  return { ...record, tradeQuestion: businessTradeQuestionOf(offered) }
}

/** The trade question research asks, while its trade is unknown, else null. */
export const tradeQuestionOf = (research) =>
  research && typeof research.trade !== 'string' && research.tradeQuestion ? research.tradeQuestion : null

/**
 * The trade the owner's answer to the trade question gives: the chosen button, or the choice the answer reading read in
 * a typed answer; null with no answer, "Something else", or a typed answer nothing was read in.
 * @param {object | null} row the draft row
 * @param {{reserve: Function, modelOf: Function}} tools the answer reading's spend gate and model door
 */
export async function answeredTradeOf(row, tools) {
  const question = tradeQuestionOf(row?.research)
  if (!question) return null
  const stored = (Array.isArray(row?.answers) ? row.answers : []).find((a) => a?.question === question.id)
  if (!stored) return null
  const answer = asChosen(stored, question)
  if (answer.choice) return tradeOfAnswer(question, answer)
  return tradeOfAnswer(question, null, await typedChoiceOf(question, answer, tools))
}
