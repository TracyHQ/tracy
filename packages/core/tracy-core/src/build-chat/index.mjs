/**
 * The creation workspace's build chat (TracyHQ/tracy#602), as the browser recognises it.
 *
 * tracy-web opens it at `/new/build`, which sends the browser to `/new/s/<session>` for the account's
 * build session (`apps/tracy-web/src/build-chat/`). Only the signed seat door mints a session ID with
 * this prefix, and only with the build agent; the browser cannot choose one. So the ID is what tells a
 * plugin "this chat is the build chat": the creation workspace's Help-only composer
 * (`@tracy/dsh-assistant`) and its first-run block (`@tracy/dsh-chat-input`) stand aside for it.
 */

/** The door that opens the signed-in viewer's build chat. */
export const BUILD_CHAT_PATH = '/new/build'

const BUILD_SESSION = /^session-build-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Whether a session is a build chat session.
 * @param {unknown} sessionId
 * @returns {boolean}
 */
export function isBuildChatSession(sessionId) {
  return typeof sessionId === 'string' && BUILD_SESSION.test(sessionId)
}

/**
 * Whether a page shows a build chat: `<mount>/s/<build session>` in the creation workspace.
 * @param {string} pathname - `location.pathname`
 * @returns {boolean}
 */
export function isBuildChatPage(pathname) {
  const match = /^\/new\/s\/([^/?#]+)\/?$/.exec(typeof pathname === 'string' ? pathname : '')
  return match !== null && isBuildChatSession(match[1])
}

export {
  answerOf,
  ASK_STRINGS,
  askRequestOf,
  BUILD_CHAT_STRINGS,
  localizedAskOf,
  MAX_QUESTIONS_AT_ONCE,
  replyOf,
  researchRowOf,
  sentChoiceIdOf,
  textTooLongOf
} from './conversation.mjs'
export {
  answerTooLongSay,
  BUILD_DONE_SAY,
  BUILD_LOCKED_SAY,
  DESIGN_CHANGE_SAY,
  FAULT_SAY,
  nameTooLongSay,
  requestTooLongSay,
  RESEARCH_READ_SAY,
  SAY_STRINGS,
  TEAM_SEES_SAY,
  UNCHANGED_SAY
} from './owner-sentences.mjs'
export {
  approvalOf,
  changedFieldsOf,
  planCardOf,
  planChangeOf,
  planEditOf,
  planOfReviewId,
  PLAN_REVIEW_APPROVE,
  PLAN_REVIEW_CHANGE,
  planReviewIdOf,
  planReviewRequestOf
} from './plan.mjs'
export { plainTextOf } from './plain-text.mjs'
export {
  LINK_FOUND_STRINGS,
  LINK_READ_STRINGS,
  linkLineOf,
  linkNameOf,
  linkReadsOf,
  readingLinksOf
} from './link-reads.mjs'
export {
  cancelledOf,
  clockOf,
  progressOf,
  stoppedOf,
  templateChoiceOf,
  templateOfChoice
} from './progress.mjs'
export {
  buildHistoryFoldOf,
  HANDOFF_FENCE,
  HANDOFF_SCHEMA,
  HANDOFF_SOURCE,
  handoffFoldOf,
  handoffOfText,
  withoutHandoff
} from './handoff.mjs'
export {
  BUILD_TOOL,
  buildToolFoldOf,
  buildToolResultOf,
  buildToolRowOf,
  canRetryStop,
  isPlanReviewRequest,
  MAX_STEP_RETRIES,
  PLAN_REVIEW_ID,
  RETRY_MESSAGE,
  revisedOf
} from './tool-results.mjs'
