/**
 * The page a customer has open beside the chat, said to the host — the browser half of `view.mjs`.
 *
 * WHAT IT HEARS, AND FROM WHOM.
 * - `tracy:browser-view` — the side card's window event, fired when a Browser tab appears, changes
 *   page or mode, or goes: it tells whether a tab of THIS workspace's conversation is on screen. The
 *   side card is a vendor fork; this listens to its event and never imports it.
 * - the page's own `view` message (runtime 8, `VIEW` in `tracy-cms-preview/protocol.mjs`): address,
 *   scroll position, window size, colour scheme. It comes from a frame on another origin, so it is
 *   believed only when `event.source` is the `contentWindow` of an iframe drawn inside the Browser
 *   tab's canvas AND `event.origin` is that iframe's own origin — a script on some other window of
 *   the page cannot pose as the customer's site.
 * - the page's `applied` message: it refreshed itself after an edit (a stylesheet swap or a reload),
 *   so a picture drawn before is not the page any more (`changed`).
 * - dsh's composer: the first key typed says "they are writing" (`warm`), and Enter or a press inside
 *   the composer flushes the newest report, so the host has the place they were looking at when they
 *   sent. It reads WHERE the typing happens (`[data-slot="conversation.composer.bar"]`, the same
 *   anchor `tracy-chat-input` and dsh-brand key on), never what is typed.
 *
 * WHAT IT SAYS. `POST …/view` `{ sessionId, visible, url, y, w, h, dark, warm, changed }` — the shape
 * `readViewReport` checks. At most one report per {@link REPORT_GAP_MS}, none identical to the last
 * (a `changed` one always goes), and `visible: false` only after a visible one was said: a page with
 * no Browser tab talks to the host not at all.
 *
 * Pure apart from the four things it is handed (`target`, `doc`, `post`, the two readers of the page),
 * so `test/view-report.test.mjs` holds it without a browser.
 */
import { isMessage, viewFrom } from '../../../../cms/tracy-cms-preview/protocol.mjs'

/** The side card's window event (`BROWSER_VIEW_EVENT` in `dsh-better-sidebar` `browser-mode.ts`). */
export const BROWSER_VIEW_EVENT = 'tracy:browser-view'

/** The least time between two reports; a trailing one follows a burst. */
export const REPORT_GAP_MS = 1500

/** How long after a keystroke the customer still counts as writing. */
export const WRITING_MS = 60_000

/** The smallest window a picture is worth drawing for (the host refuses anything under it too). */
export const MIN_SIDE = 200

/**
 * Listen in the capture phase: dsh's editor may stop an event before it bubbles. An options object and
 * not `true`, because removing a listener added with the boolean form does nothing in Node's own
 * EventTarget (the tests') and the object form means the same in every browser.
 */
const CAPTURE = Object.freeze({ capture: true })

/** Where dsh's composer bar is: the anchor its input keeps and every Tracy stylesheet keys on. */
const COMPOSER = '[data-slot="conversation.composer.bar"]'

/** The frames a Browser tab draws, inside its canvas. */
const FRAMES = '[data-browser-canvas] iframe'

/** @param {unknown} node */
function inComposer(node) {
  const el = /** @type {{ closest?: (selector: string) => unknown } | null} */ (node)
  return el !== null && typeof el?.closest === 'function' && el.closest(COMPOSER) !== null
}

/**
 * @typedef {{ url: string, y: number, w: number, h: number, dark: boolean, t: number }} PageView
 * @typedef {{ sessionId: string, visible: boolean, url?: string, y?: number, w?: number, h?: number,
 *   dark?: boolean, warm?: boolean, changed?: boolean }} Report
 */

/**
 * Watch the Browser tab and the composer, and say the open page to the host.
 * @param {{
 *   target: EventTarget,
 *   doc: EventTarget & { querySelectorAll(selector: string): Iterable<unknown> },
 *   post: (report: Report) => void,
 *   sessionId: () => string | null,
 *   siteKey: () => string | null,
 *   now?: () => number,
 *   timers?: { set: (fn: () => void, ms: number) => unknown, clear: (id: unknown) => void },
 *   gap?: number
 * }} deps - `target` is the window, `doc` the document; `sessionId` is the conversation on screen and
 *   `siteKey` the site this workspace is, both read when a report is made.
 * @returns {() => void} stops watching.
 */
