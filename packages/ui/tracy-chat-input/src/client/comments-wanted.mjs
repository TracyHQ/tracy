/**
 * When the Comments view counts as activity in a session that has no message yet (start screen Case 2,
 * Akemi 01/10/2026).
 *
 * dsh draws a blank session's start screen until some activated view says it is active
 * (`conversationPhase`). Until 01/10 the Comments view said so whenever the Browser tab listed a
 * comment of the site, open or resolved, and `index.tsx` activated it in every session whose Browser
 * tab listed one. On a site with comments that turned every new session into an empty chat column
 * with a header and a Chat / Comments strip instead of the start screen (measured on the local stand:
 * one resolved comment in the list flipped a blank session from `hero` to `active` within 800 ms).
 *
 * Now the view is active only while the person asked for it: the Comments start card or the Browser
 * toolbar's Comments button (`tracy:comments-open`) sets `wanted`, and leaving the view (the last
 * session showing it switches back to Chat, or to another conversation) clears it, so a session
 * still without a message shows its start screen again. Pure, so node tests hold it.
 */

/**
 * @template T
 * @typedef {{ get(): T, set(value: T): void, subscribe(fn: () => void): () => void }} Cell
 */

/**
 * Clear `wanted` the moment no session shows the Comments view any more.
 *
 * Only a change from "some session shows it" to "none does" clears it: between the press that sets
 * `wanted` and the view mounting, nothing shows it yet, and that wait must not undo the press.
 * @param {Cell<ReadonlySet<string>>} open - sessions whose chat column shows the Comments view.
 * @param {Cell<boolean>} wanted - the person asked for the view.
 * @returns {() => void} stop watching.
 */
export function forgetWhenLeft(open, wanted) {
  let shown = open.get().size > 0
  return open.subscribe(() => {
    const now = open.get().size > 0
    if (shown && !now && wanted.get()) wanted.set(false)
    shown = now
  })
}
