/**
 * Opening the Comments view from the Browser tab's toolbar (option B2, Brian 29/09 ~16:00): the
 * Comments split button's left part, and its menu's "Open Comments", send `tracy:comments-open`
 * `{sessionId, tabId}` on `window` (fork `dsh-better-sidebar`, `COMMENTS_OPEN_EVENT`). Pure, so node
 * tests hold the order; `index.tsx` hands it the four real steps.
 *
 * dsh gives a plugin no call that SELECTS a conversation view: `uiConversation.binding(id).activate`
 * only makes a view's data live (and a blank session not blank), and the store that holds the shown
 * view is private to ui-conversation. The one public road is dsh's own tab button
 * (`[data-conversation-tabs] [data-view="…"]`, whose click runs `selectView` — activation plus the
 * kept choice), so that is what is clicked, once the strip has rendered.
 *
 * The chat column itself is brought on screen by the Browser tab before it sends the event (a right
 * panel in fullscreen covers the chat; the fork owns that panel and leaves fullscreen through dsh's
 * `sidebarRight`). A global panel (settings, plugins) cannot be showing then: it unmounts the right
 * panel, toolbar included.
 */

/** The window event the Browser toolbar sends (fork `COMMENTS_OPEN_EVENT`). */
export const OPEN_EVENT = 'tracy:comments-open'

/** How many animation frames to wait for the tab strip to render before giving up (~0.5 s). */
const MAX_FRAMES = 30

/**
 * A well-formed `tracy:comments-open` detail, or null.
 * @param {unknown} detail
 * @returns {{ sessionId: string } | null}
 */
export function readOpenDetail(detail) {
  if (detail === null || typeof detail !== 'object') return null
  const { sessionId } = /** @type {{ sessionId?: unknown }} */ (detail)
  return typeof sessionId === 'string' && sessionId !== '' ? { sessionId } : null
}

/**
 * @typedef {{ getAttribute(name: string): string | null, click(): void }} TabButton
 * @typedef {{
 *   want: () => void,
 *   activate: (sessionId: string) => void,
 *   findTab: () => TabButton | null,
 *   frame: (fn: () => void) => void
 * }} OpenSteps
 *   want — make the view's definition say "active" so a blank session shows its tab strip;
 *   activate — `binding(sessionId).activate(view)`; findTab — dsh's tab button of the view, or null
 *   while the strip is not there; frame — `requestAnimationFrame`.
 */

/**
 * Press a view's tab button once the strip has rendered, unless it is the one shown; give up quietly
 * after {@link MAX_FRAMES}.
 * @param {() => TabButton | null} findTab
 * @param {(fn: () => void) => void} frame
 */
function pressTab(findTab, frame) {
  let tries = 0
  const select = () => {
    const tab = findTab()
    if (tab !== null) {
      if (tab.getAttribute('aria-selected') !== 'true') tab.click()
      return
    }
    tries += 1
    if (tries < MAX_FRAMES) frame(select)
  }
  select()
}

/**
 * Select the Comments view in the chat column.
 * @param {{ sessionId: string }} request
 * @param {OpenSteps} steps
 */
export function openCommentsView(request, steps) {
  steps.want()
  try {
    steps.activate(request.sessionId)
  } catch {
    // Not a session this page holds a binding for: the tab button below is still tried.
  }
  pressTab(steps.findTab, steps.frame)
}

/** dsh's own chat view (`ui-chat` registers it as `chat`). */
export const CHAT_VIEW = 'chat'

/**
 * Stage 6, rule 5 of the story file: after any Send to Tracy the chat column shows its Chat tab — the
 * message just sent and Tracy's answer — through the same public road, dsh's tab button. Chat is
 * dsh's first view and needs no activation.
 * @param {{ findTab: (view: string) => TabButton | null, frame: (fn: () => void) => void }} steps
 */
export function openChatView(steps) {
  pressTab(() => steps.findTab(CHAT_VIEW), steps.frame)
}
