/**
 * "Open conversation" from a Site changes row lands here (plan `tasks/todo-open-conversation.md` A):
 * the row opens a NEW browser window on `/<siteKey>/s/<sessionId>?…&tracy-msg=<promptMessageId>`,
 * and this page, once its chat is drawn, scrolls to the message the person typed and marks it for a
 * moment.
 *
 * WHY THE KEY. dsh draws each chat node inside `ChatNodeSeat` with
 * `data-chat-node-key="<len>:<kind><id>"`; a typed message is `13:input-message<user/message id>`,
 * and that id is what the turn record keeps as `prompt_message_id`
 * (`tasks/evidence/site-changes-v2/feasibility-open-conversation.md` §1). Upstream's attribute, read
 * as is — no fork change.
 *
 * WHY loadOlder. The chat holds only its newest ~50 messages; an older turn is not in the page
 * until history is paged in (`sessions.binding(id).session.loadOlder()`). Paged a bounded number
 * of times, then the page is left where it is — at the end of the conversation — with no message
 * and no console error: the conversation itself opened, which is what the person asked for.
 *
 * Pure, with the page handed in, so `test/conversation-scroll.test.mjs` holds these rules in Node.
 */

export const MESSAGE_PARAM = 'tracy-msg'

/** A message id as the turn record stores it (a uuid); anything else is not looked for. */
const MESSAGE_ID = /^[A-Za-z0-9._:-]{1,128}$/

/** How long the chat may take to draw at all, then to draw an older page. */
export const FIRST_DRAW_MS = 12_000
export const PAGE_DRAW_MS = 3_000
/** Older pages asked for at most (each holds at least 50 messages and two turns). */
export const MAX_OLDER_PAGES = 10
/** How long the message stays marked. */
export const FLASH_MS = 2_400
export const FLASH_ATTR = 'data-tracy-msg-flash'
const FOLLOW_UP_MS = 400
/**
 * How long the mark waits for a smooth scroll to bring the message in and stop. Marked at the
 * start of the scroll, the message spent its first ~500 ms of the mark 1780 px above the viewport
 * (QA-B03, 3/3 cold opens on the stand): the person saw the end of the mark, not its start.
 */
export const SETTLE_MS = 1_500

/**
 * @param {string} search - `location.search`.
 * @returns {string | null} the message to scroll to, or null.
 */
export function readMessageParam(search) {
  const value = new URLSearchParams(search).get(MESSAGE_PARAM)
  return value !== null && MESSAGE_ID.test(value) ? value : null
}

/**
 * The same search with `tracy-msg` removed (it is one-use: a reload must not scroll again).
 * @param {string} search
 * @returns {string} '' when nothing is left, else starting with '?'.
 */
export function stripMessageParam(search) {
  const params = new URLSearchParams(search)
  params.delete(MESSAGE_PARAM)
  const rest = params.toString()
  return rest ? `?${rest}` : ''
}

/**
 * The selector of a typed message's node. The id passed `MESSAGE_ID`, so it carries no quote.
 * @param {string} id
 */
export const messageSelector = (id) => `[data-chat-node-key*="input-message${id}"]`

/**
 * Tracy's boot cover (`@tracy/dsh-brand` `boot-cover.tsx`): it holds the page, opaque, until the
 * shell is ready — measured on the stand at ~4.5 s after the window opens, longer than the mark
 * lasts (wave r1 B1, 3/3). It is removed from the document when it lifts, at the latest after 8 s.
 */
export const BOOT_COVER = '.tracy-boot-cover'
/** How long the mark waits for the cover to lift: past the cover's own 8 s deadline. */
export const COVER_WAIT_MS = 10_000

/** Any chat node at all: the chat has drawn. */
export const ANY_NODE = '[data-chat-node-key]'

/**
 * The session id of a site page address, `/<siteKey>/s/<sessionId>`; null elsewhere.
 * @param {string} pathname - `location.pathname`.
 * @returns {string | null}
 */
