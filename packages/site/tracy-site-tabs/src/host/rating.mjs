/**
 * A Good or Bad on Tracy's answer, sent to the turn it answered (#1403 item 13).
 *
 * dsh's message feedback (the thumbs under an answer) lands in the conversation's own log only —
 * `feedback/message-put` / `feedback/message-delete` — so it could not be measured beside the turns
 * tracy-web keeps. The host half hears it (`session/event` for an open conversation, `feedback/committed`
 * for one dsh had not loaded), finds the turn whose answer was rated and who typed that turn, and tells
 * tracy-web (`POST /api/sites/:key/turn/rating`, signed as that person, as `/moment` is). Only the rating
 * and its categories travel: the note a person may write stays in the conversation.
 */
import { latestPrompter } from '../../../../tools/tracy-site-tools/src/host/prompter.mjs'

const RATINGS = new Set(['positive', 'negative'])

/**
 * What a feedback event says, or null for any other event.
 * @param {{ type?: unknown, data?: any } | null | undefined} event
 * @returns {{ messageId: string, rating: 'positive' | 'negative' | null, categories: string[] } | null}
 */
export function ratingOf(event) {
  if (event?.type === 'feedback/message-put') {
    const item = event.data?.item
    if (typeof item?.messageId !== 'string' || !RATINGS.has(item.rating)) return null
    const categories = Array.isArray(item.categories)
      ? item.categories.filter((/** @type {unknown} */ c) => typeof c === 'string')
      : typeof item.category === 'string'
        ? [item.category]
        : []
    return { messageId: item.messageId, rating: item.rating, categories }
  }
  if (event?.type === 'feedback/message-delete' && typeof event.data?.messageId === 'string')
    return { messageId: event.data.messageId, rating: null, categories: [] }
  return null
}

/**
 * The turn whose answer is `messageId`, and who typed the request that opened it: the latest message a
 * person sent before that answer. Null when the log holds no such answer or nobody with an address typed.
 * @param {readonly { type?: string, data?: any }[]} events
 * @param {string} messageId
 * @returns {{ turn: number, email: string } | null}
 */
export function ratedTurn(events, messageId) {
  if (!Array.isArray(events)) return null
  const at = events.findIndex((e) => e?.type === 'assistant/message' && e.data?.message?.id === messageId)
  if (at < 0) return null
  const turn = events[at].data?.turn
  if (!Number.isInteger(turn)) return null
  const who = latestPrompter(events.slice(0, at))
  return who ? { turn, email: who.email } : null
}
