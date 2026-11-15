/**
 * Sentences of the build chat that more than one place says to the owner (TracyHQ/tracy#613).
 *
 * The door (`apps/tracy-web`) and the tool (`@tracy/dsh-build-chat`) both answer the owner in these cases, so the
 * words live here once and both import them. Plain English for a business owner, no dashes. Pure on purpose.
 */

/** The end of every sentence that says a fault reached the Tracy team. */
export const TEAM_SEES_SAY = 'The Tracy team can see what happened and will look into it.'

/** Said when a step stopped with a fault of ours and no more specific sentence applies. */
export const FAULT_SAY = `Something went wrong on our side, so I stopped here. ${TEAM_SEES_SAY}`

/** Said when the plan is asked for again, with no request, on a draft that already holds a plan. */
export const UNCHANGED_SAY =
  'Your plan is unchanged. You can change any value on the card, tell me what to change, or ask me to start the plan over.'

/** Said when a plan edit would move the living plan to another design. */
export const DESIGN_CHANGE_SAY =
  'This plan was made for the design you chose, and it cannot be moved to another design yet.'

/** Said when the owner asks for a change while the site is being built from the approved plan. */
export const BUILD_LOCKED_SAY =
  'Your site is being built from the plan you approved, so the plan cannot change until the build ends.'

/** Said when the build ended with the site ready. */
export const BUILD_DONE_SAY =
  'Your site is ready. You can see it in the Browser tab, and you can ask me here for any change.'

/** @param {number} limit */
export const nameTooLongSay = (limit) =>
  `That name is too long for this design. Please use ${limit} characters or fewer.`

/** @param {number} limit */
export const answerTooLongSay = (limit) => `That answer is too long. Please use ${limit} characters or fewer.`

/** @param {number} limit */
export const requestTooLongSay = (limit) =>
  `That request is too long. Please use ${limit} characters or fewer.`