export function sessionOfPath(pathname) {
  const m = /^\/[^/]+\/s\/([^/?#]+)/.exec(pathname)
  return m ? decodeURIComponent(m[1]) : null
}

/**
 * @typedef {{
 *   find: (selector: string) => { scrollIntoView: (o?: object) => void, setAttribute: (n: string, v: string) => void, removeAttribute: (n: string) => void } | null,
 *   loadOlder: () => Promise<void> | void,
 *   hasOlder?: () => boolean | null,
 *   sleep: (ms: number) => Promise<void>,
 *   now: () => number,
 *   reducedMotion?: boolean,
 *   poll?: number,
 *   covered?: () => boolean,
 *   place?: (el: object) => { top: number, viewport: number }
 * }} Page
 */

/**
 * Wait until the message's top is inside the viewport and has not moved since the last look (the
 * scroll stopped), for at most {@link SETTLE_MS}. A page that cannot say where the node is
 * (`place` absent) waits {@link FOLLOW_UP_MS}, as before.
 * @param {Page} page
 * @param {object} el
 */
async function settled(page, el) {
  if (!page.place) return page.sleep(FOLLOW_UP_MS)
  const end = page.now() + SETTLE_MS
  let last = null
  for (;;) {
    const { top, viewport } = page.place(el)
    if (last !== null && Math.abs(top - last) < 1 && top >= 0 && top < viewport) return
    if (page.now() >= end) return
    last = top
    await page.sleep(page.poll ?? 100)
  }
}

/**
 * Wait until `selector` is in the page, polling, for at most `ms`.
 * @param {Page} page
 * @param {string} selector
 * @param {number} ms
 */
async function waitFor(page, selector, ms) {
  const end = page.now() + ms
  for (;;) {
    const el = page.find(selector)
    if (el) return el
    if (page.now() >= end) return null
    await page.sleep(page.poll ?? 200)
  }
}

/**
 * Find the message — paging older history in, a bounded number of times — then bring it into view
 * and mark it. Never throws.
 * @param {string} id - the prompt message id.
 * @param {Page} page
 * @returns {Promise<'shown' | 'shown-covered' | 'not-found' | 'no-chat'>}
 */
export async function revealMessage(id, page) {
  try {
    const selector = messageSelector(id)
    // The chat draws a while after the page: wait for any node, then for this one briefly.
    if (!(await waitFor(page, ANY_NODE, FIRST_DRAW_MS))) return 'no-chat'
    let el = await waitFor(page, selector, page.poll ?? 200)
    for (let pages = 0; !el && pages < MAX_OLDER_PAGES; pages++) {
      if (page.hasOlder?.() === false) break
      try {
        await page.loadOlder()
      } catch {
        break
      }
      el = await waitFor(page, selector, PAGE_DRAW_MS)
    }
    if (!el) return 'not-found'
    // The mark is for the person to SEE: while the boot cover still hides the page, wait for it to
    // lift. Past the ceiling the message is still scrolled to, only not marked behind a cover.
    const end = page.now() + COVER_WAIT_MS
    while (page.covered?.() === true && page.now() < end) await page.sleep(page.poll ?? 200)
    const behavior = page.reducedMotion ? 'auto' : 'smooth'
    if (page.covered?.() === true) {
      el.scrollIntoView({ block: 'center', behavior: 'auto' })
      return 'shown-covered'
    }
    el.scrollIntoView({ block: 'center', behavior })
    // A chat that follows its tail may pull back to the end once after the page settles: ask again.
    await page.sleep(FOLLOW_UP_MS)
    el.scrollIntoView({ block: 'center', behavior })
    // The mark starts where the person can see it: once the message has arrived and stopped.
    await settled(page, el)
    el.setAttribute(FLASH_ATTR, '')
    await page.sleep(FLASH_MS)
    el.removeAttribute(FLASH_ATTR)
    return 'shown'
  } catch {
    // A page that changed under us (the person navigated away) is not an error worth a console line.
    return 'not-found'
  }
}
