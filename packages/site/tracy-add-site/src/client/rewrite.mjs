/**
 * "AI rewrite" on each long-text question of the "Tell Tracy about your site" popup (the shared ask
 * form draws the button): the owner's words, said again in clearer words by
 * `POST /api/sites/brief/rewrite` (`apps/tracy-web/src/lib/brief-rewrite.js`).
 *
 * The length rules — at most ten words longer than what the owner wrote, about ten words for a sample, at
 * most fifty in all — are the server's to keep and it counts the answer before sending it, so what arrives
 * here is already inside them. This
 * file only turns the door's answers into the three things the popup can say about a miss.
 *
 * The path is relative on purpose, like every call in `create.ts`: dsh is served under the same
 * origin as the door, and an absolute origin would be a cross-origin call with no session cookie.
 *
 * Plain JavaScript so `node --test` runs it without a build step.
 */
import { tracyWebFetch } from '@tracy/core/web-path'

/**
 * @typedef {{ ok: true, text: string }
 *   | { ok: false, reason: 'unavailable' | 'limit' | 'failed' }} RewriteOutcome
 */

/**
 * Ask for a rewrite of `text`.
 * - `unavailable`: no text model is set on this deployment (503) — said as such, not as an error.
 * - `limit`: this person has used the hour's rewrites (429).
 * - `failed`: anything else, a dropped network included. The text in the box is never touched.
 * @param {string} text - may be empty: the door then answers with a sample sentence
 * @param {typeof tracyWebFetch} [fetchImpl]
 * @param {{ question?: string, again?: boolean }} [hint] - the question being answered; `again` when the text is what the last rewrite wrote
 * @returns {Promise<RewriteOutcome>}
 */
export async function rewriteAbout(text, fetchImpl = tracyWebFetch, { question = '', again = false } = {}) {
  let response
  try {
    response = await fetchImpl('/api/sites/brief/rewrite', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, question, again })
    })
  } catch {
    return { ok: false, reason: 'failed' }
  }
  if (response.status === 503) return { ok: false, reason: 'unavailable' }
  if (response.status === 429) return { ok: false, reason: 'limit' }
  if (!response.ok) return { ok: false, reason: 'failed' }
  /** @type {unknown} */
  let body = null
  try {
    body = await response.json()
  } catch {
    return { ok: false, reason: 'failed' }
  }
  const answer = body && typeof body === 'object' ? /** @type {{ text?: unknown }} */ (body).text : undefined
  return typeof answer === 'string' && answer.trim() !== ''
    ? { ok: true, text: answer.trim() }
    : { ok: false, reason: 'failed' }
}
