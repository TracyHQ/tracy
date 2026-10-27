/**
 * The start screen's Site changes count (plan `tasks/todo-site-changes-badge-count.md` §3): how many
 * of the site's changes this person has not looked at, read from `GET /api/sites/:key/activity/unseen`
 * — Postgres only, no Git, cheap enough to ask on every start screen.
 *
 * One number, one meaning, as the Comments count (`comment-unread.mjs`): the server keeps the
 * person's watermark, this store only asks and draws. It asks again when the site may have moved on:
 *   - `tracy:changes-seen` (window, from the Site changes tab in `@tracy/core/site-tabs` once its
 *     `PUT …/activity/seen` landed): this site → the count is 0 at once, then read back, so the card
 *     never shows a number the tab just took back;
 *   - `tracy:turn-end` (window, `comment-status.mjs`) on this site or on no named site;
 *   - the page shown again (`visibilitychange` → visible) and the window focused;
 *   - and every `everyMs` (a minute) while the page is shown: a teammate's chat turn and a wp-admin
 *     edit fire no event in THIS browser, so without a clock the card would only move on a focus or
 *     a reopen — the Inbox asks `/notifications/unread` on a clock for the same reason (ADR 0026 §6).
 * Null until the first answer (draw nothing — a 0 that then becomes 4 is a lie for a second); a failed
 * read keeps the last count; only the newest read may land; nothing lands after `stop()`.
 */
import { TURN_END_EVENT } from './comment-status.mjs'

/**
 * The tab's word that the list was looked at (`CHANGES_SEEN_EVENT` of `@tracy/core/site-tabs`
 * `activity-v2.ts`): `detail = {siteKey, seenAt}`. Spelled here too, as every cross-plugin event is —
 * the two bundles share no module instance.
 */
export const CHANGES_SEEN_EVENT = 'tracy:changes-seen'

/**
 * The round count's text on a start card: nothing at 0, the number to 9, `9+` above (plan §2.7). The
 * same rule as `badgeText` of `@tracy/core/site-tabs` `activity-v2.ts`, spelled here so this bundle
 * does not pull the whole site-tabs barrel (its views) in for one line.
 * @param {number} count
 */
export function badgeText(count) {
  if (!Number.isFinite(count) || count <= 0) return ''
  return count > 9 ? '9+' : String(Math.floor(count))
}

/**
 * @typedef {{ count: number, since: string, readAt: string, complete: boolean, pulling?: boolean }} UnseenChanges
 */

/**
 * The door, as this page calls every site door (`comment-reads.mjs`): same origin, the session
 * cookie. Anything but a 2xx with a numeric `count` is a failed read (the store keeps its number).
 * @param {string} siteKey
 * @returns {Promise<UnseenChanges>}
 */
export async function readUnseenChanges(siteKey) {
  const res = await fetch(`/api/sites/${encodeURIComponent(siteKey)}/activity/unseen`, {
    headers: { accept: 'application/json' },
    credentials: 'same-origin'
  })
  if (!res.ok) throw new Error(String(res.status))
  const body = /** @type {UnseenChanges} */ (await res.json())
  if (!body || typeof body.count !== 'number') throw new Error('no count')
  return body
}

/** How often the count is asked again while the page is shown; 0 = never on a clock. */
export const EVERY_MS = 60_000

/**
 * How long after an answer that says `pulling` (the door just started a fresh read of the CMS admin
 * log on the host) the store asks once more: a pull takes well under a second (0.32 s measured on
 * the badge stand), and a wp-admin edit should reach the card now, not at the next minute.
 */
export const PULL_SETTLE_MS = 2500

/**
 * @param {{ siteKey: string, read: () => Promise<UnseenChanges>, target?: EventTarget,
 *   doc?: EventTarget & { visibilityState?: string }, everyMs?: number }} deps
 * @returns {{ subscribe(fn: () => void): () => void, getSnapshot(): number | null, refresh(): void, stop(): void }}
 */
export function createChangesCount({ siteKey, read, target = window, doc = document, everyMs = EVERY_MS }) {
  /** @type {number | null} */
  let count = null
  /** @type {Set<() => void>} */
  const listeners = new Set()
  let newest = 0
  let stopped = false
  const publish = () => {
    for (const fn of listeners) fn()
  }
  /** @param {number} n */
  const set = (n) => {
    if (n === count) return
    count = n
    publish()
  }
  /**
   * The one follow-up ask after a `pulling` answer (`PULL_SETTLE_MS`); never more than one waiting.
   * @type {ReturnType<typeof setTimeout> | null}
   */
  let settle = null
  const refresh = () => {
    if (stopped) return
    const mine = ++newest
    read().then(
      (answer) => {
        if (stopped || mine !== newest) return
        const n = answer && typeof answer.count === 'number' ? answer.count : null
        if (n !== null) set(n)
        if (answer?.pulling === true && settle === null)
          settle = setTimeout(() => {
            settle = null
            refresh()
          }, PULL_SETTLE_MS)
      },
      () => {
        // A failed read keeps the last count: a badge that blinks out on a hiccup is noise.
      }
    )
  }
  /** @param {Event} event */
  const siteOf = (event) => {
    const d = /** @type {CustomEvent} */ (event).detail
    return d !== null && typeof d === 'object' && typeof d.siteKey === 'string' ? d.siteKey : null
  }
  /** @param {Event} event */
  const onSeen = (event) => {
    if (siteOf(event) !== siteKey) return
    set(0)
    refresh()
  }
  /** @param {Event} event */
  const onTurnEnd = (event) => {
    const site = siteOf(event)
    if (site !== null && site !== siteKey) return
    refresh()
  }
  const onVisible = () => {
    if (doc.visibilityState === 'hidden') return
    refresh()
  }
  const onFocus = () => refresh()
  target.addEventListener(CHANGES_SEEN_EVENT, onSeen)
  target.addEventListener(TURN_END_EVENT, onTurnEnd)
  target.addEventListener('focus', onFocus)
  doc.addEventListener('visibilitychange', onVisible)
  // A hidden page asks nothing: the answer would be stale by the time anyone looks, and `onVisible`
  // asks the moment it is shown again.
  const clock = everyMs > 0 ? setInterval(onVisible, everyMs) : null
  refresh()
  return {
    subscribe(fn) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    getSnapshot: () => count,
    refresh,
    stop() {
      stopped = true
      if (clock !== null) clearInterval(clock)
      if (settle !== null) clearTimeout(settle)
      listeners.clear()
      target.removeEventListener(CHANGES_SEEN_EVENT, onSeen)
      target.removeEventListener(TURN_END_EVENT, onTurnEnd)
      target.removeEventListener('focus', onFocus)
      doc.removeEventListener('visibilitychange', onVisible)
    }
  }
}
