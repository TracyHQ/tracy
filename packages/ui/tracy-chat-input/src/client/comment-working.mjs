/**
 * "Tracy working…" on a comment (Comments list redesign A, Akemi 01/10/2026): the comments a turn THIS
 * page watches is working on now. A Send to Tracy is filed by request id with the comments it came from
 * (`comment-send.mjs` `sentTurns`, `commentIds`), and the conversation's own feed says when that turn
 * starts, waits on a question card and ends (`comment-status.mjs`: `tracy:tracy-working`,
 * `tracy:tracy-asking`, `tracy:turn-end`, each `{sessionId, requestId, siteKey}`).
 *
 * 🔒 ONLY WHAT THIS PAGE SEES. The server does not know when a chat turn ends, so another person, or this
 * person on another machine, never sees "working" — their row says "Asked Tracy" (or "Done by Tracy"
 * once a write of Tracy's cited it). A turn waiting on the person's answer is not working; it is again
 * once they answer (the feed says `working` then).
 */
import { ASKING_EVENT, TURN_END_EVENT, WORKING_EVENT } from './comment-status.mjs'

/**
 * @typedef {{ get(requestId: string): { commentIds?: readonly string[] } | undefined }} SentTurnsLike
 */

/**
 * The working comments as a set, from the progress events heard on `target`.
 * @param {{ target: EventTarget, sentTurns: SentTurnsLike, onChange: (ids: ReadonlySet<string>) => void }} input
 * @returns {{ ids(): ReadonlySet<string>, stop(): void }}
 */
export function watchWorkingComments({ target, sentTurns, onChange }) {
  /** @type {Map<string, readonly string[]>} request id → its comments, while its turn works */
  const running = new Map()
  /** @type {ReadonlySet<string>} */
  let current = new Set()
  const publish = () => {
    current = new Set([...running.values()].flat())
    onChange(current)
  }
  /** @param {Event} event */
  const requestOf = (event) => {
    const d = /** @type {CustomEvent} */ (event).detail
    return d !== null && typeof d === 'object' && typeof d.requestId === 'string' ? d.requestId : null
  }
  /** @param {Event} event */
  const onWorking = (event) => {
    const id = requestOf(event)
    const ids = id === null ? undefined : sentTurns.get(id)?.commentIds
    if (id === null || ids === undefined || ids.length === 0) return
    running.set(id, [...ids])
    publish()
  }
  /** @param {Event} event */
  const onStop = (event) => {
    const id = requestOf(event)
    if (id === null || !running.delete(id)) return
    publish()
  }
  target.addEventListener(WORKING_EVENT, onWorking)
  target.addEventListener(ASKING_EVENT, onStop)
  target.addEventListener(TURN_END_EVENT, onStop)
  return {
    ids: () => current,
    stop() {
      target.removeEventListener(WORKING_EVENT, onWorking)
      target.removeEventListener(ASKING_EVENT, onStop)
      target.removeEventListener(TURN_END_EVENT, onStop)
    }
  }
}
