/**
 * The unseen-changes count, told to the right column (plan `tasks/todo-site-changes-badge-count.md`
 * §4): the Site changes tab of `@tracy/dsh-site-tabs` draws the same number the start card draws —
 * this page's store (`changes-count.mjs`) says it, the tab only listens, exactly as the Browser
 * toolbar's "Comments N" comes from `comment-unread.mjs`. Two window events, the same shape:
 *
 *   out  `tracy:changes-unseen` {siteKey, count: number | null} — every time the number changes;
 *        null until the first answer (the tab then draws nothing, as the card does).
 *   in   `tracy:changes-unseen-state` {siteKey, count?} — a tab that mounts after the last change
 *        asks, synchronously; this page sets `detail.count` when the site is this one. Nobody
 *        answering leaves it unset (no number).
 */

/** The window event this page sends the count in (`@tracy/dsh-site-tabs` `UNSEEN_EVENT`). */
export const UNSEEN_EVENT = 'tracy:changes-unseen'
/** The window event the tab asks the count with (`@tracy/dsh-site-tabs` `UNSEEN_STATE_EVENT`). */
export const UNSEEN_STATE_EVENT = 'tracy:changes-unseen-state'

/**
 * Say the count on `target` whenever the store changes it, and answer the tab's asks for this site.
 * @param {{ store: { subscribe(fn: () => void): () => void, getSnapshot(): number | null },
 *   siteKey: string, target: EventTarget }} deps
 * @returns {() => void} stop saying and answering.
 */
export function tellChangesCount({ store, siteKey, target }) {
  /** @type {number | null | undefined} */
  let said
  const say = () => {
    const count = store.getSnapshot()
    if (count === said) return
    said = count
    target.dispatchEvent(new CustomEvent(UNSEEN_EVENT, { detail: { siteKey, count } }))
  }
  /** @param {Event} event */
  const answer = (event) => {
    const detail = /** @type {CustomEvent} */ (event).detail
    if (detail === null || typeof detail !== 'object') return
    if (typeof detail.siteKey === 'string' && detail.siteKey !== siteKey) return
    detail.count = store.getSnapshot()
  }
  const stop = store.subscribe(say)
  target.addEventListener(UNSEEN_STATE_EVENT, answer)
  say()
  return () => {
    stop()
    target.removeEventListener(UNSEEN_STATE_EVENT, answer)
  }
}
