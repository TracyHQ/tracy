/**
 * The Comments badge, told to the Browser tab (Akemi 02/10/2026; open count and unread dot, Lee
 * 04/10/2026): the toolbar's "Comments N" (fork `dsh-better-sidebar`, `CommentsButton`) draws the same
 * badge as the Comments tab and the start screen's Comments card — the site's open threads as the grey
 * number, and a red dot while this person has unread ones ({@link commentBadge}). The read marks live
 * here only (`comment-reads.mjs`), so this page says both numbers and the fork never counts them again.
 * Two window events, the way the Refresh button already asks `tracy:turn-state`:
 *
 *   out  `tracy:comment-unread` {count: number | null, open: number} — every time EITHER number changes
 *        (a person's own new comment raises `open` and leaves `count` alone, and the toolbar must still
 *        move). `count` is this person's unread open threads, null until the read marks are in (the fork
 *        then draws no dot); `open` is every open thread of the site, all authors (no number at 0).
 *        Both come from one snapshot.
 *   in   `tracy:comment-unread-state` {count?, open?} — a toolbar that mounts after the last change asks,
 *        synchronously; this page sets `detail.count` and `detail.open`. Nobody answering leaves them
 *        unset (no number, no dot).
 *
 * An older fork reads `count` only; a newer fork hearing an event with no `open` (an older chat input)
 * draws `count` as the number, with no dot.
 */
import { commentBadge } from './comment-view.mjs'

/** The window event this page sends the badge in (fork `COMMENT_UNREAD_EVENT`). */
export const UNREAD_EVENT = 'tracy:comment-unread'
/** The window event the Browser tab asks the badge with (fork `COMMENT_UNREAD_STATE_EVENT`). */
export const UNREAD_STATE_EVENT = 'tracy:comment-unread-state'

/**
 * Say the badge's two numbers on `target` whenever the lists change either, and answer the Browser
 * tab's asks.
 * @param {{ lists: { subscribe(fn: () => void): () => void, getSnapshot(): import('./comment-view.mjs').ListsSnapshot },
 *   target: EventTarget }} deps
 * @returns {() => void} stop saying and answering.
 */
export function tellUnreadCount({ lists, target }) {
  /** @type {{ count: number | null, open: number } | undefined} */
  let said
  const now = () => {
    const { open, unread } = commentBadge(lists.getSnapshot())
    return { count: unread, open }
  }
  const say = () => {
    const next = now()
    if (said !== undefined && said.count === next.count && said.open === next.open) return
    said = next
    target.dispatchEvent(new CustomEvent(UNREAD_EVENT, { detail: { ...next } }))
  }
  /** @param {Event} event */
  const answer = (event) => {
    const detail = /** @type {CustomEvent} */ (event).detail
    if (detail === null || typeof detail !== 'object') return
    const { count, open } = now()
    detail.count = count
    detail.open = open
  }
  const stop = lists.subscribe(say)
  target.addEventListener(UNREAD_STATE_EVENT, answer)
  say()
  return () => {
    stop()
    target.removeEventListener(UNREAD_STATE_EVENT, answer)
  }
}
