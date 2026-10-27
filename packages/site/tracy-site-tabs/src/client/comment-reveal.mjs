/**
 * "Open comment" lands ON the comment's thread (W-F2, W-F3; Brian 02/10 ~23:0x).
 *
 * A Site changes row opens the Browser tab on the comment's page in Edit (`openBrowserLink`), and
 * this module then asks that tab to show the comment: scroll to it and open its thread card. Two
 * roads end here: a press inside Tracy (the row's `onOpen`), and an address that carries
 * `?open=browser&page=…&mode=edit&comment=<id>` (a new window, a pasted link, ⋮ Copy link).
 *
 * WHY NOT THE BROWSER TAB'S OWN `comment=`. `dsh-better-sidebar` reads `comment=` ONCE, when a
 * Browser tab mounts, and only one tab per page may take it (`commentLinkTaken`). Brian measured the
 * result on the wave stand: the page opened, the thread did not (W-F2) — the e2e only checked that
 * the href carried the id. Whichever tab took the parameter, a mount before the side card was bound
 * to the conversation on screen, a tab kept behind another conversation, or the cover still up, the
 * one shot was spent. So this side drives it by what it can SEE, with no change to the fork:
 *
 *   1. it waits for the tab of the conversation on screen to list the site's comments
 *      (`tracy:comment-list`, `active: true`) — the comments overlay has mounted and read the list;
 *   2. it waits for that tab to show the comment's own page (`url`), and for Tracy's boot cover to
 *      lift, then sends `tracy:comment-act` `reveal` — the act the chat column's Comments view uses;
 *   3. done when the list names the comment's thread as the open one (`thread`); a reveal that did
 *      not take is asked again, a bounded number of times, never while the page is still loading
 *      (a reveal on another page navigates, and asking again would restart that load).
 *
 * A comment the list never holds (deleted since, another site) opens nothing more once the deadline
 * passes: the page is open, which is what the press could still give. No console error either way.
 *
 * Pure, with the window handed in, so `test/comment-reveal.test.mjs` holds these rules in Node.
 */

export const COMMENT_PARAM = 'comment'

/** `dsh-better-sidebar` `comment-store.ts` — re-declared: a Tracy plugin does not import the fork. */
export const COMMENT_LIST_EVENT = 'tracy:comment-list'
export const COMMENT_ACT_EVENT = 'tracy:comment-act'

/** A comment id as the server mints it (a uuid, or the fork's `srv-…`); anything else is ignored. */
const COMMENT_ID = /^[A-Za-z0-9._:-]{1,128}$/

/** How long the whole reveal may wait: the page boots, the tab opens, the list arrives. */
export const REVEAL_DEADLINE_MS = 30_000
/** How often the tabs are asked for their list, and a reveal that did not take is asked again. */
export const REVEAL_TICK_MS = 1_000
/** Reveals sent at most. */
export const MAX_REVEALS = 4
/** How long the tab may show another page before the reveal itself is asked to load the right one. */
export const OTHER_PAGE_GRACE_MS = 4_000

/**
 * `tracy-chat-input`'s Comments row pressed while no Browser tab holds its comment (`comment-open.mjs`
 * there, Brian 03/10/2026): open the tab on the comment's page and land on its thread, the road
 * "Open comment" takes. Re-declared: plugins share no imports.
 */
export const COMMENT_OPEN_EVENT = 'tracy:comment-open'

/**
 * A well-formed `tracy:comment-open` detail, or null.
 * @param {unknown} detail
 * @returns {{ id: string, url: string } | null}
 */
export function readCommentOpen(detail) {
  if (detail === null || typeof detail !== 'object') return null
  const { id, url } = /** @type {{ id?: unknown, url?: unknown }} */ (detail)
  if (typeof id !== 'string' || !COMMENT_ID.test(id)) return null
  return typeof url === 'string' && url !== '' ? { id, url } : null
}

/**
 * @param {string} search - `location.search`.
 * @returns {string | null} the comment an address asks for, or null.
 */
export function readCommentParam(search) {
  const value = new URLSearchParams(search).get(COMMENT_PARAM)
  return value !== null && COMMENT_ID.test(value) ? value : null
}

/**
 * The same search without `comment` (one-use: a reload must not reveal again).
 * @param {string} search
 * @returns {string} '' when nothing is left, else starting with '?'.
 */
export function stripCommentParam(search) {
  const params = new URLSearchParams(search)
  params.delete(COMMENT_PARAM)
  const rest = params.toString()
  return rest ? `?${rest}` : ''
}