export function watchView({
  target,
  doc,
  post,
  sessionId,
  siteKey,
  now = Date.now,
  timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(/** @type {any} */ (id)) },
  gap = REPORT_GAP_MS
}) {
  /** tab id → the conversation it belongs to, for the tabs of this workspace that are on screen. */
  /** @type {Map<string, string>} */
  const shown = new Map()
  /** @type {(PageView & { source: unknown }) | null} */
  let view = null
  /** The document of the last `view` heard: a new one means the page was loaded again. */
  /** @type {number | null} */
  let lastDocument = null
  let changed = false
  let writingAt = Number.NEGATIVE_INFINITY
  let last = ''
  /** Whether a visible report was the last thing said: only then is "gone" worth saying. */
  let announced = false
  /** @type {unknown} */
  let timer = null
  let pending = false

  const frames = () =>
    [...doc.querySelectorAll(FRAMES)].map(
      (one) => /** @type {{ contentWindow?: unknown, src?: string }} */ (one)
    )

  /**
   * The frame a message came from, when it is a Browser tab's own.
   * @param {{ source?: unknown, origin?: string }} event
   */
  function frameOf(event) {
    const frame = frames().find((one) => one.contentWindow === event.source)
    if (frame === undefined) return null
    try {
      return new URL(String(frame.src)).origin === event.origin ? frame : null
    } catch {
      return null
    }
  }

  /** @returns {Report | null} what to say now, or null when there is nothing to say. */
  function report() {
    const session = sessionId()
    if (session === null) return null
    /** @type {Report} */
    const hidden = { sessionId: session, visible: false }
    const onScreen = [...shown.values()].includes(session)
    // The frame that reported must still be drawn: a tab that was closed or replaced leaves its last
    // word behind, and that word is not the page any more.
    const alive = view !== null && frames().some((one) => one.contentWindow === view?.source)
    if (!onScreen || view === null || !alive || view.w < MIN_SIDE || view.h < MIN_SIDE)
      return announced ? hidden : null
    return {
      sessionId: session,
      visible: true,
      url: view.url,
      y: view.y,
      w: view.w,
      h: view.h,
      dark: view.dark,
      warm: now() - writingAt < WRITING_MS,
      changed
    }
  }

  /**
   * Say it now, unless it is what was said last.
   * @returns {boolean} whether something was said.
   */
  function send() {
    const body = report()
    if (body === null) return false
    const key = JSON.stringify({ ...body, changed: undefined })
    if (key === last && body.changed !== true) return false
    last = key
    announced = body.visible
    if (body.changed === true) changed = false
    post(body)
    return true
  }

  /**
   * Say it now, and again once the burst is over — never more than once per `gap`. The gap starts
   * with what is said, not with what is asked: a tab that appears before its page has reported says
   * nothing yet, and must not hold the first real report back.
   */
  function ask() {
    if (timer !== null) {
      pending = true
      return
    }
    if (!send()) return
    timer = timers.set(() => {
      timer = null
      if (pending) {
        pending = false
        ask()
      }
    }, gap)
  }

  /** @param {Event} event */
  function onBrowserView(event) {
    const detail =
      /** @type {{ tabId?: unknown, sessionId?: unknown, siteKey?: unknown, url?: unknown } | null} */ (
        /** @type {CustomEvent} */ (event).detail
      )
    if (detail === null || typeof detail !== 'object') return
    const { tabId, sessionId: tabSession, siteKey: tabSite, url } = detail
    if (typeof tabId !== 'string' || typeof tabSession !== 'string') return
    // The tab's own workspace: a Browser tab of another site's page is none of this conversation's.
    const site = siteKey()
    if (site === null || tabSite !== site) return
    if (typeof url === 'string') shown.set(tabId, tabSession)
    else shown.delete(tabId)
    ask()
  }

  /** @param {Event} event */
  function onMessage(event) {
    const message = /** @type {MessageEvent} */ (event)
    const data = message.data
    if (data === null || typeof data !== 'object') return
    const heard = viewFrom(data)
    if (heard !== null) {
      if (frameOf(message) === null) return
      if (lastDocument !== null && heard.t !== lastDocument) changed = true
      lastDocument = heard.t
      view = { ...heard, source: message.source }
      ask()
      return
    }
    // The page refreshed itself after an edit: same address, same place, a new state of it.
    if (isMessage(data, 'applied') && frameOf(message) !== null) {
      changed = true
      ask()
    }
  }

  /** @param {Event} event */
  function onInput(event) {
    if (!inComposer(event.target)) return
    writingAt = now()
    ask()
  }

  /** @param {Event} event */
  function onSending(event) {
    if (!inComposer(event.target)) return
    const key = /** @type {KeyboardEvent} */ (event).key
    if (event.type === 'keydown' && key !== 'Enter') return
    send()
  }

  target.addEventListener(BROWSER_VIEW_EVENT, onBrowserView)
  target.addEventListener('message', onMessage)
  doc.addEventListener('input', onInput, CAPTURE)
  doc.addEventListener('keydown', onSending, CAPTURE)
  doc.addEventListener('pointerdown', onSending, CAPTURE)
  return () => {
    target.removeEventListener(BROWSER_VIEW_EVENT, onBrowserView)
    target.removeEventListener('message', onMessage)
    doc.removeEventListener('input', onInput, CAPTURE)
    doc.removeEventListener('keydown', onSending, CAPTURE)
    doc.removeEventListener('pointerdown', onSending, CAPTURE)
    if (timer !== null) timers.clear(timer)
    timer = null
  }
}
