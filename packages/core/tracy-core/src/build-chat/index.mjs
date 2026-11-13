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
  askRequestOf,
  BUILD_CHAT_STRINGS,
  MAX_QUESTIONS_AT_ONCE,
  replyOf,
  researchRowOf
} from './conversation.mjs'