/**
 * @typedef {{ id: string, url: string, replyTo?: string }} ListedComment
 * @typedef {{ sessionId?: string, tabId?: string, active?: boolean, url?: string | null,
 *   comments?: ListedComment[], thread?: string | null }} ListDetail
 * @typedef {{
 *   target: { addEventListener: EventTarget['addEventListener'], removeEventListener: EventTarget['removeEventListener'],
 *     dispatchEvent: (event: Event) => boolean },
 *   event: (type: string, detail: unknown) => Event,
 *   mainSession: () => string | undefined,
 *   covered?: () => boolean,
 *   now: () => number,
 *   every: (fn: () => void, ms: number) => () => void,
 *   done?: (outcome: 'shown' | 'timeout') => void,
 *   openComments?: (sessionId: string) => void
 * }} Page
 */

/**
 * Show comment `id` in the Browser tab of the conversation on screen, once it can.
 * @param {string} id
 * @param {Page} page
 * @returns {() => void} stop waiting.
 */
export function revealComment(id, page) {
  /** @type {ListDetail | null} the latest list of the tab on screen. */
  let latest = null
  /** When the tab on screen was first seen on another page than the comment's. */
  let elsewhereSince = /** @type {number | null} */ (null)
  let reveals = 0
  let lastReveal = -Infinity
  let finished = false
  let stopTicking = () => {}
  const end = page.now() + REVEAL_DEADLINE_MS

  const finish = (/** @type {'shown' | 'timeout'} */ outcome) => {
    if (finished) return
    finished = true
    page.target.removeEventListener(COMMENT_LIST_EVENT, onList)
    stopTicking()
    page.done?.(outcome)
  }

  const step = () => {
    if (finished) return
    if (page.now() >= end) return finish('timeout')
    const list = latest
    if (list === null || list.sessionId !== page.mainSession()) return
    const comments = Array.isArray(list.comments) ? list.comments : []
    const comment = comments.find((c) => c?.id === id)
    // Not listed (yet): the first list can come before the server's; a deleted one waits out the deadline.
    if (comment === undefined) return
    const root = comments.find((c) => c?.id === (comment.replyTo ?? comment.id)) ?? comment
    if (list.thread === root.id) {
      // The thread card alone left the chat column where it was — the site's start screen on a cold
      // open (dev acceptance ACC-41, 03/10). The conversation's Comments view opens with it, as the
      // Browser toolbar's Comments button opens it (`tracy:comments-open`): the list beside the
      // page, the thread open on the page.
      if (list.sessionId !== undefined) page.openComments?.(list.sessionId)
      return finish('shown')
    }
    if (page.covered?.() === true) return
    if (reveals >= MAX_REVEALS) return finish('timeout')
    const onItsPage = list.url === root.url
    if (onItsPage) elsewhereSince = null
    else {
      elsewhereSince ??= page.now()
      // The tab is on another page: the link's open is still loading the right one. Asking now would
      // navigate on top of that load; only a tab that STAYS elsewhere is asked to go there itself.
      if (page.now() - elsewhereSince < OTHER_PAGE_GRACE_MS || reveals > 0) return
    }
    if (page.now() - lastReveal < REVEAL_TICK_MS * 2) return
    reveals += 1
    lastReveal = page.now()
    page.target.dispatchEvent(
      page.event(COMMENT_ACT_EVENT, {
        tabId: list.tabId,
        sessionId: list.sessionId,
        kind: 'reveal',
        ids: [id]
      })
    )
  }

  /** @param {Event} event */
  function onList(event) {
    const detail = /** @type {ListDetail | null} */ (/** @type {CustomEvent} */ (event).detail)
    if (!detail || typeof detail !== 'object' || typeof detail.tabId !== 'string') return
    // Only the conversation on screen's tab on screen: a tab left behind another conversation
    // announces `active: false` and is not the one the person is looking at.
    if (detail.active !== true || detail.sessionId !== page.mainSession()) return
    latest = detail
    step()
  }

  page.target.addEventListener(COMMENT_LIST_EVENT, onList)
  stopTicking = page.every(() => {
    // Ask every Browser tab of the conversation on screen for its list (answered by the one shown).
    const sessionId = page.mainSession()
    if (sessionId !== undefined)
      page.target.dispatchEvent(page.event(COMMENT_ACT_EVENT, { tabId: '', sessionId, kind: 'list' }))
    step()
  }, REVEAL_TICK_MS)
  return () => finish('timeout')
}
