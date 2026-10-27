/**
 * Which conversation the page is showing, followed as it changes.
 *
 * 🔒 dsh OPENS A CONVERSATION WITH `pushState`, AND `pushState` FIRES NO `popstate`. The client said
 * `hello` on load, when the tab came back, and on `popstate` — so a page that entered a site at
 * `/<site>/` and then opened a conversation inside the SPA never bound that conversation to a
 * viewer, and a Joomla/WordPress build in it failed `check` with `NO_VIEWER` (measured 23/09/2026 on
 * `j-0a5wcu` and `wp-3bn5a1`). The sessions list says which conversation the main view shows
 * (`mainSessionOf`), and it changes on every such switch, however the switch was made.
 */
import { mainSessionOf } from '@tracy/core/session'

/**
 * @typedef {{ list: { getSnapshot: () => { byId: Record<string, { retainedBy?: Readonly<Partial<Record<string, number>>> } | undefined> }, subscribe: (listener: () => void) => () => void } }} SessionsLike
 */

/**
 * Call `onShown` once each time the main view comes to show a conversation it was not showing. The
 * conversation on screen when this starts is not reported: the page's own load already said hello
 * for it.
 * @param {SessionsLike} sessions - `ctx.sessions`.
 * @param {(sessionId: string) => void} onShown - called with the id of the conversation now on screen.
 * @returns {() => void} stop following.
 */
export function followShownSession(sessions, onShown) {
  let shown = mainSessionOf(sessions.list.getSnapshot())
  return sessions.list.subscribe(() => {
    const now = mainSessionOf(sessions.list.getSnapshot())
    if (now === undefined || now === shown) return
    shown = now
    onShown(now)
  })
}
