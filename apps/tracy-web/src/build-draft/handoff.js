/**
 * The first message of the new site's chat once the build chat's build is done (#611). The site chat is opened ahead
 * of time on the site (`lib/site-session-ahead.js`, the mechanism the Website Opportunities hand off uses), and this
 * message is queued in it as the owner: ONE fenced `tracy-build-handoff` block, one JSON line, holding the whole
 * earlier conversation, the approved plan the build ran (the build's frozen snapshot, never the browser's copy) and a
 * note that tells the site agent what the block is. The model reads all of it, so the site agent knows how the site
 * was built; the site chat draws the conversation and the plan from it (`@tracy/core/build-chat` `handoffOfText`,
 * `@tracy/dsh-build-chat`), and dsh folds the raw block into a chip.
 *
 * The block is the product's own words to the agent, so it is English whatever the owner's language, as the revert
 * block of Site changes is. Pure.
 */

/** The fence and schema `@tracy/core/build-chat` reads (`HANDOFF_FENCE`, `HANDOFF_SCHEMA`). */
export const HANDOFF_FENCE = 'tracy-build-handoff'
export const HANDOFF_SCHEMA = 'tracy-build-handoff/v1'

/** At most this many messages, each at most this long: a build chat is a few dozen. */
export const MAX_MESSAGES = 400
export const MAX_TEXT = 40_000

const ROLES = new Set(['user', 'assistant'])

/**
 * The conversation a hand off request names, as `{role, text}` in order, or null when it is not one.
 * @param {unknown} value
 */
export function conversationOf(value) {
  if (!Array.isArray(value) || value.length > MAX_MESSAGES) return null
  const out = []
  for (const m of value) {
    if (!ROLES.has(m?.role) || typeof m.text !== 'string' || m.text.length > MAX_TEXT) return null
    const text = m.text.trim()
    if (text !== '') out.push({ role: m.role, text })
  }
  return out
}

/** What the site agent is told the block is. Plain English, no dashes. */
export const HANDOFF_NOTE =
  'This site was just built from this conversation and this plan, in the build chat before the site existed. ' +
  'The owner continues here. Use them as what the owner already said and approved. Do not change the site now. ' +
  "Answer in the owner's language in one or two short sentences: the site is ready, the Browser tab shows it, " +
  'and they can ask you here for any change.'

/**
 * The first message of the site chat.
 * @param {{conversation: {role: string, text: string}[], plan: object, siteKey: string, name?: string | null}} input
 * @returns {string}
 */
export function handoffMessageOf({ conversation, plan, siteKey, name = null }) {
  const value = {
    schema: HANDOFF_SCHEMA,
    note: HANDOFF_NOTE,
    site: { siteKey, ...(name ? { name } : {}) },
    conversation,
    plan
  }
  // One JSON line: no line of it can close the fence.
  return `\`\`\`${HANDOFF_FENCE}\n${JSON.stringify(value)}\n\`\`\``
}

/**
 * Where the screen moves: the site's own workspace on the chat made ahead, with the Browser tab opened on the live
 * site's home page (`?open=browser&page=/`, the deep link `@tracy/dsh-site-tabs` reads).
 * @param {string} siteKey
 * @param {string} sessionId
 */
export function handoffNextOf(siteKey, sessionId) {
  const query = new URLSearchParams({ open: 'browser', page: '/' })
  return `/${encodeURIComponent(siteKey)}/s/${encodeURIComponent(sessionId)}?${query.toString()}`
}
