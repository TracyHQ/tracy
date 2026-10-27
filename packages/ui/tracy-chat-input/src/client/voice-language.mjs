/**
 * The language the conversation on screen is in, for the voice socket's hint (`voice-link.mjs`
 * `?language=`). David 15/10/2026: a chat's main language is that of its opening message; the agent
 * answers in it (`tracy-site-tools` `chatMainLanguage`, the same rule on the host), and dictation is
 * told it so a Vietnamese phrase with an English word in it stays Vietnamese (`relay.js`).
 *
 * Read from the session's own event window (`ctx.sessions.binding(id).eventSource`, the feed
 * `comment-status.mjs` follows): the first `user/message` a person wrote whose words read clearly in
 * one language (`messageLanguage`, `@tracy/core/language`) — a `/` command skipped, and a picked
 * element's block left out, as the host's `personWords` does. A window that does not reach back to the
 * opening message (`hasMore`) gives its oldest clear one. Once found, a conversation's language is kept
 * for the page's life, so a later scroll or reload of history never changes the hint mid-chat.
 *
 * While the chat has no clear message yet (its first words are being dictated), the hint is the
 * interface's language ({@link voiceHint}): measured 15/10/2026, an unhinted Vietnamese request that
 * ends in English came back EMPTY, and the hinted one whole.
 */
import { interfaceLocale } from '@tracy/core/interface-languages'
import { messageLanguage } from '@tracy/core/language'

/** A picked element's block and its door line, as the host cuts it (`prompter.mjs` `PICKED_ELEMENT`). */
const PICKED_BLOCK = /(^|\n)```tracy-(?:element|page)\n[\s\S]*?\n```(?:\n[^\n]*`tracy_site`[^\n]*)?(?=\n|$)/g
const MENTION_TAG = /<\/?mentioned-element\b[^>]*>/g
const KEPT_MAX = 500

/** @type {Map<string, string>} sessionId → its main language, once known. */
const kept = new Map()

/** @param {unknown} content @returns {string} */
function textOf(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .flatMap((part) => (part && typeof part === 'object' && typeof part.text === 'string' ? [part.text] : []))
    .join('\n')
}

/**
 * The main language of these event-window entries, oldest first. '' when none reads clearly.
 * @param {readonly unknown[] | undefined} entries - dsh `SessionEventWindow.entries`.
 * @returns {string}
 */
export function chatLanguageOf(entries) {
  if (!Array.isArray(entries)) return ''
  for (const entry of entries) {
    const event = /** @type {{ type?: unknown, event?: { type?: unknown, data?: any } }} */ (entry)
    if (event?.type !== 'event' || event.event?.type !== 'user/message') continue
    const data = event.event.data ?? {}
    const kind = data.source?.kind
    if (kind !== undefined && kind !== 'user') continue
    const text = textOf(data.content).trim()
    if (text === '' || text.startsWith('/')) continue
    const code = messageLanguage(text.replace(PICKED_BLOCK, '$1').replace(MENTION_TAG, ' '))
    if (code !== '') return code
  }
  return ''
}

/**
 * The main language of one conversation, read now from its live window (or kept from before).
 * @param {{ binding?(id: string): { eventSource?: { getSnapshot(): { entries?: readonly unknown[] } } } | undefined } | undefined} sessions
 * @param {string | undefined} sessionId
 * @returns {string}
 */
export function chatMainLanguage(sessions, sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') return ''
  const known = kept.get(sessionId)
  if (known) return known
  let entries
  try {
    entries = sessions?.binding?.(sessionId)?.eventSource?.getSnapshot()?.entries
  } catch {
    return ''
  }
  const found = chatLanguageOf(entries)
  if (found) {
    kept.set(sessionId, found)
    if (kept.size > KEPT_MAX) kept.delete(/** @type {string} */ (kept.keys().next().value))
  }
  return found
}

/**
 * The hint for one press: the chat's main language, else the interface's (Settings › Language, kept
 * in `<html lang>`), the best guess of what a person with no message yet speaks. The relay keeps only
 * a hint it was measured to help with, and drops it once it hears speech it makes nothing of.
 * @param {Parameters<typeof chatMainLanguage>[0]} sessions
 * @param {string | undefined} sessionId
 * @param {string | undefined} [interfaceTag]
 * @returns {string}
 */
export function voiceHint(sessions, sessionId, interfaceTag = interfaceLocale()) {
  return chatMainLanguage(sessions, sessionId) || (interfaceTag ?? '').split('-')[0].toLowerCase()
}
