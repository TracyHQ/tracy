// The business trade question (#575): when research could not tell what kind of business it is (no category from any
// source, no word of its name, its own pages or its owner names a trade), the build chat asks the owner instead of
// offering no template. One choice per trade the template catalogue offers designs for, then "Something else"; what
// the owner types is read by the answer reading (`answer-reading.mjs`), which may only name one of the offered
// choices. A Contract B question on the topic `business-trade`, made by the same helper as the needs profile's. Pure.
import { TYPED_ANSWER_MAX_LENGTH } from './build-contract-questions.mjs'
import { contractQuestionOf } from './needs-profile-questions.mjs'
import { TRADES } from './trades.mjs'

export const BUSINESS_TRADE_TOPIC = 'business-trade'
export const BUSINESS_TRADE_QUESTION_ID = 'business-trade'
/** The choice for a business none of the offered trades fits. */
export const BUSINESS_TRADE_OTHER = 'other'
export const BUSINESS_TRADE_PROMPT = 'What kind of business is it?'

/** The English label of each trade's button (the chat words it in the owner's language by its code). */
export const TRADE_LABELS = Object.freeze({
  food: 'Food and drink',
  beauty: 'Beauty',
  health: 'Health',
  fitness: 'Sports and fitness',
  hospitality: 'Hotel or stay',
  travel: 'Travel',
  professional: 'Professional services',
  creative: 'Creative work',
  education: 'Education',
  retail: 'Shop',
  auto: 'Cars and vehicles',
  home: 'Home services',
  events: 'Events',
  nonprofit: 'Non profit',
  other: 'Something else'
})

/**
 * The question for the trades the catalogue offers (`offered`, trade codes; unknown ones and `other` are left out).
 * @param {string[]} offered
 */
export function businessTradeQuestionOf(offered) {
  const trades = [
    ...new Set((Array.isArray(offered) ? offered : []).filter((t) => TRADES.includes(t)))
  ].filter((t) => t !== BUSINESS_TRADE_OTHER)
  const choices = [...trades, BUSINESS_TRADE_OTHER].map((trade) => ({
    id: trade,
    label: TRADE_LABELS[trade],
    code: `business_trade_${trade}`,
    params: {}
  }))
  return {
    ...contractQuestionOf(
      BUSINESS_TRADE_TOPIC,
      BUSINESS_TRADE_PROMPT,
      choices,
      null,
      TYPED_ANSWER_MAX_LENGTH,
      {
        code: 'business_trade'
      }
    ),
    id: BUSINESS_TRADE_QUESTION_ID
  }
}

/**
 * The trade an answer to the question gives: the chosen trade (an exact choice, or the choice the answer reading read
 * in typed text, `readChoice`), or null for "Something else", no answer, or a typed text nothing was read in.
 * @param {object} question the business trade question
 * @param {{choice?: string} | null | undefined} answer as stored, after `asChosen`
 * @param {string | null} [readChoice]
 */
export function tradeOfAnswer(question, answer, readChoice = null) {
  const choice = answer?.choice ?? readChoice
  const offered = (question?.choices ?? []).some((c) => c?.id === choice)
  return offered && choice !== BUSINESS_TRADE_OTHER ? choice : null
}
