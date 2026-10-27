/**
 * A conversation in Voice (`tracy-chat-input` `voice-mode.mjs`): the customer talks, and Tracy reads
 * the start of its reply out loud. This tells the agent so, once per turn the person speaks, so the
 * reply starts with what can be heard — not a markdown list cut off after twenty seconds (council
 * 17/10/2026: per-turn metadata and a rule on the host, never a block hidden in the customer's message,
 * so the chat after Voice stays exactly as typed).
 *
 * WHERE IT COMES FROM: THE WORDS THEMSELVES. Just before it sends what the person said, the page tells
 * the host those words through the `/view` door it already reports the open page with
 * (`readVoiceReport`; the seat gateway holds that door's `sessionId` to the seat's own sessions, so a
 * page can only say it of its own conversations), and waits for the answer. The step that takes a
 * message of the same words gets the rule, once (`spokenWords().take`). Bound to the message, not the
 * conversation (council 18/10/2026): a message typed in another tab or on another device never gets
 * it, and another tab leaving Voice never takes it from a message spoken here — what a flag per
 * conversation did. A steered message gets it at the step that takes it. Words not taken within
 * {@link VOICE_FRESH_MS} are forgotten.
 *
 * Kept pure so `test/voice-reply.test.mjs` can hold it.
 */
import { SESSION_ID } from './deploy-hold.mjs'
import { messageTextOf } from './prompter.mjs'

/** The notice producer of the spoken-reply rule (`noticeSource`, `site-context.mjs`). */
export const VOICE_REPLY_PLUGIN = 'tracy-site-tools:voice-reply'

/** How long words the page said it is about to send wait for the step that takes them. */
export const VOICE_FRESH_MS = 120_000

/** The most conversations remembered at once (one per open Voice view; a few per site). */
const VOICE_KEPT = 500

/** The most words remembered per conversation, waiting to be taken. */
const SPOKEN_KEPT = 20

/**
 * The most characters of a spoken message compared: what the page sends (within the `/view` door's
 * 4 KB body), and what the step reads.
 */
export const SPOKEN_CHARS = 1000

/** Words as compared: one form, single spaces, as long as the page sends. @param {string} text */
const sameForm = (text) => text.normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, SPOKEN_CHARS)

/**
 * The rule. The words came through speech recognition, which mishears names and numbers (on the stand
 * "Đổi tiêu đề" came as "Đời tiêu đệt", "Xanh lá" as "Xin lạ"): a value that does not fit the site is
 * asked about, not guessed, and the value used is said back (council 17/10/2026: a misheard request
 * must not become a change to the site). The page reads the first paragraph of the reply
 * (`voice-speak-text.mjs` `spokenReply`), and the speech service reads numbers and symbols badly
 * unless they are words (ElevenLabs: Flash v2.5 does no text normalisation), so the opening is
 * written for the ear.
 */
export const VOICE_REPLY =
  'The person is talking with you out loud (Voice): their words reached you through speech recognition, which can mishear names, numbers and prices. Before you write a spoken name, number, price, phone, email, address or date, check it makes sense for this site; when a word looks misheard and you cannot tell what was meant, ask instead of guessing, and say back the value you used. A change that is hard to take back or wide — deleting or hiding a page or post, a price, many places at once, the look of the whole site — is asked by the question Tracy shows when you make the call: make it first, say that question out loud and wait; never ask your own before it, or they answer twice. One no door asks, like removing a section of a page: say exactly what will change and ask; do it only after a clear yes. The first paragraph of your reply is read to them. Open with one or two short sentences, at most about 40 words, that say what you did or found, anything not done, and what you need from them. Write that opening to be heard: no markdown, list, link, file name, id or symbol, and numbers, prices and dates in words. Then a blank line, and any details for the chat.'

/**
 * A report from the page about Voice: `{ sessionId, spoken: "<the words>" }`, the words about to be
 * sent; or the older `{ sessionId, voice: true|false }` of a page loaded before this one, taken and
 * ignored, so it is never refused. Nothing else — the open page's own reports (`view.mjs`
 * `readViewReport`) never carry these.
 * @param {unknown} body
 * @returns {{ sessionId: string, spoken: string | null } | null}
 */
export function readVoiceReport(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null
  const b = /** @type {Record<string, unknown>} */ (body)
  if (typeof b.sessionId !== 'string' || !SESSION_ID.test(b.sessionId)) return null
  const keys = Object.keys(b).filter((key) => key !== 'sessionId')
  if (keys.length !== 1) return null
  if (keys[0] === 'voice' && typeof b.voice === 'boolean') return { sessionId: b.sessionId, spoken: null }
  if (keys[0] !== 'spoken' || typeof b.spoken !== 'string') return null
  const spoken = sameForm(b.spoken)
  return spoken === '' ? null : { sessionId: b.sessionId, spoken }
}

/**
 * Words the pages said they are about to send, per conversation, until the step that takes them.
 * @param {() => number} [now]
 */
export function spokenWords(now = Date.now) {
  /** @type {Map<string, { words: string, at: number }[]>} sessionId → words waiting, oldest first */
  const waiting = new Map()
  /** @param {string} sessionId */
  const fresh = (sessionId) => {
    const list = (waiting.get(sessionId) ?? []).filter((said) => now() - said.at <= VOICE_FRESH_MS)
    if (list.length === 0) waiting.delete(sessionId)
    else waiting.set(sessionId, list)
    return list
  }
  return {
    /** @param {string} sessionId @param {string} words */
    mark(sessionId, words) {
      const list = [...fresh(sessionId), { words: sameForm(words), at: now() }].slice(-SPOKEN_KEPT)
      waiting.delete(sessionId)
      waiting.set(sessionId, list)
      // The oldest conversation goes first when too many are kept.
      while (waiting.size > VOICE_KEPT) waiting.delete(/** @type {string} */ (waiting.keys().next().value))
    },
    /**
     * Whether this message is words a page said it was sending: true once, and they are taken.
     * @param {string} sessionId
     * @param {unknown} content - the message's content (blocks) or its text
     */
    take(sessionId, content) {
      const words = sameForm(messageTextOf(content))
      if (words === '') return false
      const list = fresh(sessionId)
      const i = list.findIndex((said) => said.words === words)
      if (i < 0) return false
      list.splice(i, 1)
      if (list.length === 0) waiting.delete(sessionId)
      return true
    }
  }
}

/**
 * The spoken-reply rule for a message the person said in Voice — or null when it was not spoken, or
 * carries no words.
 * @param {unknown} content - a `user/message`'s content (blocks) or its text.
 * @param {boolean} inVoice - the page said it was sending these words (`spokenWords().take`)
 * @returns {{ text: string, summary: string } | null}
 */
export function voiceReplyRule(content, inVoice) {
  if (!inVoice || messageTextOf(content).trim() === '') return null
  return { text: VOICE_REPLY, summary: 'Reply to be read out loud (Voice)' }
}
