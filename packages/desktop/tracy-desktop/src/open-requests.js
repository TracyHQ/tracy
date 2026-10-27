/**
 * Link routing, the main process's half: a page asked for a new window (target=_blank,
 * `window.open`), the window said no (`setWindowOpenHandler` must answer synchronously), and this
 * decides what happens instead — exactly once.
 *
 * WHO DECIDES. The page knows the sites and which one is on screen, so it DECIDES
 * (`@tracy/dsh-site-tabs` desktop-open.mjs): the browser, this window to another Tracy screen, or
 * the side card's Browser tab. It decides only; this module checks the decision and carries it out,
 * so a slow answer can never open both a browser tab and an in-app tab (council 09/10,
 * tasks/todo-desktop-window-shell.md).
 *
 * THE RULES, in order:
 *   - No page listening (the document has not registered, or is not Tracy's) → the browser, as before.
 *   - Anything but a plain click (`foreground-tab`: Cmd/middle → `background-tab`, Shift →
 *     `new-window`, measured on Electron 40, tasks/evidence/desktop-window-shell/spike-dispositions.json)
 *     means "somewhere else": asked only of a page that said it can answer with a second window
 *     (`windows`), and then only `window` (on Tracy's origin) or `external` is obeyed. A page that did
 *     not say so (a bundle older than the app) gets the old answer, unasked: the browser.
 *   - A plain click is never answered with a second window.
 *   - Otherwise ask; the first valid answer is carried out. No answer in `timeoutMs` → the browser.
 *     An answer that oversteps (a navigation off Tracy's origin, a tab on another address) → the
 *     browser, for the address the person pressed.
 *   - The document going away (navigation, crash, close) drops every open question: nothing opens.
 *     Once a decision has been handed to the page, its effect is the page's; nothing is retried.
 *
 * A second window is opened HERE (`openWindow`), not by the page: the page only names the address.
 *
 * Pure: effects are passed in, so test/open-requests.test.mjs drives it with a hand-held clock.
 */

/** Schemes the operating system may be handed. Anything else (blob:, file:, javascript:, app schemes) stays here. */
const EXTERNAL_SCHEMES = new Set(['http:', 'https:', 'mailto:'])

/**
 * @param {unknown} url
 * @returns {boolean} whether `url` may go to `shell.openExternal`.
 */
function externalAllowed(url) {
  if (typeof url !== 'string') return false
  try {
    return EXTERNAL_SCHEMES.has(new URL(url).protocol)
  } catch {
    return false
  }
}

/**
 * @param {unknown} value
 * @returns {URL | null}
 */
function parse(value) {
  if (typeof value !== 'string') return null
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/** A plain click; every other disposition asks for "somewhere else". */
const PLAIN = 'foreground-tab'

/**
 * Whether the page's decision may be carried out for the address asked about.
 * @param {unknown} decision
 * @param {{ url: string, disposition?: string }} asked - the address the person pressed, and how.
 * @param {string} origin - Tracy's origin.
 * @returns {boolean}
 */
function obeyable(decision, asked, origin) {
  if (decision === null || typeof decision !== 'object') return false
  const d = /** @type {{ kind?: unknown, url?: unknown, siteKey?: unknown }} */ (decision)
  if (d.kind === 'external') return true
  // Somewhere else: a second window on Tracy, or the browser — never this window or its side card.
  if (asked.disposition !== PLAIN) return d.kind === 'window' && parse(d.url)?.origin === origin
  if (d.kind === 'navigate') return parse(d.url)?.origin === origin
  if (d.kind === 'tab') {
    const url = parse(d.url)
    return (
      url !== null &&
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.href === parse(asked.url)?.href &&
      typeof d.siteKey === 'string' &&
      d.siteKey !== ''
    )
  }
  return false
}

/**
 * @typedef {{ kind: 'external' } | { kind: 'navigate', url: string } | { kind: 'tab', url: string, siteKey: string }
 *   | { kind: 'window', url: string }} OpenDecision
 * @typedef {{
 *   origin: string,
 *   timeoutMs: number,
 *   ask: (requestId: string, url: string, disposition: string | undefined) => void,
 *   execute: (requestId: string, decision: OpenDecision) => void,
 *   openExternal: (url: string) => void,
 *   openWindow?: (url: string) => void,
 *   setTimer?: (fn: () => void, ms: number) => () => void,
 * }} RouterOptions
 *   `ask`: send the question to the page. `execute`: hand a checked navigate/tab decision to the
 *   page. `openExternal`: the system browser (only ever called with an allowed scheme).
 *   `openWindow`: a second app window on a checked Tracy address.
 */

/**
 * @param {RouterOptions} options
 */
function createOpenRouter({
  origin,
  timeoutMs,
  ask,
  execute,
  openExternal,
  openWindow = () => {},
  setTimer = defaultTimer
}) {
  /** @type {Map<string, { url: string, disposition?: string, cancel: () => void }>} */
  const pending = new Map()
  let ready = false
  let windows = false
  let seq = 0

  const external = (url) => {
    if (externalAllowed(url)) openExternal(url)
  }

  /** Take a request out of the open set; only the caller that gets it may act on it. */
  const take = (requestId) => {
    const request = pending.get(requestId)
    if (request === undefined) return undefined
    pending.delete(requestId)
    request.cancel()
    return request
  }

  return {
    /**
     * The window was asked to open `url`. Call after denying it.
     * @param {{ url: string, disposition?: string }} details - `setWindowOpenHandler`'s.
     */
    open({ url, disposition }) {
      if (!ready || (disposition !== PLAIN && !windows)) {
        external(url)
        return
      }
      seq += 1
      const requestId = `open-${seq}`
      const cancel = setTimer(() => {
        if (take(requestId) !== undefined) external(url)
      }, timeoutMs)
      pending.set(requestId, { url, disposition, cancel })
      ask(requestId, url, disposition)
    },
    /**
     * The page answered. Call only for the product window's top frame (the adapter checks).
     * @param {string} requestId
     * @param {unknown} decision
     */
    answer(requestId, decision) {
      const request = take(requestId)
      if (request === undefined) return
      if (!obeyable(decision, request, origin)) {
        external(request.url)
        return
      }
      const checked = /** @type {OpenDecision} */ (decision)
      if (checked.kind === 'external') external(request.url)
      else if (checked.kind === 'window') openWindow(checked.url)
      else execute(requestId, checked)
    },
    /**
     * Whether the current document listens (it registered, or took its registration back), and
     * whether it can answer with a second window.
     * @param {unknown} value
     * @param {{ windows?: unknown }} [can]
     */
    setReady(value, can = {}) {
      ready = value === true
      windows = ready && can?.windows === true
    },
    /** The document went away: forget every open question, and that anyone listens. */
    reset() {
      ready = false
      windows = false
      for (const requestId of pending.keys()) take(requestId)
    }
  }
}

/** @param {() => void} fn @param {number} ms */
function defaultTimer(fn, ms) {
  const timer = setTimeout(fn, ms)
  return () => clearTimeout(timer)
}

module.exports = { createOpenRouter, externalAllowed }
