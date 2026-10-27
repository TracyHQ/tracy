/**
 * The count on the Site changes tab in the right column (plan `tasks/todo-site-changes-badge-count.md`
 * §4): the same number the start card shows, said by the chat column's store
 * (`@tracy/dsh-chat-input` `changes-unseen.mjs`) over two window events — never counted here.
 *
 *   `tracy:changes-unseen`       {siteKey, count: number | null} — the chat column's word, on every change
 *   `tracy:changes-unseen-state` {siteKey, count?}               — this tab's ask on start, answered in place
 *
 * The fork's tab descriptor `badge` is read on render only, so the number is kept here and a change
 * is told to the fork with `invalidateTabBadges()` (dsh-better-sidebar 0.21.1-tracy.69, feature
 * `tabBadgeInvalidation`): every chip of the type re-reads `badge`. An older fork has no such door
 * and draws no badge on a native chip at all, so there is nothing to nudge.
 */

/** The chat column's event with the count (`changes-unseen.mjs` `UNSEEN_EVENT`). */
export const UNSEEN_EVENT = 'tracy:changes-unseen'
/** The ask this tab sends on start (`changes-unseen.mjs` `UNSEEN_STATE_EVENT`). */
export const UNSEEN_STATE_EVENT = 'tracy:changes-unseen-state'

/** @type {Map<string, number | null>} the last count said per site */
const counts = new Map()

/**
 * The count the chat column last said for a site; null when it never said, or said null.
 * @param {string | null} siteKey
 */
export function unseenCountFor(siteKey) {
  if (siteKey === null) return null
  return counts.get(siteKey) ?? null
}

/**
 * What the tab draws: the number above 0, nothing otherwise (the fork caps a number at 99+).
 * @param {string | null} siteKey
 */
export function unseenBadgeOf(siteKey) {
  const n = unseenCountFor(siteKey)
  return typeof n === 'number' && n > 0 ? n : null
}

/** Test seam. */
export function resetUnseenCounts() {
  counts.clear()
}

/**
 * Keep the count of `siteKey` and tell the fork whenever it changes, so the tabs re-read `badge`.
 * The sidebar is typed as a plain object: the fork's published BetterSidebar type does not declare
 * invalidateTabBadges yet, so the method is looked up at run time.
 * @param {{ target: EventTarget, siteKey: string, sidebar: object }} deps
 * @returns {() => void} stop listening.
 */
export function watchChangesUnseen({ target, siteKey, sidebar: host }) {
  const sidebar = /** @type {{ invalidateTabBadges?: () => void }} */ (host)
  /** @param {number | null} count */
  const keep = (count) => {
    if (counts.get(siteKey) === count) return
    counts.set(siteKey, count)
    if (typeof sidebar.invalidateTabBadges === 'function') sidebar.invalidateTabBadges()
  }
  /** @param {Event} event */
  const onSaid = (event) => {
    const detail = /** @type {CustomEvent} */ (event).detail
    if (detail === null || typeof detail !== 'object' || detail.siteKey !== siteKey) return
    keep(typeof detail.count === 'number' ? detail.count : null)
  }
  target.addEventListener(UNSEEN_EVENT, onSaid)
  // The chat column may have said the number before this tab mounted: ask once, in place.
  const ask = new CustomEvent(UNSEEN_STATE_EVENT, { detail: { siteKey } })
  target.dispatchEvent(ask)
  const first = /** @type {{ count?: unknown }} */ (ask.detail).count
  if (typeof first === 'number') keep(first)
  return () => {
    target.removeEventListener(UNSEEN_EVENT, onSaid)
  }
}
