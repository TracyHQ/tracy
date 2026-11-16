/**
 * The action `start-over` of `tracy_build` (`build-tool.mjs`): the owner asked to start the whole build over, not only
 * the plan. A first call without `confirm` asks the owner in plain words; only a call with `confirm: true`, made after
 * the owner said yes, reaches tracy-web's `POST /api/build-draft/start-over`, which discards the draft and moves the
 * account to a new, empty build conversation (`apps/tracy-web/src/build-draft/fresh-start.js`).
 */

/** Said before a start over; kept word for word equal to tracy-web's `START_OVER_SAY.confirm`. Plain English, no dashes. */
export const START_OVER_CONFIRM_SAY =
  'This discards what Tracy has gathered so far. A site already built is not affected.'

/** Said when the door answered no sentence of its own. */
export const START_OVER_DONE_FALLBACK_SAY =
  'What I gathered so far is discarded. Open the build chat again to start a new conversation.'

/** Said when the door refused with no sentence of its own. */
export const START_OVER_REFUSED_FALLBACK_SAY =
  'I cannot start over right now. You can continue in this conversation.'

/** The answer of a first call: the question for the owner, never a start over. */
export function startOverQuestion() {
  return {
    confirm: true,
    say: START_OVER_CONFIRM_SAY,
    next: 'Say the sentence in say and ask the owner whether to start over. Only when the owner clearly says yes, call tracy_build with action start-over and confirm true. Otherwise continue as before.'
  }
}

/**
 * The tool's answer to the door's reply.
 * @param {{status: number, body?: any}} res
 * @param {(said: unknown, fallback: string) => string} ownerSay - the tool's own check of a door sentence
 */
export function startOverAnswerOf(res, ownerSay) {
  if (res.status >= 200 && res.status < 300)
    return {
      startedOver: true,
      open: typeof res.body?.open === 'string' ? res.body.open : '/new/build',
      say: ownerSay(res.body?.say, START_OVER_DONE_FALLBACK_SAY),
      next: 'Say the sentence in say, then stop. This conversation is closed: do not call tracy_build again here.'
    }
  return {
    refused: true,
    say: ownerSay(res.body?.say, START_OVER_REFUSED_FALLBACK_SAY),
    next: 'Say the sentence in say. Nothing was discarded; continue as before.'
  }
}
